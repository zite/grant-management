import { format } from 'date-fns';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { parseDay } from '../../lib/format';
import { useWorkspace } from '../../lib/workspace';
import { AXIS_TICK, DataTable, GRID_STROKE, LegendKey, Panel, PanelEmpty, TooltipRow, TooltipShell, fmt, slot, type Reports } from './shared';

const AWARDED = slot(0);
const PAID = slot(1);

type Row = Reports['monthly'][number];

/** Axis ticks as round compact money: $0, $4K, $8K — never a mix of $8,000 and $12K. */
const axisMoney = (currency: string) => (n: number) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(n);
  } catch {
    return `$${Math.round(n / 1000)}K`;
  }
};

function MonthTooltip({ active, payload, money }: { active?: boolean; payload?: Array<{ payload: Row }>; money: (n: number) => string }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <TooltipShell title={format(parseDay(row.month), 'MMMM yyyy')}>
      <TooltipRow color={AWARDED} label={`Awarded · ${fmt(row.awardCount)}`} value={money(row.awarded)} strong />
      <TooltipRow color={PAID} label={`Paid · ${fmt(row.paymentCount)}`} value={money(row.paid)} strong />
    </TooltipShell>
  );
}

/** Money committed (by the month an award was decided) beside money that went out (by the month it was paid). One axis — both are money. */
export function MoneyByMonth({ data }: { data: Reports }) {
  const ws = useWorkspace();
  const rows = data.monthly;
  const awarded = rows.reduce((s, r) => s + r.awarded, 0);
  const paid = rows.reduce((s, r) => s + r.paid, 0);
  const empty = awarded === 0 && paid === 0;
  const money = (n: number) => ws.money(n);

  const table = (
    <DataTable
      caption="Awards and payments by month"
      headers={['Month', 'Awards', 'Awarded', 'Payments', 'Paid']}
      align={['left', 'right', 'right', 'right', 'right']}
      rows={rows.map(r => [format(parseDay(r.month), 'MMM yyyy'), fmt(r.awardCount), money(r.awarded), fmt(r.paymentCount), money(r.paid)])}
      footer={['Total', fmt(rows.reduce((s, r) => s + r.awardCount, 0)), money(awarded), fmt(rows.reduce((s, r) => s + r.paymentCount, 0)), money(paid)]}
    />
  );

  return (
    <Panel
      id="money"
      scope={data}
      title="Awards & payments by month"
      description="Awarded, by the month the decision was made, beside paid, by the month the money went out."
      csv={empty ? null : { name: 'awards-and-payments-by-month', headers: ['Month', 'Awards', 'Awarded', 'Payments', 'Paid'], rows: rows.map(r => [r.month.slice(0, 7), r.awardCount, r.awarded, r.paymentCount, r.paid]) }}
      table={empty ? undefined : table}
      actions={
        !empty && (
          <span className="flex items-center gap-3">
            <LegendKey color={AWARDED} label={<>Awarded <span className="font-medium tabular-nums text-foreground">{ws.money(awarded, { compact: true })}</span></>} />
            <LegendKey color={PAID} label={<>Paid <span className="font-medium tabular-nums text-foreground">{ws.money(paid, { compact: true })}</span></>} />
          </span>
        )
      }
    >
      {empty ? (
        <PanelEmpty className="h-[220px]" title="No awards or payments in this range" description="Accepted applications and recorded payments show up here by month." />
      ) : (
        <div className="-mx-1 overflow-x-auto scrollbar-none">
          <div style={{ minWidth: Math.max(300, rows.length * 56) }} onMouseDown={e => e.preventDefault()} role="figure" aria-label={`Grouped bar chart by month: ${ws.money(awarded)} awarded and ${ws.money(paid)} paid across ${rows.length} month${rows.length === 1 ? '' : 's'}. Use the table view for every value.`}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap="26%" barGap={2} barSize={18} accessibilityLayer>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: 'hsl(var(--border))' }} tick={AXIS_TICK} tickMargin={8} interval="preserveStartEnd" minTickGap={16} tickFormatter={(m: string) => format(parseDay(m), rows.length > 12 ? 'MMM yy' : 'MMM')} />
                <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} width={52} tickCount={5} tickFormatter={axisMoney(ws.settings.currency)} />
                <Tooltip cursor={{ fill: 'hsl(var(--accent))', opacity: 0.7 }} content={<MonthTooltip money={money} />} isAnimationActive={false} />
                <Bar dataKey="awarded" name="Awarded" fill={AWARDED} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="paid" name="Paid" fill={PAID} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Panel>
  );
}
