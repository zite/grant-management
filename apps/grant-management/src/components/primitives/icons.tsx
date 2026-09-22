import { AlertTriangle } from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import { DISAGREEMENT_SPREAD, scoreTone } from '@project/shared/scoring';
import type { Stage, Submission } from '../../lib/types';
import { Tip } from './bits';

/**
 * Pipeline glyphs are drawn rather than borrowed, because the meaning is in
 * the SHAPE: intake is a dashed ring, review a ring filling up, decision a
 * ring with a centre, and outcomes are filled — a tick, a cross, a clock.
 * Colour repeats the information; it never carries it alone.
 */
export function StageGlyph({ kind, color, fraction, size = 14, className }: { kind: string | null | undefined; color?: string | null; fraction?: number; size?: number; className?: string }) {
  const c = color || '#8b8d98';
  const common = { width: size, height: size, viewBox: '0 0 14 14', className: cn('shrink-0', className), 'aria-hidden': true } as const;
  switch (kind) {
    case 'Intake':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="6" fill="none" stroke={c} strokeWidth="1.5" strokeDasharray="1.4 1.75" />
        </svg>
      );
    case 'Review': {
      const f = Math.max(0.2, Math.min(0.85, fraction ?? 0.5));
      const circumference = 2 * Math.PI * 2;
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="6" fill="none" stroke={c} strokeWidth="1.5" />
          <circle cx="7" cy="7" r="2" fill="none" stroke={c} strokeWidth="4" strokeDasharray={`${f * circumference} ${circumference}`} transform="rotate(-90 7 7)" />
        </svg>
      );
    }
    case 'Decision':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="6" fill="none" stroke={c} strokeWidth="1.5" />
          <circle cx="7" cy="7" r="2.6" fill={c} />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="6" fill="none" stroke={c} strokeWidth="1.5" />
        </svg>
      );
  }
}

export function OutcomeGlyph({ status, size = 14, className }: { status: string; size?: number; className?: string }) {
  const common = { width: size, height: size, viewBox: '0 0 14 14', className: cn('shrink-0', className), 'aria-hidden': true } as const;
  switch (status) {
    case 'Accepted':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="6.5" fill="#16a34a" />
          <path d="M4.2 7.2 6.1 9.1 9.9 5.1" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'Declined':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="6.5" fill="#dc2626" />
          <path d="M4.9 4.9 9.1 9.1M9.1 4.9 4.9 9.1" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'Waitlisted':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="6.5" fill="#d97706" />
          <path d="M7 3.9V7l2 1.3" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'Withdrawn':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="6" fill="none" stroke="#8b8d98" strokeWidth="1.5" />
          <path d="M3.2 10.8 10.8 3.2" stroke="#8b8d98" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'Draft':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="6" fill="none" stroke="#8b8d98" strokeWidth="1.5" strokeDasharray="0.6 2.2" strokeLinecap="round" />
        </svg>
      );
    default:
      return <StageGlyph kind={null} size={size} className={className} />;
  }
}

/** The one glyph a row shows: its outcome when decided, otherwise the stage it sits in. */
export function SubmissionGlyph({ submission, stage, stages, size = 14 }: { submission: Pick<Submission, 'status' | 'reviewsActive' | 'reviewsDoneInStage'>; stage?: Stage; stages?: Stage[]; size?: number }) {
  if (submission.status !== 'Submitted') return <OutcomeGlyph status={submission.status} size={size} />;
  const reviewFraction = submission.reviewsActive ? submission.reviewsDoneInStage / submission.reviewsActive : undefined;
  const pipelineFraction = stage && stages?.length ? (stages.findIndex(s => s.id === stage.id) + 1) / (stages.length + 1) : undefined;
  return <StageGlyph kind={stage?.kind} color={stage?.color} fraction={reviewFraction ?? pipelineFraction} size={size} />;
}

const TONE_CLASS = {
  success: 'bg-tone-success/[0.12] text-tone-success',
  accent: 'bg-tone-accent/[0.12] text-tone-accent',
  warning: 'bg-tone-warning/[0.12] text-tone-warning',
  danger: 'bg-tone-danger/[0.12] text-tone-danger',
  neutral: 'bg-muted text-muted-foreground',
} as const;

/** An average score on the 0–100 scale, with a warning when reviewers disagree. */
export function ScorePill({ score, spread, count, className, size = 'sm' }: { score: number | null | undefined; spread?: number | null; count?: number; className?: string; size?: 'sm' | 'md' }) {
  if (score == null) {
    return <span className={cn('inline-flex h-[22px] min-w-[34px] items-center justify-center rounded-md px-1.5 text-xs tabular-nums text-muted-foreground/70', className)}>—</span>;
  }
  const tone = scoreTone(score);
  const disagree = spread != null && spread >= DISAGREEMENT_SPREAD;
  const pill = (
    <span className={cn('inline-flex items-center justify-center gap-1 rounded-md font-semibold tabular-nums', size === 'md' ? 'h-7 min-w-[44px] px-2 text-[14px]' : 'h-[22px] min-w-[34px] px-1.5 text-[12px]', TONE_CLASS[tone], className)}>
      {Math.round(score)}
      {disagree && <AlertTriangle className={size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3'} strokeWidth={2.5} />}
    </span>
  );
  const label = `Average score ${score}${count ? ` from ${count} review${count === 1 ? '' : 's'}` : ''}${disagree ? ` · reviewers are ${Math.round(spread!)} points apart` : ''}`;
  return <Tip label={label}>{pill}</Tip>;
}

/** Reviews finished out of assigned, as pips — up to five, then a fraction. */
export function ReviewProgress({ done, total, className }: { done: number; total: number; className?: string }) {
  if (!total) return <span className={cn('text-xs text-muted-foreground/70', className)}>—</span>;
  const complete = done >= total;
  return (
    <Tip label={`${done} of ${total} reviews in`}>
      <span className={cn('inline-flex items-center gap-1.5 text-xs tabular-nums', complete ? 'text-tone-success' : 'text-muted-foreground', className)}>
        {total <= 5 ? (
          <span className="flex gap-[3px]" aria-hidden>
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i < done ? (complete ? 'bg-tone-success' : 'bg-primary') : 'bg-foreground/15')} />
            ))}
          </span>
        ) : null}
        {done}/{total}
      </span>
    </Tip>
  );
}

export function RecommendationBar({ yes, maybe, no, className }: { yes: number; maybe: number; no: number; className?: string }) {
  const total = yes + maybe + no;
  if (!total) return null;
  return (
    <Tip label={`${yes} recommend · ${maybe} unsure · ${no} don't recommend`}>
      <span className={cn('flex h-1.5 w-12 overflow-hidden rounded-full bg-muted', className)} aria-hidden>
        <span className="h-full bg-tone-success" style={{ width: `${(yes / total) * 100}%` }} />
        <span className="h-full bg-tone-warning" style={{ width: `${(maybe / total) * 100}%` }} />
        <span className="h-full bg-tone-danger" style={{ width: `${(no / total) * 100}%` }} />
      </span>
    </Tip>
  );
}

export function PhaseDot({ phase, className }: { phase: string; className?: string }) {
  const color = phase === 'open' ? 'bg-tone-success' : phase === 'closing' ? 'bg-tone-warning' : phase === 'scheduled' ? 'bg-tone-info' : 'bg-foreground/25';
  return (
    <span className={cn('relative inline-flex h-2 w-2 shrink-0', className)} aria-hidden>
      {(phase === 'open' || phase === 'closing') && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-40', color)} style={{ animationDuration: '2.4s' }} />}
      <span className={cn('relative h-2 w-2 rounded-full', color)} />
    </span>
  );
}
