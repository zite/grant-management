import { Banknote, CornerDownRight, EyeOff, Flag, Heading } from 'lucide-react';
import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Switch } from '@project/components/ui/switch';
import { cn } from '@project/components/lib/utils';
import type { FormField } from '@project/shared/forms/types';
import { Tip } from '../primitives/bits';

export const inputClass =
  'h-8 w-full rounded-md border border-input bg-background px-2.5 text-[13px] shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15 disabled:opacity-50 aria-[invalid=true]:border-tone-danger';

export const textareaClass =
  'block w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-[13px] leading-relaxed shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15';

/** A textarea that grows with its content. */
export const AutoTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number; maxHeight?: number }>(
  ({ className, minRows = 1, maxHeight = 480, value, ...props }, forwarded) => {
    const inner = useRef<HTMLTextAreaElement | null>(null);
    useLayoutEffect(() => {
      const el = inner.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight + 2, maxHeight)}px`;
    }, [value, maxHeight]);
    return (
      <textarea
        ref={el => {
          inner.current = el;
          if (typeof forwarded === 'function') forwarded(el);
          else if (forwarded) forwarded.current = el;
        }}
        rows={minRows}
        value={value}
        className={className}
        {...props}
      />
    );
  },
);
AutoTextarea.displayName = 'AutoTextarea';

export function Segmented<V extends string>({ value, onChange, options, className, size = 'md' }: {
  value: V;
  onChange: (v: V) => void;
  options: Array<{ value: V; label: ReactNode; icon?: ReactNode; tip?: string }>;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" className={cn('inline-flex shrink-0 items-center rounded-md border bg-subtle p-0.5', className)}>
      {options.map(o => {
        const on = o.value === value;
        const button = (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={typeof o.label === 'string' && o.label ? o.label : o.tip}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-[5px] font-medium transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5',
              size === 'sm' ? 'h-6 px-2 text-xs' : 'h-[26px] px-2.5 text-[12.5px]',
              on ? 'bg-background text-foreground shadow-xs ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
        return o.tip ? <Tip key={o.value} label={o.tip}>{button}</Tip> : button;
      })}
    </div>
  );
}

/** A number box that allows an empty value and only commits numbers. */
export function NumberField({ value, onChange, placeholder, min, max, integer = true, className, suffix, ariaLabel, invalid }: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  className?: string;
  suffix?: string;
  ariaLabel: string;
  invalid?: boolean;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value == null ? '' : String(value));
  }, [value]);
  const parsed = text.trim() === '' ? null : Number(text.replace(/,/g, ''));
  const bad = parsed !== null && (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed)) || (min != null && parsed < min) || (max != null && parsed > max));
  return (
    <div className={cn('relative', className)}>
      <input
        aria-label={ariaLabel}
        inputMode={integer ? 'numeric' : 'decimal'}
        aria-invalid={bad || invalid || undefined}
        className={cn(inputClass, 'tabular-nums', suffix && 'pr-10')}
        value={text}
        placeholder={placeholder}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          setText(value == null ? '' : String(value));
        }}
        onChange={e => {
          const t = e.target.value.replace(integer ? /[^0-9-]/g : /[^0-9.,-]/g, '');
          setText(t);
          const n = t.trim() === '' ? null : Number(t.replace(/,/g, ''));
          if (n === null) onChange(null);
          else if (Number.isFinite(n) && (!integer || Number.isInteger(n)) && (min == null || n >= min) && (max == null || n <= max)) onChange(n);
        }}
      />
      {suffix && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );
}

export function Group({ title, children, action, className, id }: { title: ReactNode; children: ReactNode; action?: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn('border-b px-4 py-4 last:border-b-0', className)}>
      <div className="mb-3 flex min-h-5 items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Row({ label, hint, children, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[12.5px] font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ToggleRow({ label, description, checked, onChange, disabled, id }: { label: ReactNode; description?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; id: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <label htmlFor={id} className={cn('min-w-0 cursor-pointer', disabled && 'cursor-not-allowed opacity-60')}>
        <span className="block text-[13px] font-medium leading-5">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} className="mt-0.5" />
    </div>
  );
}

/** The small markers that say a question does something beyond asking. */
export function FieldBadges({ field, titleFieldId, amountFieldId, className, size = 'sm' }: { field: FormField; titleFieldId: string | null; amountFieldId: string | null; className?: string; size?: 'sm' | 'md' }) {
  const items: Array<{ key: string; icon: ReactNode; label: string; tone: string }> = [];
  if (field.showIf?.fieldId) items.push({ key: 'logic', icon: <CornerDownRight />, label: field.type === 'section' ? 'Section shows conditionally' : 'Shows conditionally', tone: 'text-tone-info' });
  if (field.eligibility?.disqualifyValues?.length) items.push({ key: 'elig', icon: <Flag />, label: 'Screens eligibility', tone: 'text-tone-warning' });
  if (field.hideFromReviewers) items.push({ key: 'hidden', icon: <EyeOff />, label: 'Hidden from reviewers', tone: 'text-muted-foreground' });
  if (titleFieldId === field.id) items.push({ key: 'title', icon: <Heading />, label: 'Submission title', tone: 'text-tone-accent' });
  if (amountFieldId === field.id) items.push({ key: 'amount', icon: <Banknote />, label: 'Requested amount', tone: 'text-tone-success' });
  if (!items.length) return null;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1', className)}>
      {items.map(i => (
        <Tip key={i.key} label={i.label}>
          <span aria-label={i.label} role="img" className={cn('inline-flex items-center', i.tone, size === 'sm' ? '[&_svg]:h-3 [&_svg]:w-3' : '[&_svg]:h-3.5 [&_svg]:w-3.5')}>
            {i.icon}
          </span>
        </Tip>
      ))}
    </span>
  );
}
