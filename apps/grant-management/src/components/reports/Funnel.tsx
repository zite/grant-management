import { ArrowDown, Info } from 'lucide-react';
import { Tip } from '../primitives/bits';
import { DataTable, Panel, PanelEmpty, fmt, pct, rank, type Reports } from './shared';

/**
 * Applications started in the range, followed to their outcome. Each step
 * is a subset of the one before, so the percentages are true conversions;
 * the few decided without a submitted review (screened out as ineligible,
 * say) are counted as submitted and named in a note rather than inflating
 * a later step.
 */
export function Funnel({ data, className }: { data: Reports; className?: string }) {
  const f = data.funnel;
  const steps = [
    { key: 'started', label: 'Started', value: f.started, hint: 'Began an application' },
    { key: 'submitted', label: 'Submitted', value: f.submitted, hint: 'Sent it in' },
    { key: 'reviewed', label: 'Reviewed', value: f.reviewed, hint: 'At least one review submitted' },
    { key: 'decided', label: 'Decided', value: f.decided, hint: 'Accepted, waitlisted or declined after review' },
    { key: 'accepted', label: 'Accepted', value: f.accepted, hint: 'Accepted after review' },
  ];
  const max = Math.max(1, f.started);
  const overall = pct(f.accepted, f.started);

  const table = (
    <DataTable
      caption="Application funnel"
      headers={['Step', 'Applications', 'Of previous step', 'Of started']}
      align={['left', 'right', 'right', 'right']}
      rows={steps.map((s, i) => [s.label, fmt(s.value), i === 0 ? '—' : `${pct(s.value, steps[i - 1].value) ?? 0}%`, `${pct(s.value, f.started) ?? 0}%`])}
    />
  );

  return (
    <Panel
      id="funnel"
      scope={data}
      title="Funnel"
      description="Applications started in this range, and how far they got."
      className={className}
      table={f.started ? table : undefined}
      csv={f.started ? { name: 'application-funnel', headers: ['Step', 'Applications', 'Conversion from previous step (%)', 'Share of started (%)'], rows: steps.map((s, i) => [s.label, s.value, i === 0 ? null : pct(s.value, steps[i - 1].value), pct(s.value, f.started)]) } : null}
    >
      {!f.started ? (
        <PanelEmpty className="h-[236px]" title="No applications started in this range" description="The funnel follows applications from the day they're started." />
      ) : (
        <div className="flex h-full flex-col" role="list" aria-label="Funnel steps">
          {steps.map((s, i) => {
            const conv = i > 0 ? pct(s.value, steps[i - 1].value) : null;
            return (
              <div key={s.key} role="listitem">
                {i > 0 && (
                  <div className="flex h-5 items-center gap-1 pl-[5.5rem] text-2xs tabular-nums text-muted-foreground" aria-label={`${conv ?? 0}% of ${steps[i - 1].label.toLowerCase()} were ${s.label.toLowerCase()}`}>
                    <ArrowDown className="h-3 w-3" aria-hidden />
                    {conv ?? 0}%
                  </div>
                )}
                <Tip label={`${s.hint}: ${fmt(s.value)} (${pct(s.value, f.started) ?? 0}% of started)`} side="top">
                  <div className="grid h-7 grid-cols-[5rem_minmax(0,1fr)_2.75rem] items-center gap-2" tabIndex={0}>
                    <span className="truncate text-[12.5px]">{s.label}</span>
                    <div className="relative h-5">
                      <div className="absolute inset-y-0 left-0 rounded-r-[4px] transition-[width] duration-500" style={{ width: `${(s.value / max) * 100}%`, minWidth: s.value > 0 ? 2 : 0, background: rank(i) }} />
                    </div>
                    <span className="text-right text-[12.5px] font-medium tabular-nums">{fmt(s.value)}</span>
                  </div>
                </Tip>
              </div>
            );
          })}
          <p className="mt-auto flex items-start gap-1.5 pt-3 text-2xs text-muted-foreground">
            <Info className="mt-px h-3 w-3 shrink-0" aria-hidden />
            <span>
              <span className="font-medium text-foreground">{overall ?? 0}%</span> of applications started were accepted.{' '}
              {f.decidedWithoutReview > 0 && `${fmt(f.decidedWithoutReview)} decided without a review (for example, screened out as ineligible) ${f.decidedWithoutReview === 1 ? 'is' : 'are'} counted up to Submitted. `}
              {f.withdrawn > 0 && `${fmt(f.withdrawn)} withdrawn.`}
            </span>
          </p>
        </div>
      )}
    </Panel>
  );
}
