import {
  closestCorners, DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { ListTodo, MessageSquare } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@project/components/lib/utils';
import type { DisplayProperty, Grouping } from '../../lib/constants';
import { shortDate } from '../../lib/format';
import type { Submission } from '../../lib/types';
import type { SubmissionGroup } from '../../lib/view';
import { useWorkspace } from '../../lib/workspace';
import { AvatarStack, MemberAvatar } from '../primitives/Avatar';
import { ReviewProgress, ScorePill, SubmissionGlyph } from '../primitives/icons';
import { Glyph, LabelDot } from '../primitives/bits';
import { GroupIcon } from './SubmissionList';
import { SubmissionContextMenu } from './SubmissionContextMenu';

export type BoardMove = { submission: Submission; fromKey: string; toGroup: SubmissionGroup };

type Props = {
  groups: SubmissionGroup[];
  grouping: Grouping;
  properties: Set<DisplayProperty>;
  selection: Set<string>;
  focusedId: string | null;
  multiProgram: boolean;
  onMove: (move: BoardMove) => void;
  onCardClick: (s: Submission, e: MouseEvent) => void;
  getTargets: (s: Submission) => Submission[];
};

/** Presentational — rendered in its column and, separately, in the drag overlay. */
const CardBody = memo(function CardBody({ submission: s, properties, grouping, multiProgram, selected, focused, overlay }: {
  submission: Submission; properties: Set<DisplayProperty>; grouping: Grouping; multiProgram: boolean; selected?: boolean; focused?: boolean; overlay?: boolean;
}) {
  const ws = useWorkspace();
  const stage = s.stageId ? ws.stageById.get(s.stageId) : undefined;
  const program = ws.programById.get(s.programId);
  const owner = s.ownerId ? ws.memberById.get(s.ownerId) : undefined;
  const labels = s.labelIds.map(id => ws.labelById.get(id)).filter(Boolean);
  const has = (p: DisplayProperty) => properties.has(p);
  const muted = s.status === 'Declined' || s.status === 'Withdrawn';
  return (
    <div
      className={cn(
        'group/card relative rounded-lg border bg-card px-3 py-2.5 text-[13px] shadow-xs transition-[border-color,box-shadow] duration-100 hover:border-foreground/15 hover:shadow-sm',
        selected && 'border-primary/60 ring-1 ring-primary/40',
        focused && !selected && 'border-foreground/25',
        overlay && 'rotate-[1.5deg] cursor-grabbing border-foreground/20 shadow-xl',
      )}
    >
      <div className="flex items-center gap-1.5">
        {grouping !== 'stage' && <SubmissionGlyph submission={s} stage={stage} stages={ws.stagesFor(s.programId)} size={13} />}
        {has('reference') && <span className="text-xs tabular-nums text-muted-foreground">{s.reference}</span>}
        {multiProgram && program && <Glyph icon={program.icon} color={program.color} size={14} className="text-[9px]" />}
        <span className="ml-auto flex items-center gap-1.5">
          {has('score') && s.avgScore != null && <ScorePill score={s.avgScore} spread={s.scoreSpread} count={s.reviewsSubmitted} />}
          {has('owner') && owner && <MemberAvatar member={owner} size={18} />}
        </span>
      </div>
      <p className={cn('mt-1 line-clamp-2 leading-[1.4]', muted ? 'text-muted-foreground' : 'text-foreground')}>{s.title || s.applicantName || 'Untitled application'}</p>
      {has('applicant') && (s.applicantOrganization || s.applicantName) && s.title && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.applicantOrganization || s.applicantName}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {has('amount') && (s.requestedAmount != null || s.awardAmount != null) && (
          <span className={cn('chip h-[22px] bg-background tabular-nums', s.status === 'Accepted' && s.awardAmount != null && 'border-tone-success/30 text-tone-success')}>
            {ws.money(s.status === 'Accepted' && s.awardAmount != null ? s.awardAmount : s.requestedAmount, { compact: true })}
          </span>
        )}
        {has('labels') && labels.slice(0, 2).map(l => (
          <span key={l!.id} className="chip h-[22px] max-w-[120px] bg-background">
            <LabelDot color={l!.color} />
            <span className="truncate">{l!.name}</span>
          </span>
        ))}
        {has('reviews') && s.reviewsActive > 0 && (
          <span className="flex items-center gap-1.5 px-0.5">
            <AvatarStack members={s.reviewerIds.map(id => ws.memberById.get(id))} size={16} max={3} />
            <ReviewProgress done={s.reviewsDoneInStage} total={s.reviewsActive} />
          </span>
        )}
        {has('signals') && s.unreadMessages > 0 && (
          <span className="flex items-center gap-0.5 px-0.5 text-xs font-medium text-primary">
            <MessageSquare className="h-3 w-3" />
            {s.unreadMessages}
          </span>
        )}
        {has('signals') && s.openTasks > 0 && (
          <span className="flex items-center gap-0.5 px-0.5 text-xs text-muted-foreground">
            <ListTodo className="h-3 w-3" />
            {s.openTasks}
          </span>
        )}
        {has('submitted') && <span className="ml-auto text-2xs tabular-nums text-muted-foreground">{shortDate(s.submittedAt ?? s.startedAt)}</span>}
      </div>
      {['Accepted', 'Declined', 'Waitlisted'].includes(s.status) && !s.notifiedAt && (
        <div className="mt-2 border-t border-dashed pt-1.5 text-2xs text-muted-foreground">Decided · not yet released</div>
      )}
    </div>
  );
});

function DraggableCard(props: { submission: Submission; properties: Set<DisplayProperty>; grouping: Grouping; multiProgram: boolean; selected: boolean; focused: boolean; disabled: boolean; onClick: (s: Submission, e: MouseEvent) => void; getTargets: (s: Submission) => Submission[] }) {
  // No transform on the source while dragging: the overlay follows the pointer, and moving both makes the card leap.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.submission.id, disabled: props.disabled });
  return (
    <SubmissionContextMenu getTargets={() => props.getTargets(props.submission)}>
      <div
        ref={setNodeRef}
        data-row-id={props.submission.id}
        style={{ touchAction: 'none' }}
        className={cn('cursor-default outline-none', isDragging && 'opacity-35')}
        onClick={e => props.onClick(props.submission, e)}
        {...attributes}
        {...listeners}
      >
        <CardBody {...props} />
      </div>
    </SubmissionContextMenu>
  );
}

function Column({ group, grouping, count, droppable, children }: { group: SubmissionGroup; grouping: Grouping; count: number; droppable: boolean; children: ReactNode }) {
  // The droppable is the whole column, header included — otherwise the header is a dead zone.
  const { setNodeRef, isOver } = useDroppable({ id: `col:${group.key}`, disabled: !droppable });
  const decision = group.drop?.field === 'decision';
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex h-full w-[296px] shrink-0 flex-col rounded-xl bg-subtle/70 transition-colors dark:bg-subtle/60',
        isOver && droppable && (decision ? 'bg-primary/[0.08] ring-2 ring-primary/35' : 'bg-primary/[0.06] ring-1 ring-primary/25'),
      )}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 px-3">
        <GroupIcon group={group} grouping={grouping} />
        <span className="truncate text-[13px] font-medium">{group.label}</span>
        <span className="text-[12.5px] tabular-nums text-muted-foreground">{count}</span>
        {group.hint && <span className="ml-auto text-xs tabular-nums text-muted-foreground/80">{group.hint}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <div className="flex min-h-[64px] flex-col gap-2">{children}</div>
        {count === 0 && (
          <div className="mt-[-64px] flex h-16 items-center justify-center rounded-lg border border-dashed px-3 text-center text-xs text-muted-foreground/70">
            {decision ? `Drop to ${group.label === 'Accepted' ? 'accept' : group.label === 'Declined' ? 'decline' : 'waitlist'}` : 'Nothing here'}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The pipeline as a board. Dropping on a stage moves the submission; dropping
 * on an outcome column opens the decision flow rather than deciding silently.
 *
 * Collision uses the pointer, autoscroll is replaced by pointer-keyed edge
 * scrolling, and there is no drop animation — the move is optimistic.
 */
function SubmissionBoardInner({ groups, grouping, properties, selection, focusedId, multiProgram, onMove, onCardClick, getTargets }: Props) {
  const ws = useWorkspace();
  const [activeId, setActiveId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const byId = new Map(groups.flatMap(g => g.submissions.map(s => [s.id, s] as const)));
  const keyOf = (id: string) => groups.find(g => g.submissions.some(s => s.id === id))?.key;

  const collision: CollisionDetection = useCallback(args => {
    const hits = pointerWithin(args);
    return hits.length ? hits : closestCorners(args);
  }, []);

  useEffect(() => {
    if (!activeId) return;
    const onMoveEvt = (e: PointerEvent) => (pointer.current = { x: e.clientX, y: e.clientY });
    window.addEventListener('pointermove', onMoveEvt);
    const timer = window.setInterval(() => {
      const el = scroller.current;
      const p = pointer.current;
      if (!el || !p) return;
      const r = el.getBoundingClientRect();
      const edge = 72;
      if (p.x < r.left + edge) el.scrollLeft -= Math.ceil((r.left + edge - p.x) / 4);
      else if (p.x > r.right - edge) el.scrollLeft += Math.ceil((p.x - (r.right - edge)) / 4);
    }, 16);
    return () => {
      window.removeEventListener('pointermove', onMoveEvt);
      window.clearInterval(timer);
    };
  }, [activeId]);

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const id = String(active.id);
    const toKey = String(over.id).replace(/^col:/, '');
    const fromKey = keyOf(id);
    const toGroup = groups.find(g => g.key === toKey);
    const submission = byId.get(id);
    if (!fromKey || !toGroup?.drop || !submission || fromKey === toKey) return;
    onMove({ submission, fromKey, toGroup });
  };
  const active = activeId ? byId.get(activeId) : undefined;
  const dragDisabled = grouping === 'label' || grouping === 'review' || grouping === 'program' || grouping === 'none';

  return (
    <DndContext sensors={sensors} collisionDetection={collision} autoScroll={false} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div ref={scroller} className="flex h-full gap-3 overflow-x-auto overflow-y-hidden px-4 pb-4 pt-3">
        {groups.map(group => (
          <Column key={group.key} group={group} grouping={grouping} count={group.submissions.length} droppable={Boolean(group.drop) && !dragDisabled}>
            {group.submissions.map(s => (
              <DraggableCard
                key={s.id}
                submission={s}
                properties={properties}
                grouping={grouping}
                multiProgram={multiProgram}
                selected={selection.has(s.id)}
                focused={focusedId === s.id}
                disabled={dragDisabled || s.status === 'Withdrawn' || s.status === 'Draft'}
                onClick={onCardClick}
                getTargets={getTargets}
              />
            ))}
          </Column>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>{active ? <CardBody submission={active} properties={properties} grouping={grouping} multiProgram={multiProgram} overlay /> : null}</DragOverlay>
      {!groups.length && <div className="p-6 text-sm text-muted-foreground">{ws.programs.length ? 'Nothing to show' : 'Create a program to get started'}</div>}
    </DndContext>
  );
}

export const SubmissionBoard = memo(SubmissionBoardInner);
