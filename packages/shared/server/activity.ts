import { zite } from 'zitejs/db';
import { chunked } from './sql';

/**
 * The audit trail. Every change to a submission that a person would ask
 * "who did that, and when?" about writes one row here, and the submission
 * timeline is read straight from it.
 */

export type ActivityType =
  | 'started'
  | 'submitted'
  | 'stage_changed'
  | 'owner_changed'
  | 'decision'
  | 'decision_released'
  | 'reopened'
  | 'withdrawn'
  | 'labels_changed'
  | 'reviewer_assigned'
  | 'reviewer_removed'
  | 'review_submitted'
  | 'review_recused'
  | 'review_reopened'
  | 'message_sent'
  | 'message_received'
  | 'task_requested'
  | 'task_submitted'
  | 'task_approved'
  | 'task_returned'
  | 'payment_recorded'
  | 'payment_updated'
  | 'award_updated'
  | 'amount_changed'
  | 'title_changed'
  | 'answers_edited'
  | 'attachment_added'
  | 'attachment_removed'
  | 'created_by_staff'
  | 'program_created'
  | 'program_published'
  | 'program_unpublished'
  | 'program_archived'
  | 'program_unarchived';

export type ActivityInput = {
  type: ActivityType;
  submissionId?: string | null;
  programId?: string | null;
  applicantId?: string | null;
  actorId?: string | null;
  actorType: 'Member' | 'Applicant' | 'System';
  data?: Record<string, unknown>;
  occurredAt?: string;
};

export async function logActivity(entries: ActivityInput | ActivityInput[]) {
  const list = Array.isArray(entries) ? entries : [entries];
  if (!list.length) return;
  const now = new Date().toISOString();
  await chunked(list, async batch => {
    await zite.activity.bulkCreate({
      records: batch.map(e => ({
        type: e.type,
        submissionId: e.submissionId ?? null,
        programId: e.programId ?? null,
        applicantId: e.applicantId ?? null,
        actorId: e.actorId ?? null,
        actorType: e.actorType,
        data: e.data ? JSON.stringify(e.data) : null,
        occurredAt: e.occurredAt ?? now,
      })),
    });
  });
  // Last activity is the newest event, not the moment of writing — backfilled history keeps its own dates.
  const latest = new Map<string, string>();
  for (const e of list) {
    if (!e.submissionId) continue;
    const when = e.occurredAt ?? now;
    if (!latest.has(e.submissionId) || when > latest.get(e.submissionId)!) latest.set(e.submissionId, when);
  }
  for (const [id, when] of latest) {
    await zite.submissions.update({ id, record: { lastActivityAt: when } }).catch(() => undefined);
  }
}

export function parseData(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'string') return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
