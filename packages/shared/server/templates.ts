import { zite } from 'zitejs/db';
import type { TemplateTrigger } from './email';
import { num } from './sql';

/**
 * The email templates every workspace starts with: a confirmation when someone
 * submits, one per decision, one for follow-up requests and draft reminders,
 * and one manual template. The mailer only sends a triggered email when a
 * template for that trigger exists, so without these a new workspace would
 * send applicants nothing.
 *
 * They are installed once, when the Settings row is first created, and are
 * the organization's to edit or delete from then on. The sample data reuses
 * them and never adds a second copy.
 */

export type DefaultTemplate = { name: string; trigger: TemplateTrigger; enabled: boolean; subject: string; body: string };

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    name: 'Submission received', trigger: 'Submission received', enabled: true,
    subject: 'We received your application — {{reference}}',
    body: 'Hi {{applicant_first_name}},\n\nThank you for applying to {{program_name}}. We received your application "{{submission_title}}" and your reference number is {{reference}}.\n\nYou can check on your application, read messages from our team and download a copy of what you submitted from the applicant portal at any time.\n\nWarmly,\nThe {{organization_name}} grants team',
  },
  {
    name: 'Congratulations', trigger: 'Accepted', enabled: true,
    subject: 'Good news about your application to {{program_name}}',
    body: 'Hi {{applicant_first_name}},\n\nCongratulations — we are delighted to tell you that "{{submission_title}}" has been selected for {{program_name}}, with an award of {{award_amount}}.\n\nOver the next few days you will receive a short request in the portal to confirm your details so we can release funds. If you have any questions in the meantime, just reply to this email.\n\nWith gratitude,\nThe {{organization_name}} team',
  },
  {
    name: 'Not selected', trigger: 'Declined', enabled: true,
    subject: 'An update on your application to {{program_name}}',
    body: 'Hi {{applicant_first_name}},\n\nThank you for applying to {{program_name}}. This year we received many more strong applications than we are able to fund, and we are sorry to say that "{{submission_title}}" was not selected.\n\nThis decision is not a judgment of the value of your work. We hope you will apply again, and we are happy to talk through the review panel’s feedback if that would be helpful.\n\nWarmly,\nThe {{organization_name}} team',
  },
  {
    name: 'Waitlist', trigger: 'Waitlisted', enabled: true,
    subject: 'Your application to {{program_name}}',
    body: 'Hi {{applicant_first_name}},\n\nThank you for your application to {{program_name}}. The committee was impressed by "{{submission_title}}", and we have placed it on our waitlist.\n\nIf additional funds become available, we will contact you before the end of the month. You don’t need to do anything in the meantime.\n\nWarmly,\nThe {{organization_name}} team',
  },
  {
    name: 'New request', trigger: 'Task requested', enabled: true,
    subject: 'Action needed: {{task_title}}',
    body: 'Hi {{applicant_first_name}},\n\nWe need one more thing from you for {{program_name}}: {{task_title}}. Please complete it in the applicant portal by {{task_due_date}}.\n\nThank you,\nThe {{organization_name}} team',
  },
  {
    name: 'Finish your application', trigger: 'Draft reminder', enabled: true,
    subject: 'Your {{program_name}} application is due {{program_deadline}}',
    body: 'Hi {{applicant_first_name}},\n\nThis is a friendly reminder that your application to {{program_name}} hasn’t been submitted yet. The deadline is {{program_deadline}}.\n\nEverything you have written so far is saved, so you can pick up right where you left off.\n\nThe {{organization_name}} team',
  },
  {
    name: 'Request more information', trigger: 'Manual', enabled: false,
    subject: 'A question about your application {{reference}}',
    body: 'Hi {{applicant_first_name}},\n\nThank you for your application to {{program_name}}. As we review "{{submission_title}}", we have a question:\n\n[Your question]\n\nYou can reply to this email or answer in the applicant portal.\n\nThank you,\nThe {{organization_name}} team',
  },
];

/** Adds the default templates to a workspace that has none. Safe to call more than once. */
export async function installDefaultTemplates() {
  const { rows } = await zite.sql({ query: `SELECT COUNT(*) AS n FROM "EmailTemplates"`, params: [] });
  if (num(rows[0]?.n) > 0) return;
  await zite.emailTemplates.bulkCreate({
    records: DEFAULT_TEMPLATES.map((t, i) => ({ name: t.name, subject: t.subject, body: t.body, trigger: t.trigger, programId: null, enabled: t.enabled, position: i })),
  });
}
