import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { deriveSummary, parseFields, sanitizeAnswers } from '@project/shared/forms/logic';
import type { FormField } from '@project/shared/forms/types';
import { logActivity } from '@project/shared/server/activity';
import { ensureApplicant } from '@project/shared/server/applicants';
import { assertManager, getActor, programManagerIds } from '@project/shared/server/members';
import { notify } from '@project/shared/server/notify';
import { applicationForm, autoAssign, loadProgram, loadStages, nextNumber } from '@project/shared/server/pipeline';

/**
 * Staff entering an application that arrived on paper or by email.
 *
 * "Submitted" puts it straight into the pipeline: it gets the next reference
 * number, lands in the program's first stage and, when that stage is a review
 * stage, gets reviewers like any portal submission. "Draft" starts it for the
 * applicant to finish — they pick it up in the portal when they sign in with
 * that email.
 */
const Input = z.object({
  programId: z.string().min(1, 'Choose a program'),
  applicant: z.object({
    email: z.string().trim().email('Enter the applicant’s email address'),
    name: z.string().trim().max(160).optional(),
    organization: z.string().trim().max(200).optional(),
    phone: z.string().trim().max(60).optional(),
  }),
  title: z.string().trim().max(200, 'Keep the title under 200 characters').optional(),
  requestedAmount: z.number().min(0, 'The amount can’t be negative').nullable().optional(),
  answers: z.record(z.any()).optional(),
  status: z.enum(['Submitted', 'Draft']),
  /** When a paper application actually arrived (YYYY-MM-DD), so it isn't marked late for being typed in after the deadline. */
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().trim().max(10000).optional(),
});

export default createEndpoint({
  description: 'Create a submission on an applicant’s behalf, in review or as a draft',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ id: z.string(), reference: z.string(), status: z.string(), assigned: z.number() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Check the details and try again', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);

    const program = await loadProgram(input.programId);
    if (!program) throw new ZiteError('That program no longer exists', 'NOT_FOUND');
    if (program.status === 'Archived') throw new ZiteError(`${program.name} is archived. Restore it before adding submissions.`, 'BAD_REQUEST');

    const applicant = await ensureApplicant(input.applicant);
    // Fill in details we didn't have, never overwrite what the applicant wrote themselves.
    const fill: Record<string, string> = {};
    if (input.applicant.organization && !applicant.organization) fill.organization = input.applicant.organization;
    if (input.applicant.phone && !applicant.phone) fill.phone = input.applicant.phone;
    if (Object.keys(fill).length) await zite.applicants.update({ id: applicant.id, record: fill as never });

    const form = await applicationForm(program.id);
    const fields: FormField[] = form ? parseFields(form.fieldsJson) : [];
    const answers = form ? sanitizeAnswers(fields, input.answers ?? {}) : {};
    const summary = form ? deriveSummary(fields, answers, form) : { title: '', amount: null };
    const title = input.title?.trim() || summary.title || `${fill.organization || applicant.organization || applicant.name}’s application`;
    const requestedAmount = input.requestedAmount ?? summary.amount ?? null;

    const now = new Date().toISOString();
    const submitted = input.status === 'Submitted';
    let submittedAt = now;
    if (submitted && input.receivedOn && input.receivedOn < now.slice(0, 10)) submittedAt = `${input.receivedOn}T12:00:00.000Z`;

    let number: number | null = null;
    let firstStage: Awaited<ReturnType<typeof loadStages>>[number] | null = null;
    if (submitted) {
      const stages = await loadStages(program.id);
      firstStage = stages[0] ?? null;
      number = await nextNumber(program.id);
    }

    const created = await zite.submissions.create({
      record: {
        title,
        number,
        programId: program.id,
        applicantId: applicant.id,
        stageId: firstStage?.id ?? null,
        ownerId: null,
        status: input.status,
        answers: JSON.stringify(answers),
        requestedAmount,
        awardAmount: null,
        awardStatus: null,
        awardStartDate: null,
        awardEndDate: null,
        decisionReason: null,
        decisionNote: null,
        startedAt: submitted ? submittedAt : now,
        lastSavedAt: now,
        submittedAt: submitted ? submittedAt : null,
        stageEnteredAt: submitted ? now : null,
        decidedAt: null,
        decidedById: null,
        notifiedAt: null,
        withdrawnAt: null,
        lastActivityAt: now,
        remindedAt: null,
      },
    });
    const id = created.id;
    const reference = number ? `${program.key}-${number}` : 'Draft';
    const common = { submissionId: id, programId: program.id, applicantId: applicant.id, actorId: actor.id, actorType: 'Member' as const };

    await logActivity([
      { ...common, type: 'created_by_staff', data: { status: input.status, applicantName: applicant.name }, occurredAt: now },
      ...(submitted ? [{ ...common, type: 'submitted' as const, data: { by: 'staff', receivedOn: submittedAt !== now ? input.receivedOn : null }, occurredAt: now }] : []),
    ]);

    let assigned = 0;
    if (submitted && firstStage?.kind === 'Review' && program.reviewersPerSubmission > 0) {
      const res = await autoAssign({ submissionIds: [id], stageId: firstStage.id, programId: program.id, target: program.reviewersPerSubmission, actor });
      assigned = res.created;
    }

    if (input.note) {
      await zite.notes.create({ record: { body: input.note, submissionId: id, applicantId: applicant.id, authorId: actor.id, postedAt: now, editedAt: null } });
    }

    if (submitted) {
      await notify({
        recipientIds: await programManagerIds(program.id),
        type: 'submission_received',
        title: `${actor.name} added ${reference} · ${title}`,
        body: `Entered on behalf of ${applicant.name}${firstStage ? `, now in ${firstStage.name}` : ''}.`,
        submissionId: id,
        programId: program.id,
        actorId: actor.id,
        link: `/submission/${reference}`,
      });
    }

    return { id, reference, status: input.status, assigned };
  },
});
