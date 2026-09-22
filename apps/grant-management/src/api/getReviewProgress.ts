import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { DISAGREEMENT_SPREAD } from '@project/shared/scoring';
import { assertManager, getActor } from '@project/shared/server/members';
import { Params, iso, num, numOrNull, ref, str } from '@project/shared/server/sql';

/**
 * How reviewing is going in one program (or one of its review stages): each
 * reviewer's workload and how their scores compare, the submissions waiting
 * for reviewers, and the ones reviewers disagree on.
 *
 * Calibration is reported two ways. `avgGiven − programMean` is easy to read
 * but depends on which applications someone drew; `pairedDelta` compares each
 * score with the other reviewers' average on the same application, which is
 * what actually says "harsh" or "lenient".
 */

const Input = z.object({ programId: z.string().min(1), stageId: z.string().nullable().optional() });

const round1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);
const ids = (v: unknown) => (typeof v === 'string' && v ? v.split(',').filter(Boolean) : []);

export default createEndpoint({
  description: 'Review workload, calibration and attention lists for a program',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({
    programMean: z.number().nullable(),
    totals: z.object({ assigned: z.number(), submitted: z.number(), inProgress: z.number(), notStarted: z.number(), overdue: z.number(), recused: z.number() }),
    reviewers: z.array(z.object({
      memberId: z.string(), inPool: z.boolean(), assigned: z.number(), submitted: z.number(), inProgress: z.number(), notStarted: z.number(),
      overdue: z.number(), recused: z.number(), avgGiven: z.number().nullable(), delta: z.number().nullable(),
      pairedDelta: z.number().nullable(), pairedCount: z.number(), lastSubmittedAt: z.string().nullable(), overdueReviewIds: z.array(z.string()),
    })),
    needsReviewers: z.array(z.object({ id: z.string(), reference: z.string(), title: z.string(), applicantName: z.string(), stageId: z.string().nullable(), stageEnteredAt: z.string().nullable() })),
    disagreements: z.array(z.object({ id: z.string(), reference: z.string(), title: z.string(), applicantName: z.string(), stageId: z.string().nullable(), min: z.number(), max: z.number(), mean: z.number(), spread: z.number(), count: z.number() })),
  }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw ?? {});
    if (!parsed.success) throw new ZiteError('Which program?', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);

    const { rows: programs } = await zite.sql({ query: `SELECT id, "key" FROM "Programs" WHERE id::text = $1`, params: [input.programId] });
    if (!programs[0]) throw new ZiteError('That program no longer exists', 'NOT_FOUND');
    const key = str(programs[0].key) || 'APP';
    const stageId = input.stageId || null;

    const scoped = (alias: string, p: Params) => `${alias}."programId" = ${p.add(input.programId)}${stageId ? ` AND ${alias}."stageId" = ${p.add(stageId)}` : ''}`;
    const open = `r."status" IN ('Assigned', 'In progress') AND s."status" = 'Submitted'`;
    const overdue = `${open} AND r."dueDate" < CURRENT_DATE`;

    const pw = new Params();
    const pc = new Params();
    const pm = new Params();
    const pn = new Params();
    const pd = new Params();
    const [workload, paired, meanRes, pool, needs, disagree] = await Promise.all([
      zite.sql({
        query: `
          SELECT r."reviewerId",
            COUNT(*) FILTER (WHERE r."status" <> 'Recused') AS "assigned",
            COUNT(*) FILTER (WHERE r."status" = 'Submitted') AS "submitted",
            COUNT(*) FILTER (WHERE r."status" = 'In progress' AND s."status" = 'Submitted') AS "inProgress",
            COUNT(*) FILTER (WHERE r."status" = 'Assigned' AND s."status" = 'Submitted') AS "notStarted",
            COUNT(*) FILTER (WHERE ${overdue}) AS "overdue",
            COUNT(*) FILTER (WHERE r."status" = 'Recused') AS "recused",
            AVG(r."totalScore") FILTER (WHERE r."status" = 'Submitted') AS "avgGiven",
            MAX(r."submittedAt") FILTER (WHERE r."status" = 'Submitted') AS "lastSubmittedAt",
            string_agg(r.id::text, ',') FILTER (WHERE ${overdue}) AS "overdueIds"
          FROM "Reviews" r JOIN "Submissions" s ON s.id::text = r."submissionId"
          WHERE ${scoped('r', pw)} AND COALESCE(r."reviewerId", '') <> '' AND s."status" <> 'Draft'
          GROUP BY r."reviewerId"`,
        params: pw.values,
      }),
      zite.sql({
        query: `
          SELECT r."reviewerId", AVG(r."totalScore" - o."avg") AS "delta", COUNT(*) AS "n"
          FROM "Reviews" r
          JOIN LATERAL (
            SELECT AVG(r2."totalScore") AS "avg", COUNT(*) AS "c" FROM "Reviews" r2
            WHERE r2."submissionId" = r."submissionId" AND r2."stageId" = r."stageId" AND r2."status" = 'Submitted' AND r2.id <> r.id AND r2."totalScore" IS NOT NULL
          ) o ON o."c" > 0
          WHERE ${scoped('r', pc)} AND r."status" = 'Submitted' AND r."totalScore" IS NOT NULL
          GROUP BY r."reviewerId"`,
        params: pc.values,
      }),
      zite.sql({ query: `SELECT AVG(r."totalScore") AS "mean" FROM "Reviews" r WHERE ${scoped('r', pm)} AND r."status" = 'Submitted'`, params: pm.values }),
      zite.sql({
        query: `SELECT pm."memberId" FROM "ProgramMembers" pm JOIN "Members" m ON m.id::text = pm."memberId" WHERE pm."programId" = $1 AND pm."role" = 'Reviewer' AND COALESCE(m."status", '') <> 'Deactivated'`,
        params: [input.programId],
      }),
      zite.sql({
        query: `
          SELECT s.id, s."number", s."title", s."stageId", s."stageEnteredAt", a."name" AS "applicantName"
          FROM "Submissions" s
          JOIN "Stages" st ON st.id::text = s."stageId"
          LEFT JOIN "Applicants" a ON a.id::text = s."applicantId"
          WHERE ${scoped('s', pn)} AND s."status" = 'Submitted' AND st."kind" = 'Review'
            AND NOT EXISTS (SELECT 1 FROM "Reviews" r WHERE r."submissionId" = s.id::text AND r."stageId" = s."stageId" AND r."status" <> 'Recused')
          ORDER BY s."stageEnteredAt" ASC NULLS LAST, s."number" ASC
          LIMIT 200`,
        params: pn.values,
      }),
      zite.sql({
        query: `
          SELECT s.id, s."number", s."title", s."stageId", a."name" AS "applicantName",
            MIN(r."totalScore") AS "min", MAX(r."totalScore") AS "max", AVG(r."totalScore") AS "mean", COUNT(*) AS "count"
          FROM "Submissions" s
          JOIN "Reviews" r ON r."submissionId" = s.id::text AND r."status" = 'Submitted' AND r."totalScore" IS NOT NULL ${stageId ? `AND r."stageId" = ${pd.add(stageId)}` : ''}
          LEFT JOIN "Applicants" a ON a.id::text = s."applicantId"
          WHERE s."programId" = ${pd.add(input.programId)} AND s."status" = 'Submitted'
          GROUP BY s.id, s."number", s."title", s."stageId", a."name"
          HAVING COUNT(*) > 1 AND MAX(r."totalScore") - MIN(r."totalScore") >= ${pd.add(DISAGREEMENT_SPREAD)}
          ORDER BY MAX(r."totalScore") - MIN(r."totalScore") DESC
          LIMIT 100`,
        params: pd.values,
      }),
    ]);

    const programMean = round1(numOrNull(meanRes.rows[0]?.mean));
    const pairedBy = new Map(paired.rows.map(p => [String(p.reviewerId), { delta: numOrNull(p.delta), n: num(p.n) }]));
    const poolIds = new Set(pool.rows.map(p => String(p.memberId)));
    const byMember = new Map(workload.rows.map(w => [String(w.reviewerId), w]));
    const memberIds = [...new Set([...poolIds, ...byMember.keys()])];

    const reviewers = memberIds.map(memberId => {
      const w = byMember.get(memberId) ?? {};
      const avgGiven = round1(numOrNull(w.avgGiven));
      const pair = pairedBy.get(memberId);
      return {
        memberId,
        inPool: poolIds.has(memberId),
        assigned: num(w.assigned),
        submitted: num(w.submitted),
        inProgress: num(w.inProgress),
        notStarted: num(w.notStarted),
        overdue: num(w.overdue),
        recused: num(w.recused),
        avgGiven,
        delta: avgGiven != null && programMean != null ? round1(avgGiven - programMean) : null,
        pairedDelta: round1(pair?.delta ?? null),
        pairedCount: pair?.n ?? 0,
        lastSubmittedAt: iso(w.lastSubmittedAt),
        overdueReviewIds: ids(w.overdueIds),
      };
    });
    reviewers.sort((a, b) => b.overdue - a.overdue || b.inProgress + b.notStarted - (a.inProgress + a.notStarted) || b.assigned - a.assigned);

    const totals = reviewers.reduce(
      (t, r) => ({ assigned: t.assigned + r.assigned, submitted: t.submitted + r.submitted, inProgress: t.inProgress + r.inProgress, notStarted: t.notStarted + r.notStarted, overdue: t.overdue + r.overdue, recused: t.recused + r.recused }),
      { assigned: 0, submitted: 0, inProgress: 0, notStarted: 0, overdue: 0, recused: 0 },
    );

    return {
      programMean,
      totals,
      reviewers,
      needsReviewers: needs.rows.map(s => ({
        id: String(s.id),
        reference: s.number ? `${key}-${num(s.number)}` : 'Draft',
        title: str(s.title) || '',
        applicantName: str(s.applicantName) || '',
        stageId: ref(s.stageId),
        stageEnteredAt: iso(s.stageEnteredAt),
      })),
      disagreements: disagree.rows.map(s => {
        const min = num(s.min);
        const max = num(s.max);
        return {
          id: String(s.id),
          reference: s.number ? `${key}-${num(s.number)}` : 'Draft',
          title: str(s.title) || '',
          applicantName: str(s.applicantName) || '',
          stageId: ref(s.stageId),
          min,
          max,
          mean: round1(num(s.mean)) ?? 0,
          spread: round1(max - min) ?? 0,
          count: num(s.count),
        };
      }),
    };
  },
});
