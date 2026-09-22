import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { sanitizeAnswers, validateAnswers } from '@project/shared/forms/logic';
import { logActivity } from '@project/shared/server/activity';
import { getApplicant } from '@project/shared/server/applicants';
import { notify } from '@project/shared/server/notify';
import { freeFormProblem } from '../lib/tasks';
import { assertReasonableSize, parseInput } from '../server/portal';
import { isTaskEditable, loadOwnTask } from '../server/tasks';

const Input = z.object({
  id: z.string().trim().min(1).max(100),
  answers: z.record(z.any()),
});

/** Hand a completed task back to the program team for review. */
export default createEndpoint({
  description: 'Submit a task to the program team',
  authenticated: true,
  inputSchema: Input,
  execute: async ({ input: raw, context }) => {
    const input = parseInput(Input, raw);
    assertReasonableSize(input.answers);
    const applicant = await getApplicant(context);
    const task = await loadOwnTask(applicant.id, input.id);
    if (!isTaskEditable(task.status)) throw new ZiteError('This request has already been submitted.', 'CONFLICT');
    if (task.application.status === 'Withdrawn') throw new ZiteError('This application was withdrawn, so its requests are closed.', 'CONFLICT');

    const answers = sanitizeAnswers(task.fields, input.answers, { dropHidden: true });
    const errors = validateAnswers(task.fields, answers);
    const first = task.fields.find(f => errors[f.id]);
    if (first) throw new ZiteError(`"${first.label}": ${errors[first.id]}`, 'BAD_REQUEST');
    if (task.freeForm) {
      const problem = freeFormProblem(answers);
      if (problem) throw new ZiteError(problem, 'BAD_REQUEST');
    }

    const now = new Date().toISOString();
    const resubmitted = task.status === 'Returned';
    await zite.tasks.update({ id: task.id, record: { answers: JSON.stringify(answers), status: 'Submitted', submittedAt: now } });
    await logActivity({
      type: 'task_submitted',
      submissionId: task.submissionId,
      programId: task.programId,
      applicantId: applicant.id,
      actorId: applicant.id,
      actorType: 'Applicant',
      data: { title: task.title, taskId: task.id, resubmitted },
      occurredAt: now,
    });
    await notify({
      recipientIds: [task.requestedById, task.ownerId],
      type: 'task_submitted',
      title: `${applicant.organization || applicant.name || applicant.email} ${resubmitted ? 'resubmitted' : 'completed'} ${task.title}`,
      body: 'Ready for your approval',
      submissionId: task.submissionId,
      programId: task.programId,
      actorId: applicant.id,
      actorType: 'Applicant',
      occurredAt: now,
    });
    return { status: 'Submitted', submittedAt: now };
  },
});
