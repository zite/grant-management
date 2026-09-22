import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { deriveSummary, parseFields, sanitizeAnswers } from '@project/shared/forms/logic';
import { logActivity, type ActivityInput } from '@project/shared/server/activity';
import { assertManager, getActor } from '@project/shared/server/members';
import { notify } from '@project/shared/server/notify';
import { applicationForm, moveToStage } from '@project/shared/server/pipeline';
import { day, numOrNull, ref, str } from '@project/shared/server/sql';

const Input = z.object({
  id: z.string().min(1),
  stageId: z.string().optional(),
  ownerId: z.string().nullable().optional(),
  title: z.string().max(200).optional(),
  requestedAmount: z.number().min(0).nullable().optional(),
  awardAmount: z.number().min(0).nullable().optional(),
  awardStatus: z.enum(['Pending', 'Active', 'Completed', 'Cancelled']).nullable().optional(),
  awardStartDate: z.string().nullable().optional(),
  awardEndDate: z.string().nullable().optional(),
  decisionReason: z.string().max(200).nullable().optional(),
  decisionNote: z.string().max(5000).nullable().optional(),
  /** Staff can withdraw on an applicant's behalf, or put a withdrawn submission back in the pipeline. */
  status: z.enum(['Submitted', 'Withdrawn']).optional(),
  /** Staff corrections to answers, recorded in history. */
  answers: z.record(z.any()).optional(),
});

export default createEndpoint({
  description: 'Change a submission’s stage, owner, amounts, award details or answers',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ id: z.string(), assigned: z.number() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid update', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);

    const { rows } = await zite.sql({ query: `SELECT * FROM "Submissions" WHERE id::text = $1`, params: [input.id] });
    const s = rows[0];
    if (!s) throw new ZiteError('Submission not found', 'NOT_FOUND');
    const programId = String(s.programId);
    const common = { submissionId: input.id, programId, applicantId: ref(s.applicantId), actorId: actor.id, actorType: 'Member' as const };
    const patch: Record<string, unknown> = {};
    const events: ActivityInput[] = [];

    if (input.ownerId !== undefined && (input.ownerId ?? null) !== ref(s.ownerId)) {
      if (input.ownerId) {
        const { rows: m } = await zite.sql({ query: `SELECT id FROM "Members" WHERE id::text = $1 AND "role" IN ('Admin', 'Manager')`, params: [input.ownerId] });
        if (!m.length) throw new ZiteError('Owners must be admins or managers', 'BAD_REQUEST');
      }
      patch.ownerId = input.ownerId ?? null;
      events.push({ ...common, type: 'owner_changed', data: { from: ref(s.ownerId), to: input.ownerId ?? null } });
    }
    if (input.title !== undefined && input.title.trim() !== (str(s.title) ?? '')) {
      patch.title = input.title.trim();
      events.push({ ...common, type: 'title_changed', data: { from: str(s.title), to: input.title.trim() } });
    }
    if (input.requestedAmount !== undefined && input.requestedAmount !== numOrNull(s.requestedAmount)) {
      patch.requestedAmount = input.requestedAmount;
      events.push({ ...common, type: 'amount_changed', data: { field: 'requestedAmount', from: numOrNull(s.requestedAmount), to: input.requestedAmount } });
    }
    const awardFields: Array<[keyof typeof input, string, (v: unknown) => unknown]> = [
      ['awardAmount', 'awardAmount', v => numOrNull(v)],
      ['awardStatus', 'awardStatus', v => ref(v)],
      ['awardStartDate', 'awardStartDate', v => day(v)],
      ['awardEndDate', 'awardEndDate', v => day(v)],
    ];
    for (const [key, column, read] of awardFields) {
      const next = input[key];
      if (next === undefined) continue;
      const before = read(s[column]);
      if ((next ?? null) === before) continue;
      if (key === 'awardAmount' && s.status !== 'Accepted') throw new ZiteError('Only accepted submissions have an award', 'BAD_REQUEST');
      patch[column] = next ?? null;
      events.push({ ...common, type: 'award_updated', data: { field: key, from: before, to: next ?? null } });
    }
    if (input.decisionReason !== undefined) patch.decisionReason = input.decisionReason ?? null;
    if (input.decisionNote !== undefined) patch.decisionNote = input.decisionNote ?? null;

    if (input.status && input.status !== s.status) {
      if (input.status === 'Withdrawn') {
        if (s.status === 'Draft') throw new ZiteError('Drafts can be deleted, not withdrawn', 'BAD_REQUEST');
        patch.status = 'Withdrawn';
        patch.withdrawnAt = new Date().toISOString();
        events.push({ ...common, type: 'withdrawn', data: { by: 'staff' } });
      } else {
        if (s.status !== 'Withdrawn') throw new ZiteError('Use Reopen decision to undo a decision', 'BAD_REQUEST');
        patch.status = 'Submitted';
        patch.withdrawnAt = null;
        events.push({ ...common, type: 'reopened', data: { from: 'Withdrawn' } });
      }
    }

    if (input.answers) {
      const form = await applicationForm(programId);
      if (!form) throw new ZiteError('This program has no application form', 'BAD_REQUEST');
      const fields = parseFields(form.fieldsJson);
      const answers = sanitizeAnswers(fields, input.answers);
      patch.answers = JSON.stringify(answers);
      const summary = deriveSummary(fields, answers, form);
      if (summary.title && input.title === undefined) patch.title = summary.title;
      if (summary.amount != null && input.requestedAmount === undefined) patch.requestedAmount = summary.amount;
      events.push({ ...common, type: 'answers_edited', data: {} });
    }

    if (Object.keys(patch).length) await zite.submissions.update({ id: input.id, record: patch as never });
    await logActivity(events);

    if (patch.ownerId && patch.ownerId !== actor.id) {
      await notify({
        recipientIds: [String(patch.ownerId)],
        type: 'owner_assigned',
        title: `${actor.name} made you the owner of ${str(s.title) || 'a submission'}`,
        submissionId: input.id,
        programId,
        actorId: actor.id,
      });
    }

    let assigned = 0;
    if (input.stageId && input.stageId !== ref(s.stageId)) {
      if (s.status === 'Draft') throw new ZiteError("Drafts aren't in the pipeline yet", 'BAD_REQUEST');
      const res = await moveToStage({ submissionIds: [input.id], stageId: input.stageId, actor });
      assigned = res.assigned;
    }
    return { id: input.id, assigned };
  },
});
