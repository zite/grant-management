import { zite } from 'zitejs/db';
import { chunked } from './sql';

/**
 * In-app notifications for staff and reviewers — the Inbox.
 *
 * The actor never notifies themselves, and recipients are de-duplicated, so
 * callers can pass "everyone who might care" without filtering first.
 */

export type NotificationType =
  | 'submission_received'
  | 'review_assigned'
  | 'review_submitted'
  | 'review_recused'
  | 'mention'
  | 'note'
  | 'applicant_message'
  | 'task_submitted'
  | 'submission_withdrawn'
  | 'review_due'
  | 'deadline_passed'
  | 'owner_assigned'
  | 'decision_made'
  | 'payment_due'
  | 'task_overdue';

export async function notify(n: {
  recipientIds: Array<string | null | undefined>;
  type: NotificationType;
  title: string;
  body?: string | null;
  submissionId?: string | null;
  programId?: string | null;
  actorId?: string | null;
  actorType?: 'Member' | 'Applicant' | 'System';
  link?: string | null;
  occurredAt?: string;
}) {
  const recipients = [...new Set(n.recipientIds.filter(Boolean) as string[])].filter(id => id !== n.actorId);
  if (!recipients.length) return 0;
  const now = n.occurredAt ?? new Date().toISOString();
  await chunked(recipients, async batch => {
    await zite.notifications.bulkCreate({
      records: batch.map(recipientId => ({
        title: n.title.slice(0, 240),
        body: n.body ? n.body.slice(0, 2000) : null,
        type: n.type,
        recipientId,
        actorId: n.actorId ?? null,
        actorType: n.actorType ?? 'Member',
        submissionId: n.submissionId ?? null,
        programId: n.programId ?? null,
        link: n.link ?? null,
        occurredAt: now,
        readAt: null,
        archivedAt: null,
        snoozedUntil: null,
      })),
    });
  });
  return recipients.length;
}

/** `@[Name](memberId)` tokens written by the mention composer. */
export function mentionedIds(body: string) {
  const ids = new Set<string>();
  for (const m of body.matchAll(/@\[[^\]]+\]\(([^)\s]+)\)/g)) ids.add(m[1]);
  return [...ids];
}

/** Mentions rendered as plain names, for notification previews and emails. */
export function plainMentions(body: string) {
  return body.replace(/@\[([^\]]+)\]\([^)\s]+\)/g, '@$1');
}
