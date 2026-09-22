import { AlarmClock, BadgeCheck, CalendarClock, CircleDollarSign, HandCoins, PauseCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@project/components/lib/utils';
import { percent, plural } from '../../lib/format';
import { useWorkspace } from '../../lib/workspace';
import type { AwardTotals } from './data';

type Tile = { key: string; label: string; value: string; hint: string; icon: ReactNode; tone?: 'danger' | 'warning'; onClick?: () => void; action?: string };

/**
 * The portfolio at a glance. Warning and danger colour only turns on when the
 * number is non-zero — a colour that's always on stops meaning anything. Each
 * tile opens the list behind its number.
 */
export function AwardsKpis({ totals, onOpen }: {
  totals: AwardTotals;
  onOpen: (target: 'paid' | 'next30' | 'onHold' | 'active' | 'overdueReports' | 'all') => void;
}) {
  const ws = useWorkspace();
  const t = totals;
  const tiles: Tile[] = [
    { key: 'awarded', label: 'Total awarded', value: ws.money(t.totalAwarded, { compact: true }), hint: `${plural(t.awards, 'award')}${t.pendingAwards ? ` · ${t.pendingAwards} pending` : ''}`, icon: <HandCoins />, onClick: () => onOpen('all'), action: 'Show all awards' },
    { key: 'paid', label: 'Paid to date', value: ws.money(t.paidToDate, { compact: true }), hint: t.totalAwarded ? `${percent(t.paidToDate, t.totalAwarded)}% of awarded · ${ws.money(t.remaining, { compact: true })} to go` : 'Nothing awarded yet', icon: <CircleDollarSign />, onClick: () => onOpen('paid'), action: 'Show paid payments' },
    {
      key: 'next30',
      label: 'Scheduled, next 30 days',
      value: ws.money(t.scheduledNext30, { compact: true }),
      hint: t.scheduledOverdue ? `${ws.money(t.scheduledOverdue, { compact: true })} of it overdue` : 'Scheduled payments',
      icon: <CalendarClock />,
      tone: t.scheduledOverdue ? 'danger' : undefined,
      onClick: () => onOpen('next30'),
      action: 'Show payments due in the next 30 days',
    },
    { key: 'hold', label: 'On hold', value: ws.money(t.onHold, { compact: true }), hint: t.onHoldCount ? plural(t.onHoldCount, 'payment') : 'Nothing held', icon: <PauseCircle />, tone: t.onHold ? 'warning' : undefined, onClick: () => onOpen('onHold'), action: 'Show awards with payments on hold' },
    { key: 'active', label: 'Active awards', value: t.activeAwards.toLocaleString(), hint: t.pendingAwards ? `${t.pendingAwards} pending, not yet paid` : 'Payments underway', icon: <BadgeCheck />, onClick: () => onOpen('active'), action: 'Show active awards' },
    {
      key: 'reports',
      label: 'Reports overdue',
      value: t.reportsOverdue.toLocaleString(),
      hint: t.reportsOverdue ? `Across ${plural(t.awardsWithOverdueReports, 'award')}` : 'Every follow-up on time',
      icon: <AlarmClock />,
      tone: t.reportsOverdue ? 'danger' : undefined,
      onClick: () => onOpen('overdueReports'),
      action: 'Show awards with overdue follow-ups',
    },
  ];

  return (
    <div className="grid shrink-0 grid-cols-2 gap-px border-b bg-border sm:grid-cols-3 xl:grid-cols-6">
      {tiles.map(tile => (
        <button
          key={tile.key}
          type="button"
          onClick={tile.onClick}
          aria-label={`${tile.label}: ${tile.value}. ${tile.action}`}
          className="group min-w-0 bg-background px-4 py-2.5 text-left transition-colors hover:bg-accent/50 focus-visible:relative focus-visible:z-[1]"
        >
          <div className={cn('flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:h-[13px] [&_svg]:w-[13px] [&_svg]:shrink-0', tile.tone === 'danger' && 'text-tone-danger', tile.tone === 'warning' && 'text-tone-warning')}>
            {tile.icon}
            <span className="truncate">{tile.label}</span>
          </div>
          <div className={cn('mt-0.5 text-[20px] font-semibold leading-7 tracking-tight', tile.tone === 'danger' && 'text-tone-danger')}>{tile.value}</div>
          <div className="truncate text-2xs text-muted-foreground" title={tile.hint}>{tile.hint}</div>
        </button>
      ))}
    </div>
  );
}

export function AwardsKpisSkeleton() {
  return (
    <div className="grid shrink-0 grid-cols-2 gap-px border-b bg-border sm:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-background px-4 py-2.5">
          <div className="skeleton h-3 w-20" />
          <div className="skeleton mt-2 h-5 w-16" />
          <div className="skeleton mt-2 h-2.5 w-24" />
        </div>
      ))}
    </div>
  );
}
