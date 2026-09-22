import {
  AlarmClock, AtSign, Bell, CalendarX, ClipboardCheck, ClipboardList, FileInput, Gavel, ListChecks, MessageSquare, StickyNote, Undo2, UserPlus, UserX, type LucideIcon,
} from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import type { Workspace } from '../../lib/workspace';
import { Avatar, MemberAvatar } from '../primitives/Avatar';
import type { InboxItem } from './inboxData';

type Tone = 'info' | 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

export const TYPE_META: Record<string, { icon: LucideIcon; label: string; tone: Tone }> = {
  submission_received: { icon: FileInput, label: 'New submission', tone: 'info' },
  review_assigned: { icon: ClipboardList, label: 'Review assigned', tone: 'accent' },
  review_submitted: { icon: ClipboardCheck, label: 'Review submitted', tone: 'success' },
  review_recused: { icon: UserX, label: 'Reviewer recused', tone: 'warning' },
  review_due: { icon: AlarmClock, label: 'Review due', tone: 'warning' },
  mention: { icon: AtSign, label: 'Mention', tone: 'accent' },
  note: { icon: StickyNote, label: 'Note', tone: 'neutral' },
  applicant_message: { icon: MessageSquare, label: 'Applicant message', tone: 'info' },
  task_submitted: { icon: ListChecks, label: 'Task submitted', tone: 'success' },
  submission_withdrawn: { icon: Undo2, label: 'Withdrawn', tone: 'neutral' },
  deadline_passed: { icon: CalendarX, label: 'Deadline passed', tone: 'warning' },
  owner_assigned: { icon: UserPlus, label: 'Owner assigned', tone: 'accent' },
  decision_made: { icon: Gavel, label: 'Decisions', tone: 'success' },
};

export const typeMeta = (type: string) => TYPE_META[type] ?? { icon: Bell, label: 'Update', tone: 'neutral' as Tone };

const TONE_TEXT: Record<Tone, string> = {
  info: 'text-tone-info',
  accent: 'text-tone-accent',
  success: 'text-tone-success',
  warning: 'text-tone-warning',
  danger: 'text-tone-danger',
  neutral: 'text-muted-foreground',
};

export function TypeIcon({ type, className }: { type: string; className?: string }) {
  const meta = typeMeta(type);
  const Icon = meta.icon;
  return <Icon className={cn(TONE_TEXT[meta.tone], className)} strokeWidth={2.25} />;
}

/** Who did it: a teammate's avatar, an applicant's initials on a quiet bubble, or the system bell — with the kind of event badged on. */
export function ActorAvatar({ item, ws, size = 28 }: { item: InboxItem; ws: Workspace; size?: number }) {
  const member = item.actorType === 'Member' && item.actorId ? ws.memberById.get(item.actorId) : undefined;
  let face;
  if (member) face = <MemberAvatar member={member} size={size} />;
  else if (item.actorType === 'Member' && item.actorName) face = <Avatar name={item.actorName} size={size} />;
  else if (item.actorType === 'Applicant') {
    face = (
      <span
        aria-hidden
        className="inline-flex shrink-0 select-none items-center justify-center rounded-full border bg-subtle font-semibold text-muted-foreground"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      >
        {(item.actorName ?? 'A').trim().charAt(0).toUpperCase() || 'A'}
      </span>
    );
  } else {
    face = (
      <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full border bg-subtle text-muted-foreground" style={{ width: size, height: size }}>
        <Bell style={{ width: size * 0.5, height: size * 0.5 }} />
      </span>
    );
  }
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {face}
      <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border bg-background shadow-xs">
        <TypeIcon type={item.type} className="h-2.5 w-2.5" />
      </span>
    </span>
  );
}

export type Destination = { kind: 'route'; to: string; label: string } | { kind: 'peek'; id: string; label: string } | null;

/**
 * Where "open" goes. Review work opens the review; managers open the
 * submission itself; reviewers never get a submission they weren't assigned.
 */
export function destinationFor(item: InboxItem, ws: Workspace): Destination {
  const reviewish = item.link?.startsWith('/reviews');
  if (reviewish || !ws.isManager) {
    if (item.reviewId) return { kind: 'route', to: `/reviews/${item.reviewId}`, label: 'Open review' };
    if (reviewish || item.submissionId) return { kind: 'route', to: item.link?.startsWith('/reviews') ? item.link : '/reviews', label: 'Open review queue' };
  }
  if (ws.isManager && item.submissionId) {
    if (item.submissionStatus === 'Draft' || item.submissionReference === 'Draft') return { kind: 'peek', id: item.submissionId, label: 'Preview draft' };
    return { kind: 'route', to: `/submission/${item.submissionReference}`, label: `Open ${item.submissionReference}` };
  }
  if (item.link?.startsWith('/')) return { kind: 'route', to: item.link, label: 'Open' };
  if (ws.isManager && item.programId && ws.programById.has(item.programId)) {
    return { kind: 'route', to: `/programs/${item.programId}`, label: `Open ${ws.programById.get(item.programId)!.name}` };
  }
  return null;
}

/** Managers read the submission inline; everything else gets a compact card. */
export const showsSubmission = (item: InboxItem, ws: Workspace) => ws.isManager && Boolean(item.submissionId) && !item.link?.startsWith('/reviews');
