import { Check } from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import { mediumDateTime } from '../lib/format';

type Item = { key: string; label: string; at: string | null; done: boolean };

/** Where an application is: finished steps are filled, the current one is ringed, the rest wait. */
export function Timeline({ items }: { items: Item[] }) {
  const currentIndex = (() => {
    const lastDone = items.map(i => i.done).lastIndexOf(true);
    return lastDone;
  })();
  return (
    <ol className="relative">
      {items.map((item, i) => {
        const current = i === currentIndex && i < items.length - 1 && item.key !== 'withdrawn';
        const last = i === items.length - 1;
        return (
          <li key={item.key} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && <span className={cn('absolute left-[11px] top-6 h-[calc(100%-20px)] w-0.5 rounded-full', item.done && items[i + 1]?.done ? 'bg-primary/60' : 'bg-border')} aria-hidden />}
            <span
              className={cn(
                'relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                item.done ? 'bg-primary text-primary-foreground' : 'border-2 border-border bg-background',
                current && 'ring-4 ring-primary/15',
              )}
              aria-hidden
            >
              {item.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </span>
            <div className="min-w-0">
              <p className={cn('text-[15px] font-medium', !item.done && 'text-muted-foreground')}>
                {item.label}
                <span className="sr-only">{item.done ? ' — done' : ' — not yet'}</span>
              </p>
              {item.at ? <p className="text-sm text-muted-foreground">{mediumDateTime(item.at)}</p> : current ? <p className="text-sm text-muted-foreground">In progress</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
