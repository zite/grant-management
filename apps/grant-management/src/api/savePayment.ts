import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { logActivity } from '@project/shared/server/activity';
import { assertManager, getActor } from '@project/shared/server/members';
import { num, ref } from '@project/shared/server/sql';

/**
 * Award payments: a schedule of installments per accepted submission. Marking
 * one Paid records the date and moves a Pending award to Active; paying the
 * last scheduled amount doesn't close the award on its own — a final report
 * usually still has to come in.
 */
const Input = z.object({
  action: z.enum(['create', 'update', 'delete']),
  id: z.string().optional(),
  submissionId: z.string().optional(),
  name: z.string().trim().max(120).optional(),
  amount: z.number().min(0).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(['Scheduled', 'Paid', 'On hold', 'Cancelled']).optional(),
  method: z.enum(['ACH', 'Check', 'Wire', 'Card', 'Other']).nullable().optional(),
  reference: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export default createEndpoint({
  description: 'Schedule, record, edit or remove an award payment',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ id: z.string().nullable() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid payment', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);
    const now = new Date().toISOString();

    if (input.action === 'create') {
      if (!input.submissionId) throw new ZiteError('Which submission is this payment for?', 'BAD_REQUEST');
      const { rows } = await zite.sql({ query: `SELECT id, "programId", "applicantId", "status", "awardStatus" FROM "Submissions" WHERE id::text = $1`, params: [input.submissionId] });
      const s = rows[0];
      if (!s) throw new ZiteError('Submission not found', 'NOT_FOUND');
      if (s.status !== 'Accepted') throw new ZiteError('Payments can only be scheduled for accepted submissions', 'BAD_REQUEST');
      if (input.amount == null || input.amount <= 0) throw new ZiteError('Enter an amount', 'BAD_REQUEST');
      const status = input.status ?? 'Scheduled';
      const created = await zite.payments.create({
        record: {
          name: input.name || 'Payment',
          submissionId: input.submissionId,
          programId: String(s.programId),
          amount: input.amount,
          dueDate: input.dueDate ?? null,
          paidDate: status === 'Paid' ? input.paidDate ?? now.slice(0, 10) : null,
          status,
          method: input.method ?? null,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          recordedById: actor.id,
        },
      });
      if (status === 'Paid' && s.awardStatus === 'Pending') await zite.submissions.update({ id: input.submissionId, record: { awardStatus: 'Active' } });
      await logActivity({ type: 'payment_recorded', submissionId: input.submissionId, programId: ref(s.programId), applicantId: ref(s.applicantId), actorId: actor.id, actorType: 'Member', data: { amount: input.amount, status, name: input.name || 'Payment' } });
      return { id: created.id };
    }

    if (!input.id) throw new ZiteError('Which payment?', 'BAD_REQUEST');
    const { rows } = await zite.sql({
      query: `SELECT p.*, s."applicantId", s."awardStatus" FROM "Payments" p LEFT JOIN "Submissions" s ON s.id::text = p."submissionId" WHERE p.id::text = $1`,
      params: [input.id],
    });
    const p = rows[0];
    if (!p) throw new ZiteError('Payment not found', 'NOT_FOUND');
    const common = { submissionId: ref(p.submissionId), programId: ref(p.programId), applicantId: ref(p.applicantId), actorId: actor.id, actorType: 'Member' as const };

    if (input.action === 'delete') {
      if (p.status === 'Paid') throw new ZiteError('A paid payment is part of the financial record — cancel it instead of deleting', 'CONFLICT');
      await zite.payments.delete({ id: input.id });
      await logActivity({ ...common, type: 'payment_updated', data: { removed: true, amount: num(p.amount), name: p.name } });
      return { id: null };
    }

    const patch: Record<string, unknown> = {};
    for (const key of ['name', 'amount', 'dueDate', 'method', 'reference', 'notes'] as const) {
      if (input[key] !== undefined) patch[key] = input[key];
    }
    if (input.status !== undefined) {
      patch.status = input.status;
      if (input.status === 'Paid') patch.paidDate = input.paidDate ?? p.paidDate ?? now.slice(0, 10);
      else patch.paidDate = null;
    } else if (input.paidDate !== undefined) patch.paidDate = input.paidDate;
    await zite.payments.update({ id: input.id, record: patch as never });
    if (patch.status === 'Paid' && p.awardStatus === 'Pending' && p.submissionId) await zite.submissions.update({ id: String(p.submissionId), record: { awardStatus: 'Active' } });
    await logActivity({ ...common, type: patch.status === 'Paid' && p.status !== 'Paid' ? 'payment_recorded' : 'payment_updated', data: { amount: num(patch.amount ?? p.amount), status: patch.status ?? p.status, name: patch.name ?? p.name } });
    return { id: input.id };
  },
});
