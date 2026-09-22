import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { deriveSummary, parseFields, sanitizeAnswers } from '@project/shared/forms/logic';
import { getApplicant } from '@project/shared/server/applicants';
import { applicationForm } from '@project/shared/server/pipeline';
import { assertReasonableSize, loadOwnSubmission, parseInput } from '../server/portal';

const Input = z.object({
  id: z.string().trim().min(1).max(100),
  answers: z.record(z.any()),
});

/**
 * Autosave. Answers are re-sanitized against the form (anything that isn't a
 * question on it is dropped), but answers to questions hidden by a condition
 * are kept, so flipping an answer back and forth never destroys work.
 */
export default createEndpoint({
  description: 'Save your draft application',
  authenticated: true,
  inputSchema: Input,
  execute: async ({ input: raw, context }) => {
    const input = parseInput(Input, raw);
    assertReasonableSize(input.answers);
    const applicant = await getApplicant(context);
    const sub = await loadOwnSubmission(applicant.id, input.id);
    if (sub.status !== 'Draft') throw new ZiteError('This application has already been submitted, so it can no longer be changed.', 'CONFLICT');
    const form = await applicationForm(sub.programId);
    if (!form) throw new ZiteError("This program's application form is no longer available.", 'CONFLICT');
    const fields = parseFields(form.fieldsJson);
    const answers = sanitizeAnswers(fields, input.answers);
    const summary = deriveSummary(fields, answers, form);
    const savedAt = new Date().toISOString();
    await zite.submissions.update({
      id: sub.id,
      record: { answers: JSON.stringify(answers), title: summary.title || null, requestedAmount: summary.amount, lastSavedAt: savedAt },
    });
    return { savedAt, title: summary.title };
  },
});
