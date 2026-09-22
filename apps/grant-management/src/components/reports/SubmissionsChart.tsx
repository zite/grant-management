import { format } from 'date-fns';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { parseDay } from '../../lib/format';
import { useWorkspace } from '../../lib/workspace';
import { AXIS_TICK, DataTable, GRID_STROKE, LegendKey, Panel, PanelEmpty, TooltipRow, TooltipShell, fmt, slot, type Reports } from './shared';

const GAP = 2;
const RADIUS = 4;

type Series = { key: string; name: string; color: string };
type Row = { week: string; total: number; top: string | null; [series: string]: number | string | null };

function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}L${x},${y + rr}Q${x},${y} ${x + rr},${y}L${x + w - rr},${y}Q${x + w},${y} ${x + w},${y + rr}L${x + w},${y + h}Z`;
}

/** A stacked segment: the top one gets the rounded data end, the ones below give up 2px of surface gap. */
function Segment(props: any) {
  const { x, y, width, height, payload, fill, seriesKey } = props as { x: number; y: number; width: number; height: number; payload: Row; fill: string; seriesKey: string };
  if (!height || height <= 0) return <g />;
  const isTop = payload.top === seriesKey;
  const h = isTop ? height : Math.max(0.5, height - GAP);
  return <path d={topRounded(x, y + (height - h), width, h, isTop ? RADIUS : 0)} fill={fill} />;
}

function WeekTooltip({ active, payload, series }: { active?: boolean; payload?: Array<{ payload: Row }>; series: Series[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const present = series.filter(s => Number(row[s.key]) > 0);
  return (
    <TooltipShell title={`Week of ${format(parseDay(row.week), 'MMM d, yyyy')}`}>
      <TooltipRow label="Submitted" value={fmt(row.total)} strong />
      {series.length > 1 && present.map(s => <TooltipRow key={s.key} color={s.color} label={s.name} value={fmt(Number(row[s.key]))} />)}
    </TooltipShell>
  );
}

/** Applications submitted each week, stacked by program when every program is in view. */
export function SubmissionsChart({ data, className }: { data: Reports; className?: string }) {
  const ws = useWorkspace();
  const multi = !data.programId;

  const { rows, series } = useMemo(() => {
    // Colour follows the program's place in the workspace, never its rank in this range, so a filter never repaints it.
    const index = new Map(ws.programs.map((p, i) => [p.id, i]));
    const present = new Set<string>();
    for (const w of data.weekly) for (const id of Object.keys(w.byProgram)) present.add(id);
    const list: Series[] = multi
      ? [...present]
          .sort((a, b) => (index.get(a) ?? 99) - (index.get(b) ?? 99))
          .map(id => ({ key: id, name: ws.programById.get(id)?.name ?? 'Other', color: slot(index.get(id) ?? 99) }))
      : [{ key: 'total', name: 'Submitted', color: slot(0) }];
    const out: Row[] = data.weekly.map(w => {
      const row: Row = { week: w.week, total: w.total, top: null };
      if (multi) {
        for (const s of list) row[s.key] = w.byProgram[s.key] ?? 0;
        row.top = [...list].reverse().find(s => Number(row[s.key]) > 0)?.key ?? null;
      } else {
        row.top = 'total';
      }
      return row;
    });
    return { rows: out, series: list };
  }, [data.weekly, multi, ws.programs, ws.programById]);

  const total = rows.reduce((s, r) => s + r.total, 0);
  const peak = rows.reduce<Row | null>((best, r) => (!best || r.total > best.total ? r : best), null);
  const perWeek = rows.length ? total / rows.length : 0;

  const csv = {
    name: 'submissions-by-week',
    headers: ['Week starting', 'Total', ...(multi ? series.map(s => s.name) : [])],
    rows: rows.map(r => [r.week, r.total, ...(multi ? series.map(s => Number(r[s.key]) || 0) : [])]),
  };
  const table = (
    <DataTable
      caption="Applications submitted by week"
      headers={['Week of', ...(multi ? series.map(s => s.name) : []), 'Total']}
      align={['left', ...(multi ? series.map(() => 'right' as const) : []), 'right']}
      rows={rows.filter(r => r.total > 0).map(r => [format(parseDay(r.week), 'MMM d, yyyy'), ...(multi ? series.map(s => fmt(Number(r[s.key]) || 0)) : []), fmt(r.total)])}
      footer={['Total', ...(multi ? series.map(s => fmt(rows.reduce((n, r) => n + (Number(r[s.key]) || 0), 0))) : []), fmt(total)]}
    />
  );

  return (
    <Panel
      id="volume"
      scope={data}
      title="Submissions over time"
      description={multi ? 'Applications submitted each week, by program.' : 'Applications submitted each week.'}
      className={className}
      csv={total ? csv : null}
      table={total ? table : undefined}
      actions={
        total > 0 && (
          <span className="text-xs text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">{fmt(total)}</span> total · {perWeek >= 10 ? Math.round(perWeek) : Math.round(perWeek * 10) / 10}/week
          </span>
        )
      }
    >
      {total === 0 ? (
        <PanelEmpty className="h-[236px]" title="No applications submitted in this range" description="Try a longer range, or all programs." />
      ) : (
        <>
          {series.length > 1 && (
            <div className="mb-2 flex flex-wrap items-center gap-x-3.5 gap-y-1">
              {series.map(s => (
                <LegendKey key={s.key} color={s.color} label={s.name} />
              ))}
            </div>
          )}
          <div className="-mx-1 overflow-x-auto scrollbar-none">
            <div style={{ minWidth: Math.max(300, rows.length * 16) }}>
              <div
                // Clicking shouldn't move keyboard focus into the chart: recharts' keyboard layer would jump the tooltip to the first week.
                onMouseDown={e => e.preventDefault()}
                role="figure"
                aria-label={`Bar chart of applications submitted per week: ${fmt(total)} in total${peak ? `, peaking at ${fmt(peak.total)} in the week of ${format(parseDay(peak.week), 'MMMM d')}` : ''}. Use the table view for every value.`}
              >
                <ResponsiveContainer width="100%" height={236}>
                  <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barCategoryGap="22%" accessibilityLayer>
                    <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                    <XAxis dataKey="week" tickLine={false} axisLine={{ stroke: 'hsl(var(--border))' }} tick={AXIS_TICK} tickMargin={8} minTickGap={24} interval="preserveStartEnd" tickFormatter={(w: string) => format(parseDay(w), 'MMM d')} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={AXIS_TICK} width={40} tickCount={5} />
                    <Tooltip cursor={{ fill: 'hsl(var(--accent))', opacity: 0.7 }} content={<WeekTooltip series={series} />} isAnimationActive={false} />
                    {series.map(s => (
                      <Bar key={s.key} dataKey={s.key} name={s.name} stackId="weeks" fill={s.color} maxBarSize={24} shape={(p: unknown) => <Segment {...(p as object)} seriesKey={s.key} />} isAnimationActive={false} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}
