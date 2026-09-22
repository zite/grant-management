import { Email } from 'zitejs/email';
import { zite } from 'zitejs/db';
import { firstName, formatDeadline, formatLongDay, renderMerge, type MergeContext } from '../merge';
import { formatMoney } from '../forms/logic';
import { reference } from '../status';
import { portalLink, type OrgSettings } from './settings';
import { str } from './sql';

/**
 * Email to applicants and reviewers.
 *
 * Every applicant email is also a row in Messages, so the portal and the
 * staff app show the same conversation whether or not delivery worked. A
 * failed send is recorded as Failed rather than thrown: the decision, task or
 * message it accompanied still happened.
 */

export type TemplateTrigger = 'Manual' | 'Submission received' | 'Accepted' | 'Declined' | 'Waitlisted' | 'Task requested' | 'Draft reminder';

export type TemplateRow = { id: string; name: string; subject: string; body: string; trigger: string; programId: string | null; enabled: boolean };

export async function findTemplate(trigger: TemplateTrigger, programId: string | null | undefined, opts: { requireEnabled?: boolean } = {}): Promise<TemplateRow | null> {
  const { rows } = await zite.sql({
    query: `
      SELECT id, "name", "subject", "body", "trigger", "programId", "enabled" FROM "EmailTemplates"
      WHERE "trigger" = $1 AND (COALESCE("programId", '') = '' OR "programId" = $2)
        ${opts.requireEnabled ? 'AND COALESCE("enabled", false) = true' : ''}
      ORDER BY CASE WHEN "programId" = $2 THEN 0 ELSE 1 END, COALESCE("position", 0) ASC, created_at ASC
      LIMIT 1`,
    params: [trigger, programId ?? ''],
  });
  const r = rows[0];
  if (!r) return null;
  return {
    id: String(r.id),
    name: str(r.name) ?? '',
    subject: str(r.subject) ?? '',
    body: str(r.body) ?? '',
    trigger: str(r.trigger) ?? 'Manual',
    programId: r.programId ? String(r.programId) : null,
    enabled: r.enabled === true,
  };
}

export function buildMergeContext(input: {
  settings: OrgSettings;
  applicant?: { name?: string | null; email?: string | null } | null;
  program?: { name?: string | null; key?: string | null; deadline?: string | null } | null;
  submission?: { id: string; title?: string | null; number?: number | null; awardAmount?: number | null } | null;
  task?: { title?: string | null; dueDate?: string | null } | null;
}): MergeContext {
  const { settings, applicant, program, submission, task } = input;
  return {
    applicant_name: applicant?.name ?? '',
    applicant_first_name: firstName(applicant?.name) || 'there',
    applicant_email: applicant?.email ?? '',
    organization_name: settings.organizationName,
    program_name: program?.name ?? '',
    program_deadline: formatDeadline(program?.deadline),
    submission_title: submission?.title ?? '',
    reference: submission ? reference(program?.key, submission.number) : '',
    award_amount: submission?.awardAmount ? formatMoney(submission.awardAmount, settings.currency) : '',
    task_title: task?.title ?? '',
    task_due_date: formatLongDay(task?.dueDate),
    application_link: submission ? portalLink(settings, `/applications/${submission.id}`) : '',
    portal_link: portalLink(settings),
  };
}

/** Plain text with blank lines between paragraphs, into the gateway's blocks. */
function toBlocks(text: string, settings: OrgSettings, button?: { label: string; href: string } | null) {
  const paragraphs = text.replace(/\r\n/g, '\n').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const blocks: Array<{ type: 'text'; content: string } | { type: 'button'; label: string; href: string; alignment?: 'left' } | { type: 'divider' } | { type: 'spacer'; height: number }> =
    paragraphs.map(p => ({ type: 'text' as const, content: p }));
  if (button?.href && /^https:\/\//.test(button.href)) {
    blocks.push({ type: 'spacer', height: 4 }, { type: 'button', label: button.label, href: button.href, alignment: 'left' });
  }
  const signature = settings.emailSignature.trim();
  if (signature) blocks.push({ type: 'divider' }, { type: 'text', content: signature });
  return blocks;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  settings: OrgSettings;
  button?: { label: string; href: string } | null;
}): Promise<'Sent' | 'Failed'> {
  const to = input.to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return 'Failed';
  try {
    const res = await Email.send({
      to,
      subject: input.subject.slice(0, 200),
      body: toBlocks(input.text, input.settings, input.button) as never,
      ...(input.settings.supportEmail ? { replyTo: input.settings.supportEmail } : {}),
      ...(input.settings.logoUrl && /^https:\/\//.test(input.settings.logoUrl) ? { logo: { url: input.settings.logoUrl, height: 40 } } : {}),
    });
    return res?.success === false ? 'Failed' : 'Sent';
  } catch (e) {
    console.error('Email send failed', e instanceof Error ? e.message : e);
    return 'Failed';
  }
}

export type MessageKind = 'Message' | 'Confirmation' | 'Decision' | 'Request' | 'Reminder';

/**
 * Write a message to an applicant's thread and, when asked, email it.
 * `deliver: false` keeps it portal-only — useful for notes the applicant
 * will see next time they sign in, without an email.
 */
export async function messageApplicant(input: {
  settings: OrgSettings;
  applicant: { id: string; email: string; name?: string | null };
  submissionId?: string | null;
  subject: string;
  body: string;
  kind: MessageKind;
  senderId?: string | null;
  templateId?: string | null;
  deliver: boolean;
  buttonLabel?: string;
}) {
  const link = input.submissionId ? portalLink(input.settings, `/applications/${input.submissionId}`) : portalLink(input.settings, '/applications');
  const delivery = input.deliver
    ? await sendEmail({
        to: input.applicant.email,
        subject: input.subject,
        text: input.body,
        settings: input.settings,
        button: link ? { label: input.buttonLabel ?? 'View in the portal', href: link } : null,
      })
    : 'Portal only';
  const now = new Date().toISOString();
  const created = await zite.messages.create({
    record: {
      subject: input.subject.slice(0, 240),
      body: input.body,
      submissionId: input.submissionId ?? null,
      applicantId: input.applicant.id,
      senderId: input.senderId ?? null,
      direction: 'Outbound',
      kind: input.kind,
      delivery,
      templateId: input.templateId ?? null,
      sentAt: now,
      readAt: null,
    },
  });
  return { id: created.id, delivery, sentAt: now };
}

/** Send a triggered template if one exists and is switched on. Returns null when there's nothing to send. */
export async function sendTriggered(input: {
  trigger: TemplateTrigger;
  settings: OrgSettings;
  applicant: { id: string; email: string; name?: string | null };
  program: { id: string; name?: string | null; key?: string | null; deadline?: string | null };
  submission?: { id: string; title?: string | null; number?: number | null; awardAmount?: number | null } | null;
  task?: { title?: string | null; dueDate?: string | null } | null;
  kind: MessageKind;
  senderId?: string | null;
}) {
  const template = await findTemplate(input.trigger, input.program.id, { requireEnabled: true });
  if (!template) return null;
  const ctx = buildMergeContext({ settings: input.settings, applicant: input.applicant, program: input.program, submission: input.submission, task: input.task });
  return messageApplicant({
    settings: input.settings,
    applicant: input.applicant,
    submissionId: input.submission?.id ?? null,
    subject: renderMerge(template.subject, ctx),
    body: renderMerge(template.body, ctx),
    kind: input.kind,
    senderId: input.senderId ?? null,
    templateId: template.id,
    deliver: true,
  });
}

/** Email a staff member or reviewer (assignments, mentions, reminders). Best-effort. */
export async function emailMember(input: { settings: OrgSettings; to: string; subject: string; text: string; link?: string | null; linkLabel?: string }) {
  return sendEmail({
    to: input.to,
    subject: input.subject,
    text: input.text,
    settings: { ...input.settings, emailSignature: '' },
    button: input.link ? { label: input.linkLabel ?? 'Open the workspace', href: input.link } : null,
  });
}
