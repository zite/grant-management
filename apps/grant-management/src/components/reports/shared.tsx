import { BarChart3, Download, Table2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { GetReportsOutputType } from 'zitejs/api';
import { cn } from '@project/components/lib/utils';
import { IconButton, Tip } from '../primitives/bits';
import { csvSlug, downloadCsv } from '../awards/csv';
import { useWorkspace } from '../../lib/workspace';

export type Reports = GetReportsOutputType;

/**
 * Chart colour, validated with the dataviz palette checks (CVD separation,
 * lightness band, contrast) against this app's own surfaces — white, and the
 * dark panel at #141416 — and re-stepped for dark rather than flipped.
 *
 *   --viz-1…8     categorical, fixed order (series identity; slot 1 is the brand purple)
 *   --viz-rank-1…5 ordinal ramp for ordered stages (light → dark on white, dark → light on the dark panel)
 *   --viz-pos/neg  diverging poles around a neutral midpoint
 *
 * The app's --chart-* tokens put two purples side by side and fail the CVD
 * check, so charts use these scoped tokens instead.
 */
export const VIZ_STYLE = `
.grants-viz {
  --viz-1: #6943d0; --viz-2: #eb6834; --viz-3: #1baf7a; --viz-4: #eda100;
  --viz-5: #e87ba4; --viz-6: #008300; --viz-7: #2a78d6; --viz-8: #e34948;
  --viz-rank-1: #b7a6ec; --viz-rank-2: #9278e0; --viz-rank-3: #6943d0; --viz-rank-4: #4f2fb0; --viz-rank-5: #3a2287;
  --viz-pos: #2a78d6; --viz-neg: #e34948;
  --viz-other: #a1a1aa;
}
html.dark .grants-viz {
  --viz-1: #9085e9; --viz-2: #d95926; --viz-3: #199e70; --viz-4: #c98500;
  --viz-5: #d55181; --viz-6: #008300; --viz-7: #3987e5; --viz-8: #e66767;
  --viz-rank-1: #5846b4; --viz-rank-2: #7461d0; --viz-rank-3: #8f7fe6; --viz-rank-4: #ab9ef2; --viz-rank-5: #c9c1f9;
  --viz-pos: #3987e5; --viz-neg: #e66767;
  --viz-other: #71717a;
}`;

export const SLOTS = 8;
export const slot = (i: number) => (i >= 0 && i < SLOTS ? `var(--viz-${i + 1})` : 'var(--viz-other)');
export const rank = (i: number) => `var(--viz-rank-${Math.max(1, Math.min(5, i + 1))})`;

/** Chart chrome from tokens, so both themes follow. */
export const AXIS_TICK = { fill: 'hsl(var(--muted-foreground))', fontSize: 11 };
export const GRID_STROKE = 'hsl(var(--border))';

export const fmt = (n: number) => n.toLocaleString();
export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);
export const days = (d: number | null) => (d == null ? '—' : d < 1 ? `${Math.max(1, Math.round(d * 24))}h` : d < 10 ? `${Math.round(d * 10) / 10}d` : `${Math.round(d)}d`);

/** A panel with a title, a one-line explanation, and — where it has data — CSV export and a table view. */
export function Panel({
  id,
  title,
  scope,
  description,
  actions,
  csv,
  table,
  children,
  className,
  bodyClassName,
}: {
  id: string;
  title: ReactNode;
  /** The report the panel belongs to, so exports are named for their program and range. */
  scope?: Reports;
  description?: ReactNode;
  actions?: ReactNode;
  csv?: { name: string; headers: string[]; rows: Array<Array<string | number | null>> } | null;
  /** A table twin of the chart. When given, the panel offers a chart/table switch. */
  table?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  const ws = useWorkspace();
  const filename = () => {
    const key = scope?.programId ? ws.programById.get(scope.programId)?.key : null;
    return `${csvSlug(csv!.name, key, scope ? `${scope.range.from}-to-${scope.range.to}` : null)}.csv`;
  };
  return (
    <section aria-labelledby={`${id}-title`} className={cn('flex min-w-0 flex-col rounded-lg border bg-background', className)}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-3.5">
        <div className="min-w-[min(100%,15rem)] flex-1">
          <h2 id={`${id}-title`} className="text-[13px] font-medium leading-5">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {actions}
          {(table || csv) && (
            <div className="-mr-1.5 flex items-center">
              {table && (
                <Tip label={asTable ? 'Show as chart' : 'Show as table'}>
                  <IconButton size="sm" aria-pressed={asTable} aria-label={asTable ? `Show ${typeof title === 'string' ? title : 'section'} as a chart` : `Show ${typeof title === 'string' ? title : 'section'} as a table`} onClick={() => setAsTable(v => !v)}>
                    {asTable ? <BarChart3 /> : <Table2 />}
                  </IconButton>
                </Tip>
              )}
              {csv && (
                <Tip label="Export as CSV">
                  <IconButton size="sm" aria-label={`Export ${typeof title === 'string' ? title : 'section'} as CSV`} onClick={() => downloadCsv(filename(), csv.headers, csv.rows)}>
                    <Download />
                  </IconButton>
                </Tip>
              )}
            </div>
          )}
        </div>
      </header>
      <div className={cn('min-w-0 flex-1 px-4 pb-4 pt-3', bodyClassName)}>{asTable && table ? <div className="animate-fade-in">{table}</div> : children}</div>
    </section>
  );
}

export function PanelSkeleton({ title, description, className, height = 220 }: { title: string; description?: string; className?: string; height?: number }) {
  return (
    <section className={cn('flex min-w-0 flex-col rounded-lg border bg-background', className)} aria-busy>
      <header className="px-4 pt-3.5">
        <h2 className="text-[13px] font-medium leading-5">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </header>
      <div className="px-4 pb-4 pt-3">
        <div className="flex flex-col justify-between" style={{ height }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton h-2.5 w-16" />
              <div className="skeleton h-2.5" style={{ width: `${25 + ((i * 29) % 55)}%` }} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** A quiet in-card empty message; a full EmptyState would outweigh the card it sits in. */
export function PanelEmpty({ title, description, className }: { title: string; description?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-4 py-8 text-center', className)}>
      <p className="text-[13px] font-medium">{title}</p>
      {description && <p className="mt-0.5 max-w-xs text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

/** A legend entry: squares key filled marks, lines key lines — the key mirrors the mark. */
export function LegendKey({ color, label, kind = 'square' }: { color: string; label: ReactNode; kind?: 'square' | 'line' }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {kind === 'line' ? (
        <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      ) : (
        <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: color }} aria-hidden />
      )}
      {label}
    </span>
  );
}

export function TooltipShell({ title, subtitle, children }: { title?: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-[176px] rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
      {title && <div className="font-medium">{title}</div>}
      {subtitle && <div className="text-2xs text-muted-foreground">{subtitle}</div>}
      <div className={cn('space-y-0.5', (title || subtitle) && 'mt-1.5')}>{children}</div>
    </div>
  );
}

/** Values lead in a tooltip; the series name is secondary and keyed with a short stroke. */
export function TooltipRow({ color, label, value, strong }: { color?: string; label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {color ? <span className="h-0.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden /> : <span className="w-2.5 shrink-0" aria-hidden />}
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('ml-auto pl-4 tabular-nums', strong ? 'font-semibold' : 'font-medium')}>{value}</span>
    </div>
  );
}

/** A plain data table, the accessible twin of every chart. */
export function DataTable({ headers, rows, align, caption, footer }: { headers: string[]; rows: ReactNode[][]; align?: Array<'left' | 'right'>; caption?: string; footer?: ReactNode[] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[320px] border-separate border-spacing-0 text-[12.5px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            {headers.map((h, i) => (
              <th key={h} scope="col" className={cn('h-8 whitespace-nowrap border-b px-2 font-medium first:pl-0 last:pr-0', align?.[i] === 'right' && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="hover:bg-accent/40">
              {r.map((c, ci) => (
                <td key={ci} className={cn('h-8 whitespace-nowrap border-b px-2 tabular-nums first:pl-0 last:pr-0', align?.[ci] === 'right' && 'text-right')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr className="font-medium">
              {footer.map((c, ci) => (
                <td key={ci} className={cn('h-8 whitespace-nowrap px-2 tabular-nums first:pl-0 last:pr-0', align?.[ci] === 'right' && 'text-right')}>
                  {c}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** A horizontal bar on a shared scale: 4px rounded data end, square at the baseline, direct value label beside it. */
export function HBar({ value, max, color, label, className }: { value: number; max: number; color: string; label?: ReactNode; className?: string }) {
  const w = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <div className="relative h-3.5 min-w-0 flex-1">
        <div className="absolute inset-y-0 left-0 rounded-r-[4px] transition-[width] duration-500" style={{ width: `${w * 100}%`, minWidth: value > 0 ? 2 : 0, background: color }} />
      </div>
      {label != null && <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{label}</span>}
    </div>
  );
}
