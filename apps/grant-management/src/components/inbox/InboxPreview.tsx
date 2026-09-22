import { AlarmClock, Archive, ArchiveRestore, ArrowLeft, ArrowUpRight, ClipboardCheck, Inbox, Mail, MailOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@project/components/ui/button';
import { cn } from '@project/components/lib/utils';
import { useAppActions } from '../../lib/app-actions';
import { MOD } from '../../lib/hotkeys';
import { dateTime, timeAgo } from '../../lib/format';
import { useSubmission } from '../../lib/queries';
import type { Workspace } from '../../lib/workspace';
import { STATUS_META } from '../../lib/constants';
import { SubmissionDetailView } from '../submission/SubmissionDetail';
import { EmptyState, Glyph, IconButton, Kbd, Tip } from '../primitives/bits';
import { OutcomeGlyph } from '../primitives/icons';
import { untilLabel, type InboxItem, type InboxTab } from './inboxData';
import { ActorAvatar, destinationFor, showsSubmission, TypeIcon, typeMeta } from './inboxMeta';
import { SnoozeMenu, type RowActions } from './InboxRow';

function SubmissionPreview({ id, onClose }: { id: string; onClose?: () => void }) {
  const { data, isPending, isError } = useSubmission(id);
  if (isPending) {
    return (
      <div className="space-y-4 p-6">
        <div className="skeleton h-3.5 w-20" />
        <div className="skeleton h-6 w-2/3" />
        <div className="skeleton h-3.5 w-full" />
        <div className="skeleton h-3.5 w-5/6" />
        <div className="skeleton h-3.5 w-4/6" />
      </div>
    );
  }
  if (isError || !data) {
    return <EmptyState title="This submission isn’t available" description="It may have been deleted since this notification was sent." className="h-full" />;
  }
  return (
    <div className="h-full min-h-0">
      <SubmissionDetailView key={data.submission.id} detail={data} mode="peek" onClose={onClose} />
    </div>
  );
}

function ReviewStatus({ status }: { status: string | null }) {
  if (!status) return null;
  const tone = status === 'Submitted' ? 'text-tone-success' : status === 'Recused' ? 'text-muted-foreground' : 'text-tone-warning';
  return <span className={cn('text-xs font-medium', tone)}>{status === 'Submitted' ? 'You submitted this review' : status === 'Recused' ? 'You recused yourself' : status === 'In progress' ? 'Your review is in progress' : 'Waiting for your review'}</span>;
}

/** For everything that isn't a submission a manager can read inline: what happened, who did it, and the one thing to do next. */
function NotificationCard({ item, ws }: { item: InboxItem; ws: Workspace }) {
  const navigate = useNavigate();
  const app = useAppActions();
  const meta = typeMeta(item.type);
  const program = item.programId ? ws.programById.get(item.programId) : undefined;
  const member = item.actorType === 'Member' && item.actorId ? ws.memberById.get(item.actorId) : undefined;
  const dest = destinationFor(item, ws);
  const reviewItem = item.link?.startsWith('/reviews') || item.reviewId || !ws.isManager;
  const actorLabel = item.actorType === 'System' ? 'System' : member?.name ?? item.actorName ?? (item.actorType === 'Applicant' ? 'An applicant' : 'A teammate');
  const actorRole = item.actorType === 'System' ? 'Automatic reminder' : item.actorType === 'Applicant' ? 'Applicant' : member?.title || member?.role || 'Teammate';
  const go = () => {
    if (!dest) return;
    if (dest.kind === 'route') navigate(dest.to);
    else app.openPeek(dest.id);
  };
  const statusMeta = item.submissionStatus ? STATUS_META[item.submissionStatus] : undefined;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[560px] px-6 py-10 animate-fade-in sm:px-8 sm:py-14">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <TypeIcon type={item.type} className="h-3.5 w-3.5" />
          <span className="font-medium">{meta.label}</span>
          <span aria-hidden>·</span>
          <Tip label={dateTime(item.occurredAt)}>
            <span>{timeAgo(item.occurredAt)}</span>
          </Tip>
        </div>
        <h2 className="mt-2.5 text-[19px] font-semibold leading-snug tracking-[-0.01em]">{item.title}</h2>
        {item.body && <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-muted-foreground">{item.body}</p>}

        <div className="mt-7 divide-y overflow-hidden rounded-lg border bg-background">
          <div className="flex items-center gap-3 px-4 py-3">
            <ActorAvatar item={item} ws={ws} size={30} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium">{actorLabel}</div>
              <div className="truncate text-xs text-muted-foreground">{actorRole}</div>
            </div>
          </div>
          {item.submissionId && (
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border bg-subtle">
                {reviewItem ? <ClipboardCheck className="h-4 w-4 text-muted-foreground" /> : <OutcomeGlyph status={item.submissionStatus ?? 'Submitted'} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  {item.submissionReference && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.submissionReference}</span>}
                  <span className="truncate text-[13px] font-medium">{item.submissionTitle || 'Untitled application'}</span>
                </div>
                <div className="mt-0.5 truncate">
                  {item.reviewStatus ? (
                    <ReviewStatus status={item.reviewStatus} />
                  ) : ws.isManager ? (
                    <span className="text-xs text-muted-foreground">{statusMeta?.label ?? item.submissionStatus}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No longer assigned to you</span>
                  )}
                </div>
              </div>
            </div>
          )}
          {program && (
            <div className="flex items-center gap-3 px-4 py-3">
              <Glyph icon={program.icon} color={program.color} size={30} />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium">{program.name}</div>
                <div className="truncate text-xs text-muted-foreground">{program.key} · {program.type}</div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {dest && (
            <Button size="sm" onClick={go}>
              {dest.label}
              <ArrowUpRight />
            </Button>
          )}
          {ws.isManager && item.submissionId && item.submissionReference && item.submissionReference !== 'Draft' && dest?.kind === 'route' && !dest.to.startsWith('/submission/') && (
            <Button size="sm" variant="outline" onClick={() => navigate(`/submission/${item.submissionReference}`)}>
              View {item.submissionReference}
            </Button>
          )}
          {dest && (
            <span className="ml-1 hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
              <Kbd>↵</Kbd> to open
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const HINTS: Array<{ keys: string[]; label: string }> = [
  { keys: ['J', 'K'], label: 'Move through the list' },
  { keys: ['↵'], label: 'Open' },
  { keys: ['E'], label: 'Archive' },
  { keys: ['U'], label: 'Mark read or unread' },
  { keys: ['S'], label: 'Snooze' },
  { keys: ['⇧', 'E'], label: 'Archive everything read' },
];

export function EmptyPreview({ tab, empty }: { tab: InboxTab; empty: boolean }) {
  const title = empty
    ? tab === 'snoozed' ? 'Nothing snoozed' : tab === 'archived' ? 'Nothing archived yet' : 'You’re all caught up'
    : 'Select a notification';
  const description = empty
    ? tab === 'snoozed' ? 'Snooze a notification to have it come back when you’re ready for it.' : tab === 'archived' ? 'Archive what you’re done with and it will wait here.' : 'New submissions, messages, mentions and review updates will show up here.'
    : 'Read it here without losing your place in the list.';
  return (
    <div className="flex h-full items-center justify-center px-8">
      <div className="w-full max-w-[320px] animate-fade-in">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border bg-subtle text-muted-foreground">
          <Inbox className="h-[18px] w-[18px]" />
        </div>
        <h2 className="mt-4 text-[14px] font-medium">{title}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
        <div className="mt-6 space-y-2 border-t pt-5">
          {HINTS.map(h => (
            <div key={h.label} className="flex items-center justify-between text-[12.5px] text-muted-foreground">
              <span>{h.label}</span>
              <span className="flex items-center gap-1">{h.keys.map(k => <Kbd key={k}>{k}</Kbd>)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between text-[12.5px] text-muted-foreground">
            <span>Search everything</span>
            <span className="flex items-center gap-1"><Kbd>{MOD}</Kbd><Kbd>K</Kbd></span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InboxPreview({ item, ws, tab, actions, onBack, onOpen, onClosePreview }: {
  item: InboxItem;
  ws: Workspace;
  tab: InboxTab;
  actions: RowActions;
  onBack?: () => void;
  onOpen: (item: InboxItem) => void;
  onClosePreview?: () => void;
}) {
  const unread = !item.readAt;
  const dest = destinationFor(item, ws);
  const meta = typeMeta(item.type);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        {onBack && (
          <IconButton aria-label="Back to inbox" onClick={onBack}>
            <ArrowLeft />
          </IconButton>
        )}
        <TypeIcon type={item.type} className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{meta.label}</span>
        {tab === 'snoozed' && item.snoozedUntil && (
          <span className="chip shrink-0 border-transparent bg-muted text-muted-foreground">
            <AlarmClock className="h-3 w-3" /> {untilLabel(item.snoozedUntil)}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Tip label={unread ? 'Mark as read' : 'Mark as unread'} keys={['U']}>
            <IconButton aria-label={unread ? 'Mark as read' : 'Mark as unread'} onClick={() => actions.toggleRead(item)}>
              {unread ? <MailOpen /> : <Mail />}
            </IconButton>
          </Tip>
          {tab !== 'archived' && (
            <SnoozeMenu item={item} onSnooze={o => actions.snooze(item, o)} onUnsnooze={() => actions.unsnooze(item)}>
              <IconButton aria-label="Snooze">
                <AlarmClock />
              </IconButton>
            </SnoozeMenu>
          )}
          <Tip label={tab === 'archived' ? 'Move back to inbox' : 'Archive'} keys={['E']}>
            <IconButton aria-label={tab === 'archived' ? 'Move back to inbox' : 'Archive'} onClick={() => actions.archive(item)}>
              {tab === 'archived' ? <ArchiveRestore /> : <Archive />}
            </IconButton>
          </Tip>
          {dest && !showsSubmission(item, ws) && (
            <Tip label={dest.label} keys={['↵']}>
              <Button size="sm" variant="outline" className="ml-1 h-7 gap-1 px-2 text-[12.5px]" onClick={() => onOpen(item)}>
                Open <ArrowUpRight className="!size-3.5" />
              </Button>
            </Tip>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {showsSubmission(item, ws) ? <SubmissionPreview id={item.submissionId!} onClose={onClosePreview} /> : <NotificationCard item={item} ws={ws} />}
      </div>
    </div>
  );
}
