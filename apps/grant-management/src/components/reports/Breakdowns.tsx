import { cn } from '@project/components/lib/utils';
import { Tip } from '../primitives/bits';
import { DataTable, HBar, LegendKey, Panel, PanelEmpty, fmt, pct, slot, type Reports } from './shared';

const NOT_RECORDED = 'Not recorded';
const TOP_LOCATIONS = 8;

/** Why applications were declined, largest first; a missing reason is its own bar so gaps in record-keeping show. */
export function DeclineReasons({ data, className }: { data: Reports; className?: string }) {
  const rows = data.declineReasons;
  const total = rows.reduce((s, r) => s + r.count, 0);
  const max = Math.max(1, ...rows.map(r => r.count));
  const table = <DataTable caption="Decline reasons" headers={['Reason', 'Declined', 'Share']} align={['left', 'right', 'right']} rows={rows.map(r => [r.reason, fmt(r.count), `${pct(r.count, total)}%`])} footer={['Total', fmt(total), '100%']} />;
  return (
    <Panel
      id="declines"
      scope={data}
      title="Decline reasons"
      description="Why applications declined in this range were turned down."
      className={className}
      csv={total ? { name: 'decline-reasons', headers: ['Reason', 'Declined', 'Share (%)'], rows: rows.map(r => [r.reason, r.count, pct(r.count, total)]) } : null}
      table={total ? table : undefined}
      actions={total > 0 && <span className="text-xs text-muted-foreground"><span className="font-medium tabular-nums text-foreground">{fmt(total)}</span> declined</span>}
    >
      {!total ? (
        <PanelEmpty className="h-[180px]" title="No applications declined in this range" />
      ) : (
        <div className="space-y-1" role="list" aria-label="Decline reasons">
          {rows.map(r => {
            const missing = r.reason === NOT_RECORDED;
            return (
              <Tip key={r.reason} label={`${r.reason}: ${fmt(r.count)} of ${fmt(total)} declined (${pct(r.count, total)}%)`} side="top">
                <div role="listitem" tabIndex={0} className="grid h-8 grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-center gap-3 rounded outline-none focus-visible:bg-accent/60 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
                  <span className={cn('truncate text-[12.5px]', missing && 'italic text-muted-foreground')}>{r.reason}</span>
                  <HBar value={r.count} max={max} color={missing ? 'var(--viz-other)' : slot(0)} label={`${fmt(r.count)} · ${pct(r.count, total)}%`} className="[&>span]:w-16" />
                </div>
              </Tip>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/** Who applied: first-timers against people who've applied before, and where they're from. */
export function ApplicantReach({ data, className }: { data: Reports; className?: string }) {
  const { applicants, returning, locations } = data.reach;
  const fresh = data.reach.new;
  const top = locations.slice(0, TOP_LOCATIONS);
  const rest = locations.slice(TOP_LOCATIONS).reduce((s, l) => s + l.count, 0);
  const shown = rest ? [...top, { location: 'Everywhere else', count: rest }] : top;
  const max = Math.max(1, ...shown.map(l => l.count));
  const newPct = pct(fresh, applicants) ?? 0;

  const table = (
    <div className="space-y-4">
      <DataTable caption="New and returning applicants" headers={['Applicants', 'Count', 'Share']} align={['left', 'right', 'right']} rows={[['New', fmt(fresh), `${pct(fresh, applicants) ?? 0}%`], ['Returning', fmt(returning), `${pct(returning, applicants) ?? 0}%`]]} footer={['Total', fmt(applicants), '100%']} />
      <DataTable caption="Applicants by location" headers={['Location', 'Applicants']} align={['left', 'right']} rows={locations.map(l => [l.location, fmt(l.count)])} />
    </div>
  );

  return (
    <Panel
      id="reach"
      scope={data}
      title="Applicant reach"
      description="People who submitted in this range: new or returning, and where they're based."
      className={className}
      csv={applicants ? { name: 'applicant-reach', headers: ['Group', 'Label', 'Applicants'], rows: [['Applicants', 'New', fresh], ['Applicants', 'Returning', returning], ...locations.map(l => ['Location', l.location, l.count])] } : null}
      table={applicants ? table : undefined}
      actions={applicants > 0 && <span className="text-xs text-muted-foreground"><span className="font-medium tabular-nums text-foreground">{fmt(applicants)}</span> {applicants === 1 ? 'applicant' : 'applicants'}</span>}
    >
      {!applicants ? (
        <PanelEmpty className="h-[180px]" title="Nobody submitted in this range" />
      ) : (
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center gap-3">
              <LegendKey color={slot(0)} label={<><span className="font-medium tabular-nums text-foreground">{fmt(fresh)}</span> new</>} />
              <LegendKey color={slot(1)} label={<><span className="font-medium tabular-nums text-foreground">{fmt(returning)}</span> returning</>} />
            </div>
            <Tip label={`${fmt(fresh)} applied for the first time (${newPct}%) · ${fmt(returning)} had applied before (${100 - newPct}%)`}>
              <div className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded-[4px]" tabIndex={0} role="img" aria-label={`${newPct}% new applicants, ${100 - newPct}% returning`}>
                {fresh > 0 && <div className="h-full transition-[width] duration-500" style={{ width: `${newPct}%`, background: slot(0) }} />}
                {returning > 0 && <div className="h-full flex-1" style={{ background: slot(1) }} />}
              </div>
            </Tip>
            <p className="mt-1.5 text-2xs text-muted-foreground">Returning means they had submitted an application before this range.</p>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">Top locations</h3>
            <div role="list" aria-label="Applicants by location">
              {shown.map(l => (
                <div key={l.location} role="listitem" className="grid h-7 grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-3">
                  <span className={cn('truncate text-[12.5px]', (l.location === 'Not given' || l.location === 'Everywhere else') && 'text-muted-foreground')}>{l.location}</span>
                  <HBar value={l.count} max={max} color={l.location === 'Not given' || l.location === 'Everywhere else' ? 'var(--viz-other)' : slot(0)} label={fmt(l.count)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
