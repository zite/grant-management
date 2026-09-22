import { addDays, differenceInCalendarDays, format, startOfWeek } from 'date-fns';
import { useId, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '@project/components/lib/utils';
import { parseDay, toDayString } from '../../lib/format';
import type { ProgramStats } from './programData';

type Point = { key: string; t: number; label: string; submitted: number | null; total: number | null; future: boolean };

const tick = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };

/**
 * Daily points (weekly past four months), padded forward to a future deadline
 * so the runway left is visible. `baseline` carries submissions older than the
 * one-year window into the running total.
 */
function buildPoints(series: ProgramStats['series'], baseline: number, deadline: string | null) {
  if (!series.length) return { points: [] as Point[], weekly: false, deadlineKey: null as string | null };
  const first = parseDay(series[0].day);
  const last = parseDay(series[series.length - 1].day);
  const deadlineDay = deadline ? toDayString(new Date(deadline)) : null;
  const deadlineDate = deadlineDay ? parseDay(deadlineDay) : null;
  // Show a future deadline only when it's close enough not to squash the history.
  const span = differenceInCalendarDays(last, first) + 1;
  const ahead = deadlineDate ? differenceInCalendarDays(deadlineDate, last) : 0;
  const padTo = deadlineDate && ahead > 0 && ahead <= Math.max(21, span) ? deadlineDate : last;
  const totalDays = differenceInCalendarDays(padTo, first) + 1;
  const weekly = totalDays > 120;

  const byDay = new Map(series.map(s => [s.day, s.submitted]));
  const days: Array<{ day: string; date: Date; submitted: number | null; future: boolean }> = [];
  for (let d = first; d <= padTo; d = addDays(d, 1)) {
    const key = toDayString(d);
    const future = d > last;
    days.push({ day: key, date: d, submitted: future ? null : byDay.get(key) ?? 0, future });
  }

  let running = baseline;
  if (!weekly) {
    const points = days.map(d => {
      if (!d.future) running += d.submitted ?? 0;
      return { key: d.day, t: d.date.getTime(), label: format(d.date, 'EEE, MMM d'), submitted: d.submitted, total: d.future ? null : running, future: d.future };
    });
    const deadlineKey = deadlineDay && points.some(p => p.key === deadlineDay) ? deadlineDay : null;
    return { points, weekly, deadlineKey };
  }

  const weeks = new Map<string, { date: Date; submitted: number; future: boolean }>();
  for (const d of days) {
    const wk = toDayString(startOfWeek(d.date, { weekStartsOn: 1 }));
    if (!weeks.has(wk)) weeks.set(wk, { date: startOfWeek(d.date, { weekStartsOn: 1 }), submitted: 0, future: true });
    const w = weeks.get(wk)!;
    if (!d.future) {
      w.submitted += d.submitted ?? 0;
      w.future = false;
    }
  }
  const points = [...weeks.entries()].map(([key, w]) => {
    if (!w.future) running += w.submitted;
    return { key, t: w.date.getTime(), label: `Week of ${format(w.date, 'MMM d, yyyy')}`, submitted: w.future ? null : w.submitted, total: w.future ? null : running, future: w.future };
  });
  const deadlineKey = deadlineDate ? toDayString(startOfWeek(deadlineDate, { weekStartsOn: 1 })) : null;
  return { points, weekly, deadlineKey: deadlineKey && weeks.has(deadlineKey) ? deadlineKey : null };
}

function ChartTooltip({ active, payload, weekly }: { active?: boolean; payload?: Array<{ payload: Point }>; weekly: boolean }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (p.future) {
    return <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-muted-foreground shadow-md">{p.label} · still to come</div>;
  }
  return (
    <div className="min-w-[160px] rounded-md border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1.5 text-muted-foreground">{p.label}</div>
      <div className="flex items-center gap-2 py-px">
        <span className="h-0.5 w-3 rounded-full bg-primary" aria-hidden />
        <span className="font-semibold tabular-nums">{p.total}</span>
        <span className="text-muted-foreground">submitted so far</span>
      </div>
      <div className="flex items-center gap-2 py-px">
        <span className="h-2 w-2 rounded-[2px] bg-primary/60" aria-hidden />
        <span className="font-semibold tabular-nums">{p.submitted}</span>
        <span className="text-muted-foreground">{weekly ? 'that week' : 'that day'}</span>
      </div>
    </div>
  );
}

/**
 * Two charts on one time axis rather than one chart with two scales: the
 * running total on top, the daily count underneath, hovering either shows both.
 */
export function SubmissionsChart({ series, baseline, deadline }: { series: ProgramStats['series']; baseline: number; deadline: string | null }) {
  const gid = useId().replace(/:/g, '');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const { points, weekly, deadlineKey } = useMemo(() => buildPoints(series, baseline, deadline), [series, baseline, deadline]);
  const past = points.filter(p => !p.future);
  const interval = Math.max(0, Math.ceil(points.length / 7) - 1);
  const syncId = `subs-${gid}`;
  const deadlineLabel = deadlineKey ? { value: 'Deadline', position: 'insideTopRight' as const, fontSize: 11, fill: 'hsl(var(--muted-foreground))' } : undefined;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 px-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded-full bg-primary" aria-hidden /> Total submitted</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-primary/60" aria-hidden /> {weekly ? 'Per week' : 'Per day'}</span>
        </div>
        <div className="flex h-6 items-center rounded-md border bg-background p-0.5" role="radiogroup" aria-label="Show as">
          {(['chart', 'table'] as const).map(v => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={cn('h-full rounded-[4px] px-2 text-2xs capitalize transition-colors', view === v ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === 'table' ? (
        <div className="max-h-[252px] overflow-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-subtle text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">{weekly ? 'Week' : 'Day'}</th>
                <th className="px-3 py-1.5 text-right font-medium">Submitted</th>
                <th className="px-3 py-1.5 text-right font-medium">Running total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...past].reverse().map(p => (
                <tr key={p.key}>
                  <td className="px-3 py-1.5">{p.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{p.submitted}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{p.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div role="img" aria-label={`${past[past.length - 1]?.total ?? 0} submissions so far`}>
          <div className="h-[184px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} syncId={syncId} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="key" hide />
                <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={34} />
                <Tooltip content={<ChartTooltip weekly={weekly} />} cursor={{ stroke: 'hsl(var(--muted-foreground) / 0.5)', strokeWidth: 1 }} />
                <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} fill={`url(#${gid}-fill)`} isAnimationActive={false} connectNulls={false} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--background))' }} />
                {deadlineKey && <ReferenceLine x={deadlineKey} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 3" label={deadlineLabel} />}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 h-[92px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} syncId={syncId} margin={{ top: 6, right: 12, bottom: 0, left: 0 }} barCategoryGap="18%">
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="key"
                  tick={tick}
                  tickLine={false}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  interval={interval}
                  tickFormatter={k => format(parseDay(String(k)), 'MMM d')}
                  minTickGap={16}
                />
                <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={34} ticks={[0, Math.max(1, ...past.map(p => p.submitted ?? 0))]} domain={[0, 'dataMax']} />
                <Tooltip content={() => null} cursor={{ fill: 'hsl(var(--muted-foreground) / 0.08)' }} />
                <Bar dataKey="submitted" fill="hsl(var(--primary) / 0.6)" radius={[2, 2, 0, 0]} maxBarSize={24} isAnimationActive={false} />
                {deadlineKey && <ReferenceLine x={deadlineKey} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 3" />}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
