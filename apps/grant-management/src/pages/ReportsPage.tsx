import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BarChart3, Download, RotateCw } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { getReports } from 'zitejs/api';
import { cn } from '@project/components/lib/utils';
import { ProgramSelect } from '../components/awards/controls';
import { csvFilename, downloadCsv } from '../components/awards/csv';
import { ApplicantReach, DeclineReasons } from '../components/reports/Breakdowns';
import { Funnel } from '../components/reports/Funnel';
import { KpiTiles, KpiTilesSkeleton } from '../components/reports/KpiTiles';
import { MoneyByMonth } from '../components/reports/MoneyByMonth';
import { OutcomesTable } from '../components/reports/OutcomesTable';
import { RANGES, RangeSelect, rangeDays, rangeText, useReportPrefs } from '../components/reports/ReportControls';
import { ReviewOps } from '../components/reports/ReviewOps';
import { PanelSkeleton, VIZ_STYLE, pct, type Reports } from '../components/reports/shared';
import { SubmissionsChart } from '../components/reports/SubmissionsChart';
import { EmptyState, IconButton, Tip } from '../components/primitives/bits';
import { PageHeader, useDocumentTitle } from '../components/shell/PageHeader';
import { useAppActions } from '../lib/app-actions';
import { qk } from '../lib/queries';
import { todayString } from '../lib/format';
import { useWorkspace } from '../lib/workspace';

function viewerTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

function useReports(input: { from?: string; to: string; programId?: string }) {
  return useQuery({
    queryKey: [...qk.reportsRoot, input],
    queryFn: () => getReports({ ...input, today: todayString(), timeZone: viewerTimeZone() }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/**
 * Program reporting for a foundation's staff and board: volume, conversion,
 * outcomes, review health, reach and money. Every panel answers to the one
 * range and program chosen above it, so the numbers always agree; the choice
 * is remembered for next time.
 */
export function ReportsPage() {
  useDocumentTitle('Reports');
  const ws = useWorkspace();
  const app = useAppActions();
  const [prefs, setPrefs] = useReportPrefs();
  // A remembered program that has since been deleted falls back to all programs.
  const program = prefs.programId ? ws.programById.get(prefs.programId) : undefined;
  const range = RANGES.find(r => r.id === prefs.range) ?? RANGES[1];
  const days = useMemo(() => rangeDays(range.id), [range.id]);

  useEffect(() => app.setContextProgram(program?.id ?? null), [program?.id]);

  const { data, isPending, isError, refetch, isFetching, isPlaceholderData } = useReports({ ...days, programId: program?.id });

  const exportKpis = (d: Reports) => {
    const k = d.kpis;
    downloadCsv(csvFilename('report-key-numbers', program?.key, range.id), ['Measure', 'This range', 'Previous period'], [
      ['Range', `${d.range.from} to ${d.range.to}`, d.range.prevFrom ? `${d.range.prevFrom} to ${d.range.prevTo}` : ''],
      ['Program', program?.name ?? 'All programs', ''],
      ['Applications submitted', k.submitted, k.submittedPrev],
      ['Applications started', k.started, ''],
      ['Started and submitted', k.startedSubmitted, ''],
      ['Draft to submitted conversion (%)', pct(k.startedSubmitted, k.started), ''],
      ['Decisions', k.decided, k.decidedPrev],
      ['Accepted', k.accepted, k.acceptedPrev],
      ['Acceptance rate (%)', pct(k.accepted, k.decided), k.decidedPrev ? pct(k.acceptedPrev ?? 0, k.decidedPrev) : ''],
      ['Total requested', k.requested, k.requestedPrev],
      ['Total awarded', k.awarded, k.awardedPrev],
      ['Median days to decision', k.medianDaysToDecision, k.medianDaysToDecisionPrev],
    ]);
  };

  const scope = data ? `${range.label} · ${rangeText(data.range.from, data.range.to)}` : range.label;

  return (
    <>
      <style>{VIZ_STYLE}</style>
      <PageHeader icon={<BarChart3 />} title="Reports" />
      <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5">
        <ProgramSelect programId={program?.id ?? null} onChange={id => setPrefs({ programId: id })} align="start" />
        <RangeSelect value={range.id} onChange={r => setPrefs({ range: r })} />
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">{data && !isPlaceholderData ? rangeText(data.range.from, data.range.to) : ''}</span>
        {isFetching && data && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/70" aria-label="Updating" />}
      </div>
      <div className="grants-viz min-h-0 flex-1 overflow-y-auto">
        {isError && !data ? (
          <EmptyState
            icon={<BarChart3 />}
            title="Reports couldn't load"
            description="The report didn't come back. It's usually temporary."
            action={
              <button type="button" onClick={() => refetch()} className="flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-[13px] shadow-2xs hover:bg-accent">
                <RotateCw className="h-3.5 w-3.5" /> Try again
              </button>
            }
          />
        ) : (
          <div className="mx-auto max-w-[1240px] space-y-4 px-3 py-4 sm:px-6 sm:py-5">
            <div className="flex items-start justify-between gap-2 px-0.5">
              <div className="min-w-0">
                <h2 className="text-[13px] font-medium">{program?.name ?? 'All programs'}</h2>
                <p className="text-xs text-muted-foreground">{scope}{data && !data.range.allTime ? ` · compared with the ${data.range.days} days before` : ''}</p>
              </div>
              {data && (
                <Tip label="Export the key numbers as CSV">
                  <IconButton aria-label="Export key numbers as CSV" onClick={() => exportKpis(data)}>
                    <Download />
                  </IconButton>
                </Tip>
              )}
            </div>

            {isPending || !data ? (
              <ReportSkeleton />
            ) : (
              // While another range or program loads, the previous report stays in place, dimmed — no layout jump.
              <div className={cn('space-y-4 transition-opacity duration-200 animate-fade-in', isPlaceholderData && isFetching && 'opacity-60')}>
                <KpiTiles data={data} />
                {isQuiet(data) ? (
                  <div className="rounded-lg border bg-background">
                    <EmptyState
                      icon={<BarChart3 />}
                      title={`Nothing happened${program ? ` in ${program.name}` : ''} ${range.id === 'all' ? 'yet' : `in the ${range.label.toLowerCase()}`}`}
                      description="No applications were started or submitted, nothing was reviewed or decided, and no payments went out. Reports fill in as the program runs."
                      action={
                        <div className="flex items-center gap-4">
                          {range.id !== 'all' && <button type="button" onClick={() => setPrefs({ range: 'all' })} className="text-[13px] font-medium text-primary hover:underline">Show all time</button>}
                          {program && <button type="button" onClick={() => setPrefs({ programId: null })} className="text-[13px] text-muted-foreground hover:text-foreground">All programs</button>}
                        </div>
                      }
                    />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                      <SubmissionsChart data={data} className="xl:col-span-2" />
                      <Funnel data={data} />
                    </div>
                    <OutcomesTable data={data} />
                    <ReviewOps data={data} />
                    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                      <DeclineReasons data={data} />
                      <ApplicantReach data={data} />
                    </div>
                    <MoneyByMonth data={data} />
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/** A range where nothing at all happened reads better as one message than eight empty panels. */
function isQuiet(d: Reports) {
  const k = d.kpis;
  return (
    k.submitted + k.started + k.decided === 0 &&
    d.reviewOps.assigned + d.reviewOps.submitted === 0 &&
    d.monthly.every(m => m.paid === 0 && m.awarded === 0) &&
    d.outcomes.every(o => o.withdrawn === 0)
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <KpiTilesSkeleton />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <PanelSkeleton title="Submissions over time" description="Applications submitted each week." className="xl:col-span-2" height={236} />
        <PanelSkeleton title="Funnel" description="Applications started in this range, and how far they got." height={236} />
      </div>
      <PanelSkeleton title="Outcomes by program" description="Applications received and decisions made in this range." height={180} />
      <PanelSkeleton title="Review operations" description="Review workload, and how reviewers' scores compare." height={220} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PanelSkeleton title="Decline reasons" height={180} />
        <PanelSkeleton title="Applicant reach" height={180} />
      </div>
      <PanelSkeleton title="Awards & payments by month" height={220} />
    </div>
  );
}
