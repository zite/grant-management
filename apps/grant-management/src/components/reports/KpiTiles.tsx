import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import { useWorkspace } from '../../lib/workspace';
import { Tip } from '../primitives/bits';
import { days, fmt, pct, type Reports } from './shared';

type Delta = { text: string; direction: 'up' | 'down' | 'flat'; good: boolean | null; explain: string };

function change(current: number, previous: number | null | undefined, opts: { lowerIsBetter?: boolean; neutral?: boolean; unit?: 'percent' | 'points' | 'days'; periodLabel: string }): Delta | null {
  // Nothing now and nothing before isn't a change worth a badge.
  if (previous == null || (current === 0 && previous === 0)) return null;
  const diff = current - previous;
  const direction = Math.abs(diff) < 0.05 ? 'flat' : diff > 0 ? 'up' : 'down';
  const good = opts.neutral || direction === 'flat' ? null : (direction === 'up') !== Boolean(opts.lowerIsBetter);
  let text: string;
  if (opts.unit === 'points') text = `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(Math.round(diff))} pts`;
  else if (opts.unit === 'days') text = `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${days(Math.abs(diff))}`;
  else if (previous === 0) text = current === 0 ? '0%' : 'New';
  else text = `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(Math.round((diff / previous) * 100))}%`;
  return { text, direction, good, explain: `vs ${opts.periodLabel}` };
}

function DeltaBadge({ delta }: { delta: Delta | null }) {
  if (!delta) return null;
  const Icon = delta.direction === 'up' ? ArrowUpRight : delta.direction === 'down' ? ArrowDownRight : Minus;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-2xs font-medium tabular-nums', delta.good === true ? 'text-tone-success' : delta.good === false ? 'text-tone-danger' : 'text-muted-foreground')}>
      <Icon className="h-3 w-3" aria-hidden />
      {delta.text}
    </span>
  );
}

/**
 * The headline numbers for the range. A change is shown against the equal
 * period just before it; green and red only where "up" has a clear meaning.
 */
export function KpiTiles({ data }: { data: Reports }) {
  const ws = useWorkspace();
  const k = data.kpis;
  const period = data.range.allTime ? '' : `the previous ${data.range.days} days`;
  const rate = pct(k.accepted, k.decided);
  const ratePrev = k.decidedPrev ? pct(k.acceptedPrev ?? 0, k.decidedPrev) : null;
  const conversion = pct(k.startedSubmitted, k.started);

  const tiles = [
    {
      label: 'Applications submitted',
      value: fmt(k.submitted),
      hint: data.range.allTime ? 'Since the first application' : k.submittedPrev != null ? `${fmt(k.submittedPrev)} in the period before` : '',
      delta: change(k.submitted, k.submittedPrev, { periodLabel: period }),
    },
    {
      label: 'Draft → submitted',
      value: conversion == null ? '—' : `${conversion}%`,
      hint: k.started ? `${fmt(k.startedSubmitted)} of ${fmt(k.started)} started` : 'No applications started',
      delta: null,
    },
    {
      label: 'Acceptance rate',
      value: rate == null ? '—' : `${rate}%`,
      hint: k.decided ? `${fmt(k.accepted)} of ${fmt(k.decided)} decisions` : 'No decisions yet',
      delta: rate != null && ratePrev != null ? change(rate, ratePrev, { unit: 'points', neutral: true, periodLabel: period }) : null,
    },
    {
      label: 'Total requested',
      value: ws.money(k.requested, { compact: true }),
      hint: 'By applications submitted',
      delta: change(k.requested, k.requestedPrev, { neutral: true, periodLabel: period }),
    },
    {
      label: 'Total awarded',
      value: ws.money(k.awarded, { compact: true }),
      hint: 'By acceptances in the range',
      delta: change(k.awarded, k.awardedPrev, { neutral: true, periodLabel: period }),
    },
    {
      label: 'Median days to decision',
      value: k.medianDaysToDecision == null ? '—' : days(k.medianDaysToDecision),
      hint: k.decided ? 'From submission to decision' : 'No decisions yet',
      delta: k.medianDaysToDecision != null ? change(k.medianDaysToDecision, k.medianDaysToDecisionPrev, { unit: 'days', lowerIsBetter: true, periodLabel: period }) : null,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3 xl:grid-cols-6" role="list" aria-label="Key numbers">
      {tiles.map(t => (
        <div key={t.label} role="listitem" className="min-w-0 bg-background px-3.5 py-3">
          <div className="truncate text-xs text-muted-foreground">{t.label}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[22px] font-semibold leading-7 tracking-tight">{t.value}</span>
            {t.delta && (
              <Tip label={`${t.delta.text} ${t.delta.explain}`}>
                <span tabIndex={0} className="rounded outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  <DeltaBadge delta={t.delta} />
                  <span className="sr-only"> {t.delta.explain}</span>
                </span>
              </Tip>
            )}
          </div>
          <div className="truncate text-2xs text-muted-foreground" title={t.hint}>{t.hint}</div>
        </div>
      ))}
    </div>
  );
}

export function KpiTilesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3 xl:grid-cols-6" aria-busy>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-background px-3.5 py-3">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton mt-2.5 h-5 w-12" />
          <div className="skeleton mt-2 h-2.5 w-20" />
        </div>
      ))}
    </div>
  );
}
