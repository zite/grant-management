import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { parseAnswers } from '@project/shared/forms/logic';
import { getApplicant } from '@project/shared/server/applicants';
import { getSettings } from '@project/shared/server/settings';
import { parseInput } from '../server/portal';
import { isTaskEditable, loadOwnTask } from '../server/tasks';

const Input = z.object({ id: z.string().trim().min(1).max(100) });

/** A request from the program team: its instructions, its form, and anything already filled in. */
export default createEndpoint({
  description: 'One task the program team asked you to complete',
  authenticated: true,
  inputSchema: Input,
  execute: async ({ input: raw, context }) => {
    const { id } = parseInput(Input, raw);
    const applicant = await getApplicant(context);
    const [task, settings] = await Promise.all([loadOwnTask(applicant.id, id), getSettings()]);
    return {
      task: {
        id: task.id,
        title: task.title,
        instructions: task.instructions,
        status: task.status,
        dueDate: task.dueDate,
        requestedAt: task.requestedAt,
        submittedAt: task.submittedAt,
        reviewedAt: task.reviewedAt,
        reviewNote: task.status === 'Returned' ? task.reviewNote : '',
        answers: parseAnswers(task.answers),
        formName: task.formName,
        fields: task.fields,
        freeForm: task.freeForm,
        canEdit: isTaskEditable(task.status) && task.application.status !== 'Withdrawn',
      },
      application: task.application,
      organizationName: settings.organizationName,
      currency: settings.currency,
    };
  },
});
