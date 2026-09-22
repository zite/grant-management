import { EyeOff, Minus, ThumbsDown, ThumbsUp } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@project/components/lib/utils';
import { RECOMMENDATION_LABEL, type Recommendation } from '@project/shared/scoring';
import { dueLabel, shortDate } from '../../lib/format';
import type { ReviewQueueItem } from '../../lib/types';
import { ScorePill } from '../primitives/icons';
import { Tip } from '../primitives/bits';

/** A review's state as a shape: an empty ring waiting, a half ring started, a filled tick done, a slash stepped back. */
export function ReviewStatusGlyph({ status, closed, size = 14, className }: { status: string; closed?: boolean; size?: number; className?: string }) {
  const common = { width: size, height: size, viewBox: '0 0 14 14', className: cn('shrink-0', className), 'aria-hidden': true } as const;
  if (closed) {
    return (
      <svg {...common}>
        <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeOpacity={0.35} strokeWidth="1.5" strokeDasharray="1.4 1.75" />
      </svg>
    );
  }
  switch (status) {
    case 'In progress':
      return (
        <svg {...common} className={cn(common.className, 'text-tone-warning')}>
          <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 3.5a3.5 3.5 0 0 1 0 7z" fill="currentColor" />
        </svg>
      );
    case 'Submitted':
      return (
        <svg {...common} className={cn(common.className, 'text-tone-success')}>
          <circle cx="7" cy="7" r="6.5" fill="currentColor" />
          <path d="M4.2 7.2 6.1 9.1 9.9 5.1" fill="none" stroke="hsl(var(--background))" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'Recused':
      return (
        <svg {...common} className={cn(common.className, 'text-muted-foreground')}>
          <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3.2 10.8 10.8 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg {...common} className={cn(common.className, 'text-muted-foreground')}>
          <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
  }
}

export function RecommendationLabel({ value, className, short }: { value: string | null | undefined; className?: string; short?: boolean }) {
  if (value !== 'Yes' && value !== 'Maybe' && value !== 'No') return null;
  const Icon = value === 'Yes' ? ThumbsUp : value === 'No' ? ThumbsDown : Minus;
  const tone = value === 'Yes' ? 'text-tone-success' : value === 'No' ? 'text-tone-danger' : 'text-tone-warning';
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground', className)}>
      <Icon className={cn('h-3 w-3 shrink-0', tone)} />
      {!short && <span className="truncate">{RECOMMENDATION_LABEL[value as Recommendation]}</span>}
    </span>
  );
}

export const DUE_TONE = { overdue: 'text-tone-danger', soon: 'text-tone-warning', normal: 'text-muted-foreground' } as const;

function ReviewQueueRowInner({ review: r, focused, onOpen, onFocus }: { review: ReviewQueueItem; focused: boolean; onOpen: (r: ReviewQueueItem) => void; onFocus: (id: string) => void }) {
  const open = (r.status === 'Assigned' || r.status === 'In progress') && !r.closed;
  const due = open ? dueLabel(r.dueDate) : null;
  const finished = r.status === 'Submitted' || r.status === 'Recused';

  return (
    <div
      role="row"
      data-review-id={r.id}
      aria-selected={focused}
      onClick={() => onOpen(r)}
      onMouseMove={() => !focused && onFocus(r.id)}
      className={cn(
        'group/row relative flex h-10 cursor-default select-none items-center gap-2.5 border-b border-border/60 pl-4 pr-4 text-[13px] transition-colors duration-75',
        focused ? 'bg-accent/80' : 'hover:bg-accent/50',
      )}
    >
      {focused && <span className="absolute inset-y-0 left-0 w-[2px] bg-primary/70" aria-hidden />}
      <Tip label={r.closed ? 'Closed — the application moved on before this was finished' : r.status}>
        <span className="flex h-6 w-4 items-center justify-center">
          <ReviewStatusGlyph status={r.status} closed={r.closed} />
        </span>
      </Tip>
      <span className="hidden w-[68px] shrink-0 truncate text-[12.5px] tabular-nums text-muted-foreground sm:inline">{r.reference}</span>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className={cn('truncate', r.closed || r.status === 'Recused' ? 'text-muted-foreground' : 'text-foreground')}>{r.title}</span>
        {r.blind ? (
          <Tip label="Blind review — the applicant's identity is hidden from you">
            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-px text-2xs font-medium text-muted-foreground">
              <EyeOff className="h-3 w-3" /> Blind
            </span>
          </Tip>
        ) : r.applicantLabel ? (
          <span className="hidden min-w-0 shrink truncate text-[12.5px] text-muted-foreground md:inline">{r.applicantLabel}</span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {r.stageName && <span className="hidden w-[128px] truncate text-right text-[12.5px] text-muted-foreground lg:inline">{r.stageName}</span>}

        <span className="w-[68px] text-right text-xs tabular-nums sm:w-[76px]">
          {due ? (
            <Tip label={due.tone === 'overdue' ? `Overdue — was due ${shortDate(r.dueDate)}` : `Due ${shortDate(r.dueDate)}`}>
              <span className={cn(DUE_TONE[due.tone], due.tone === 'overdue' && 'font-medium')}>{due.label}</span>
            </Tip>
          ) : finished && r.submittedAt ? (
            <Tip label={`${r.status === 'Recused' ? 'Stepped back' : 'Submitted'} ${shortDate(r.submittedAt)}`}>
              <span className="text-muted-foreground">{shortDate(r.submittedAt)}</span>
            </Tip>
          ) : (
            <span className="text-muted-foreground/60">—</span>
          )}
        </span>

        <span className="flex items-center justify-end gap-1.5 sm:w-[148px]">
          {r.closed ? (
            <Tip label="The application moved to another stage or was decided — nothing more is needed from you">
              <span className="text-xs text-muted-foreground">Closed</span>
            </Tip>
          ) : r.status === 'Submitted' ? (
            <>
              <RecommendationLabel value={r.recommendation} className="hidden sm:inline-flex" />
              <RecommendationLabel value={r.recommendation} short className="sm:hidden" />
              <ScorePill score={r.totalScore} />
            </>
          ) : r.status === 'Recused' ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">Recused</span>
          ) : r.status === 'In progress' ? (
            <span className="hidden text-xs font-medium text-tone-warning sm:inline">In progress</span>
          ) : (
            <span className="hidden text-xs text-muted-foreground sm:inline">Assigned</span>
          )}
        </span>
      </div>
    </div>
  );
}

export const ReviewQueueRow = memo(ReviewQueueRowInner);
