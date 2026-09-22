import { Check, Clock3, ListTodo, MessageSquare } from 'lucide-react';
import { memo, type MouseEvent, type ReactElement } from 'react';
import { cn } from '@project/components/lib/utils';
import type { DisplayProperty } from '../../lib/constants';
import { shortDate, timeAgo } from '../../lib/format';
import type { Submission } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { AvatarStack, MemberAvatar } from '../primitives/Avatar';
import { ReviewProgress, ScorePill, SubmissionGlyph } from '../primitives/icons';
import { Glyph, LabelDot, Tip } from '../primitives/bits';
import { SubmissionContextMenu } from './SubmissionContextMenu';
import { SubmissionPropertyPicker, type PickerKind } from './SubmissionPropertyPicker';

export type RowProps = {
  submission: Submission;
  properties: Set<DisplayProperty>;
  selected: boolean;
  focused: boolean;
  selecting: boolean;
  multiProgram: boolean;
  activePicker: PickerKind | null;
  onPickerChange: (id: string, kind: PickerKind | null) => void;
  onClick: (s: Submission, e: MouseEvent) => void;
  onToggleSelect: (s: Submission, e: MouseEvent) => void;
  onHover: (s: Submission) => void;
  getTargets: (s: Submission) => Submission[];
};

/**
 * A slot that is a plain button until used and only becomes a live picker
 * then — mounting pickers on every row of a long list would re-render
 * thousands of popovers on every selection change.
 */
function Slot({ kind, submission, active, onChange, getTargets, children, label }: {
  kind: PickerKind; submission: Submission; active: PickerKind | null; onChange: (id: string, k: PickerKind | null) => void; getTargets: (s: Submission) => Submission[]; children: ReactElement; label: string;
}) {
  const trigger = (
    <button
      type="button"
      aria-label={label}
      onClick={e => {
        e.stopPropagation();
        onChange(submission.id, kind);
      }}
      className="inline-flex max-w-full shrink-0 items-center rounded-[5px] outline-none transition-colors hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-accent"
    >
      {children}
    </button>
  );
  if (active !== kind) return trigger;
  return <SubmissionPropertyPicker submissions={getTargets(submission)} kind={kind} open onOpenChange={o => !o && onChange(submission.id, null)} trigger={trigger} />;
}

function SubmissionRowInner({ submission: s, properties, selected, focused, selecting, multiProgram, activePicker, onPickerChange, onClick, onToggleSelect, onHover, getTargets }: RowProps) {
  const ws = useWorkspace();
  const stage = s.stageId ? ws.stageById.get(s.stageId) : undefined;
  const program = ws.programById.get(s.programId);
  const owner = s.ownerId ? ws.memberById.get(s.ownerId) : undefined;
  const labels = s.labelIds.map(id => ws.labelById.get(id)).filter(Boolean);
  const reviewers = s.reviewerIds.map(id => ws.memberById.get(id));
  const has = (p: DisplayProperty) => properties.has(p);
  const slot = { submission: s, active: activePicker, onChange: onPickerChange, getTargets };
  const muted = s.status === 'Declined' || s.status === 'Withdrawn';
  const title = s.title || s.applicantOrganization || s.applicantName || 'Untitled application';

  return (
    <SubmissionContextMenu getTargets={() => getTargets(s)}>
      <div
        role="row"
        data-row-id={s.id}
        aria-selected={selected}
        onClick={e => onClick(s, e)}
        onMouseMove={() => !focused && onHover(s)}
        className={cn(
          'group/row relative flex h-[40px] cursor-default select-none items-center gap-2 border-b border-border/60 pl-2 pr-4 text-[13px] transition-colors duration-75',
          focused ? 'bg-accent/80' : 'hover:bg-accent/50',
          selected && 'bg-primary/[0.07] hover:bg-primary/10 dark:bg-primary/[0.1]',
        )}
      >
        {focused && <span className="absolute inset-y-0 left-0 w-[2px] bg-primary/70" aria-hidden />}
        <button
          type="button"
          aria-label={selected ? 'Deselect' : 'Select'}
          onClick={e => {
            e.stopPropagation();
            onToggleSelect(s, e);
          }}
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-opacity',
            selected ? 'border-primary bg-primary text-primary-foreground opacity-100' : 'border-input bg-background',
            !selected && (selecting ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'),
          )}
        >
          {selected && <Check className="h-3 w-3" strokeWidth={3} />}
        </button>

        <Slot {...slot} kind="stage" label="Move or decide">
          <Tip label={s.status === 'Submitted' ? stage?.name ?? 'No stage' : s.status}>
            <span className="flex h-6 w-6 items-center justify-center">
              <SubmissionGlyph submission={s} stage={stage} stages={ws.stagesFor(s.programId)} />
            </span>
          </Tip>
        </Slot>

        {has('reference') && <span className="hidden w-[64px] shrink-0 truncate text-[12.5px] tabular-nums text-muted-foreground sm:inline">{s.reference}</span>}

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className={cn('truncate', muted ? 'text-muted-foreground' : 'text-foreground')}>{title}</span>
          {has('applicant') && (s.applicantOrganization || s.applicantName) && title !== (s.applicantOrganization || s.applicantName) && (
            <span className="hidden min-w-0 shrink truncate text-[12.5px] text-muted-foreground md:inline">{s.applicantOrganization || s.applicantName}</span>
          )}
          {s.late && (
            <Tip label="Submitted after the deadline">
              <span className="shrink-0 rounded bg-tone-warning/10 px-1.5 py-px text-2xs font-medium text-tone-warning">Late</span>
            </Tip>
          )}
          {['Accepted', 'Declined', 'Waitlisted'].includes(s.status) && !s.notifiedAt && (
            <Tip label="Decided but not yet released to the applicant">
              <span className="shrink-0 rounded border border-dashed border-foreground/20 px-1.5 py-px text-2xs text-muted-foreground">Unreleased</span>
            </Tip>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {has('signals') && (s.unreadMessages > 0 || s.openTasks > 0) && (
            <span className="hidden items-center gap-2 text-xs md:flex">
              {s.unreadMessages > 0 && (
                <Tip label={`${s.unreadMessages} unread message${s.unreadMessages === 1 ? '' : 's'} from the applicant`}>
                  <span className="flex items-center gap-0.5 font-medium text-primary">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {s.unreadMessages}
                  </span>
                </Tip>
              )}
              {s.openTasks > 0 && (
                <Tip label={`${s.openTasks} open task${s.openTasks === 1 ? '' : 's'}`}>
                  <span className="flex items-center gap-0.5 text-muted-foreground">
                    <ListTodo className="h-3.5 w-3.5" />
                    {s.openTasks}
                  </span>
                </Tip>
              )}
            </span>
          )}

          {has('labels') && labels.length > 0 && (
            <Slot {...slot} kind="labels" label="Change labels">
              <span className="hidden items-center gap-1 lg:flex">
                {labels.slice(0, 2).map(l => (
                  <span key={l!.id} className="chip h-[22px] max-w-[130px] bg-background">
                    <LabelDot color={l!.color} />
                    <span className="truncate">{l!.name}</span>
                  </span>
                ))}
                {labels.length > 2 && <span className="chip h-[22px] bg-background text-muted-foreground">+{labels.length - 2}</span>}
              </span>
            </Slot>
          )}

          {has('program') && multiProgram && program && (
            <span className="chip hidden h-[22px] max-w-[160px] bg-background xl:inline-flex">
              <Glyph icon={program.icon} color={program.color} size={13} className="text-[9px]" />
              <span className="truncate">{program.key}</span>
            </span>
          )}

          {has('stage') && s.status === 'Submitted' && stage && (
            <span className="hidden w-[108px] truncate text-right text-[12.5px] text-muted-foreground 2xl:inline">{stage.name}</span>
          )}

          {has('reviews') && (
            <span className="hidden w-[92px] items-center justify-end gap-2 md:flex">
              {reviewers.length > 0 && <AvatarStack members={reviewers} size={18} max={3} />}
              {s.reviewsActive > 0 ? <ReviewProgress done={s.reviewsDoneInStage} total={s.reviewsActive} /> : null}
            </span>
          )}

          {has('score') && (
            <span className="flex w-[44px] justify-end">
              <ScorePill score={s.avgScore} spread={s.scoreSpread} count={s.reviewsSubmitted} />
            </span>
          )}

          {has('amount') && (
            <span className="hidden w-[72px] text-right text-[12.5px] tabular-nums text-foreground/90 sm:inline">
              {s.status === 'Accepted' && s.awardAmount != null && has('award') ? (
                <Tip label={`Awarded ${ws.money(s.awardAmount)}${s.requestedAmount != null ? ` of ${ws.money(s.requestedAmount)} requested` : ''}`}>
                  <span className="font-medium text-tone-success">{ws.money(s.awardAmount, { compact: true })}</span>
                </Tip>
              ) : s.requestedAmount != null ? (
                ws.money(s.requestedAmount, { compact: true })
              ) : (
                <span className="text-muted-foreground/60">—</span>
              )}
            </span>
          )}

          {has('submitted') && (
            <Tip label={s.submittedAt ? `Submitted ${shortDate(s.submittedAt)}` : `Started ${shortDate(s.startedAt)}`}>
              <span className="hidden w-[52px] text-right text-xs tabular-nums text-muted-foreground md:inline">{shortDate(s.submittedAt ?? s.startedAt)}</span>
            </Tip>
          )}

          {has('activity') && (
            <Tip label={`Last activity ${timeAgo(s.lastActivityAt)}`}>
              <span className="hidden w-[64px] items-center justify-end gap-1 text-xs tabular-nums text-muted-foreground lg:flex">
                <Clock3 className="h-3 w-3" />
                {timeAgo(s.lastActivityAt).replace(' ago', '')}
              </span>
            </Tip>
          )}

          {has('owner') && (
            <Slot {...slot} kind="owner" label="Change owner">
              <Tip label={owner ? `Owner: ${owner.name}` : 'No owner'}>
                <span className="flex h-6 w-6 items-center justify-center">
                  <MemberAvatar member={owner} size={20} />
                </span>
              </Tip>
            </Slot>
          )}
        </div>
      </div>
    </SubmissionContextMenu>
  );
}

export const SubmissionRow = memo(SubmissionRowInner);
