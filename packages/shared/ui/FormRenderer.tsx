import { AlertTriangle, AtSign, Check, FileText, Link2, Loader2, Phone, Upload, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { cn } from '@project/components/lib/utils';
import { acceptAttribute, checkEligibility, isEmptyValue, validateField, visibleFieldIds, wordCount } from '../forms/logic';
import { FILE_KINDS, OTHER, otherKey, type AddressValue, type AnswerValue, type Answers, type FileValue, type FormField } from '../forms/types';
import { Markdown, fileSize } from './Markdown';

/**
 * Renders a form for filling in — the applicant portal, follow-up tasks, and
 * the builder's live preview all use this one component, so what a program
 * manager previews is exactly what an applicant gets.
 *
 * It is fully controlled: answers in, answers out. Validation messages come
 * from the parent (usually `validateAnswers`), so the parent decides when to
 * show them — typically after a field is touched or a step is attempted.
 */

export type UploadFn = (file: File) => Promise<FileValue>;

export type FormRendererProps = {
  fields: FormField[];
  answers: Answers;
  onChange: (next: Answers, changedFieldId: string) => void;
  errors?: Record<string, string | undefined>;
  onFieldBlur?: (fieldId: string) => void;
  disabled?: boolean;
  currency?: string;
  /** Omit to disable uploads (the builder preview). */
  upload?: UploadFn;
  /** Prefix for DOM ids, so two renderers can share a page. */
  idPrefix?: string;
  /** Show section fields as headings. Steppers pass false and title the step themselves. */
  showSections?: boolean;
  /** Validate a field as soon as it's blurred, even before the parent asks. */
  eagerErrors?: boolean;
  size?: 'md' | 'lg';
};

const inputBase =
  'w-full rounded-lg border border-input bg-background text-foreground shadow-xs transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-tone-danger aria-[invalid=true]:focus-visible:ring-tone-danger/15';

export function currencySymbol(currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find(p => p.type === 'currency')?.value ?? '$';
  } catch {
    return '$';
  }
}

export function FormRenderer({
  fields, answers, onChange, errors = {}, onFieldBlur, disabled, currency = 'USD', upload, idPrefix, showSections = true, eagerErrors, size = 'md',
}: FormRendererProps) {
  const autoId = useId();
  const prefix = idPrefix ?? `f${autoId.replace(/[^a-z0-9]/gi, '')}`;
  const visible = useMemo(() => visibleFieldIds(fields, answers), [fields, answers]);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const eligibility = useMemo(() => checkEligibility(fields, answers), [fields, answers]);
  const blockedBy = new Map(eligibility.reasons.map(r => [r.fieldId, r.message]));

  // Merge onto the newest answers, not the ones captured when an async change (an upload) began —
  // otherwise typing done while a file uploads is overwritten when the upload lands.
  const latest = useRef(answers);
  latest.current = answers;
  const set = (id: string, value: AnswerValue, extra?: Answers) => {
    const next = { ...latest.current, [id]: value, ...(extra ?? {}) };
    latest.current = next;
    if (value === null || value === undefined) delete next[id];
    onChange(next, id);
  };
  const blur = (id: string) => {
    if (eagerErrors) setTouched(t => (t.has(id) ? t : new Set(t).add(id)));
    onFieldBlur?.(id);
  };

  const rendered = fields.filter(f => visible.has(f.id) && (showSections || f.type !== 'section'));
  return (
    <div className={cn('grid grid-cols-1 gap-x-4 sm:grid-cols-2', size === 'lg' ? 'gap-y-7' : 'gap-y-6')}>
      {rendered.map((f, i) => {
        if (f.type === 'section') {
          return (
            <div key={f.id} className={cn('sm:col-span-2', i > 0 && 'mt-4 border-t pt-7')}>
              <h3 className={cn('font-semibold tracking-tight', size === 'lg' ? 'text-xl' : 'text-[15px]')}>{f.label}</h3>
              {f.help && <Markdown compact className="mt-1 text-sm text-muted-foreground">{f.help}</Markdown>}
            </div>
          );
        }
        if (f.type === 'content') {
          return (
            <div key={f.id} className="sm:col-span-2">
              {f.label && <p className="mb-1 font-medium">{f.label}</p>}
              <Markdown compact className="text-muted-foreground">{f.help ?? ''}</Markdown>
            </div>
          );
        }
        const error = errors[f.id] ?? (eagerErrors && touched.has(f.id) ? validateField(f, answers) ?? undefined : undefined);
        return (
          <FieldShell key={f.id} field={f} id={`${prefix}-${f.id}`} error={error} counter={<Counter field={f} value={answers[f.id]} />} size={size}>
            <Control
              field={f}
              id={`${prefix}-${f.id}`}
              value={answers[f.id]}
              otherText={String(answers[otherKey(f.id)] ?? '')}
              invalid={Boolean(error)}
              disabled={disabled}
              currency={currency}
              upload={upload}
              size={size}
              onChange={(v, extra) => set(f.id, v, extra)}
              onBlur={() => blur(f.id)}
            />
            {blockedBy.has(f.id) && (
              <div role="alert" className="mt-2.5 flex gap-2.5 rounded-lg border border-tone-warning/30 bg-tone-warning/[0.07] px-3 py-2.5 text-sm text-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-tone-warning" />
                <span>{blockedBy.get(f.id)}</span>
              </div>
            )}
          </FieldShell>
        );
      })}
    </div>
  );
}

function FieldShell({ field, id, error, counter, children, size }: { field: FormField; id: string; error?: string; counter?: ReactNode; children: ReactNode; size: 'md' | 'lg' }) {
  const groupLike = field.type === 'single_choice' || field.type === 'multiple_choice' || field.type === 'yes_no' || field.type === 'address' || field.type === 'file';
  const Label = groupLike ? 'div' : 'label';
  return (
    <div className={cn('min-w-0', field.width !== 'half' && 'sm:col-span-2')} data-field-id={field.id} id={`${id}-wrap`}>
      <Label {...(groupLike ? { id: `${id}-label` } : { htmlFor: id })} className={cn('block font-medium leading-snug text-foreground', size === 'lg' ? 'text-[15px]' : 'text-sm')}>
        {field.label || <span className="text-muted-foreground">Untitled question</span>}
        {field.required && <span className="ml-0.5 text-tone-danger" aria-hidden>*</span>}
        {field.required && <span className="sr-only"> (required)</span>}
      </Label>
      {field.help && <Markdown compact className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{field.help}</Markdown>}
      <div className="mt-2">{children}</div>
      {(error || counter) && (
        <div className="mt-1.5 flex items-start gap-3 text-[12.5px]">
          {error && (
            <p id={`${id}-error`} className="flex-1 text-tone-danger" role="alert">
              {error}
            </p>
          )}
          {counter && <div className="ml-auto shrink-0">{counter}</div>}
        </div>
      )}
    </div>
  );
}

function Counter({ field, value }: { field: FormField; value: AnswerValue | undefined }) {
  if (field.type === 'long_text' && field.maxWords) {
    const n = wordCount(String(value ?? ''));
    return <span className={cn('tabular-nums', n > field.maxWords ? 'font-medium text-tone-danger' : 'text-muted-foreground')}>{n.toLocaleString()} / {field.maxWords.toLocaleString()} words</span>;
  }
  if ((field.type === 'short_text' || field.type === 'long_text') && field.maxLength) {
    const n = String(value ?? '').length;
    if (n < field.maxLength * 0.8) return null;
    return <span className={cn('tabular-nums', n > field.maxLength ? 'font-medium text-tone-danger' : 'text-muted-foreground')}>{n} / {field.maxLength}</span>;
  }
  return null;
}

type ControlProps = {
  field: FormField;
  id: string;
  value: AnswerValue | undefined;
  otherText: string;
  invalid: boolean;
  disabled?: boolean;
  currency: string;
  upload?: UploadFn;
  size: 'md' | 'lg';
  onChange: (value: AnswerValue, extra?: Answers) => void;
  onBlur: () => void;
};

function Control(props: ControlProps) {
  const { field, id, value, invalid, disabled, onChange, onBlur, size } = props;
  const aria = { 'aria-invalid': invalid || undefined, 'aria-describedby': invalid ? `${id}-error` : undefined, 'aria-required': field.required || undefined };
  const h = size === 'lg' ? 'h-11 text-[15px]' : 'h-10 text-sm';

  switch (field.type) {
    case 'short_text':
      return <input id={id} {...aria} disabled={disabled} className={cn(inputBase, h, 'px-3')} value={String(value ?? '')} placeholder={field.placeholder} maxLength={field.maxLength ? field.maxLength * 2 : 2000} onChange={e => onChange(e.target.value)} onBlur={onBlur} />;
    case 'email':
    case 'url':
    case 'phone': {
      const Icon = field.type === 'email' ? AtSign : field.type === 'url' ? Link2 : Phone;
      return (
        <div className="relative">
          <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id={id}
            {...aria}
            disabled={disabled}
            type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'tel'}
            inputMode={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'tel'}
            autoComplete={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'url'}
            className={cn(inputBase, h, 'pl-9 pr-3')}
            value={String(value ?? '')}
            placeholder={field.placeholder ?? (field.type === 'email' ? 'name@example.org' : field.type === 'url' ? 'example.org' : '')}
            onChange={e => onChange(e.target.value)}
            onBlur={e => {
              if (field.type === 'url') {
                const v = e.target.value.trim();
                if (v && !/^https?:\/\//i.test(v) && v.includes('.')) onChange(`https://${v}`);
              }
              onBlur();
            }}
          />
        </div>
      );
    }
    case 'long_text':
      return <AutoTextarea id={id} aria={aria} disabled={disabled} value={String(value ?? '')} placeholder={field.placeholder} onChange={v => onChange(v)} onBlur={onBlur} size={size} />;
    case 'number':
    case 'currency':
      return <NumberInput {...props} className={h} aria={aria} />;
    case 'date':
      return <input id={id} {...aria} disabled={disabled} type="date" className={cn(inputBase, h, 'px-3 [color-scheme:light] dark:[color-scheme:dark]')} value={String(value ?? '')} onChange={e => onChange(e.target.value || null)} onBlur={onBlur} />;
    case 'single_choice':
    case 'multiple_choice':
      return <ChoiceList {...props} />;
    case 'dropdown':
      return (
        <div className="space-y-2">
          <Select value={value ? String(value) : undefined} onValueChange={v => onChange(v)} disabled={disabled}>
            <SelectTrigger id={id} {...aria} className={cn(inputBase, h, 'px-3', !value && 'text-muted-foreground')} onBlur={onBlur}>
              <SelectValue placeholder={field.placeholder || 'Choose an option'} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {(field.options ?? []).map(o => (
                <SelectItem key={o.id} value={o.id}>{o.label || 'Untitled option'}</SelectItem>
              ))}
              {field.allowOther && <SelectItem value={OTHER}>Other</SelectItem>}
            </SelectContent>
          </Select>
          {value === OTHER && <OtherInput {...props} />}
        </div>
      );
    case 'yes_no':
      return (
        <div role="radiogroup" aria-labelledby={`${id}-label`} className="inline-flex gap-2" {...aria}>
          {(['yes', 'no'] as const).map(v => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={value === v}
              disabled={disabled}
              onClick={() => onChange(value === v ? null : v)}
              onBlur={onBlur}
              className={cn(
                'inline-flex min-w-[88px] items-center justify-center gap-2 rounded-lg border px-4 font-medium transition-colors disabled:opacity-60',
                h,
                value === v ? 'border-primary bg-primary/[0.08] text-foreground ring-1 ring-primary' : 'border-input bg-background hover:bg-accent',
                invalid && value !== v && 'border-tone-danger/60',
              )}
            >
              {value === v && <Check className="h-4 w-4 text-primary" />}
              {v === 'yes' ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      );
    case 'file':
      return <FileInput {...props} />;
    case 'address':
      return <AddressInput {...props} className={h} />;
    default:
      return null;
  }
}

function AutoTextarea({ id, aria, value, onChange, onBlur, disabled, placeholder, size }: { id: string; aria: Record<string, unknown>; value: string; onChange: (v: string) => void; onBlur: () => void; disabled?: boolean; placeholder?: string; size: 'md' | 'lg' }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight + 2, 120), 640)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      id={id}
      {...aria}
      disabled={disabled}
      placeholder={placeholder}
      className={cn(inputBase, 'block min-h-[120px] resize-y px-3 py-2.5 leading-relaxed', size === 'lg' ? 'text-[15px]' : 'text-sm')}
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={onBlur}
    />
  );
}

function NumberInput({ field, id, value, disabled, onChange, onBlur, currency, className, aria }: ControlProps & { className: string; aria: Record<string, unknown> }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value == null || value === '' ? '' : field.type === 'currency' ? Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(value));
  }, [value, field.type]);
  const symbol = field.type === 'currency' ? currencySymbol(currency) : null;
  return (
    <div className="relative">
      {symbol && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{symbol}</span>}
      <input
        id={id}
        {...aria}
        disabled={disabled}
        inputMode="decimal"
        className={cn(inputBase, className, symbol ? (symbol.length > 1 ? 'pl-10' : 'pl-7') : 'pl-3', 'pr-3 tabular-nums')}
        value={draft}
        placeholder={field.placeholder ?? (field.min != null && field.max != null ? `${field.min.toLocaleString()}–${field.max.toLocaleString()}` : '')}
        onFocus={() => (focused.current = true)}
        onChange={e => {
          const raw = e.target.value.replace(field.type === 'currency' ? /[^0-9.,-]/g : /[^0-9.-]/g, '');
          setDraft(raw);
          const n = Number(raw.replace(/,/g, ''));
          onChange(raw.trim() === '' || !Number.isFinite(n) ? null : n);
        }}
        onBlur={() => {
          focused.current = false;
          if (value != null && field.type === 'currency') setDraft(Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 }));
          onBlur();
        }}
      />
    </div>
  );
}

function OtherInput({ field, id, otherText, disabled, onChange, value }: ControlProps) {
  return (
    <input
      aria-label={`${field.label}: other`}
      id={`${id}-other`}
      autoFocus
      disabled={disabled}
      className={cn(inputBase, 'h-9 px-3 text-sm')}
      placeholder="Please specify"
      value={otherText}
      onChange={e => onChange(value ?? OTHER, { [otherKey(field.id)]: e.target.value })}
    />
  );
}

function ChoiceList(props: ControlProps) {
  const { field, id, value, disabled, onChange, onBlur, invalid, size } = props;
  const multiple = field.type === 'multiple_choice';
  const selected = new Set(multiple ? (Array.isArray(value) ? (value as string[]) : []) : value ? [String(value)] : []);
  const options = [...(field.options ?? []), ...(field.allowOther ? [{ id: OTHER, label: 'Other' }] : [])];
  const toggle = (optionId: string) => {
    if (multiple) {
      const next = new Set(selected);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      const ordered = options.map(o => o.id).filter(o => next.has(o));
      onChange(ordered, next.has(OTHER) ? undefined : { [otherKey(field.id)]: null });
    } else {
      onChange(selected.has(optionId) ? null : optionId, optionId === OTHER ? undefined : { [otherKey(field.id)]: null });
    }
  };
  const columns = options.length > 6 && options.every(o => o.label.length < 28);
  return (
    <div className="space-y-2">
      <div role={multiple ? 'group' : 'radiogroup'} aria-labelledby={`${id}-label`} className={cn('grid gap-2', columns && 'sm:grid-cols-2')}>
        {options.map(o => {
          const on = selected.has(o.id);
          return (
            <button
              key={o.id}
              type="button"
              role={multiple ? 'checkbox' : 'radio'}
              aria-checked={on}
              disabled={disabled}
              onClick={() => toggle(o.id)}
              onBlur={onBlur}
              className={cn(
                'group flex w-full items-center gap-3 rounded-lg border px-3 text-left transition-colors disabled:opacity-60',
                size === 'lg' ? 'min-h-11 py-2.5 text-[15px]' : 'min-h-10 py-2 text-sm',
                on ? 'border-primary bg-primary/[0.06] ring-1 ring-primary' : 'border-input bg-background hover:border-foreground/25 hover:bg-accent/60',
                invalid && !on && 'border-tone-danger/50',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex h-[18px] w-[18px] shrink-0 items-center justify-center border transition-colors',
                  multiple ? 'rounded-[5px]' : 'rounded-full',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background group-hover:border-foreground/40',
                )}
              >
                {on && (multiple ? <Check className="h-3 w-3" strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />)}
              </span>
              <span className="min-w-0 flex-1">{o.label || 'Untitled option'}</span>
            </button>
          );
        })}
      </div>
      {selected.has(OTHER) && <OtherInput {...props} />}
    </div>
  );
}

function kindsLabel(kinds: string[] | undefined) {
  if (!kinds?.length) return 'Any file type';
  return kinds.map(k => FILE_KINDS[k]?.label ?? k).join(', ');
}

function FileInput({ field, id, value, disabled, upload, onChange, invalid }: ControlProps) {
  const files = Array.isArray(value) ? (value as FileValue[]) : [];
  const [pending, setPending] = useState<Array<{ key: string; name: string; size: number }>>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  const max = field.maxFiles ?? 1;
  const full = files.length + pending.length >= max;

  const accept = async (list: FileList | File[]) => {
    setProblem(null);
    if (!upload) {
      setProblem('Uploads are turned off in preview.');
      return;
    }
    const incoming = Array.from(list).slice(0, Math.max(0, max - files.length - pending.length));
    if (!incoming.length) {
      setProblem(`You can upload up to ${max} file${max === 1 ? '' : 's'}.`);
      return;
    }
    for (const file of incoming) {
      const probe: FileValue = { url: 'https://local', name: file.name, size: file.size, type: file.type };
      const check = validateField({ ...field, required: false, maxFiles: null }, { [field.id]: [probe] });
      if (check) {
        setProblem(check);
        continue;
      }
      const key = `${file.name}-${file.size}-${Math.random()}`;
      setPending(p => [...p, { key, name: file.name, size: file.size }]);
      try {
        const uploaded = await upload(file);
        onChange([...filesRef.current, uploaded]);
      } catch (e) {
        setProblem(`${file.name} didn't upload${e instanceof Error && e.message ? ` — ${e.message}` : ''}. Try again.`);
      } finally {
        setPending(p => p.filter(x => x.key !== key));
      }
    }
  };

  return (
    <div className="space-y-2">
      {(files.length > 0 || pending.length > 0) && (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li key={`${f.url}-${i}`} className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <a href={f.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">{f.name}</a>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fileSize(f.size)}</span>
              {!disabled && (
                <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Remove ${f.name}`}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
          {pending.map(p => (
            <li key={p.key} className="flex items-center gap-3 rounded-lg border border-dashed bg-background px-3 py-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
              <span className="shrink-0 text-xs">Uploading…</span>
            </li>
          ))}
        </ul>
      )}
      {!full && !disabled && (
        <div
          role="button"
          tabIndex={0}
          aria-labelledby={`${id}-label`}
          aria-invalid={invalid || undefined}
          onClick={() => inputRef.current?.click()}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), inputRef.current?.click())}
          onDragOver={e => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={e => {
            e.preventDefault();
            setOver(false);
            if (e.dataTransfer.files?.length) accept(e.dataTransfer.files);
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15',
            over ? 'border-primary bg-primary/[0.05]' : 'border-input bg-subtle hover:border-foreground/30 hover:bg-accent/50',
            invalid && 'border-tone-danger/60',
          )}
        >
          <Upload className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm">
            <span className="font-medium text-primary">Choose a file</span> <span className="text-muted-foreground">or drag it here</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {kindsLabel(field.accept)}
            {field.maxSizeMb ? ` · up to ${field.maxSizeMb} MB` : ''}
            {max > 1 ? ` · ${max - files.length} more allowed` : ''}
          </p>
          <input
            ref={inputRef}
            id={id}
            type="file"
            className="sr-only"
            tabIndex={-1}
            multiple={max - files.length > 1}
            accept={acceptAttribute(field.accept)}
            onChange={e => {
              if (e.target.files?.length) accept(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}
      {problem && <p className="text-[12.5px] text-tone-danger" role="alert">{problem}</p>}
    </div>
  );
}

function AddressInput({ field, id, value, disabled, onChange, onBlur, className }: ControlProps & { className: string }) {
  const a = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as AddressValue;
  const set = (k: keyof AddressValue, v: string) => {
    const next = { ...a, [k]: v };
    onChange(isEmptyValue(next) ? null : next);
  };
  const box = (k: keyof AddressValue, label: string, extra = '', autoComplete?: string) => (
    <input aria-label={`${field.label}: ${label}`} id={k === 'line1' ? id : undefined} disabled={disabled} placeholder={label} autoComplete={autoComplete} className={cn(inputBase, className, 'px-3', extra)} value={a[k] ?? ''} onChange={e => set(k, e.target.value)} onBlur={onBlur} />
  );
  return (
    <div className="grid grid-cols-6 gap-2">
      {box('line1', 'Street address', 'col-span-6', 'address-line1')}
      {box('line2', 'Apartment, suite, etc. (optional)', 'col-span-6', 'address-line2')}
      {box('city', 'City', 'col-span-6 sm:col-span-3', 'address-level2')}
      {box('region', 'State / region', 'col-span-3 sm:col-span-3', 'address-level1')}
      {box('postalCode', 'Postal code', 'col-span-3 sm:col-span-2', 'postal-code')}
      {box('country', 'Country', 'col-span-6 sm:col-span-4', 'country-name')}
    </div>
  );
}
