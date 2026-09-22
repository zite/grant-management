import { ArrowRight, CalendarClock, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@project/components/lib/utils';
import { awardLabel, deadlineInfo, type Urgency } from '../lib/format';
import type { PortalProgram } from '../lib/queries';
import { Tip } from './ui';

const URGENCY_CLASS: Record<Urgency, string> = {
  danger: 'text-tone-danger',
  warning: 'text-tone-warning',
  neutral: 'text-muted-foreground',
  muted: 'text-muted-foreground',
};

/** The deadline as a countdown, with the exact local date and time on hover or focus. */
export function DeadlineText({ program, className, iconless }: { program: Pick<PortalProgram, 'phase' | 'deadline' | 'opensAt' | 'allowLate'>; className?: string; iconless?: boolean }) {
  const info = deadlineInfo(program);
  const Icon = program.phase === 'scheduled' ? CalendarClock : Clock;
  return (
    <Tip label={info.exact}>
      <span tabIndex={0} className={cn('inline-flex items-center gap-1.5 rounded font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40', URGENCY_CLASS[info.tone], className)}>
        {!iconless && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
        <span>{info.label}</span>
        <span className="sr-only">. {info.exact}</span>
      </span>
    </Tip>
  );
}

/**
 * One program in the index.
 *
 * A row rather than a card: a foundation runs a handful of programs, and an
 * applicant reads down them comparing money and dates — which a list does far
 * better than a grid, and without leaving half a row of empty cells.
 */
export function ProgramRow({ program, currency, muted }: { program: PortalProgram; currency: string; muted?: boolean }) {
  const award = awardLabel(program.awardMin, program.awardMax, currency);
  const cta = program.phase === 'scheduled' ? 'Learn more' : program.accepting ? 'View and apply' : 'View details';
  return (
    <li className="group relative border-b last:border-b-0">
      <div className={cn('grid items-start gap-x-10 gap-y-3 py-6 transition-colors sm:grid-cols-[minmax(0,1fr)_minmax(180px,auto)] sm:py-7', muted && 'opacity-80')}>
        <div className="min-w-0">
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">{program.type}</p>
          <h3 className={cn('mt-2.5 font-serif text-2xl font-semibold leading-tight', muted && 'text-foreground/80')}>
            <Link to={`/programs/${program.slug}`} className="decoration-foreground/25 underline-offset-4 after:absolute after:inset-0 focus-visible:outline-none group-hover:underline">
              {program.name}
            </Link>
          </h3>
          {program.summary && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground line-clamp-2">{program.summary}</p>}
        </div>

        <div className="sm:text-right">
          <dl className="space-y-1">
            {award && (
              <div>
                <dt className="sr-only">Award</dt>
                <dd className="text-[15px] font-semibold tabular-nums">{award}</dd>
              </div>
            )}
            <div>
              <dt className="sr-only">Deadline</dt>
              {/* Above the row's stretched link, so the exact date can be hovered. */}
              <dd className="relative z-10 inline-flex text-sm">
                <DeadlineText program={program} iconless />
              </dd>
            </div>
          </dl>
          <span className={cn('mt-3 inline-flex items-center gap-1.5 text-sm font-medium', muted ? 'text-muted-foreground' : 'text-primary')}>
            {cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </div>
      </div>
    </li>
  );
}
