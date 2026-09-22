import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertManager, getActor } from '@project/shared/server/members';
import { Params, day, num, numOrNull, ref, str } from '@project/shared/server/sql';

/**
 * Every award payment across programs, for finance: what's coming up, what's
 * late, what went out. A payment's date is when it was paid if it has been,
 * otherwise when it is due — so "this month" means money that moved or is
 * meant to move this month. Totals are summed in SQL over the same filter.
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['Scheduled', 'Paid', 'On hold', 'Cancelled'] as const;

const Input = z.object({
  programId: z.string().optional(),
  statuses: z.array(z.enum(STATUSES, { errorMap: () => ({ message: 'Payment status must be Scheduled, Paid, On hold or Cancelled' }) })).optional(),
  /** Inclusive calendar days, compared with the paid date for paid payments and the due date otherwise. */
  from: z.string().regex(DAY).optional(),
  to: z.string().regex(DAY).optional(),
  /** Only unpaid payments due before today. */
  overdueOnly: z.boolean().optional(),
  submissionId: z.string().optional(),
  today: z.string().regex(DAY).optional(),
});

const row = z.object({
  id: z.string(),
  name: z.string(),
  amount: z.number(),
  dueDate: z.string().nullable(),
  paidDate: z.string().nullable(),
  status: z.string(),
  method: z.string().nullable(),
  reference: z.string(),
  notes: z.string(),
  recordedById: z.string().nullable(),
  overdue: z.boolean(),
  submissionId: z.string(),
  submissionReference: z.string(),
  submissionTitle: z.string(),
  submissionStatus: z.string(),
  awardStatus: z.string().nullable(),
  awardAmount: z.number().nullable(),
  programId: z.string(),
  applicantName: z.string(),
  organization: z.string(),
});

export type PaymentRow = z.infer<typeof row>;

export default createEndpoint({
  description: 'List award payments with their award, payee and program, plus totals',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({
    payments: z.array(row),
    totals: z.object({ count: z.number(), amount: z.number(), paid: z.number(), scheduled: z.number(), onHold: z.number(), cancelled: z.number(), overdue: z.number(), overdueCount: z.number() }),
    today: z.string(),
  }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw ?? {});
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid payment filters', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);
    const today = input.today ?? new Date().toISOString().slice(0, 10);
    if (input.from && input.to && input.from > input.to) throw new ZiteError('The start date needs to be before the end date', 'BAD_REQUEST');

    const p = new Params();
    const todayP = p.add(today);
    const where: string[] = [];
    if (input.programId) where.push(`py."programId" = ${p.add(input.programId)}`);
    if (input.submissionId) where.push(`py."submissionId" = ${p.add(input.submissionId)}`);
    if (input.statuses?.length) where.push(`py."status" = ANY(${p.add(input.statuses)}::text[])`);
    const effective = `(CASE WHEN py."status" = 'Paid' THEN COALESCE(py."paidDate", py."dueDate") ELSE py."dueDate" END)`;
    if (input.from) where.push(`${effective} >= ${p.add(input.from)}::date`);
    if (input.to) where.push(`${effective} <= ${p.add(input.to)}::date`);
    if (input.overdueOnly) where.push(`py."status" IN ('Scheduled', 'On hold') AND py."dueDate" < ${todayP}::date`);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const overdue = `(py."status" IN ('Scheduled', 'On hold') AND py."dueDate" < ${todayP}::date)`;

    const [{ rows }, { rows: totalRows }] = await Promise.all([
      zite.sql({
        query: `
          SELECT py.id::text AS id, py."name", py."amount", py."dueDate", py."paidDate", py."status", py."method", py."reference", py."notes", py."recordedById",
            py."submissionId", py."programId", ${overdue} AS overdue,
            s."number", s."title", s."status" AS "submissionStatus", s."awardStatus", s."awardAmount",
            pr."key" AS "programKey", a."name" AS "applicantName", a."organization"
          FROM "Payments" py
          LEFT JOIN "Submissions" s ON s.id::text = py."submissionId"
          LEFT JOIN "Programs" pr ON pr.id::text = py."programId"
          LEFT JOIN "Applicants" a ON a.id::text = s."applicantId"
          ${whereSql}
          ORDER BY
            CASE WHEN py."status" IN ('Scheduled', 'On hold') THEN 0 WHEN py."status" = 'Paid' THEN 1 ELSE 2 END,
            CASE WHEN py."status" IN ('Scheduled', 'On hold') THEN py."dueDate" END ASC NULLS LAST,
            ${effective} DESC NULLS LAST,
            py.created_at DESC
          LIMIT 2000`,
        params: p.values,
      }),
      zite.sql({
        query: `
          SELECT COUNT(*) AS count,
            COALESCE(SUM(py."amount") FILTER (WHERE py."status" <> 'Cancelled'), 0) AS amount,
            COALESCE(SUM(py."amount") FILTER (WHERE py."status" = 'Paid'), 0) AS paid,
            COALESCE(SUM(py."amount") FILTER (WHERE py."status" = 'Scheduled'), 0) AS scheduled,
            COALESCE(SUM(py."amount") FILTER (WHERE py."status" = 'On hold'), 0) AS "onHold",
            COALESCE(SUM(py."amount") FILTER (WHERE py."status" = 'Cancelled'), 0) AS cancelled,
            COALESCE(SUM(py."amount") FILTER (WHERE ${overdue}), 0) AS overdue,
            COUNT(*) FILTER (WHERE ${overdue}) AS "overdueCount"
          FROM "Payments" py
          ${whereSql}`,
        params: p.values,
      }),
    ]);

    const t = totalRows[0] ?? {};
    return {
      today,
      payments: rows.map(r => ({
        id: String(r.id),
        name: str(r.name) || 'Payment',
        amount: num(r.amount),
        dueDate: day(r.dueDate),
        paidDate: day(r.paidDate),
        status: str(r.status) || 'Scheduled',
        method: ref(r.method),
        reference: str(r.reference) ?? '',
        notes: str(r.notes) ?? '',
        recordedById: ref(r.recordedById),
        overdue: r.overdue === true || r.overdue === 'true',
        submissionId: String(r.submissionId ?? ''),
        submissionReference: r.number ? `${str(r.programKey) || 'APP'}-${num(r.number)}` : '',
        submissionTitle: str(r.title) ?? '',
        submissionStatus: str(r.submissionStatus) ?? '',
        awardStatus: ref(r.awardStatus),
        awardAmount: numOrNull(r.awardAmount),
        programId: String(r.programId ?? ''),
        applicantName: str(r.applicantName) ?? '',
        organization: str(r.organization) ?? '',
      })),
      totals: {
        count: num(t.count),
        amount: num(t.amount),
        paid: num(t.paid),
        scheduled: num(t.scheduled),
        onHold: num(t.onHold),
        cancelled: num(t.cancelled),
        overdue: num(t.overdue),
        overdueCount: num(t.overdueCount),
      },
    };
  },
});
