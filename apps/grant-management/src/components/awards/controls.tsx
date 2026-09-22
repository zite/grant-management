import { Check, ChevronDown, Layers, Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@project/components/lib/utils';
import { useWorkspace } from '../../lib/workspace';
import { OptionPicker, type Option } from '../pickers/OptionPicker';
import { Glyph, Tip } from '../primitives/bits';

/** Tabs that live in the page header but are driven by a search param, so both can't look active at once. */
export function HeaderTabs({ tabs, value, onChange, label }: { tabs: Array<{ id: string; label: string; count?: number | null }>; value: string; onChange: (id: string) => void; label: string }) {
  return (
    <nav className="ml-1 flex min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-none sm:ml-2" aria-label={label}>
      {tabs.map(t => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => onChange(t.id)}
            className={cn(
              'flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] transition-colors',
              active ? 'border-border bg-accent font-medium text-foreground shadow-2xs' : 'border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && <span className="tabular-nums text-muted-foreground">{t.count}</span>}
          </button>
        );
      })}
    </nav>
  );
}

const ALL = '__all__';

/** "All programs" or one program, as a compact header control. */
export function ProgramSelect({ programId, onChange, align = 'end' }: { programId: string | null; onChange: (id: string | null) => void; align?: 'start' | 'end' }) {
  const ws = useWorkspace();
  const program = programId ? ws.programById.get(programId) : undefined;
  const options: Option<string>[] = [
    { value: ALL, label: 'All programs', icon: <Layers className="h-3.5 w-3.5 text-muted-foreground" />, shortcut: '0' },
    ...ws.orderedPrograms.map((p, i) => ({ value: p.id, label: p.name, icon: <Glyph icon={p.icon} color={p.color} size={16} />, hint: p.key, keywords: [p.key], shortcut: i < 9 ? String(i + 1) : undefined, group: p.phase === 'archived' ? 'Archived' : undefined })),
  ];
  return (
    <OptionPicker
      value={program?.id ?? ALL}
      onChange={v => onChange(v === ALL ? null : v)}
      options={options}
      placeholder="Choose a program…"
      align={align}
      width={260}
      trigger={
        <button type="button" aria-label="Program" className="flex h-7 min-w-0 max-w-[132px] items-center gap-1.5 rounded-md border bg-background px-2 text-[12.5px] shadow-2xs transition-colors hover:bg-accent data-[state=open]:bg-accent sm:max-w-[200px]">
          {program ? <Glyph icon={program.icon} color={program.color} size={16} /> : <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate">{program?.name ?? 'All programs'}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      }
    />
  );
}

/** A filter chip with a multi-select popover: "Status" → "Status: Active, Pending". */
export function MultiFilterChip({ label, icon, options, value, onChange }: { label: string; icon: ReactNode; options: Option<string>[]; value: string[]; onChange: (v: string[]) => void }) {
  const chosen = options.filter(o => value.includes(o.value));
  const text = chosen.length === 0 ? null : chosen.length <= 2 ? chosen.map(c => c.label).join(', ') : `${chosen.length} selected`;
  return (
    <span className={cn('inline-flex h-7 shrink-0 items-center overflow-hidden rounded-md border text-[12.5px] shadow-2xs transition-colors', chosen.length ? 'border-primary/30 bg-primary/[0.06]' : 'bg-background')}>
      <OptionPicker
        multiple
        value={value}
        onChange={onChange}
        options={options}
        placeholder={`${label}…`}
        width={220}
        trigger={
          <button type="button" className="flex h-full items-center gap-1.5 px-2 hover:bg-accent data-[state=open]:bg-accent">
            <span className="flex text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
            <span className={cn(!text && 'text-muted-foreground')}>{label}</span>
            {text && <span className="max-w-[160px] truncate font-medium">{text}</span>}
            {!text && <ChevronDown className="h-3 w-3 text-muted-foreground" />}
          </button>
        }
      />
      {chosen.length > 0 && (
        <button type="button" aria-label={`Clear ${label.toLowerCase()} filter`} onClick={() => onChange([])} className="flex h-full items-center border-l border-primary/20 px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}

/** A single-choice filter chip. */
export function SingleFilterChip({ label, icon, options, value, onChange, defaultValue }: { label: string; icon: ReactNode; options: Option<string>[]; value: string; onChange: (v: string) => void; defaultValue: string }) {
  const chosen = options.find(o => o.value === value);
  const active = value !== defaultValue;
  return (
    <span className={cn('inline-flex h-7 shrink-0 items-center overflow-hidden rounded-md border text-[12.5px] shadow-2xs transition-colors', active ? 'border-primary/30 bg-primary/[0.06]' : 'bg-background')}>
      <OptionPicker
        value={value}
        onChange={onChange}
        options={options}
        placeholder={`${label}…`}
        width={240}
        trigger={
          <button type="button" className="flex h-full items-center gap-1.5 px-2 hover:bg-accent data-[state=open]:bg-accent">
            <span className="flex text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
            <span className={cn(active ? 'font-medium' : 'text-muted-foreground')}>{active ? chosen?.label : label}</span>
            {!active && <ChevronDown className="h-3 w-3 text-muted-foreground" />}
          </button>
        }
      />
      {active && (
        <button type="button" aria-label={`Clear ${label.toLowerCase()} filter`} onClick={() => onChange(defaultValue)} className="flex h-full items-center border-l border-primary/20 px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}

/** An on/off filter: pressed chips read as applied. */
export function ToggleChip({ pressed, onChange, icon, children, tip }: { pressed: boolean; onChange: (v: boolean) => void; icon?: ReactNode; children: ReactNode; tip?: string }) {
  const chip = (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[12.5px] shadow-2xs transition-colors',
        pressed ? 'border-primary/30 bg-primary/[0.06] font-medium text-foreground' : 'bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {pressed ? <Check className="h-3.5 w-3.5 text-primary" /> : <span className="flex [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>}
      {children}
    </button>
  );
  return tip ? <Tip label={tip}>{chip}</Tip> : chip;
}

export function SearchBox({ value, onChange, placeholder, inputRef }: { value: string; onChange: (v: string) => void; placeholder: string; inputRef?: React.Ref<HTMLInputElement> }) {
  return (
    <div className="flex h-7 w-full items-center gap-1.5 rounded-md border bg-background px-2 shadow-2xs focus-within:border-foreground/30 sm:w-52">
      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            onChange('');
            e.currentTarget.blur();
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
      />
      {value ? (
        <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <kbd className="kbd hidden sm:inline-flex">/</kbd>
      )}
    </div>
  );
}
