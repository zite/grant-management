import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { sanitizeAnswers } from '@project/shared/forms/logic';
import { getApplicant } from '@project/shared/server/applicants';
import { assertReasonableSize, parseInput } from '../server/portal';
import { isTaskEditable, loadOwnTask } from '../server/tasks';

const Input = z.object({
  id: z.string().trim().min(1).max(100),
  answers: z.record(z.any()),
});

/** Autosave for a task in progress. Nothing is sent to staff until it's submitted. */
export default createEndpoint({
  description: 'Save your progress on a task',
  authenticated: true,
  inputSchema: Input,
  execute: async ({ input: raw, context }) => {
    const input = parseInput(Input, raw);
    assertReasonableSize(input.answers);
    const applicant = await getApplicant(context);
    const task = await loadOwnTask(applicant.id, input.id);
    if (!isTaskEditable(task.status)) throw new ZiteError('This request has already been submitted, so it can no longer be changed.', 'CONFLICT');
    const answers = sanitizeAnswers(task.fields, input.answers);
    await zite.tasks.update({ id: task.id, record: { answers: JSON.stringify(answers) } });
    return { savedAt: new Date().toISOString() };
  },
});
