import { AlertTriangle } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '@project/components/lib/utils';
import { useWorkspace } from '../../lib/workspace';
import { MemberAvatar } from '../primitives/Avatar';
import { Tip } from '../primitives/bits';
import { DataTable, LegendKey, Panel, PanelEmpty, days, fmt, pct, type Reports } from './shared';

/** A reviewer this far from their colleagues, on average, is worth a conversation. */
const OUTLIER = 10;
/** Fewer comparisons than this and the average is mostly noise. */
const MIN_COMPARED = 3;

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'danger' }) {
  return (
    <div className="min-w-0 bg-background px-3.5 py-2.5">
      <div className={cn('truncate text-xs text-muted-foreground', tone === 'danger' && 'text-tone-danger')}>{label}</div>
      <div className={cn('mt-0.5 text-[18px] font-semibold leading-6 tracking-tight', tone === 'danger' && 'text-tone-danger')}>{value}</div>
      {hint && <div className="truncate text-2xs text-muted-foreground" title={hint}>{hint}</div>}
    </div>
  );
}

/**
 * How review work is flowing, and whether reviewers score alike. Calibration
 * compares each reviewer's score with the average of the OTHER reviewers of
 * the same submissions at the same stage, so a panel that only saw strong
 * applications isn't mistaken for a generous one.
 */
export function ReviewOps({ data }: { data: Reports }) {
  const ws = useWorkspace();
  const r = data.reviewOps;
  const onTime = pct(r.submittedOnTime, r.submittedWithDue);

  const rows = useMemo(
    () =>
      data.calibration
        .filter(c => c.compared > 0 && c.delta != null)
        .map(c => ({ ...c, member: ws.memberById.get(c.reviewerId), delta: c.delta! }))
        .sort((a, b) => a.delta - b.delta),
    [data.calibration, ws.memberById],
  );
  const extent = Math.max(15, Math.ceil(Math.max(0, ...rows.map(x => Math.abs(x.delta))) / 5) * 5);
  const outliers = rows.filter(x => Math.abs(x.delta) >= OUTLIER && x.compared >= MIN_COMPARED);

  const name = (c: (typeof rows)[number]) => c.member?.name ?? 'Former member';
  const stats = (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-4">
      <Stat label="Assigned" value={fmt(r.assigned)} hint={r.recused ? `${fmt(r.recused)} recused` : 'In this range'} />
      <Stat label="Submitted" value={fmt(r.submitted)} hint={onTime != null ? `${onTime}% by the due date` : 'In this range'} />
      <Stat label="Overdue now" value={fmt(r.overdueNow)} hint={`${fmt(r.openNow)} open in all`} tone={r.overdueNow ? 'danger' : undefined} />
      <Stat label="Median turnaround" value={days(r.medianTurnaroundDays)} hint="Assigned to submitted" />
    </div>
  );
  const table = (
    <div className="space-y-4">
      {stats}
      <DataTable
        caption="Reviewer calibration"
        headers={['Reviewer', 'Reviews', 'Compared', 'Their average', 'Others on the same', 'Difference']}
        align={['left', 'right', 'right', 'right', 'right', 'right']}
        rows={rows.map(c => [name(c), fmt(c.reviews), fmt(c.compared), c.avgScoreCompared ?? '—', c.othersAvg ?? '—', `${c.delta > 0 ? '+' : ''}${c.delta}`])}
      />
    </div>
  );

  const csv = {
    name: 'review-operations',
    headers: ['Reviewer', 'Email', 'Reviews submitted', 'Reviews compared', 'Average score (compared)', 'Others on the same submissions', 'Difference', 'Flag'],
    rows: [
      ...rows.map(c => [name(c), c.member?.email ?? '', c.reviews, c.compared, c.avgScoreCompared, c.othersAvg, c.delta, Math.abs(c.delta) >= OUTLIER && c.compared >= MIN_COMPARED ? (c.delta < 0 ? 'Harsher' : 'More generous') : '']),
      [],
      ['Reviews assigned in range', '', r.assigned],
      ['Reviews submitted in range', '', r.submitted],
      ['Open now', '', r.openNow],
      ['Overdue now', '', r.overdueNow],
      ['Median turnaround (days)', '', r.medianTurnaroundDays],
      ['Submitted by due date (%)', '', onTime],
    ],
  };

  return (
    <Panel id="review-ops" scope={data} title="Review operations" description="Review workload in this range, and how each reviewer's scores compare with colleagues on the same applications." csv={r.assigned || r.submitted || rows.length ? csv : null} table={rows.length ? table : undefined}>
      {stats}

      <div className="mt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h3 className="text-xs font-medium text-muted-foreground">Reviewer calibration</h3>
          {rows.length > 0 && (
            <div className="flex items-center gap-3">
              <LegendKey color="var(--viz-neg)" label="Scores lower than others" />
              <LegendKey color="var(--viz-pos)" label="Scores higher" />
            </div>
          )}
        </div>
        {rows.length === 0 ? (
          <PanelEmpty className="h-[120px] rounded-md border border-dashed" title="No overlapping reviews in this range" description="Calibration needs at least two reviewers to have scored the same application." />
        ) : (
          <div role="list" aria-label="Reviewer calibration">
            <div className="hidden h-5 grid-cols-[minmax(0,11rem)_minmax(0,1fr)_5.5rem] items-center gap-3 text-2xs text-muted-foreground sm:grid" aria-hidden>
              <span />
              <div className="flex justify-between tabular-nums">
                <span>← Harsher · −{extent}</span>
                <span>0</span>
                <span>+{extent} · More generous →</span>
              </div>
              <span />
            </div>
            {rows.map(c => {
              const flagged = Math.abs(c.delta) >= OUTLIER && c.compared >= MIN_COMPARED;
              const w = Math.min(1, Math.abs(c.delta) / extent) * 50;
              const neg = c.delta < 0;
              const label = `${name(c)}: averages ${c.avgScoreCompared} against ${c.othersAvg} from other reviewers on the same ${c.compared === 1 ? 'application' : `${c.compared} applications`} — ${Math.abs(c.delta)} points ${neg ? 'lower' : 'higher'}${flagged ? ` (${neg ? 'harsher' : 'more generous'} than the panel)` : ''}${c.compared < MIN_COMPARED ? '. Too few to judge.' : ''}`;
              return (
                <Tip key={c.reviewerId} label={<span className="block max-w-[280px]">{label}</span>} side="top">
                  <div role="listitem" tabIndex={0} aria-label={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-md py-1 outline-none focus-visible:bg-accent/60 sm:h-9 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_5.5rem] sm:py-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <MemberAvatar member={c.member} size={18} />
                      <span className="truncate text-[12.5px]">{name(c)}</span>
                    </div>
                    <div className="relative order-last col-span-2 h-6 sm:order-none sm:col-span-1 sm:h-full">
                      {/* Neutral midpoint: a hairline at zero, with a faint ±10 band marking "within normal". */}
                      <div className="absolute inset-y-1.5 bg-muted/70" style={{ left: `${50 - (OUTLIER / extent) * 50}%`, right: `${50 - (OUTLIER / extent) * 50}%` }} aria-hidden />
                      <div className="absolute inset-y-0.5 left-1/2 w-px bg-foreground/25" aria-hidden />
                      <div
                        className={cn('absolute top-1/2 h-3.5 -translate-y-1/2 transition-[width] duration-500', neg ? 'rounded-l-[4px]' : 'rounded-r-[4px]')}
                        style={{ [neg ? 'right' : 'left']: '50%', width: `${w}%`, minWidth: c.delta ? 2 : 0, background: neg ? 'var(--viz-neg)' : 'var(--viz-pos)', opacity: c.compared < MIN_COMPARED ? 0.45 : 1 }}
                      />
                    </div>
                    <div className="flex items-center justify-end gap-1.5 text-right">
                      {flagged && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-tone-warning" aria-hidden />}
                      <span className={cn('text-[12.5px] font-medium tabular-nums', flagged && 'text-foreground')}>{c.delta > 0 ? '+' : c.delta < 0 ? '−' : ''}{Math.abs(c.delta)}</span>
                      <span className="w-6 text-2xs tabular-nums text-muted-foreground">×{c.compared}</span>
                    </div>
                  </div>
                </Tip>
              );
            })}
            <p className="mt-2 text-2xs text-muted-foreground">
              {outliers.length
                ? `${outliers.map(o => `${name(o)} (${o.delta < 0 ? 'harsher' : 'more generous'})`).join(', ')} ${outliers.length === 1 ? 'scores' : 'score'} ${OUTLIER}+ points from colleagues on the same applications. ×n is how many applications were compared; faded bars have fewer than ${MIN_COMPARED}.`
                : `Everyone scores within ${OUTLIER} points of colleagues on the same applications. ×n is how many applications were compared.`}
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
}
