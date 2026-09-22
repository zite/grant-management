import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertManager, getActor } from '@project/shared/server/members';
import { Params, day, num, numOrNull, ref, str } from '@project/shared/server/sql';

/**
 * The award portfolio: every accepted submission with what has been paid,
 * what is still to pay, what is held, the next installment due and the
 * follow-ups the recipient still owes. All money is summed in SQL.
 *
 * `today` is the viewer's calendar day, so "overdue" and "the next 30 days"
 * agree with the dates they see rather than the server's clock.
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const AWARD_STATUSES = ['Pending', 'Active', 'Completed', 'Cancelled'] as const;

const Input = z.object({
  programId: z.string().max(64).optional(),
  awardStatuses: z.array(z.enum(AWARD_STATUSES, { errorMap: () => ({ message: 'Award status must be Pending, Active, Completed or Cancelled' }) })).optional(),
  overdueReportsOnly: z.boolean().optional(),
  onHoldOnly: z.boolean().optional(),
  today: z.string().regex(DAY).optional(),
});

const row = z.object({
  id: z.string(),
  reference: z.string(),
  number: z.number(),
  title: z.string(),
  programId: z.string(),
  applicantId: z.string().nullable(),
  applicantName: z.string(),
  applicantEmail: z.string(),
  organization: z.string(),
  ownerId: z.string().nullable(),
  requestedAmount: z.number().nullable(),
  awardAmount: z.number(),
  awardStatus: z.string(),
  awardStartDate: z.string().nullable(),
  awardEndDate: z.string().nullable(),
  decidedAt: z.string().nullable(),
  paid: z.number(),
  scheduled: z.number(),
  onHold: z.number(),
  paymentCount: z.number(),
  nextPayment: z.object({ id: z.string(), name: z.string(), dueDate: z.string().nullable(), amount: z.number(), status: z.string() }).nullable(),
  openTasks: z.number(),
  tasksToReview: z.number(),
  overdueTasks: z.number(),
});

const totals = z.object({
  awards: z.number(),
  totalAwarded: z.number(),
  paidToDate: z.number(),
  scheduledNext30: z.number(),
  scheduledOverdue: z.number(),
  onHold: z.number(),
  onHoldCount: z.number(),
  activeAwards: z.number(),
  pendingAwards: z.number(),
  reportsOverdue: z.number(),
  awardsWithOverdueReports: z.number(),
  remaining: z.number(),
});

export type AwardRow = z.infer<typeof row>;

export default createEndpoint({
  description: 'List accepted submissions as awards, with payment and follow-up totals',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ awards: z.array(row), totals, today: z.string() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw ?? {});
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid award filters', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);
    const today = input.today ?? new Date().toISOString().slice(0, 10);

    // One CTE feeds both the rows and the portfolio totals, so they can never disagree.
    const p = new Params();
    const todayP = p.add(today);
    const scope: string[] = [`s."status" = 'Accepted'`];
    if (input.programId) scope.push(`s."programId" = ${p.add(input.programId)}`);

    // Never name a CTE after a table: Zite's SQL layer matched `"Tasks"` to a CTE called `tasks` and failed.
    const base = `
      WITH pay AS (
        SELECT py."submissionId",
          COALESCE(SUM(py."amount") FILTER (WHERE py."status" = 'Paid'), 0) AS paid,
          COALESCE(SUM(py."amount") FILTER (WHERE py."status" = 'Scheduled'), 0) AS scheduled,
          COALESCE(SUM(py."amount") FILTER (WHERE py."status" = 'On hold'), 0) AS "onHold",
          COALESCE(SUM(py."amount") FILTER (WHERE py."status" = 'Scheduled' AND py."dueDate" <= ${todayP}::date + 30), 0) AS "scheduledNext30",
          COALESCE(SUM(py."amount") FILTER (WHERE py."status" = 'Scheduled' AND py."dueDate" < ${todayP}::date), 0) AS "scheduledOverdue",
          COUNT(*) FILTER (WHERE py."status" = 'On hold') AS "onHoldCount",
          COUNT(*) AS "paymentCount"
        FROM "Payments" py
        GROUP BY py."submissionId"
      ),
      task_counts AS (
        SELECT t."submissionId",
          COUNT(*) FILTER (WHERE t."status" IN ('Open', 'Returned', 'Submitted')) AS "openTasks",
          COUNT(*) FILTER (WHERE t."status" = 'Submitted') AS "tasksToReview",
          COUNT(*) FILTER (WHERE t."status" IN ('Open', 'Returned') AND t."dueDate" < ${todayP}::date) AS "overdueTasks"
        FROM "Tasks" t
        GROUP BY t."submissionId"
      ),
      awards AS (
        SELECT s.id::text AS id, s."number", s."title", s."programId", s."applicantId", s."ownerId", s."requestedAmount",
          COALESCE(s."awardAmount", 0) AS "awardAmount", COALESCE(NULLIF(s."awardStatus", ''), 'Pending') AS "awardStatus",
          s."awardStartDate", s."awardEndDate", s."decidedAt",
          pr."key" AS "programKey", pr."position" AS "programPosition",
          a."name" AS "applicantName", a."email" AS "applicantEmail", a."organization",
          COALESCE(pay.paid, 0) AS paid, COALESCE(pay.scheduled, 0) AS scheduled, COALESCE(pay."onHold", 0) AS "onHold",
          COALESCE(pay."scheduledNext30", 0) AS "scheduledNext30", COALESCE(pay."scheduledOverdue", 0) AS "scheduledOverdue",
          COALESCE(pay."onHoldCount", 0) AS "onHoldCount", COALESCE(pay."paymentCount", 0) AS "paymentCount",
          COALESCE(task_counts."openTasks", 0) AS "openTasks", COALESCE(task_counts."tasksToReview", 0) AS "tasksToReview", COALESCE(task_counts."overdueTasks", 0) AS "overdueTasks",
          nx.id AS "nextId", nx."name" AS "nextName", nx."dueDate" AS "nextDue", nx."amount" AS "nextAmount", nx."status" AS "nextStatus"
        FROM "Submissions" s
        LEFT JOIN "Programs" pr ON pr.id::text = s."programId"
        LEFT JOIN "Applicants" a ON a.id::text = s."applicantId"
        LEFT JOIN pay ON pay."submissionId" = s.id::text
        LEFT JOIN task_counts ON task_counts."submissionId" = s.id::text
        LEFT JOIN LATERAL (
          SELECT py.id::text AS id, py."name", py."dueDate", py."amount", py."status"
          FROM "Payments" py
          WHERE py."submissionId" = s.id::text AND py."status" IN ('Scheduled', 'On hold')
          ORDER BY py."dueDate" ASC NULLS LAST, py.created_at ASC
          LIMIT 1
        ) nx ON true
        WHERE ${scope.join(' AND ')}
      )`;

    const baseParams = p.values.length;
    const filters: string[] = [];
    if (input.awardStatuses?.length) filters.push(`"awardStatus" = ANY(${p.add(input.awardStatuses)}::text[])`);
    if (input.overdueReportsOnly) filters.push(`"overdueTasks" > 0`);
    if (input.onHoldOnly) filters.push(`"onHoldCount" > 0`);

    const [{ rows }, { rows: totalRows }] = await Promise.all([
      zite.sql({
        query: `${base}
          SELECT * FROM awards ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
          ORDER BY COALESCE("programPosition", 0) ASC, "programKey" ASC,
            CASE "awardStatus" WHEN 'Active' THEN 0 WHEN 'Pending' THEN 1 WHEN 'Completed' THEN 2 ELSE 3 END,
            "nextDue" ASC NULLS LAST, "number" ASC
          LIMIT 2000`,
        params: p.values,
      }),
      // Portfolio totals follow the program choice only: the strip describes the portfolio, filters narrow the table.
      zite.sql({
        query: `${base}
          SELECT
            COUNT(*) AS awards,
            COALESCE(SUM("awardAmount") FILTER (WHERE "awardStatus" <> 'Cancelled'), 0) AS "totalAwarded",
            COALESCE(SUM(paid), 0) AS "paidToDate",
            COALESCE(SUM("scheduledNext30"), 0) AS "scheduledNext30",
            COALESCE(SUM("scheduledOverdue"), 0) AS "scheduledOverdue",
            COALESCE(SUM("onHold"), 0) AS "onHold",
            COALESCE(SUM("onHoldCount"), 0) AS "onHoldCount",
            COUNT(*) FILTER (WHERE "awardStatus" = 'Active') AS "activeAwards",
            COUNT(*) FILTER (WHERE "awardStatus" = 'Pending') AS "pendingAwards",
            COALESCE(SUM("overdueTasks"), 0) AS "reportsOverdue",
            COUNT(*) FILTER (WHERE "overdueTasks" > 0) AS "awardsWithOverdueReports",
            COALESCE(SUM(GREATEST("awardAmount" - paid, 0)) FILTER (WHERE "awardStatus" <> 'Cancelled'), 0) AS remaining
          FROM awards`,
        params: p.values.slice(0, baseParams),
      }),
    ]);

    const t = totalRows[0] ?? {};
    return {
      today,
      awards: rows.map(r => ({
        id: String(r.id),
        reference: r.number ? `${str(r.programKey) || 'APP'}-${num(r.number)}` : 'Draft',
        number: num(r.number),
        title: str(r.title) || '',
        programId: String(r.programId ?? ''),
        applicantId: ref(r.applicantId),
        applicantName: str(r.applicantName) ?? '',
        applicantEmail: str(r.applicantEmail) ?? '',
        organization: str(r.organization) ?? '',
        ownerId: ref(r.ownerId),
        requestedAmount: numOrNull(r.requestedAmount),
        awardAmount: num(r.awardAmount),
        awardStatus: str(r.awardStatus) || 'Pending',
        awardStartDate: day(r.awardStartDate),
        awardEndDate: day(r.awardEndDate),
        decidedAt: r.decidedAt ? new Date(String(r.decidedAt)).toISOString() : null,
        paid: num(r.paid),
        scheduled: num(r.scheduled),
        onHold: num(r.onHold),
        paymentCount: num(r.paymentCount),
        nextPayment: r.nextId ? { id: String(r.nextId), name: str(r.nextName) || 'Payment', dueDate: day(r.nextDue), amount: num(r.nextAmount), status: str(r.nextStatus) || 'Scheduled' } : null,
        openTasks: num(r.openTasks),
        tasksToReview: num(r.tasksToReview),
        overdueTasks: num(r.overdueTasks),
      })),
      totals: {
        awards: num(t.awards),
        totalAwarded: num(t.totalAwarded),
        paidToDate: num(t.paidToDate),
        scheduledNext30: num(t.scheduledNext30),
        scheduledOverdue: num(t.scheduledOverdue),
        onHold: num(t.onHold),
        onHoldCount: num(t.onHoldCount),
        activeAwards: num(t.activeAwards),
        pendingAwards: num(t.pendingAwards),
        reportsOverdue: num(t.reportsOverdue),
        awardsWithOverdueReports: num(t.awardsWithOverdueReports),
        remaining: num(t.remaining),
      },
    };
  },
});
