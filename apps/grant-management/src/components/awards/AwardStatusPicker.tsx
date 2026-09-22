import { ChevronDown } from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import { OptionPicker, type Option } from '../pickers/OptionPicker';
import { AWARD_STATUSES, AWARD_STATUS_META, type AwardStatus } from './data';

export function AwardStatusDot({ status, className }: { status: string; className?: string }) {
  return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', AWARD_STATUS_META[status]?.dot ?? 'bg-tone-neutral', className)} aria-hidden />;
}

/** The award's status as a quiet inline select. Digits 1–4 pick while the menu is open. */
export function AwardStatusPicker({ status, onChange, compact }: { status: string; onChange: (s: AwardStatus) => void; compact?: boolean }) {
  const options: Option<string>[] = AWARD_STATUSES.map((s, i) => ({
    value: s,
    label: AWARD_STATUS_META[s].label,
    icon: <AwardStatusDot status={s} />,
    hint: <span className="hidden sm:inline">{AWARD_STATUS_META[s].description}</span>,
    shortcut: String(i + 1),
  }));
  return (
    <OptionPicker
      value={status}
      onChange={v => onChange(v as AwardStatus)}
      options={options}
      placeholder="Award status…"
      width={300}
      trigger={
        <button
          type="button"
          onClick={e => e.stopPropagation()}
          aria-label={`Award status: ${status}. Change`}
          className={cn('ghost-chip group/status h-7 gap-1.5 px-1.5 text-[12.5px]', compact && 'h-6')}
        >
          <AwardStatusDot status={status} />
          <span className={cn(status === 'Cancelled' && 'text-muted-foreground')}>{AWARD_STATUS_META[status]?.label ?? status}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover/status:opacity-100 group-data-[state=open]/status:opacity-100" />
        </button>
      }
    />
  );
}
