import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertManager, getActor } from '@project/shared/server/members';
import { Params, num, numOrNull } from '@project/shared/server/sql';

/**
 * Program reporting in one payload, every number aggregated in SQL.
 *
 * The range is inclusive calendar days. Each section counts what HAPPENED in
 * the range by the event that defines it: applications by the day they were
 * submitted, decisions and awards by the day they were decided, withdrawals
 * by the day they were withdrawn, payments by the day they were paid, reviews
 * by the day they were assigned or submitted. The funnel is the exception —
 * it follows the applications STARTED in the range through to their outcome.
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const Input = z.object({
  from: z.string().regex(DAY).optional(),
  to: z.string().regex(DAY).optional(),
  programId: z.string().optional(),
  today: z.string().regex(DAY).optional(),
  /** The viewer's IANA time zone, so a day in the range starts at their midnight, not the server's. */
  timeZone: z.string().max(64).regex(/^[A-Za-z0-9_+\-]+(\/[A-Za-z0-9_+\-]+)*$/).optional(),
});

const n = z.number();
const nOrNull = z.number().nullable();
const Output = z.object({
  range: z.object({ from: z.string(), to: z.string(), days: n, allTime: z.boolean(), prevFrom: z.string().nullable(), prevTo: z.string().nullable() }),
  programId: z.string().nullable(),
  kpis: z.object({
    submitted: n, submittedPrev: nOrNull, started: n, startedSubmitted: n, decided: n, accepted: n, decidedPrev: nOrNull, acceptedPrev: nOrNull,
    requested: n, requestedPrev: nOrNull, awarded: n, awardedPrev: nOrNull, medianDaysToDecision: nOrNull, medianDaysToDecisionPrev: nOrNull,
  }),
  weekly: z.array(z.object({ week: z.string(), total: n, byProgram: z.record(n) })),
  funnel: z.object({ started: n, submitted: n, reviewed: n, decided: n, accepted: n, decidedWithoutReview: n, withdrawn: n }),
  outcomes: z.array(z.object({ programId: z.string(), budget: nOrNull, submitted: n, inReview: n, accepted: n, waitlisted: n, declined: n, withdrawn: n, requested: n, awarded: n, awardedToDate: n })),
  reviewOps: z.object({ assigned: n, submitted: n, recused: n, openNow: n, overdueNow: n, medianTurnaroundDays: nOrNull, submittedWithDue: n, submittedOnTime: n }),
  calibration: z.array(z.object({ reviewerId: z.string(), reviews: n, compared: n, avgScore: nOrNull, avgScoreCompared: nOrNull, othersAvg: nOrNull, delta: nOrNull })),
  declineReasons: z.array(z.object({ reason: z.string(), count: n })),
  reach: z.object({ applicants: n, returning: n, new: n, locations: z.array(z.object({ location: z.string(), count: n })) }),
  monthly: z.array(z.object({ month: z.string(), awarded: n, awardCount: n, paid: n, paymentCount: n })),
});

const shiftDay = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
const round1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

type Scope = { from: string; to: string; prevFrom: string | null; today: string; programId: string | null; tz: string };

/**
 * Bound parameters for one query, with each named value bound once however often it's referenced.
 * Timestamps are cut at local midnight in the viewer's zone; date-only fields compare as calendar days.
 */
function binder(values: Scope) {
  const p = new Params();
  const seen = new Map<string, string>();
  const bind = (key: keyof typeof values) => {
    if (!seen.has(key)) seen.set(key, p.add(values[key]));
    return seen.get(key)!;
  };
  return {
    params: p.values,
    from: () => `${bind('from')}::date`,
    to: () => `${bind('to')}::date`,
    today: () => `${bind('today')}::date`,
    /** A timestamp column as wall-clock time in the viewer's zone. */
    local: (col: string) => `(${col} AT TIME ZONE ${bind('tz')})`,
    /** A timestamp column within the range's local days. */
    inRange: (col: string) => `(${col} >= (${bind('from')}::date::timestamp AT TIME ZONE ${bind('tz')}) AND ${col} < ((${bind('to')}::date + 1)::timestamp AT TIME ZONE ${bind('tz')}))`,
    inPrev: (col: string) => `(${col} >= (${bind('prevFrom')}::date::timestamp AT TIME ZONE ${bind('tz')}) AND ${col} < (${bind('from')}::date::timestamp AT TIME ZONE ${bind('tz')}))`,
    /** A date-only column within the range. */
    inDays: (col: string) => `(${col}::date >= ${bind('from')}::date AND ${col}::date <= ${bind('to')}::date)`,
    program: (col: string) => (values.programId ? ` AND ${col} = ${bind('programId')}` : ''),
  };
}

export default createEndpoint({
  description: 'Program reporting: volume, funnel, outcomes, review operations, reach and money over a date range',
  authenticated: true,
  inputSchema: Input,
  outputSchema: Output,
  execute: async ({ input: raw, context }): Promise<z.infer<typeof Output>> => {
    const parsed = Input.safeParse(raw ?? {});
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid report range', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);

    const today = input.today ?? new Date().toISOString().slice(0, 10);
    const to = input.to ?? today;
    const programId = input.programId || null;
    let tz = 'UTC';
    if (input.timeZone && input.timeZone !== 'UTC') {
      try {
        const { rows } = await zite.sql({ query: `SELECT 1 AS ok FROM pg_timezone_names WHERE name = $1 LIMIT 1`, params: [input.timeZone] });
        if (rows.length) tz = input.timeZone;
      } catch {
        /* an unknown zone falls back to UTC */
      }
    }

    // "All time" starts at the earliest thing that happened in scope.
    let from = input.from ?? null;
    const allTime = !from;
    if (!from) {
      const b = binder({ from: to, to, prevFrom: null, today, programId, tz });
      const { rows } = await zite.sql({
        query: `SELECT to_char(LEAST(
            (SELECT MIN(${b.local('s."startedAt"')}) FROM "Submissions" s WHERE true${b.program('s."programId"')}),
            (SELECT MIN(${b.local('s."submittedAt"')}) FROM "Submissions" s WHERE true${b.program('s."programId"')}),
            (SELECT MIN(py."paidDate"::date)::timestamp FROM "Payments" py WHERE true${b.program('py."programId"')})
          ), 'YYYY-MM-DD') AS first`,
        params: b.params,
      });
      from = typeof rows[0]?.first === 'string' && DAY.test(rows[0].first) ? rows[0].first : to;
    }
    if (from > to) throw new ZiteError('The start of the range needs to be before its end', 'BAD_REQUEST');
    const periodDays = daysBetween(from, to) + 1;
    const prevFrom = allTime ? null : shiftDay(from, -periodDays);
    const values: Scope = { from, to, prevFrom, today, programId, tz };
    const q = () => binder(values);

    const kpi = q();
    const kpiSql = `
      SELECT
        COUNT(*) FILTER (WHERE ${kpi.inRange('s."submittedAt"')}) AS submitted,
        ${prevFrom ? `COUNT(*) FILTER (WHERE ${kpi.inPrev('s."submittedAt"')})` : 'NULL'} AS "submittedPrev",
        COUNT(*) FILTER (WHERE ${kpi.inRange('s."startedAt"')}) AS started,
        COUNT(*) FILTER (WHERE ${kpi.inRange('s."startedAt"')} AND s."submittedAt" IS NOT NULL) AS "startedSubmitted",
        COUNT(*) FILTER (WHERE s."status" IN ('Accepted', 'Declined', 'Waitlisted') AND ${kpi.inRange('s."decidedAt"')}) AS decided,
        COUNT(*) FILTER (WHERE s."status" = 'Accepted' AND ${kpi.inRange('s."decidedAt"')}) AS accepted,
        ${prevFrom ? `COUNT(*) FILTER (WHERE s."status" IN ('Accepted', 'Declined', 'Waitlisted') AND ${kpi.inPrev('s."decidedAt"')})` : 'NULL'} AS "decidedPrev",
        ${prevFrom ? `COUNT(*) FILTER (WHERE s."status" = 'Accepted' AND ${kpi.inPrev('s."decidedAt"')})` : 'NULL'} AS "acceptedPrev",
        COALESCE(SUM(s."requestedAmount") FILTER (WHERE ${kpi.inRange('s."submittedAt"')}), 0) AS requested,
        ${prevFrom ? `COALESCE(SUM(s."requestedAmount") FILTER (WHERE ${kpi.inPrev('s."submittedAt"')}), 0)` : 'NULL'} AS "requestedPrev",
        COALESCE(SUM(s."awardAmount") FILTER (WHERE s."status" = 'Accepted' AND COALESCE(s."awardStatus", '') <> 'Cancelled' AND ${kpi.inRange('s."decidedAt"')}), 0) AS awarded,
        ${prevFrom ? `COALESCE(SUM(s."awardAmount") FILTER (WHERE s."status" = 'Accepted' AND COALESCE(s."awardStatus", '') <> 'Cancelled' AND ${kpi.inPrev('s."decidedAt"')}), 0)` : 'NULL'} AS "awardedPrev",
        percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (s."decidedAt" - s."submittedAt")) / 86400)
          FILTER (WHERE s."status" IN ('Accepted', 'Declined', 'Waitlisted') AND s."submittedAt" IS NOT NULL AND ${kpi.inRange('s."decidedAt"')}) AS "medianDaysToDecision",
        ${prevFrom ? `percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (s."decidedAt" - s."submittedAt")) / 86400)
          FILTER (WHERE s."status" IN ('Accepted', 'Declined', 'Waitlisted') AND s."submittedAt" IS NOT NULL AND ${kpi.inPrev('s."decidedAt"')})` : 'NULL'} AS "medianDaysToDecisionPrev"
      FROM "Submissions" s
      WHERE true${kpi.program('s."programId"')}`;

    // Weekly volume, every week present even when nothing came in.
    const wk = q();
    const weeklySql = `
      WITH weeks AS (
        SELECT generate_series(date_trunc('week', ${wk.from()}::timestamp), date_trunc('week', ${wk.to()}::timestamp), interval '1 week') AS week
      )
      SELECT to_char(w.week, 'YYYY-MM-DD') AS week, s."programId", COUNT(s.id) AS n
      FROM weeks w
      LEFT JOIN "Submissions" s ON date_trunc('week', ${wk.local('s."submittedAt"')}) = w.week AND ${wk.inRange('s."submittedAt"')}${wk.program('s."programId"')}
      GROUP BY w.week, s."programId"
      ORDER BY w.week`;

    const fn = q();
    const funnelSql = `
      SELECT
        COUNT(*) AS started,
        COUNT(*) FILTER (WHERE s."submittedAt" IS NOT NULL) AS submitted,
        COUNT(*) FILTER (WHERE s."submittedAt" IS NOT NULL AND rv.done) AS reviewed,
        COUNT(*) FILTER (WHERE s."submittedAt" IS NOT NULL AND rv.done AND s."status" IN ('Accepted', 'Declined', 'Waitlisted')) AS decided,
        COUNT(*) FILTER (WHERE s."submittedAt" IS NOT NULL AND rv.done AND s."status" = 'Accepted') AS accepted,
        COUNT(*) FILTER (WHERE s."submittedAt" IS NOT NULL AND NOT rv.done AND s."status" IN ('Accepted', 'Declined', 'Waitlisted')) AS "decidedWithoutReview",
        COUNT(*) FILTER (WHERE s."status" = 'Withdrawn') AS withdrawn
      FROM "Submissions" s
      LEFT JOIN LATERAL (
        SELECT EXISTS (SELECT 1 FROM "Reviews" r WHERE r."submissionId" = s.id::text AND r."status" = 'Submitted') AS done
      ) rv ON true
      WHERE ${fn.inRange('s."startedAt"')}${fn.program('s."programId"')}`;

    const oc = q();
    const outcomesSql = `
      SELECT pr.id::text AS "programId", pr."budget",
        COUNT(s.id) FILTER (WHERE ${oc.inRange('s."submittedAt"')}) AS submitted,
        COUNT(s.id) FILTER (WHERE s."status" = 'Submitted' AND ${oc.inRange('s."submittedAt"')}) AS "inReview",
        COUNT(s.id) FILTER (WHERE s."status" = 'Accepted' AND ${oc.inRange('s."decidedAt"')}) AS accepted,
        COUNT(s.id) FILTER (WHERE s."status" = 'Waitlisted' AND ${oc.inRange('s."decidedAt"')}) AS waitlisted,
        COUNT(s.id) FILTER (WHERE s."status" = 'Declined' AND ${oc.inRange('s."decidedAt"')}) AS declined,
        COUNT(s.id) FILTER (WHERE s."status" = 'Withdrawn' AND ${oc.inRange('s."withdrawnAt"')}) AS withdrawn,
        COALESCE(SUM(s."requestedAmount") FILTER (WHERE ${oc.inRange('s."submittedAt"')}), 0) AS requested,
        COALESCE(SUM(s."awardAmount") FILTER (WHERE s."status" = 'Accepted' AND COALESCE(s."awardStatus", '') <> 'Cancelled' AND ${oc.inRange('s."decidedAt"')}), 0) AS awarded,
        COALESCE(SUM(s."awardAmount") FILTER (WHERE s."status" = 'Accepted' AND COALESCE(s."awardStatus", '') <> 'Cancelled'), 0) AS "awardedToDate"
      FROM "Programs" pr
      LEFT JOIN "Submissions" s ON s."programId" = pr.id::text
      WHERE true${oc.program('pr.id::text')}
      GROUP BY pr.id, pr."budget", pr."position", pr.created_at
      ORDER BY COALESCE(pr."position", 0) ASC, pr.created_at ASC`;

    const ro = q();
    const reviewOpsSql = `
      SELECT
        COUNT(*) FILTER (WHERE ${ro.inRange('r."assignedAt"')}) AS assigned,
        COUNT(*) FILTER (WHERE r."status" = 'Submitted' AND ${ro.inRange('r."submittedAt"')}) AS submitted,
        COUNT(*) FILTER (WHERE r."status" = 'Recused' AND ${ro.inRange('r."assignedAt"')}) AS recused,
        COUNT(*) FILTER (WHERE r."status" IN ('Assigned', 'In progress') AND s."status" = 'Submitted' AND COALESCE(s."stageId", '') = COALESCE(r."stageId", '')) AS "openNow",
        COUNT(*) FILTER (WHERE r."status" IN ('Assigned', 'In progress') AND s."status" = 'Submitted' AND COALESCE(s."stageId", '') = COALESCE(r."stageId", '') AND r."dueDate" < ${ro.today()}) AS "overdueNow",
        percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (r."submittedAt" - r."assignedAt")) / 86400)
          FILTER (WHERE r."status" = 'Submitted' AND r."assignedAt" IS NOT NULL AND ${ro.inRange('r."submittedAt"')}) AS "medianTurnaroundDays",
        COUNT(*) FILTER (WHERE r."status" = 'Submitted' AND r."dueDate" IS NOT NULL AND ${ro.inRange('r."submittedAt"')}) AS "submittedWithDue",
        COUNT(*) FILTER (WHERE r."status" = 'Submitted' AND r."dueDate" IS NOT NULL AND ${ro.local('r."submittedAt"')}::date <= r."dueDate"::date AND ${ro.inRange('r."submittedAt"')}) AS "submittedOnTime"
      FROM "Reviews" r
      LEFT JOIN "Submissions" s ON s.id::text = r."submissionId"
      WHERE true${ro.program('r."programId"')}`;

    // Each reviewer's score against the other reviewers of the same submission at the same stage (same rubric).
    const cal = q();
    const calibrationSql = `
      WITH mine AS (
        SELECT r.id, r."reviewerId", r."submissionId", COALESCE(r."stageId", '') AS stage, r."totalScore" AS score
        FROM "Reviews" r
        WHERE r."status" = 'Submitted' AND r."totalScore" IS NOT NULL AND COALESCE(r."reviewerId", '') <> '' AND ${cal.inRange('r."submittedAt"')}${cal.program('r."programId"')}
      ),
      paired AS (
        SELECT m."reviewerId", m.score,
          (SELECT AVG(o."totalScore") FROM "Reviews" o
            WHERE o."submissionId" = m."submissionId" AND COALESCE(o."stageId", '') = m.stage AND o.id <> m.id
              AND o."status" = 'Submitted' AND o."totalScore" IS NOT NULL) AS others
        FROM mine m
      )
      SELECT "reviewerId",
        COUNT(*) AS reviews,
        COUNT(others) AS compared,
        AVG(score) AS "avgScore",
        AVG(score) FILTER (WHERE others IS NOT NULL) AS "avgScoreCompared",
        AVG(others) AS "othersAvg",
        AVG(score - others) AS delta
      FROM paired
      GROUP BY "reviewerId"
      ORDER BY AVG(score - others) ASC NULLS LAST`;

    const dr = q();
    const declineSql = `
      SELECT COALESCE(NULLIF(TRIM(s."decisionReason"), ''), 'Not recorded') AS reason, COUNT(*) AS n
      FROM "Submissions" s
      WHERE s."status" = 'Declined' AND ${dr.inRange('s."decidedAt"')}${dr.program('s."programId"')}
      GROUP BY 1
      ORDER BY n DESC, reason ASC`;

    // Applicants who submitted in the range; returning means they had submitted anything before their first one in it.
    const ar = q();
    const cohort = `
      WITH cohort AS (
        SELECT s."applicantId", MIN(s."submittedAt") AS first
        FROM "Submissions" s
        WHERE COALESCE(s."applicantId", '') <> '' AND ${ar.inRange('s."submittedAt"')}${ar.program('s."programId"')}
        GROUP BY s."applicantId"
      )`;
    const reachSql = `${cohort}
      SELECT COUNT(*) AS applicants,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Submissions" e WHERE e."applicantId" = c."applicantId" AND e."submittedAt" < c.first)) AS returning
      FROM cohort c`;
    const lc = q();
    const locationsSql = `
      WITH cohort AS (
        SELECT DISTINCT s."applicantId"
        FROM "Submissions" s
        WHERE COALESCE(s."applicantId", '') <> '' AND ${lc.inRange('s."submittedAt"')}${lc.program('s."programId"')}
      )
      SELECT COALESCE(NULLIF(TRIM(split_part(COALESCE(a."location", ''), ',', 1)), ''), 'Not given') AS location, COUNT(*) AS n
      FROM cohort c
      JOIN "Applicants" a ON a.id::text = c."applicantId"
      GROUP BY 1
      ORDER BY n DESC, location ASC
      LIMIT 50`;

    const mo = q();
    const monthlySql = `
      WITH months AS (
        SELECT generate_series(date_trunc('month', ${mo.from()}::timestamp), date_trunc('month', ${mo.to()}::timestamp), interval '1 month') AS m
      ),
      awarded AS (
        SELECT date_trunc('month', ${mo.local('s."decidedAt"')}) AS m, SUM(s."awardAmount") AS amount, COUNT(*) AS n
        FROM "Submissions" s
        WHERE s."status" = 'Accepted' AND COALESCE(s."awardStatus", '') <> 'Cancelled' AND ${mo.inRange('s."decidedAt"')}${mo.program('s."programId"')}
        GROUP BY 1
      ),
      paid AS (
        SELECT date_trunc('month', py."paidDate"::date::timestamp) AS m, SUM(py."amount") AS amount, COUNT(*) AS n
        FROM "Payments" py
        WHERE py."status" = 'Paid' AND ${mo.inDays('py."paidDate"')}${mo.program('py."programId"')}
        GROUP BY 1
      )
      SELECT to_char(months.m, 'YYYY-MM-DD') AS month,
        COALESCE(awarded.amount, 0) AS awarded, COALESCE(awarded.n, 0) AS "awardCount",
        COALESCE(paid.amount, 0) AS paid, COALESCE(paid.n, 0) AS "paymentCount"
      FROM months
      LEFT JOIN awarded ON awarded.m = months.m
      LEFT JOIN paid ON paid.m = months.m
      ORDER BY months.m`;

    const [kpiRes, weeklyRes, funnelRes, outcomesRes, reviewOpsRes, calibrationRes, declineRes, reachRes, locationsRes, monthlyRes] = await Promise.all([
      zite.sql({ query: kpiSql, params: kpi.params }),
      zite.sql({ query: weeklySql, params: wk.params }),
      zite.sql({ query: funnelSql, params: fn.params }),
      zite.sql({ query: outcomesSql, params: oc.params }),
      zite.sql({ query: reviewOpsSql, params: ro.params }),
      zite.sql({ query: calibrationSql, params: cal.params }),
      zite.sql({ query: declineSql, params: dr.params }),
      zite.sql({ query: reachSql, params: ar.params }),
      zite.sql({ query: locationsSql, params: lc.params }),
      zite.sql({ query: monthlySql, params: mo.params }),
    ]);

    const k = kpiRes.rows[0] ?? {};
    const f = funnelRes.rows[0] ?? {};
    const r = reviewOpsRes.rows[0] ?? {};
    const reach = reachRes.rows[0] ?? {};

    // Weeks arrive one row per (week, program); a week with nothing in it is a single row with no program.
    const weekly = new Map<string, { week: string; total: number; byProgram: Record<string, number> }>();
    for (const row of weeklyRes.rows) {
      const week = String(row.week);
      const entry = weekly.get(week) ?? { week, total: 0, byProgram: {} };
      const n = num(row.n);
      if (row.programId && n > 0) {
        entry.byProgram[String(row.programId)] = n;
        entry.total += n;
      }
      weekly.set(week, entry);
    }

    const applicants = num(reach.applicants);
    const returning = num(reach.returning);

    return {
      range: { from, to, days: periodDays, allTime, prevFrom, prevTo: prevFrom ? shiftDay(from, -1) : null },
      programId,
      kpis: {
        submitted: num(k.submitted),
        submittedPrev: numOrNull(k.submittedPrev),
        started: num(k.started),
        startedSubmitted: num(k.startedSubmitted),
        decided: num(k.decided),
        accepted: num(k.accepted),
        decidedPrev: numOrNull(k.decidedPrev),
        acceptedPrev: numOrNull(k.acceptedPrev),
        requested: num(k.requested),
        requestedPrev: numOrNull(k.requestedPrev),
        awarded: num(k.awarded),
        awardedPrev: numOrNull(k.awardedPrev),
        medianDaysToDecision: round1(numOrNull(k.medianDaysToDecision)),
        medianDaysToDecisionPrev: round1(numOrNull(k.medianDaysToDecisionPrev)),
      },
      weekly: [...weekly.values()],
      funnel: {
        started: num(f.started),
        submitted: num(f.submitted),
        reviewed: num(f.reviewed),
        decided: num(f.decided),
        accepted: num(f.accepted),
        decidedWithoutReview: num(f.decidedWithoutReview),
        withdrawn: num(f.withdrawn),
      },
      outcomes: outcomesRes.rows.map(o => ({
        programId: String(o.programId),
        budget: numOrNull(o.budget),
        submitted: num(o.submitted),
        inReview: num(o.inReview),
        accepted: num(o.accepted),
        waitlisted: num(o.waitlisted),
        declined: num(o.declined),
        withdrawn: num(o.withdrawn),
        requested: num(o.requested),
        awarded: num(o.awarded),
        awardedToDate: num(o.awardedToDate),
      })),
      reviewOps: {
        assigned: num(r.assigned),
        submitted: num(r.submitted),
        recused: num(r.recused),
        openNow: num(r.openNow),
        overdueNow: num(r.overdueNow),
        medianTurnaroundDays: round1(numOrNull(r.medianTurnaroundDays)),
        submittedWithDue: num(r.submittedWithDue),
        submittedOnTime: num(r.submittedOnTime),
      },
      calibration: calibrationRes.rows.map(c => ({
        reviewerId: String(c.reviewerId),
        reviews: num(c.reviews),
        compared: num(c.compared),
        avgScore: round1(numOrNull(c.avgScore)),
        avgScoreCompared: round1(numOrNull(c.avgScoreCompared)),
        othersAvg: round1(numOrNull(c.othersAvg)),
        delta: round1(numOrNull(c.delta)),
      })),
      declineReasons: declineRes.rows.map(d => ({ reason: String(d.reason), count: num(d.n) })),
      reach: {
        applicants,
        returning,
        new: Math.max(0, applicants - returning),
        locations: locationsRes.rows.map(l => ({ location: String(l.location), count: num(l.n) })),
      },
      monthly: monthlyRes.rows.map(m => ({ month: String(m.month), awarded: num(m.awarded), awardCount: num(m.awardCount), paid: num(m.paid), paymentCount: num(m.paymentCount) })),
    };
  },
});
