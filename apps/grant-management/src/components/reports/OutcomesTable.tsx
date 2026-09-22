import { useNavigate } from 'react-router-dom';
import { cn } from '@project/components/lib/utils';
import { useWorkspace } from '../../lib/workspace';
import { OutcomeGlyph } from '../primitives/icons';
import { Glyph, ProgressBar, Tip } from '../primitives/bits';
import { Panel, PanelEmpty, fmt, pct, type Reports } from './shared';

/**
 * One row per program: what came in, what was decided, what it cost. Every
 * count is by the event in the range; budget used is all awards to date
 * against the program's budget, because a budget is spent across a cycle,
 * not a date range.
 */
export function OutcomesTable({ data }: { data: Reports }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const rows = data.outcomes
    .map(o => ({ ...o, program: ws.programById.get(o.programId) }))
    .filter(o => o.program && (data.programId || o.submitted + o.accepted + o.waitlisted + o.declined + o.withdrawn > 0 || o.awardedToDate > 0));
  const totals = rows.reduce(
    (t, r) => ({
      submitted: t.submitted + r.submitted,
      accepted: t.accepted + r.accepted,
      waitlisted: t.waitlisted + r.waitlisted,
      declined: t.declined + r.declined,
      withdrawn: t.withdrawn + r.withdrawn,
      requested: t.requested + r.requested,
      awarded: t.awarded + r.awarded,
      awardedToDate: t.awardedToDate + r.awardedToDate,
      budget: t.budget + (r.budget ?? 0),
    }),
    { submitted: 0, accepted: 0, waitlisted: 0, declined: 0, withdrawn: 0, requested: 0, awarded: 0, awardedToDate: 0, budget: 0 },
  );
  const anyActivity = rows.some(r => r.submitted + r.accepted + r.waitlisted + r.declined + r.withdrawn > 0);

  const csv = {
    name: 'outcomes-by-program',
    headers: ['Program', 'Key', 'Submitted', 'Accepted', 'Waitlisted', 'Declined', 'Withdrawn', 'Acceptance rate (%)', 'Requested', 'Awarded', 'Awarded to date', 'Budget', 'Budget used (%)'],
    rows: rows.map(r => [
      r.program!.name, r.program!.key, r.submitted, r.accepted, r.waitlisted, r.declined, r.withdrawn,
      pct(r.accepted, r.accepted + r.waitlisted + r.declined), r.requested, r.awarded, r.awardedToDate, r.budget, r.budget ? pct(r.awardedToDate, r.budget) : null,
    ]),
  };

  const th = 'h-8 whitespace-nowrap border-b px-3 text-xs font-medium text-muted-foreground';
  const td = 'h-10 whitespace-nowrap border-b px-3 tabular-nums';

  return (
    <Panel id="outcomes" scope={data} title="Outcomes by program" description="Applications received and decisions made in this range, with each program's budget used to date." csv={anyActivity || rows.some(r => r.awardedToDate) ? csv : null} bodyClassName="px-0 pb-1">
      {!anyActivity && rows.every(r => !r.awardedToDate) ? (
        <PanelEmpty className="h-[160px]" title="Nothing submitted or decided in this range" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-separate border-spacing-0 text-[13px]">
            <caption className="sr-only">Outcomes by program</caption>
            <thead>
              <tr className="text-left">
                <th scope="col" className={cn(th, 'pl-4')}>Program</th>
                <th scope="col" className={cn(th, 'text-right')}>Submitted</th>
                <th scope="col" className={cn(th, 'text-right')}><span className="inline-flex items-center gap-1.5"><OutcomeGlyph status="Accepted" size={11} />Accepted</span></th>
                <th scope="col" className={cn(th, 'text-right')}><span className="inline-flex items-center gap-1.5"><OutcomeGlyph status="Waitlisted" size={11} />Waitlisted</span></th>
                <th scope="col" className={cn(th, 'text-right')}><span className="inline-flex items-center gap-1.5"><OutcomeGlyph status="Declined" size={11} />Declined</span></th>
                <th scope="col" className={cn(th, 'text-right')}>Withdrawn</th>
                <th scope="col" className={cn(th, 'text-right')}>Acceptance</th>
                <th scope="col" className={cn(th, 'text-right')}>Requested</th>
                <th scope="col" className={cn(th, 'text-right')}>Awarded</th>
                <th scope="col" className={cn(th, 'w-[190px] pr-4')}>Budget used to date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const decided = r.accepted + r.waitlisted + r.declined;
                const rate = pct(r.accepted, decided);
                const used = r.budget ? r.awardedToDate / r.budget : null;
                const zero = (n: number) => (n ? fmt(n) : <span className="text-muted-foreground/60">0</span>);
                return (
                  <tr key={r.programId} className="group hover:bg-accent/40">
                    <td className={cn(td, 'max-w-[240px] pl-4')}>
                      <button type="button" onClick={() => navigate(`/programs/${r.programId}`)} className="flex min-w-0 items-center gap-2 rounded text-left hover:underline" title={`Open ${r.program!.name}`}>
                        <Glyph icon={r.program!.icon} color={r.program!.color} size={18} className="text-[11px]" />
                        <span className="truncate">{r.program!.name}</span>
                      </button>
                    </td>
                    <td className={cn(td, 'text-right')}>
                      {zero(r.submitted)}
                      {r.inReview > 0 && <span className="ml-1 text-2xs text-muted-foreground">({fmt(r.inReview)} in review)</span>}
                    </td>
                    <td className={cn(td, 'text-right')}>{zero(r.accepted)}</td>
                    <td className={cn(td, 'text-right')}>{zero(r.waitlisted)}</td>
                    <td className={cn(td, 'text-right')}>{zero(r.declined)}</td>
                    <td className={cn(td, 'text-right')}>{zero(r.withdrawn)}</td>
                    <td className={cn(td, 'text-right')}>
                      {rate == null ? <span className="text-muted-foreground/60">—</span> : <Tip label={`${fmt(r.accepted)} of ${fmt(decided)} decisions accepted`}><span>{rate}%</span></Tip>}
                    </td>
                    <td className={cn(td, 'text-right')}>{r.requested ? ws.money(r.requested) : <span className="text-muted-foreground/60">—</span>}</td>
                    <td className={cn(td, 'text-right font-medium')}>{r.awarded ? ws.money(r.awarded) : <span className="font-normal text-muted-foreground/60">—</span>}</td>
                    <td className={cn(td, 'pr-4')}>
                      {used == null ? (
                        <span className="text-xs text-muted-foreground/70">No budget set</span>
                      ) : (
                        <Tip label={`${ws.money(r.awardedToDate)} awarded of a ${ws.money(r.budget)} budget`}>
                          <div className="flex items-center gap-2">
                            <ProgressBar value={used} tone={used > 1 ? 'danger' : used >= 0.9 ? 'warning' : 'primary'} className="flex-1" />
                            <span className={cn('w-10 text-right text-xs', used > 1 ? 'font-medium text-tone-danger' : 'text-muted-foreground')}>{Math.round(used * 100)}%</span>
                          </div>
                        </Tip>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 1 && (
              <tfoot>
                <tr className="text-xs font-medium">
                  <td className="h-9 px-3 pl-4 text-muted-foreground">All programs</td>
                  <td className="h-9 px-3 text-right tabular-nums">{fmt(totals.submitted)}</td>
                  <td className="h-9 px-3 text-right tabular-nums">{fmt(totals.accepted)}</td>
                  <td className="h-9 px-3 text-right tabular-nums">{fmt(totals.waitlisted)}</td>
                  <td className="h-9 px-3 text-right tabular-nums">{fmt(totals.declined)}</td>
                  <td className="h-9 px-3 text-right tabular-nums">{fmt(totals.withdrawn)}</td>
                  <td className="h-9 px-3 text-right tabular-nums">{pct(totals.accepted, totals.accepted + totals.waitlisted + totals.declined) ?? '—'}{pct(totals.accepted, totals.accepted + totals.waitlisted + totals.declined) != null && '%'}</td>
                  <td className="h-9 px-3 text-right tabular-nums">{ws.money(totals.requested)}</td>
                  <td className="h-9 px-3 text-right tabular-nums">{ws.money(totals.awarded)}</td>
                  <td className="h-9 px-3 pr-4 text-muted-foreground">{totals.budget ? `${Math.round((totals.awardedToDate / totals.budget) * 100)}% of ${ws.money(totals.budget, { compact: true })}` : ''}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </Panel>
  );
}
