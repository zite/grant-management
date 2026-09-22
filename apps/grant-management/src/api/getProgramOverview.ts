import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { parseData } from '@project/shared/server/activity';
import { assertManager, getActor } from '@project/shared/server/members';
import { bool, iso, num, numOrNull, ref, str } from '@project/shared/server/sql';

/**
 * One program's full record and, unless only the details are asked for, the
 * numbers its overview is built from: counts, the pipeline funnel, a daily
 * series since it opened, review progress, budget and recent activity.
 * Names (stages, members) are resolved on the client from bootstrap.
 */

const Input = z.object({
  programId: z.string().min(1),
  detailsOnly: z.boolean().optional(),
  /** The viewer's IANA zone, so "a day" in the series is their day. */
  timeZone: z.string().max(64).regex(/^[A-Za-z0-9_+\-/]+$/).optional(),
});

const programSchema = z.object({
  id: z.string(), name: z.string(), key: z.string(), slug: z.string(), type: z.string(), status: z.string(),
  summary: z.string(), description: z.string(), eligibility: z.string(), confirmationMessage: z.string(), coverImageUrl: z.string().nullable(),
  opensAt: z.string().nullable(), deadline: z.string().nullable(), allowLate: z.boolean(), maxPerApplicant: z.number(),
  budget: z.number().nullable(), awardMin: z.number().nullable(), awardMax: z.number().nullable(),
  color: z.string(), icon: z.string(), ownerId: z.string().nullable(), contactEmail: z.string().nullable(),
  blindReview: z.boolean(), showScoresToReviewers: z.boolean(), reviewersPerSubmission: z.number(),
  publishedAt: z.string().nullable(), createdAt: z.string().nullable(),
});

const statsSchema = z.object({
  counts: z.object({
    started: z.number(), drafts: z.number(), submitted: z.number(), inReview: z.number(), accepted: z.number(), waitlisted: z.number(),
    declined: z.number(), withdrawn: z.number(), unreleased: z.number(), late: z.number(), needsReviewers: z.number(),
  }),
  funnel: z.array(z.object({ stageId: z.string(), current: z.number(), reached: z.number() })),
  series: z.array(z.object({ day: z.string(), submitted: z.number(), started: z.number() })),
  reviews: z.object({
    assigned: z.number(), submitted: z.number(), open: z.number(), overdue: z.number(), recused: z.number(), mean: z.number().nullable(),
    top: z.array(z.object({ memberId: z.string(), submitted: z.number(), open: z.number(), overdue: z.number() })),
  }),
  budget: z.object({ budget: z.number().nullable(), requested: z.number(), awarded: z.number(), paid: z.number(), scheduled: z.number() }),
  activity: z.array(z.object({
    id: z.string(), type: z.string(), submissionId: z.string().nullable(), reference: z.string().nullable(), title: z.string(),
    actorId: z.string().nullable(), actorType: z.string(), actorName: z.string().nullable(), data: z.record(z.any()), occurredAt: z.string().nullable(),
  })),
});

export default createEndpoint({
  description: 'Load a program with its overview statistics',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ program: programSchema, stats: statsSchema.nullable() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw ?? {});
    if (!parsed.success) throw new ZiteError('Which program?', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);

    const { rows } = await zite.sql({ query: `SELECT * FROM "Programs" WHERE id::text = $1 LIMIT 1`, params: [input.programId] });
    const r = rows[0];
    if (!r) throw new ZiteError('That program no longer exists', 'NOT_FOUND');
    const program = {
      id: String(r.id),
      name: str(r.name) ?? '',
      key: str(r.key) || 'APP',
      slug: str(r.slug) ?? '',
      type: str(r.type) || 'Grant',
      status: str(r.status) || 'Draft',
      summary: str(r.summary) ?? '',
      description: str(r.description) ?? '',
      eligibility: str(r.eligibility) ?? '',
      confirmationMessage: str(r.confirmationMessage) ?? '',
      coverImageUrl: ref(r.coverImageUrl),
      opensAt: iso(r.opensAt),
      deadline: iso(r.deadline),
      allowLate: bool(r.allowLate),
      maxPerApplicant: num(r.maxPerApplicant, 1) || 1,
      budget: numOrNull(r.budget),
      awardMin: numOrNull(r.awardMin),
      awardMax: numOrNull(r.awardMax),
      color: str(r.color) || '#6943d0',
      icon: str(r.icon) ?? '',
      ownerId: ref(r.ownerId),
      contactEmail: ref(r.contactEmail),
      blindReview: bool(r.blindReview),
      showScoresToReviewers: bool(r.showScoresToReviewers),
      reviewersPerSubmission: num(r.reviewersPerSubmission),
      publishedAt: iso(r.publishedAt),
      createdAt: iso(r.created_at),
    };
    if (input.detailsOnly) return { program, stats: null };

    const id = program.id;
    const tz = input.timeZone || 'UTC';
    // A zone the database doesn't recognise shouldn't cost the whole overview; days fall back to UTC.
    const runSeries = (query: string) => zite.sql({ query, params: [id, tz] }).catch(() => zite.sql({ query, params: [id, 'UTC'] }));
    const [countsRes, funnelRes, seriesRes, reviewRes, topRes, paymentsRes, activityRes] = await Promise.all([
      zite.sql({
        query: `
          SELECT
            COUNT(*) AS "started",
            COUNT(*) FILTER (WHERE s."status" = 'Draft') AS "drafts",
            COUNT(*) FILTER (WHERE s."submittedAt" IS NOT NULL AND s."status" <> 'Draft') AS "submitted",
            COUNT(*) FILTER (WHERE s."status" = 'Submitted') AS "inReview",
            COUNT(*) FILTER (WHERE s."status" = 'Accepted') AS "accepted",
            COUNT(*) FILTER (WHERE s."status" = 'Waitlisted') AS "waitlisted",
            COUNT(*) FILTER (WHERE s."status" = 'Declined') AS "declined",
            COUNT(*) FILTER (WHERE s."status" = 'Withdrawn') AS "withdrawn",
            COUNT(*) FILTER (WHERE s."status" IN ('Accepted', 'Declined', 'Waitlisted') AND s."notifiedAt" IS NULL) AS "unreleased",
            COUNT(*) FILTER (WHERE s."submittedAt" IS NOT NULL AND p."deadline" IS NOT NULL AND s."submittedAt" > p."deadline") AS "late",
            COALESCE(SUM(s."requestedAmount") FILTER (WHERE s."status" NOT IN ('Draft', 'Withdrawn')), 0) AS "requested",
            COALESCE(SUM(s."awardAmount") FILTER (WHERE s."status" = 'Accepted' AND COALESCE(s."awardStatus", '') <> 'Cancelled'), 0) AS "awarded",
            COUNT(*) FILTER (WHERE s."status" = 'Submitted' AND st."kind" = 'Review' AND NOT EXISTS (
              SELECT 1 FROM "Reviews" rv WHERE rv."submissionId" = s.id::text AND rv."stageId" = s."stageId" AND rv."status" <> 'Recused'
            )) AS "needsReviewers"
          FROM "Submissions" s
          JOIN "Programs" p ON p.id::text = s."programId"
          LEFT JOIN "Stages" st ON st.id::text = s."stageId"
          WHERE s."programId" = $1`,
        params: [id],
      }),
      zite.sql({
        query: `
          SELECT st.id::text AS "stageId",
            (SELECT COUNT(*) FROM "Submissions" s WHERE s."stageId" = st.id::text AND s."status" = 'Submitted') AS "current",
            (SELECT COUNT(*) FROM "Submissions" s WHERE s."programId" = $1 AND s."status" <> 'Draft' AND (
              s."stageId" = st.id::text
              OR EXISTS (SELECT 1 FROM "Activity" a WHERE a."submissionId" = s.id::text AND a."type" = 'stage_changed' AND a."data" LIKE '%' || st.id::text || '%')
            )) AS "reached"
          FROM "Stages" st WHERE st."programId" = $1
          ORDER BY COALESCE(st."position", 0) ASC, st.created_at ASC`,
        params: [id],
      }),
      runSeries(`
          WITH b AS (
            SELECT
              GREATEST(
                LEAST(
                  (COALESCE(p."opensAt", p.created_at) AT TIME ZONE $2)::date,
                  COALESCE((SELECT MIN((s."submittedAt" AT TIME ZONE $2)::date) FROM "Submissions" s WHERE s."programId" = $1), (NOW() AT TIME ZONE $2)::date),
                  (NOW() AT TIME ZONE $2)::date
                ),
                (NOW() AT TIME ZONE $2)::date - 365
              ) AS "start",
              (NOW() AT TIME ZONE $2)::date AS "finish"
            FROM "Programs" p WHERE p.id::text = $1
          ),
          days AS (SELECT generate_series(b."start", b."finish", INTERVAL '1 day')::date AS "day" FROM b),
          sub AS (
            SELECT (s."submittedAt" AT TIME ZONE $2)::date AS "day", COUNT(*) AS n FROM "Submissions" s
            WHERE s."programId" = $1 AND s."submittedAt" IS NOT NULL AND s."status" <> 'Draft' GROUP BY 1
          ),
          began AS (
            SELECT (COALESCE(s."startedAt", s.created_at) AT TIME ZONE $2)::date AS "day", COUNT(*) AS n FROM "Submissions" s
            WHERE s."programId" = $1 GROUP BY 1
          )
          SELECT to_char(days."day", 'YYYY-MM-DD') AS "day", COALESCE(sub.n, 0) AS "submitted", COALESCE(began.n, 0) AS "started"
          FROM days LEFT JOIN sub ON sub."day" = days."day" LEFT JOIN began ON began."day" = days."day"
          ORDER BY days."day" ASC`),
      zite.sql({
        query: `
          SELECT
            COUNT(*) FILTER (WHERE r."status" <> 'Recused') AS "assigned",
            COUNT(*) FILTER (WHERE r."status" = 'Submitted') AS "submitted",
            COUNT(*) FILTER (WHERE r."status" = 'Recused') AS "recused",
            COUNT(*) FILTER (WHERE r."status" IN ('Assigned', 'In progress') AND s."status" = 'Submitted') AS "open",
            COUNT(*) FILTER (WHERE r."status" IN ('Assigned', 'In progress') AND s."status" = 'Submitted' AND r."dueDate" < CURRENT_DATE) AS "overdue",
            AVG(r."totalScore") FILTER (WHERE r."status" = 'Submitted') AS "mean"
          FROM "Reviews" r JOIN "Submissions" s ON s.id::text = r."submissionId"
          WHERE r."programId" = $1`,
        params: [id],
      }),
      zite.sql({
        query: `
          SELECT r."reviewerId",
            COUNT(*) FILTER (WHERE r."status" = 'Submitted') AS "submitted",
            COUNT(*) FILTER (WHERE r."status" IN ('Assigned', 'In progress') AND s."status" = 'Submitted') AS "open",
            COUNT(*) FILTER (WHERE r."status" IN ('Assigned', 'In progress') AND s."status" = 'Submitted' AND r."dueDate" < CURRENT_DATE) AS "overdue"
          FROM "Reviews" r JOIN "Submissions" s ON s.id::text = r."submissionId"
          WHERE r."programId" = $1 AND COALESCE(r."reviewerId", '') <> ''
          GROUP BY r."reviewerId"
          ORDER BY COUNT(*) FILTER (WHERE r."status" IN ('Assigned', 'In progress') AND s."status" = 'Submitted') DESC, COUNT(*) FILTER (WHERE r."status" = 'Submitted') DESC
          LIMIT 5`,
        params: [id],
      }),
      zite.sql({
        query: `
          SELECT
            COALESCE(SUM(pm."amount") FILTER (WHERE pm."status" = 'Paid'), 0) AS "paid",
            COALESCE(SUM(pm."amount") FILTER (WHERE pm."status" IN ('Scheduled', 'On hold')), 0) AS "scheduled"
          FROM "Payments" pm WHERE pm."programId" = $1`,
        params: [id],
      }),
      zite.sql({
        query: `
          SELECT a.id, a."type", a."submissionId", a."actorId", a."actorType", a."data", a."occurredAt",
            s."number", s."title", ap."name" AS "applicantName", actorApplicant."name" AS "actorApplicantName"
          FROM "Activity" a
          LEFT JOIN "Submissions" s ON s.id::text = a."submissionId"
          LEFT JOIN "Applicants" ap ON ap.id::text = s."applicantId"
          LEFT JOIN "Applicants" actorApplicant ON a."actorType" = 'Applicant' AND actorApplicant.id::text = a."actorId"
          WHERE a."programId" = $1 AND a."type" <> 'started'
          ORDER BY a."occurredAt" DESC NULLS LAST, a.created_at DESC
          LIMIT 15`,
        params: [id],
      }),
    ]);

    const c = countsRes.rows[0] ?? {};
    const rv = reviewRes.rows[0] ?? {};
    const pay = paymentsRes.rows[0] ?? {};
    const mean = numOrNull(rv.mean);

    return {
      program,
      stats: {
        counts: {
          started: num(c.started),
          drafts: num(c.drafts),
          submitted: num(c.submitted),
          inReview: num(c.inReview),
          accepted: num(c.accepted),
          waitlisted: num(c.waitlisted),
          declined: num(c.declined),
          withdrawn: num(c.withdrawn),
          unreleased: num(c.unreleased),
          late: num(c.late),
          needsReviewers: num(c.needsReviewers),
        },
        funnel: funnelRes.rows.map(f => ({ stageId: String(f.stageId), current: num(f.current), reached: num(f.reached) })),
        series: seriesRes.rows.map(s => ({ day: String(s.day), submitted: num(s.submitted), started: num(s.started) })),
        reviews: {
          assigned: num(rv.assigned),
          submitted: num(rv.submitted),
          open: num(rv.open),
          overdue: num(rv.overdue),
          recused: num(rv.recused),
          mean: mean == null ? null : Math.round(mean * 10) / 10,
          top: topRes.rows.map(t => ({ memberId: String(t.reviewerId), submitted: num(t.submitted), open: num(t.open), overdue: num(t.overdue) })),
        },
        budget: { budget: program.budget, requested: num(c.requested), awarded: num(c.awarded), paid: num(pay.paid), scheduled: num(pay.scheduled) },
        activity: activityRes.rows.map(a => ({
          id: String(a.id),
          type: str(a.type) ?? '',
          submissionId: ref(a.submissionId),
          reference: a.number ? `${program.key}-${num(a.number)}` : null,
          title: str(a.title) || str(a.applicantName) || '',
          actorId: ref(a.actorId),
          actorType: str(a.actorType) || 'System',
          actorName: ref(a.actorApplicantName),
          data: parseData(a.data),
          occurredAt: iso(a.occurredAt),
        })),
      },
    };
  },
});
