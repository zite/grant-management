import type { FormField } from '@project/shared/forms/types';

/**
 * A task with no follow-up form is answered free-form: a written response and
 * any files. Stored as `{ response, files }` so the staff app reads it the same
 * way it reads seeded tasks. Expressed as ordinary fields so the portal and the
 * endpoints validate it with the same form logic as everything else.
 */
export const FREE_FORM_FIELDS: FormField[] = [
  {
    id: 'response',
    type: 'long_text',
    label: 'Your response',
    help: 'Write your answer here, or add a short note to go with the files you upload.',
    maxLength: 20000,
  },
  {
    id: 'files',
    type: 'file',
    label: 'Files',
    help: 'Optional. Documents, spreadsheets, images or media.',
    accept: [],
    maxFiles: 10,
    maxSizeMb: 50,
  },
];

export function freeFormProblem(answers: Record<string, unknown>) {
  const text = typeof answers.response === 'string' ? answers.response.trim() : '';
  const files = Array.isArray(answers.files) ? answers.files : [];
  return text || files.length ? null : 'Write a response or upload at least one file before submitting.';
}
