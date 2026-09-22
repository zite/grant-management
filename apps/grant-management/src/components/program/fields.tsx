import { format, parseISO } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@project/components/ui/popover';
import { cn } from '@project/components/lib/utils';
import { viewerTimeZone } from './programData';

/** Dense form controls shared by the program settings and the create dialog. */
export const inputClass = 'h-8 text-[13px] md:text-[13px]';
export const textareaClass = 'min-h-[72px] text-[13px] md:text-[13px] leading-[1.5]';
export const selectTriggerClass = 'h-8 text-[13px]';
export const selectItemClass = 'text-[13px]';

export function Field({ label, htmlFor, hint, error, children, className, aside }: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
  aside?: ReactNode;
}) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="block text-xs font-medium">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? <p className="text-xs text-tone-danger">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function SettingsSection({ title, description, actions, children, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('mb-9 last:mb-0', className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold">{title}</h3>
          {description && <p className="mt-0.5 max-w-[620px] text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('divide-y overflow-hidden rounded-lg border bg-background', className)}>{children}</div>;
}

/** Label and explanation on the left, the control on the right; stacks on a phone. */
export function SettingsRow({ label, description, children, className, htmlFor }: { label: ReactNode; description?: ReactNode; children?: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn('flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6', className)}>
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-[13px] font-medium">
          {label}
        </label>
        {description && <div className="mt-0.5 text-[12.5px] text-muted-foreground">{description}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

export function PageTitle({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
      <div className="min-w-0 flex-1">
        <h2 className="text-[18px] font-semibold tracking-[-0.01em]">{title}</h2>
        {description && <p className="mt-1 max-w-[600px] text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * The bar that appears once a form has unsaved edits. It sticks to the bottom
 * of the scroll area, so Save is always one click away however long the form.
 */
export function SaveBar({ dirty, saving, onSave, onDiscard, message = 'You have unsaved changes' }: { dirty: boolean; saving: boolean; onSave: () => void; onDiscard: () => void; message?: string }) {
  if (!dirty && !saving) return null;
  return (
    <div className="sticky bottom-3 z-10 mt-6 flex items-center gap-3 rounded-lg border bg-popover px-3 py-2 shadow-lg animate-fade-up sm:px-4">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-tone-warning" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[13px]">{message}</span>
      <button type="button" onClick={onDiscard} disabled={saving} className="h-7 shrink-0 rounded-md px-2.5 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50">
        Discard
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-70"
      >
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}

/** Warn before closing the tab with unsaved edits. */
export function useUnloadGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [dirty]);
}

/**
 * A date and a time in the viewer's own timezone, stored as an ISO instant.
 * Picking a date without a time uses `defaultTime`, which is how deadlines
 * usually work ("end of day on the 30th").
 */
export function DateTimeInput({ id, value, onChange, defaultTime = '17:00', disabled, className, 'aria-label': ariaLabel }: {
  id?: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  defaultTime?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}) {
  const [date, setDate] = useState(() => (value ? format(parseISO(value), 'yyyy-MM-dd') : ''));
  const [time, setTime] = useState(() => (value ? format(parseISO(value), 'HH:mm') : ''));

  // Follow outside changes (a discard, a refetch) without fighting the person typing.
  useEffect(() => {
    const d = value ? format(parseISO(value), 'yyyy-MM-dd') : '';
    const t = value ? format(parseISO(value), 'HH:mm') : '';
    setDate(prev => (prev === d ? prev : d));
    setTime(prev => (value ? (prev === t ? prev : t) : prev));
  }, [value]);

  const emit = (d: string, t: string) => {
    if (!d) return onChange(null);
    const at = new Date(`${d}T${t || defaultTime}:00`);
    if (Number.isNaN(at.getTime())) return;
    onChange(at.toISOString());
  };

  const control = 'h-8 min-w-0 rounded-md border border-input bg-background px-2 text-[13px] shadow-xs outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 dark:[color-scheme:dark]';
  return (
    <div className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <input
        id={id}
        type="date"
        aria-label={ariaLabel ? `${ariaLabel} date` : undefined}
        value={date}
        disabled={disabled}
        onChange={e => {
          setDate(e.target.value);
          if (!time && e.target.value) setTime(defaultTime);
          emit(e.target.value, time || defaultTime);
        }}
        className={cn(control, 'flex-1')}
      />
      <input
        type="time"
        aria-label={ariaLabel ? `${ariaLabel} time` : 'Time'}
        value={time}
        disabled={disabled || !date}
        onChange={e => {
          setTime(e.target.value);
          emit(date, e.target.value);
        }}
        className={cn(control, 'w-[112px] shrink-0')}
      />
    </div>
  );
}

export function TimeZoneNote({ className }: { className?: string }) {
  const tz = viewerTimeZone();
  let abbr = '';
  try {
    abbr = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    /* older engines */
  }
  return <span className={className}>Times are in your timezone, {tz.replace(/_/g, ' ')}{abbr ? ` (${abbr})` : ''}.</span>;
}

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase();

export function SwatchGrid({ value, colors, onPick, columns = 9 }: { value: string | null | undefined; colors: string[]; onPick: (c: string) => void; columns?: number }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, 20px)` }}>
      {colors.map(c => (
        <button
          key={c}
          type="button"
          aria-label={`Colour ${c}`}
          aria-pressed={same(c, value)}
          onClick={() => onPick(c)}
          className={cn('h-5 w-5 rounded-full ring-offset-2 ring-offset-popover transition-transform hover:scale-110', same(c, value) && 'ring-2 ring-foreground/60')}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

export function ColorPopover({ value, colors, onChange, children, align = 'start' }: { value: string | null | undefined; colors: string[]; onChange: (c: string) => void; children: ReactNode; align?: 'start' | 'center' | 'end' }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-2.5 shadow-lg">
        <SwatchGrid
          value={value}
          colors={colors}
          onPick={c => {
            if (!same(c, value)) onChange(c);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function IconColorPopover({ icon, color, icons, colors, onChange, children }: {
  icon: string | null | undefined;
  color: string | null | undefined;
  icons: string[];
  colors: string[];
  onChange: (next: { icon?: string; color?: string }) => void;
  children: ReactNode;
}) {
  const choices = icon && !icons.includes(icon) ? [icon, ...icons] : icons;
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2.5 shadow-lg">
        <div className="mb-1.5 text-2xs font-medium text-muted-foreground">Icon</div>
        <div className="mb-3 grid grid-cols-7 gap-1">
          {choices.map(i => (
            <button
              key={i}
              type="button"
              onClick={() => onChange({ icon: i })}
              aria-label={`Icon ${i}`}
              aria-pressed={i === icon}
              className={cn('flex h-7 w-7 items-center justify-center rounded-md text-[15px] transition-colors', i === icon ? 'bg-accent ring-1 ring-foreground/25' : 'hover:bg-accent')}
            >
              {i}
            </button>
          ))}
        </div>
        <div className="mb-1.5 text-2xs font-medium text-muted-foreground">Colour</div>
        <SwatchGrid value={color} colors={colors} onPick={c => onChange({ color: c })} columns={7} />
      </PopoverContent>
    </Popover>
  );
}

/** Money as a plain number input with the currency symbol in front. Empty means "not set". */
export function MoneyInput({ id, value, onChange, symbol, placeholder, className }: { id?: string; value: number | null; onChange: (v: number | null) => void; symbol: string; placeholder?: string; className?: string }) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    setText(prev => (Number(prev.replace(/,/g, '')) === value || (prev === '' && value == null) ? prev : value == null ? '' : String(value)));
  }, [value]);
  // Thousands separators while reading; the plain number while typing.
  const shown = focused || value == null ? text : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return (
    <div className={cn('flex h-8 min-w-0 items-center rounded-md border border-input bg-background shadow-xs focus-within:ring-1 focus-within:ring-ring', className)}>
      <span className="pl-2.5 pr-1 text-[13px] text-muted-foreground">{symbol}</span>
      <input
        id={id}
        inputMode="decimal"
        value={shown}
        placeholder={placeholder}
        onFocus={() => {
          setFocused(true);
          setText(value == null ? '' : String(value));
        }}
        onBlur={() => setFocused(false)}
        onChange={e => {
          const raw = e.target.value.replace(/[^0-9.,]/g, '');
          setText(raw);
          const n = Number(raw.replace(/,/g, ''));
          onChange(raw.trim() === '' ? null : Number.isFinite(n) ? n : value);
        }}
        className="h-full min-w-0 flex-1 bg-transparent pr-2.5 text-[13px] tabular-nums outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

/**
 * Text that becomes an input the moment you point at it. Commits on Enter or
 * blur, Escape reverts, and an unchanged value never sends a request.
 */
export function InlineInput({ value, onCommit, placeholder, required, maxLength, className, 'aria-label': ariaLabel }: {
  value: string | null | undefined;
  onCommit: (next: string) => void;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  className?: string;
  'aria-label'?: string;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [focused, setFocused] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!focused) setDraft(value ?? '');
  }, [value, focused]);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(value ?? '');
      return;
    }
    const next = draft.trim();
    if (required && !next) {
      setDraft(value ?? '');
      return;
    }
    if (next !== (value ?? '').trim()) onCommit(next);
  };

  return (
    <input
      value={draft}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={e => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.stopPropagation();
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      className={cn(
        'h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-[13px] outline-none transition-colors placeholder:text-muted-foreground hover:border-border focus:border-input focus:bg-background',
        className,
      )}
    />
  );
}
