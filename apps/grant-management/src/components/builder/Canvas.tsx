import {
  ArrowDown, ArrowUp, AtSign, CalendarDays, ChevronDown, Copy, CornerDownRight, Flag, Link2, Phone, Plus, SlidersHorizontal, Trash2, Upload, X,
} from 'lucide-react';
import { memo, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { cn } from '@project/components/lib/utils';
import { FILE_KINDS, OTHER, isInputField, type FieldType, type FormField } from '@project/shared/forms/types';
import { FieldIcon } from '@project/shared/ui/FieldIcon';
import { currencySymbol } from '@project/shared/ui/FormRenderer';
import { Markdown } from '@project/shared/ui/Markdown';
import { newId } from '@project/shared/forms/logic';
import { IconButton, Kbd, Tip } from '../primitives/bits';
import { MOD } from '../../lib/hotkeys';
import type { Draft } from './draft';
import { FieldPalette } from './FieldPalette';
import { conditionSummary, eligibilitySummary, typeLabel } from './summaries';
import { AutoTextarea, FieldBadges } from './ui';

export type FocusRequest = { id: string; target: 'label' | 'help' | 'option'; optionId?: string; nonce: number };

export type CanvasProps = {
  draft: Draft;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChangeField: (id: string, patch: Partial<FormField>, key?: string) => void;
  onInsert: (index: number, type: FieldType) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onNudge: (id: string, dir: -1 | 1) => void;
  onOpenSettings?: (id: string) => void;
  paletteAt: string | null;
  setPaletteAt: (key: string | null) => void;
  focus: FocusRequest | null;
  requestFocus: (req: Omit<FocusRequest, 'nonce'>) => void;
  currency: string;
  issues: Map<string, string>;
  onEditDescription: () => void;
  empty: ReactNode;
};

/** Stable callbacks for cards, so a keystroke in one card doesn't re-render (and re-parse the markdown of) every other card. */
type CardActions = {
  select: (id: string | null) => void;
  change: (id: string, patch: Partial<FormField>, key?: string) => void;
  insert: (index: number, type: FieldType) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  nudge: (id: string, dir: -1 | 1) => void;
  openSettings: ((id: string) => void) | null;
  setPalette: (key: string | null) => void;
  requestFocus: (req: Omit<FocusRequest, 'nonce'>) => void;
};

const box = 'flex w-full items-center rounded-lg border border-input bg-background text-sm text-muted-foreground/80 shadow-xs';

/**
 * The form as applicants will see it, made of cards you can click, retitle in
 * place and insert between. Controls are drawings, not inputs, so clicking
 * anywhere on a card selects it instead of typing into it.
 */
export function Canvas(props: CanvasProps) {
  const { draft, selectedId, onSelect, paletteAt, setPaletteAt, onInsert, focus, issues, currency } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const hasSettings = Boolean(props.onOpenSettings);
  const actions = useMemo<CardActions>(
    () => ({
      select: id => latest.current.onSelect(id),
      change: (id, patch, key) => latest.current.onChangeField(id, patch, key),
      insert: (index, type) => latest.current.onInsert(index, type),
      duplicate: id => latest.current.onDuplicate(id),
      remove: id => latest.current.onRemove(id),
      nudge: (id, dir) => latest.current.onNudge(id, dir),
      openSettings: id => latest.current.onOpenSettings?.(id),
      setPalette: key => latest.current.setPaletteAt(key),
      requestFocus: req => latest.current.requestFocus(req),
    }),
    [],
  );

  useEffect(() => {
    if (!selectedId) return;
    const el = scrollRef.current?.querySelector(`[data-card-id="${CSS.escape(selectedId)}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  let step = 0;
  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto bg-canvas"
      onMouseDown={e => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvasBlank !== undefined) onSelect(null);
      }}
    >
      <div data-canvas-blank className="mx-auto w-full max-w-[720px] px-3 pb-24 pt-5 sm:px-8 sm:pt-8">
        <button
          type="button"
          onClick={props.onEditDescription}
          className="group mb-5 block w-full rounded-lg px-1 py-1 text-left transition-colors hover:bg-background/60"
        >
          <h2 className="text-[20px] font-semibold tracking-[-0.01em]">{draft.name || 'Untitled form'}</h2>
          {draft.description.trim() ? (
            <Markdown compact className="mt-1 text-[13.5px] text-muted-foreground">{draft.description}</Markdown>
          ) : (
            <p className="mt-1 text-[13px] text-muted-foreground/80 group-hover:text-muted-foreground">Add a description applicants see before they start…</p>
          )}
        </button>

        {draft.fields.length === 0 ? (
          props.empty
        ) : (
          <div data-canvas-blank className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {draft.fields.map((f, index) => {
              if (f.type === 'section') step += 1;
              return (
                <FieldCard
                  key={f.id}
                  field={f}
                  index={index}
                  count={draft.fields.length}
                  step={step}
                  selected={selectedId === f.id}
                  paletteOpen={paletteAt === `before:${f.id}`}
                  logic={conditionSummary(draft.fields, f, currency)}
                  issue={issues.get(f.id) ?? null}
                  titleFieldId={draft.titleFieldId}
                  amountFieldId={draft.amountFieldId}
                  currency={currency}
                  focus={focus && focus.id === f.id ? focus : null}
                  hasSettings={hasSettings}
                  actions={actions}
                />
              );
            })}
            <div className="sm:col-span-2">
              <FieldPalette
                open={paletteAt === 'end'}
                onOpenChange={o => setPaletteAt(o ? 'end' : null)}
                onPick={type => onInsert(draft.fields.length, type)}
                side="top"
                trigger={
                  <button
                    type="button"
                    className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-input/70 text-[13px] text-muted-foreground transition-colors hover:border-primary/60 hover:bg-background hover:text-foreground data-[state=open]:border-primary data-[state=open]:bg-background"
                  >
                    <Plus className="h-4 w-4" /> Add question
                    <Kbd className="ml-1">A</Kbd>
                  </button>
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type CardProps = {
  field: FormField;
  index: number;
  count: number;
  step: number;
  selected: boolean;
  paletteOpen: boolean;
  logic: string | null;
  issue: string | null;
  titleFieldId: string | null;
  amountFieldId: string | null;
  currency: string;
  focus: FocusRequest | null;
  hasSettings: boolean;
  actions: CardActions;
};

const FieldCard = memo(function FieldCard(props: CardProps) {
  const { field: f, index, selected, focus, issue, currency, logic, actions, titleFieldId, amountFieldId } = props;
  const labelRef = useRef<HTMLTextAreaElement>(null);
  const helpRef = useRef<HTMLTextAreaElement>(null);
  const isSection = f.type === 'section';
  const isContent = f.type === 'content';
  const half = f.width === 'half' && isInputField(f);
  const elig = eligibilitySummary(f);

  useEffect(() => {
    if (!focus || focus.id !== f.id || !selected) return;
    const el = focus.target === 'label' ? labelRef.current : focus.target === 'help' ? helpRef.current : null;
    if (el) {
      el.focus();
      const end = el.value.length;
      if (focus.target === 'label' && /^(Untitled question|New section|Upload a file)$/.test(el.value)) el.select();
      else el.setSelectionRange(end, end);
    }
  }, [focus, selected, f.id]);

  const onCardMouseDown = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-card-toolbar], [data-insert]')) return;
    if (!selected) {
      actions.select(f.id);
      const zone = t.closest<HTMLElement>('[data-focus]')?.dataset.focus as 'label' | 'help' | undefined;
      if (zone) {
        e.preventDefault();
        actions.requestFocus({ id: f.id, target: zone });
      }
    }
  };

  const labelEditor = (className: string, placeholder: string) => (
    <AutoTextarea
      ref={labelRef}
      cols={1}
      value={f.label}
      placeholder={placeholder}
      aria-label={isSection ? 'Section heading' : isContent ? 'Text block title' : 'Question label'}
      maxLength={500}
      onChange={e => actions.change(f.id, { label: e.target.value.replace(/\n/g, ' ') }, `label:${f.id}`)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      className={cn('block w-full resize-none border-0 bg-transparent p-0 outline-none placeholder:text-muted-foreground/60 focus:ring-0', className)}
    />
  );

  const helpEditor = (placeholder: string, className?: string) => (
    <AutoTextarea
      ref={helpRef}
      value={f.help ?? ''}
      placeholder={placeholder}
      aria-label={isContent ? 'Text block' : 'Help text'}
      onChange={e => actions.change(f.id, { help: e.target.value }, `help:${f.id}`)}
      onKeyDown={e => e.key === 'Escape' && (e.target as HTMLTextAreaElement).blur()}
      className={cn('block w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-relaxed text-muted-foreground outline-none placeholder:text-muted-foreground/50 focus:text-foreground focus:ring-0', className)}
    />
  );

  return (
    <div data-card-id={f.id} className={cn('relative min-w-0', (!half || isSection || isContent) && 'sm:col-span-2', isSection && index > 0 && 'mt-5')}>
      <InsertPoint field={f} index={index} paletteOpen={props.paletteOpen} actions={actions} />
      <div
        onMouseDown={onCardMouseDown}
        className={cn(
          'group/card relative cursor-default rounded-lg border transition-[border-color,box-shadow,background-color]',
          isSection ? 'border-transparent px-3 py-2.5' : 'bg-background px-4 pb-4 pt-3 shadow-xs',
          selected
            ? 'border-primary ring-[3px] ring-primary/15'
            : isSection
              ? 'hover:border-border hover:bg-background/60'
              : 'hover:border-foreground/20',
          issue && !selected && 'border-tone-danger/60',
        )}
      >
        <div className="mb-1 flex h-5 items-center gap-2 text-2xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <FieldIcon type={f.type} className="h-3 w-3 shrink-0" />
            <span className="truncate">{isSection ? `Step ${props.step}` : typeLabel(f)}</span>
          </span>
          <FieldBadges field={f} titleFieldId={titleFieldId} amountFieldId={amountFieldId} className="ml-1" />
          {selected && <CardToolbar field={f} index={index} count={props.count} hasSettings={props.hasSettings} actions={actions} />}
        </div>

        {isSection ? (
          <>
            {selected ? labelEditor('text-[17px] font-semibold tracking-[-0.01em] leading-snug', 'Section heading') : (
              <h3 data-focus="label" className="text-[17px] font-semibold leading-snug tracking-[-0.01em]">{f.label || <span className="text-muted-foreground">Untitled section</span>}</h3>
            )}
            {selected ? <div className="mt-1">{helpEditor('Add a short introduction to this step (optional)')}</div> : f.help ? (
              <div data-focus="help"><Markdown compact className="mt-1 text-[13px] text-muted-foreground">{f.help}</Markdown></div>
            ) : null}
          </>
        ) : isContent ? (
          <>
            {selected ? labelEditor('text-[14px] font-medium', 'Title (optional)') : f.label ? <p data-focus="label" className="text-[14px] font-medium">{f.label}</p> : null}
            {selected ? <div className="mt-1">{helpEditor('Write instructions or context. Markdown works: **bold**, lists, [links](https://…).', 'text-foreground/90')}</div> : (
              <div data-focus="help">
                {f.help?.trim() ? <Markdown compact className="text-[13.5px] text-foreground/85">{f.help}</Markdown> : <p className="text-[13px] text-muted-foreground">Empty text block</p>}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-start gap-0.5">
              {selected ? (
                // An invisible copy of the text sizes the box, so the required marker stays right after the words.
                <div className="inline-grid min-w-[4ch] max-w-full text-[14px] font-medium leading-snug">
                  <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre-wrap break-words">{(f.label || 'Question') + ' '}</span>
                  {labelEditor('col-start-1 row-start-1 overflow-hidden text-[14px] font-medium leading-snug', 'Question')}
                </div>
              ) : (
                <p data-focus="label" className="min-w-0 text-[14px] font-medium leading-snug">{f.label || <span className="text-muted-foreground">Untitled question</span>}</p>
              )}
              {f.required && <span className="text-[14px] font-medium leading-snug text-tone-danger" aria-label="Required">*</span>}
            </div>
            {selected ? <div className="mt-1">{helpEditor('Help text (optional)')}</div> : f.help ? (
              <div data-focus="help"><Markdown compact className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{f.help}</Markdown></div>
            ) : null}
            <div className="mt-2.5">
              <ControlPreview field={f} selected={selected} currency={currency} actions={actions} />
            </div>
          </>
        )}

        {(logic || elig || issue) && (
          <div className="mt-3 space-y-1 border-t border-dashed pt-2.5 text-xs">
            {logic && (
              <p className="flex items-start gap-1.5 text-tone-info">
                <CornerDownRight className="mt-0.5 h-3 w-3 shrink-0" /> <span className="min-w-0">{logic}</span>
              </p>
            )}
            {elig && (
              <p className="flex items-start gap-1.5 text-tone-warning">
                <Flag className="mt-0.5 h-3 w-3 shrink-0" /> <span className="min-w-0">{elig}</span>
              </p>
            )}
            {issue && <p className="text-tone-danger">{issue}</p>}
          </div>
        )}
      </div>
    </div>
  );
});

function CardToolbar({ field: f, index, count, hasSettings, actions }: { field: FormField; index: number; count: number; hasSettings: boolean; actions: CardActions }) {
  return (
    <div data-card-toolbar className="ml-auto flex items-center gap-0.5" onMouseDown={e => e.stopPropagation()}>
      <Tip label="Move up" keys={['⌥', '↑']}>
        <IconButton size="sm" aria-label="Move up" disabled={index === 0} onClick={() => actions.nudge(f.id, -1)}><ArrowUp /></IconButton>
      </Tip>
      <Tip label="Move down" keys={['⌥', '↓']}>
        <IconButton size="sm" aria-label="Move down" disabled={index === count - 1} onClick={() => actions.nudge(f.id, 1)}><ArrowDown /></IconButton>
      </Tip>
      <Tip label="Duplicate" keys={[MOD, 'D']}>
        <IconButton size="sm" aria-label="Duplicate" onClick={() => actions.duplicate(f.id)}><Copy /></IconButton>
      </Tip>
      <Tip label="Delete" keys={['⌫']}>
        <IconButton size="sm" aria-label="Delete" className="hover:text-tone-danger" onClick={() => actions.remove(f.id)}><Trash2 /></IconButton>
      </Tip>
      {hasSettings && (
        <Tip label="Settings">
          <IconButton size="sm" aria-label="Question settings" className="lg:hidden" onClick={() => actions.openSettings?.(f.id)}><SlidersHorizontal /></IconButton>
        </Tip>
      )}
    </div>
  );
}

function InsertPoint({ field: f, index, paletteOpen, actions }: { field: FormField; index: number; paletteOpen: boolean; actions: CardActions }) {
  return (
    <div data-insert className={cn('group/insert absolute inset-x-0 -top-[11px] z-10 flex h-[16px] items-center', paletteOpen ? 'opacity-100' : 'opacity-0 hover:opacity-100 focus-within:opacity-100')}>
      <div className="h-[2px] flex-1 rounded-full bg-primary/60" />
      <FieldPalette
        open={paletteOpen}
        onOpenChange={o => actions.setPalette(o ? `before:${f.id}` : null)}
        onPick={type => actions.insert(index, type)}
        trigger={
          <button type="button" aria-label={`Add a question before ${f.label || 'this one'}`} className="mx-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Plus className="h-3.5 w-3.5" />
          </button>
        }
      />
      <div className="h-[2px] flex-1 rounded-full bg-primary/60" />
    </div>
  );
}

function kindsText(accept: string[] | undefined) {
  return accept?.length ? accept.map(k => FILE_KINDS[k]?.label ?? k).join(', ') : 'Any file type';
}

function ControlPreview(props: { field: FormField; selected: boolean; currency: string; actions: CardActions }) {
  const { field: f, selected, currency } = props;
  switch (f.type) {
    case 'short_text':
      return <div className={cn(box, 'h-10 px-3')}>{f.placeholder}</div>;
    case 'email':
    case 'url':
    case 'phone': {
      const Icon = f.type === 'email' ? AtSign : f.type === 'url' ? Link2 : Phone;
      return (
        <div className={cn(box, 'h-10 gap-2 px-3')}>
          <Icon className="h-4 w-4 text-muted-foreground" />
          {f.placeholder ?? (f.type === 'email' ? 'name@example.org' : f.type === 'url' ? 'example.org' : '')}
        </div>
      );
    }
    case 'long_text':
      return (
        <>
          <div className={cn(box, 'h-24 items-start px-3 py-2.5')}>{f.placeholder}</div>
          {(f.maxWords || f.maxLength) && (
            <p className="mt-1.5 text-right text-[12px] tabular-nums text-muted-foreground">
              {f.maxWords ? `0 / ${f.maxWords.toLocaleString()} words` : `Up to ${f.maxLength!.toLocaleString()} characters`}
            </p>
          )}
        </>
      );
    case 'number':
    case 'currency':
      return (
        <div className={cn(box, 'h-10 gap-2 px-3 tabular-nums')}>
          {f.type === 'currency' && <span className="text-muted-foreground">{currencySymbol(currency)}</span>}
          {f.placeholder ?? (f.min != null && f.max != null ? `${f.min.toLocaleString()}–${f.max.toLocaleString()}` : f.min != null ? `${f.min.toLocaleString()} or more` : f.max != null ? `Up to ${f.max.toLocaleString()}` : '')}
        </div>
      );
    case 'date':
      return (
        <div className={cn(box, 'h-10 justify-between px-3')}>
          mm/dd/yyyy <CalendarDays className="h-4 w-4 text-muted-foreground" />
        </div>
      );
    case 'single_choice':
    case 'multiple_choice':
      return selected ? <OptionsInline {...props} /> : <OptionList field={f} />;
    case 'dropdown':
      return (
        <>
          <div className={cn(box, 'h-10 justify-between px-3')}>
            {f.placeholder || 'Choose an option'} <ChevronDown className="h-4 w-4 opacity-60" />
          </div>
          {selected ? (
            <div className="mt-2.5"><OptionsInline {...props} /></div>
          ) : (
            <p className="mt-1.5 truncate text-[12px] text-muted-foreground">
              {(f.options?.length ?? 0).toLocaleString()} option{f.options?.length === 1 ? '' : 's'}: {(f.options ?? []).slice(0, 5).map(o => o.label || 'Untitled').join(', ')}
              {(f.options?.length ?? 0) > 5 ? '…' : ''}
              {f.allowOther ? ', Other' : ''}
            </p>
          )}
        </>
      );
    case 'yes_no':
      return (
        <div className="inline-flex gap-2">
          {['Yes', 'No'].map(v => (
            <span key={v} className="inline-flex h-10 min-w-[88px] items-center justify-center rounded-lg border border-input bg-background px-4 text-sm font-medium shadow-xs">{v}</span>
          ))}
        </div>
      );
    case 'file':
      return (
        <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-input bg-subtle px-4 py-4 text-center">
          <Upload className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm"><span className="font-medium text-primary">Choose a file</span> <span className="text-muted-foreground">or drag it here</span></p>
          <p className="text-xs text-muted-foreground">
            {kindsText(f.accept)}
            {f.maxSizeMb ? ` · up to ${f.maxSizeMb} MB` : ''}
            {(f.maxFiles ?? 1) > 1 ? ` · up to ${f.maxFiles} files` : ''}
          </p>
        </div>
      );
    case 'address':
      return (
        <div className="grid grid-cols-6 gap-2">
          {[['Street address', 'col-span-6'], ['Apartment, suite, etc. (optional)', 'col-span-6'], ['City', 'col-span-6 sm:col-span-3'], ['State / region', 'col-span-3'], ['Postal code', 'col-span-3 sm:col-span-2'], ['Country', 'col-span-6 sm:col-span-4']].map(([label, span]) => (
            <div key={label} className={cn(box, 'h-10 px-3', span)}>{label}</div>
          ))}
        </div>
      );
    default:
      return null;
  }
}

function Indicator({ multiple }: { multiple: boolean }) {
  return <span aria-hidden className={cn('h-[18px] w-[18px] shrink-0 border border-input bg-background', multiple ? 'rounded-[5px]' : 'rounded-full')} />;
}

function OptionList({ field: f }: { field: FormField }) {
  const multiple = f.type === 'multiple_choice';
  const options = [...(f.options ?? []), ...(f.allowOther ? [{ id: OTHER, label: 'Other' }] : [])];
  const columns = options.length > 6 && options.every(o => o.label.length < 28);
  return (
    <div className={cn('grid gap-2', columns && 'sm:grid-cols-2')}>
      {options.map(o => (
        <div key={o.id} className="flex min-h-10 items-center gap-3 rounded-lg border border-input bg-background px-3 py-2 text-sm">
          <Indicator multiple={multiple} />
          <span className="min-w-0 flex-1">{o.label || <span className="text-muted-foreground">Untitled option</span>}</span>
        </div>
      ))}
      {(f.min != null || f.max != null) && multiple && (
        <p className="text-[12px] text-muted-foreground">
          {f.min != null && f.max != null ? `Choose ${f.min}–${f.max}` : f.min != null ? `Choose at least ${f.min}` : `Choose up to ${f.max}`}
        </p>
      )}
    </div>
  );
}

/** Options you edit where they appear: Enter adds the next one, Backspace on an empty one removes it. */
function OptionsInline({ field: f, actions }: { field: FormField; actions: CardActions }) {
  const refs = useRef(new Map<string, HTMLInputElement>());
  const pending = useRef<string | null>(null);
  const options = f.options ?? [];
  const multiple = f.type === 'multiple_choice';

  useEffect(() => {
    if (!pending.current) return;
    const el = refs.current.get(pending.current);
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      pending.current = null;
    }
  });

  const set = (next: typeof options, key?: string) => actions.change(f.id, { options: next }, key);
  const addAfter = (index: number) => {
    const o = { id: newId('o'), label: '' };
    pending.current = o.id;
    set([...options.slice(0, index + 1), o, ...options.slice(index + 1)]);
  };

  return (
    <div className="space-y-1.5" onMouseDown={e => e.stopPropagation()}>
      {options.map((o, i) => (
        <div key={o.id} className="group/opt flex items-center gap-2.5 rounded-lg border border-input bg-background pl-3 pr-1 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15">
          {f.type === 'dropdown' ? <span className="w-4 text-center text-xs tabular-nums text-muted-foreground">{i + 1}</span> : <Indicator multiple={multiple} />}
          <input
            ref={el => {
              if (el) refs.current.set(o.id, el);
              else refs.current.delete(o.id);
            }}
            value={o.label}
            placeholder={`Option ${i + 1}`}
            aria-label={`Option ${i + 1}`}
            maxLength={300}
            className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            onChange={e => set(options.map(x => (x.id === o.id ? { ...x, label: e.target.value } : x)), `option:${o.id}`)}
            onPaste={e => {
              const text = e.clipboardData.getData('text');
              const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
              if (lines.length < 2) return;
              e.preventDefault();
              const added = lines.map((label, j) => ({ id: j === 0 && !o.label ? o.id : newId('o'), label }));
              const head = options.slice(0, o.label ? i + 1 : i);
              pending.current = added[added.length - 1].id;
              set([...head, ...added, ...options.slice(i + 1)]);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addAfter(i);
              } else if (e.key === 'Backspace' && !o.label && options.length > 1) {
                e.preventDefault();
                pending.current = options[i - 1]?.id ?? options[i + 1]?.id ?? null;
                set(options.filter(x => x.id !== o.id));
              } else if (e.key === 'ArrowDown' && options[i + 1]) {
                e.preventDefault();
                refs.current.get(options[i + 1].id)?.focus();
              } else if (e.key === 'ArrowUp' && options[i - 1]) {
                e.preventDefault();
                refs.current.get(options[i - 1].id)?.focus();
              } else if (e.key === 'Escape') {
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          <IconButton size="sm" aria-label={`Remove option ${i + 1}`} disabled={options.length <= 1} className="opacity-0 group-hover/opt:opacity-100 focus-visible:opacity-100" onClick={() => set(options.filter(x => x.id !== o.id))}>
            <X />
          </IconButton>
        </div>
      ))}
      {f.allowOther && (
        <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-input bg-background pl-3 pr-1">
          {f.type === 'dropdown' ? <span className="w-4" /> : <Indicator multiple={multiple} />}
          <span className="h-9 flex-1 text-sm leading-9 text-muted-foreground">Other (applicants type their own)</span>
          <IconButton size="sm" aria-label="Remove Other" onClick={() => actions.change(f.id, { allowOther: false })}><X /></IconButton>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[12.5px]">
        <button type="button" title="Tip: paste a list to add many at once" onClick={() => addAfter(options.length - 1)} className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1 py-0.5 font-medium text-primary hover:bg-primary/[0.08]">
          <Plus className="h-3.5 w-3.5" /> Add option
        </button>
        {!f.allowOther && (
          <button type="button" onClick={() => actions.change(f.id, { allowOther: true })} className="whitespace-nowrap rounded px-1 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            Add “Other”
          </button>
        )}
      </div>
    </div>
  );
}
