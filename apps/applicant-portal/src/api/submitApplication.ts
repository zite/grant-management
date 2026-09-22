import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { checkEligibility, deriveSummary, formatMoney, parseFields, sanitizeAnswers, validateAnswers } from '@project/shared/forms/logic';
import { logActivity } from '@project/shared/server/activity';
import { getApplicant } from '@project/shared/server/applicants';
import { sendTriggered } from '@project/shared/server/email';
import { programManagerIds } from '@project/shared/server/members';
import { notify } from '@project/shared/server/notify';
import { applicationForm, autoAssign, loadStages, nextNumber } from '@project/shared/server/pipeline';
import { getSettings } from '@project/shared/server/settings';
import { num, str } from '@project/shared/server/sql';
import { reference } from '@project/shared/status';
import { formatWhen, loadOwnSubmission, loadProgramRow, parseInput, sectionOf, toPublicProgram } from '../server/portal';

const Input = z.object({ id: z.string().trim().min(1).max(100) });

/**
 * Submit a draft. Every rule is checked again on the server — the deadline,
 * required answers, eligibility and the per-applicant limit — then the
 * application gets its reference number, enters the program's first stage,
 * and the applicant and the program's managers are told.
 */
export default createEndpoint({
  description: 'Submit your application',
  authenticated: true,
  inputSchema: Input,
  execute: async ({ input: raw, context }) => {
    const { id } = parseInput(Input, raw);
    const applicant = await getApplicant(context);
    const sub = await loadOwnSubmission(applicant.id, id);
    if (sub.status !== 'Draft') throw new ZiteError('This application has already been submitted.', 'CONFLICT');

    const programRow = await loadProgramRow({ id: sub.programId });
    if (!programRow || programRow.status !== 'Published') throw new ZiteError("This program is no longer accepting applications.", 'CONFLICT');
    const program = toPublicProgram(programRow);
    if (!program.accepting) {
      throw new ZiteError(
        program.phase === 'scheduled'
          ? `${program.name} opens for applications on ${formatWhen(program.opensAt)}.`
          : `The deadline for ${program.name} passed on ${formatWhen(program.deadline)}, so this application can't be submitted.`,
        'CONFLICT',
      );
    }

    const form = await applicationForm(program.id);
    if (!form) throw new ZiteError("This program's application form is no longer available.", 'CONFLICT');
    const fields = parseFields(form.fieldsJson);
    const answers = sanitizeAnswers(fields, sub.answers, { dropHidden: true });

    const errors = validateAnswers(fields, answers);
    const firstId = fields.find(f => errors[f.id])?.id;
    if (firstId) {
      const field = fields.find(f => f.id === firstId)!;
      const section = sectionOf(fields, firstId);
      const count = Object.keys(errors).length;
      throw new ZiteError(
        `${count === 1 ? 'One question needs' : `${count} questions need`} attention before you can submit. "${field.label}"${section ? ` in ${section}` : ''}: ${errors[firstId]}`,
        'BAD_REQUEST',
      );
    }
    const eligibility = checkEligibility(fields, answers);
    if (!eligibility.eligible) throw new ZiteError(eligibility.reasons[0].message, 'BAD_REQUEST');

    const max = num(programRow.maxPerApplicant, 1) || 1;
    const { rows: others } = await zite.sql({
      query: `SELECT COUNT(*) AS n FROM "Submissions" WHERE "programId" = $1 AND "applicantId" = $2 AND "status" NOT IN ('Draft', 'Withdrawn') AND id::text <> $3`,
      params: [program.id, applicant.id, sub.id],
    });
    if (num(others[0]?.n) >= max) {
      throw new ZiteError(max === 1 ? `You've already submitted an application to ${program.name}. Each applicant can submit one.` : `You've reached the limit of ${max} applications to ${program.name}.`, 'CONFLICT');
    }

    const summary = deriveSummary(fields, answers, form);
    const number = await nextNumber(program.id);
    const stages = await loadStages(program.id);
    const first = stages[0] ?? null;
    const now = new Date().toISOString();
    await zite.submissions.update({
      id: sub.id,
      record: {
        status: 'Submitted',
        number,
        answers: JSON.stringify(answers),
        title: summary.title || null,
        requestedAmount: summary.amount,
        stageId: first?.id ?? null,
        stageEnteredAt: first ? now : null,
        submittedAt: now,
        lastSavedAt: now,
        lastActivityAt: now,
      },
    });
    const ref = reference(program.key, number);
    const title = summary.title || 'Untitled application';

    await logActivity({ type: 'submitted', submissionId: sub.id, programId: program.id, applicantId: applicant.id, actorId: applicant.id, actorType: 'Applicant', data: { reference: ref }, occurredAt: now });

    if (first?.kind === 'Review' && num(programRow.reviewersPerSubmission) > 0) {
      await autoAssign({ submissionIds: [sub.id], stageId: first.id, programId: program.id, target: num(programRow.reviewersPerSubmission), actor: null }).catch(e =>
        console.error('Auto-assign on submit failed', e instanceof Error ? e.message : e),
      );
    }

    const settings = await getSettings();
    const confirmation = await sendTriggered({
      trigger: 'Submission received',
      settings,
      applicant: { id: applicant.id, email: applicant.email, name: applicant.name },
      program: { id: program.id, name: program.name, key: program.key, deadline: program.deadline },
      submission: { id: sub.id, title, number },
      kind: 'Confirmation',
    }).catch(e => {
      console.error('Confirmation email failed', e instanceof Error ? e.message : e);
      return null;
    });

    const who = applicant.organization || applicant.name || applicant.email;
    await notify({
      recipientIds: await programManagerIds(program.id),
      type: 'submission_received',
      title: `New submission: ${title}`,
      body: summary.amount != null ? `${who} · ${formatMoney(summary.amount, settings.currency)} requested` : who,
      submissionId: sub.id,
      programId: program.id,
      actorId: applicant.id,
      actorType: 'Applicant',
      link: `/submission/${ref}`,
      occurredAt: now,
    });

    return {
      reference: ref,
      submittedAt: now,
      confirmationMessage: str(programRow.confirmationMessage) ?? '',
      emailed: confirmation?.delivery === 'Sent',
    };
  },
});
