import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { type ReactNode } from 'react';
import { cn } from '@project/components/lib/utils';
import { PHASE_LABEL, type ProgramPhase } from '@project/shared/status';
import { deadlineLabel, shortDate } from '../../lib/format';
import type { Program } from '../../lib/types';
import { PhaseDot } from '../primitives/icons';

/** "Accepting applications · closes in 12 days", "Opens Oct 1", "Closed Sep 3", "Draft — not visible to applicants". */
export function statusLine(p: Pick<Program, 'phase' | 'opensAt' | 'deadline' | 'allowLate'>): { text: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' } {
  switch (p.phase as ProgramPhase) {
    case 'draft':
      return { text: 'Draft — not visible to applicants', tone: 'neutral' };
    case 'archived':
      return { text: 'Archived — hidden from applicants and lists', tone: 'neutral' };
    case 'scheduled':
      return { text: `Opens ${p.opensAt ? whenLabel(p.opensAt) : 'soon'}`, tone: 'info' };
    case 'closed':
      return { text: `Closed ${p.deadline ? shortDate(p.deadline) : ''}${p.allowLate ? ' · still accepting late submissions' : ''}`.trim(), tone: 'neutral' };
    default: {
      if (!p.deadline) return { text: 'Accepting applications · rolling, no deadline', tone: 'success' };
      const d = deadlineLabel(p.deadline);
      const rest = d.label.replace(/^Closes/, 'closes');
      return { text: `Accepting applications · ${rest}`, tone: d.tone === 'overdue' ? 'danger' : d.tone === 'soon' ? 'warning' : 'success' };
    }
  }
}

function whenLabel(iso: string) {
  const d = parseISO(iso);
  const days = differenceInCalendarDays(d, new Date());
  if (days === 0) return `today at ${format(d, 'h:mm a')}`;
  if (days === 1) return `tomorrow at ${format(d, 'h:mm a')}`;
  return shortDate(iso);
}

const TONE_TEXT = {
  success: 'text-tone-success',
  warning: 'text-tone-warning',
  danger: 'text-tone-danger',
  info: 'text-tone-info',
  accent: 'text-tone-accent',
  neutral: 'text-muted-foreground',
} as const;

export const toneText = (tone: keyof typeof TONE_TEXT) => TONE_TEXT[tone];

/** The phase as a quiet chip: a dot that pulses while open, and its name. */
export function PhaseBadge({ phase, className, children }: { phase: string; className?: string; children?: ReactNode }) {
  return (
    <span className={cn('inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border bg-background px-2 text-2xs font-medium text-muted-foreground', className)}>
      <PhaseDot phase={phase} />
      <span className="text-foreground/85">{PHASE_LABEL[phase as ProgramPhase] ?? phase}</span>
      {children}
    </span>
  );
}

/** The deadline countdown, coloured only when it's getting close. */
export function DeadlineText({ program, className }: { program: Pick<Program, 'phase' | 'deadline' | 'opensAt'>; className?: string }) {
  if (program.phase === 'archived') return null;
  if (program.phase === 'scheduled' && program.opensAt) return <span className={cn('text-muted-foreground', className)}>Opens {shortDate(program.opensAt)}</span>;
  if (program.phase === 'draft') return <span className={cn('text-muted-foreground', className)}>{program.deadline ? `Deadline ${shortDate(program.deadline)}` : 'No deadline yet'}</span>;
  const d = deadlineLabel(program.deadline);
  const tone = program.phase === 'closed' ? 'text-muted-foreground' : d.tone === 'overdue' ? 'text-tone-danger' : d.tone === 'soon' ? 'text-tone-warning' : 'text-muted-foreground';
  return <span className={cn(tone, className)}>{d.label}</span>;
}

/**
 * A 30-day trend as tiny columns in the program's colour — sparse daily counts
 * read as bars, where a line would zig-zag between zero and one. Days with
 * nothing show a faint tick so the timeline stays legible.
 */
export function Sparkline({ values, color, width = 120, height = 28, label, className }: { values: number[]; color: string; width?: number; height?: number; label?: string; className?: string }) {
  if (values.length < 2) return <div style={{ width, height }} className={className} />;
  const max = Math.max(1, ...values);
  const gap = 1;
  const bar = Math.max(1, (width - gap * (values.length - 1)) / values.length);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn('shrink-0', className)} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {values.map((v, i) => {
        const x = i * (bar + gap);
        if (v <= 0) return <rect key={i} x={x} y={height - 1} width={bar} height={1} fill="hsl(var(--muted-foreground))" opacity={0.25} />;
        const h = Math.max(3, (v / max) * height);
        return <rect key={i} x={x} y={height - h} width={bar} height={h} rx={Math.min(1, bar / 2)} fill={color} opacity={i === values.length - 1 ? 1 : 0.75} />;
      })}
    </svg>
  );
}

/** A labelled number for dense stat rows. */
export function MiniStat({ label, value, hint, className }: { label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="truncate text-2xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-[13px] font-medium tabular-nums">
        {value}
        {hint && <span className="ml-1 font-normal text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

export function portalProgramUrl(portalUrl: string | null | undefined, slug: string) {
  if (!portalUrl || !slug) return null;
  return `${portalUrl.replace(/\/+$/, '')}/#/programs/${slug}`;
}
