import { format, subDays, subMonths } from 'date-fns';
import { useCallback, useState } from 'react';
import { cn } from '@project/components/lib/utils';
import { toDayString } from '../../lib/format';
import { Tip } from '../primitives/bits';

export const RANGES = [
  { id: '30d', short: '30d', label: 'Last 30 days' },
  { id: '90d', short: '90d', label: 'Last 90 days' },
  { id: '12m', short: '12m', label: 'Last 12 months' },
  { id: 'ytd', short: 'Year', label: 'This year' },
  { id: 'all', short: 'All', label: 'All time' },
] as const;
export type RangeId = (typeof RANGES)[number]['id'];

/** Calendar days for a range, in the viewer's own timezone. */
export function rangeDays(range: RangeId, now = new Date()): { from?: string; to: string } {
  const to = toDayString(now);
  switch (range) {
    case '30d':
      return { from: toDayString(subDays(now, 29)), to };
    case '90d':
      return { from: toDayString(subDays(now, 89)), to };
    case '12m':
      return { from: toDayString(subDays(subMonths(now, 12), -1)), to };
    case 'ytd':
      return { from: `${now.getFullYear()}-01-01`, to };
    default:
      return { to };
  }
}

export function rangeText(from: string, to: string) {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  const sameYear = a.getFullYear() === b.getFullYear();
  return `${format(a, sameYear ? 'MMM d' : 'MMM d, yyyy')} – ${format(b, 'MMM d, yyyy')}`;
}

const STORAGE_KEY = 'grants:reports';
type Prefs = { range: RangeId; programId: string | null };

function readPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Prefs>;
    return {
      range: RANGES.some(r => r.id === raw.range) ? (raw.range as RangeId) : '90d',
      programId: typeof raw.programId === 'string' ? raw.programId : null,
    };
  } catch {
    return { range: '90d', programId: null };
  }
}

/** The range and program, remembered between visits. */
export function useReportPrefs() {
  const [prefs, setState] = useState<Prefs>(readPrefs);
  const update = useCallback((patch: Partial<Prefs>) => {
    setState(prev => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage may be unavailable */
      }
      return next;
    });
  }, []);
  return [prefs, update] as const;
}

export function RangeSelect({ value, onChange }: { value: RangeId; onChange: (r: RangeId) => void }) {
  return (
    <div role="radiogroup" aria-label="Date range" className="flex h-7 items-center rounded-md border bg-background p-0.5 shadow-2xs">
      {RANGES.map(r => {
        const on = r.id === value;
        return (
          <Tip key={r.id} label={r.label}>
            <button
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={r.label}
              onClick={() => onChange(r.id)}
              onKeyDown={e => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const i = RANGES.findIndex(x => x.id === value);
                const next = RANGES[(i + (e.key === 'ArrowRight' ? 1 : RANGES.length - 1)) % RANGES.length];
                onChange(next.id);
                (e.currentTarget.parentElement?.querySelectorAll('button')[RANGES.indexOf(next)] as HTMLButtonElement | undefined)?.focus();
              }}
              tabIndex={on ? 0 : -1}
              className={cn('h-[22px] rounded-[4px] px-2 text-xs tabular-nums transition-colors', on ? 'bg-accent font-medium text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground')}
            >
              {r.short}
            </button>
          </Tip>
        );
      })}
    </div>
  );
}
