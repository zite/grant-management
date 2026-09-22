import {
  ArrowRight, Banknote, CircleDot, FilePlus2, FileX2, Gavel, ListChecks, Mail, MailOpen, Megaphone, PencilLine, RotateCcw, Send, Star, Tag, UserMinus,
  UserPlus, UserRound, Undo2, type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { formatMoney } from '@project/shared/forms/logic';
import { STATUS_META } from '../../lib/constants';
import { shortDate } from '../../lib/format';
import type { ActivityEntry, SubmissionDetail } from '../../lib/types';
import type { Workspace } from '../../lib/workspace';
import { firstNameOf, type Tone } from './detailBits';

/**
 * Every activity type the platform logs, as a sentence a grant manager would
 * say out loud — "Marcus Chen moved this from Eligibility screen to Panel
 * review". Ids resolve through the workspace; anything that no longer exists
 * reads as "a deleted …" rather than an id.
 */

type Described = { actor: string; text: ReactNode; icon: LucideIcon; tone: Tone };

const b = (text: ReactNode) => <span className="font-medium text-foreground">{text}</span>;

const RECOMMENDS: Record<string, string> = { Yes: 'Recommends', Maybe: 'Unsure', No: 'Doesn’t recommend' };

function list(names: string[]) {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function actorName(entry: Pick<ActivityEntry, 'actorId' | 'actorType'>, ws: Workspace, detail: SubmissionDetail) {
  if (entry.actorType === 'Applicant') return `${firstNameOf(detail.applicant?.name ?? detail.submission.applicantName) || 'The applicant'} (applicant)`;
  if (entry.actorType === 'System' || !entry.actorId) return 'System';
  return ws.memberById.get(entry.actorId)?.name ?? 'A former team member';
}

export function describeActivity(entry: ActivityEntry, ws: Workspace, detail: SubmissionDetail, group: ActivityEntry[] = [entry]): Described {
  const d = entry.data ?? {};
  const actor = actorName(entry, ws, detail);
  const money = (n: unknown) => formatMoney(Number(n ?? 0), ws.settings.currency);
  const stage = (id: unknown) => (id ? ws.stageById.get(String(id))?.name ?? 'a deleted stage' : null);
  const member = (id: unknown) => (id ? ws.memberById.get(String(id))?.name ?? 'a former team member' : null);
  const label = (id: unknown) => ws.labelById.get(String(id))?.name ?? 'a deleted label';
  const status = (s: unknown) => STATUS_META[String(s)]?.label ?? String(s ?? '');
  const quoted = (s: unknown) => b(`“${String(s ?? '')}”`);
  const applicant = detail.applicant?.name ?? detail.submission.applicantName ?? 'the applicant';
  const deliveryNote = d.delivery === 'Failed' ? <span className="text-tone-danger"> · email failed</span> : d.delivery === 'Portal only' ? ' · portal only' : null;

  switch (entry.type) {
    case 'started':
      return { actor, text: 'started the application', icon: CircleDot, tone: 'neutral' };
    case 'submitted':
      return d.by === 'staff'
        ? { actor, text: <>entered the application on {b(applicant)}’s behalf{d.receivedOn ? <> · received {b(shortDate(String(d.receivedOn)))}</> : null}</>, icon: Send, tone: 'accent' }
        : { actor, text: 'submitted the application', icon: Send, tone: 'accent' };
    case 'created_by_staff':
      return { actor, text: <>created this submission for {b(String(d.applicantName ?? applicant))}{d.status === 'Draft' ? ' as a draft for them to finish' : ''}</>, icon: FilePlus2, tone: 'neutral' };
    case 'stage_changed': {
      const from = stage(d.from);
      const to = stage(d.to) ?? 'a stage';
      return { actor, text: from ? <>moved this from {b(from)} to {b(to)}</> : <>moved this to {b(to)}</>, icon: ArrowRight, tone: 'accent' };
    }
    case 'owner_changed': {
      const to = member(d.to);
      const from = member(d.from);
      if (!to) return { actor, text: from ? <>removed {b(from)} as owner</> : 'removed the owner', icon: UserRound, tone: 'neutral' };
      if (d.to === entry.actorId && !from) return { actor, text: 'took ownership', icon: UserRound, tone: 'neutral' };
      return { actor, text: from ? <>changed the owner from {b(from)} to {b(to)}</> : <>made {b(to)} the owner</>, icon: UserRound, tone: 'neutral' };
    }
    case 'decision': {
      const extra = d.decision === 'Accepted' && d.awardAmount != null ? <> · award {b(money(d.awardAmount))}</> : d.decision === 'Declined' && d.reason ? <> · {String(d.reason)}</> : null;
      return { actor, text: <>decided {b(status(d.decision))}{extra}</>, icon: Gavel, tone: d.decision === 'Accepted' ? 'success' : d.decision === 'Declined' ? 'danger' : 'warning' };
    }
    case 'decision_released':
      return { actor, text: <>released the decision: {b(status(d.decision))}{deliveryNote}</>, icon: Megaphone, tone: 'info' };
    case 'reopened':
      return d.from === 'Withdrawn'
        ? { actor, text: 'put this back in review', icon: RotateCcw, tone: 'neutral' }
        : { actor, text: <>reopened the decision (was {b(status(d.from))}){d.wasReleased ? ' · the applicant had already been told' : ''}</>, icon: RotateCcw, tone: 'warning' };
    case 'withdrawn':
      return d.by === 'staff'
        ? { actor, text: 'withdrew this on the applicant’s behalf', icon: Undo2, tone: 'neutral' }
        : { actor, text: <>withdrew the application{d.reason ? <> · “{String(d.reason)}”</> : null}</>, icon: Undo2, tone: 'neutral' };
    case 'labels_changed': {
      const added = (Array.isArray(d.added) ? d.added : []).map(label);
      const removed = (Array.isArray(d.removed) ? d.removed : []).map(label);
      return {
        actor,
        text: (
          <>
            {added.length > 0 && <>added {b(list(added))}</>}
            {added.length > 0 && removed.length > 0 && ' · '}
            {removed.length > 0 && <>removed {b(list(removed))}</>}
            {!added.length && !removed.length && 'changed labels'}
          </>
        ),
        icon: Tag,
        tone: 'neutral',
      };
    }
    case 'reviewer_assigned': {
      const names = group.map(g => member(g.data?.reviewerId) ?? 'a reviewer');
      const inStage = stage(d.stageId);
      return { actor, text: <>assigned {b(list(names))} to review{inStage && group.length ? <> in {inStage}</> : null}</>, icon: UserPlus, tone: 'accent' };
    }
    case 'reviewer_removed':
      return { actor, text: <>removed {b(member(d.reviewerId) ?? 'a reviewer')} from reviewing{d.hadScore ? ' · their submitted score was discarded' : ''}</>, icon: UserMinus, tone: 'neutral' };
    case 'review_submitted': {
      const parts = [d.score != null ? String(Math.round(Number(d.score))) : null, d.recommendation ? RECOMMENDS[String(d.recommendation)] ?? String(d.recommendation) : null].filter(Boolean);
      return { actor, text: <>submitted a review{parts.length ? <> · {b(parts.join(' · '))}</> : null}</>, icon: Star, tone: 'success' };
    }
    case 'review_recused':
      return { actor, text: <>recused from reviewing{d.reason ? <> · “{String(d.reason)}”</> : null}</>, icon: UserMinus, tone: 'warning' };
    case 'review_reopened': {
      const reviewer = d.reviewerId && d.reviewerId !== entry.actorId ? member(d.reviewerId) : null;
      return { actor, text: reviewer ? <>reopened {b(reviewer)}’s review</> : 'reopened their review', icon: RotateCcw, tone: 'neutral' };
    }
    case 'message_sent':
      return { actor, text: <>{d.kind === 'Reminder' ? 'sent a reminder' : 'sent a message'}{d.subject ? <>: {quoted(d.subject)}</> : null}{deliveryNote}</>, icon: Mail, tone: 'info' };
    case 'message_received':
      return { actor, text: <>sent a message{d.subject ? <>: {quoted(d.subject)}</> : null}</>, icon: MailOpen, tone: 'info' };
    case 'task_requested':
      return { actor, text: <>requested {quoted(d.title)}{deliveryNote}</>, icon: ListChecks, tone: 'neutral' };
    case 'task_submitted':
      return { actor, text: <>submitted {b(String(d.title ?? 'a follow-up'))}</>, icon: ListChecks, tone: 'accent' };
    case 'task_approved':
      return { actor, text: <>approved {quoted(d.title)}</>, icon: ListChecks, tone: 'success' };
    case 'task_returned':
      return { actor, text: <>returned {quoted(d.title)} for changes{d.note ? <> · “{String(d.note)}”</> : null}</>, icon: ListChecks, tone: 'warning' };
    case 'payment_recorded': {
      const paid = !d.status || d.status === 'Paid';
      return { actor, text: <>{paid ? 'recorded a payment' : 'scheduled a payment'} · {b(money(d.amount))}{d.name && d.name !== 'Payment' ? <> · {String(d.name)}</> : null}</>, icon: Banknote, tone: paid ? 'success' : 'neutral' };
    }
    case 'payment_updated':
      return d.removed
        ? { actor, text: <>removed a payment · {b(money(d.amount))}{d.name ? <> · {String(d.name)}</> : null}</>, icon: Banknote, tone: 'neutral' }
        : { actor, text: <>updated a payment · {b(money(d.amount))}{d.status ? <> · {String(d.status)}</> : null}</>, icon: Banknote, tone: 'neutral' };
    case 'award_updated': {
      const field = String(d.field ?? '');
      if (field === 'awardAmount') return { actor, text: d.from != null ? <>changed the award from {b(money(d.from))} to {b(d.to == null ? 'nothing' : money(d.to))}</> : <>set the award to {b(money(d.to))}</>, icon: Banknote, tone: 'success' };
      if (field === 'awardStatus') return { actor, text: <>set the award status to {b(String(d.to ?? 'none'))}</>, icon: Banknote, tone: 'neutral' };
      if (field === 'awardStartDate' || field === 'awardEndDate') {
        const which = field === 'awardStartDate' ? 'start' : 'end';
        return { actor, text: d.to ? <>set the award {which} date to {b(shortDate(String(d.to)))}</> : <>cleared the award {which} date</>, icon: Banknote, tone: 'neutral' };
      }
      return { actor, text: 'updated the award', icon: Banknote, tone: 'neutral' };
    }
    case 'amount_changed':
      return { actor, text: d.from != null ? <>changed the requested amount from {b(money(d.from))} to {b(d.to == null ? 'nothing' : money(d.to))}</> : <>set the requested amount to {b(money(d.to))}</>, icon: Banknote, tone: 'neutral' };
    case 'title_changed':
      return { actor, text: <>renamed this to {quoted(d.to)}</>, icon: PencilLine, tone: 'neutral' };
    case 'answers_edited':
      return { actor, text: 'corrected the application answers', icon: PencilLine, tone: 'warning' };
    case 'attachment_added':
      return { actor, text: <>added a staff document: {b(String(d.name ?? 'a file'))}</>, icon: FilePlus2, tone: 'neutral' };
    case 'attachment_removed':
      return { actor, text: <>removed a staff document: {b(String(d.name ?? 'a file'))}</>, icon: FileX2, tone: 'neutral' };
    default:
      return { actor, text: entry.type.replace(/_/g, ' '), icon: CircleDot, tone: 'neutral' };
  }
}

/** Consecutive assignments by the same person in the same minute read as one line. */
export function groupActivity(entries: ActivityEntry[]) {
  const out: Array<{ entry: ActivityEntry; group: ActivityEntry[] }> = [];
  for (const e of entries) {
    const prev = out[out.length - 1];
    if (
      prev &&
      e.type === 'reviewer_assigned' &&
      prev.entry.type === 'reviewer_assigned' &&
      prev.entry.actorId === e.actorId &&
      Math.abs(Date.parse(e.occurredAt ?? '') - Date.parse(prev.entry.occurredAt ?? '')) < 60_000
    ) {
      prev.group.push(e);
      continue;
    }
    out.push({ entry: e, group: [e] });
  }
  return out;
}
