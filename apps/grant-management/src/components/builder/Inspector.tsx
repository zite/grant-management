import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, ClipboardPaste, Copy, CornerDownRight, EyeOff, Flag, GripVertical, Heading, Banknote, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@project/components/ui/button';
import { Checkbox } from '@project/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { cn } from '@project/components/lib/utils';
import {
  AMOUNT_TYPES, TITLE_TYPES, answerChoices, canHaveEligibility, conditionProblem, conditionSources, operatorLabel, operatorNeedsValue, operatorsFor,
} from '@project/shared/forms/builder';
import { FIELD_CATALOG } from '@project/shared/forms/catalog';
import { newId } from '@project/shared/forms/logic';
import { FILE_KINDS, isChoiceField, isInputField, type ChoiceOption, type Condition, type FormField } from '@project/shared/forms/types';
import { FieldIcon } from '@project/shared/ui/FieldIcon';
import { Markdown } from '@project/shared/ui/Markdown';
import { IconButton, Tip } from '../primitives/bits';
import { MOD } from '../../lib/hotkeys';
import { changeType, compatibleTypes, inputCount, type Draft } from './draft';
import { typeLabel } from './summaries';
import { AutoTextarea, Group, NumberField, Row, Segmented, ToggleRow, inputClass, textareaClass } from './ui';

export type InspectorProps = {
  draft: Draft;
  field: FormField | null;
  kind: string;
  blindReview: boolean;
  submissionCount: number;
  onChangeField: (id: string, patch: Partial<FormField>, key?: string) => void;
  onChangeDraft: (update: (d: Draft) => Draft, key?: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onSelect: (id: string | null) => void;
};

const selectTrigger = 'h-8 text-[13px] shadow-xs bg-background';

export function Inspector(props: InspectorProps) {
  const { field } = props;
  if (!field) return <FormOverview {...props} />;
  return <FieldInspector key={field.id} {...props} field={field} />;
}

// ── Nothing selected: the form as a whole ─────────────────────────────────

function FormOverview({ draft, kind, onChangeDraft, onSelect }: InspectorProps) {
  const fields = draft.fields;
  const stats = [
    { label: 'Questions', value: inputCount(fields) },
    { label: 'Required', value: fields.filter(f => f.required && isInputField(f)).length },
    { label: 'Steps', value: Math.max(1, fields.filter(f => f.type === 'section').length) },
  ];
  const lists = [
    { key: 'logic', icon: <CornerDownRight className="h-3.5 w-3.5 text-tone-info" />, label: 'Conditional', items: fields.filter(f => f.showIf?.fieldId) },
    { key: 'elig', icon: <Flag className="h-3.5 w-3.5 text-tone-warning" />, label: 'Eligibility screening', items: fields.filter(f => f.eligibility?.disqualifyValues?.length) },
    { key: 'hidden', icon: <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />, label: 'Hidden from reviewers', items: fields.filter(f => f.hideFromReviewers) },
  ];
  const titleOptions = fields.filter(f => TITLE_TYPES.includes(f.type));
  const amountOptions = fields.filter(f => AMOUNT_TYPES.includes(f.type));
  return (
    <div>
      <Group title="This form">
        <div className="grid grid-cols-3 gap-2">
          {stats.map(s => (
            <div key={s.label} className="rounded-md border bg-subtle px-2.5 py-2">
              <div className="text-[15px] font-semibold tabular-nums">{s.value}</div>
              <div className="text-2xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Select a question to edit it, or press <kbd className="kbd">A</kbd> to add one.</p>
      </Group>
      {kind === 'Application' && (
        <Group title="Submission details">
          <Row label="Submission title" hint="Lists and emails name each submission by this answer.">
            <Select value={draft.titleFieldId ?? '__none'} onValueChange={v => onChangeDraft(d => ({ ...d, titleFieldId: v === '__none' ? null : v }))}>
              <SelectTrigger className={selectTrigger} aria-label="Submission title question"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none" className="text-[13px]">None — use the applicant’s name</SelectItem>
                {titleOptions.map(f => <SelectItem key={f.id} value={f.id} className="text-[13px]">{f.label || 'Untitled question'}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Requested amount" hint="Shown on each submission and used in funding totals.">
            <Select value={draft.amountFieldId ?? '__none'} onValueChange={v => onChangeDraft(d => ({ ...d, amountFieldId: v === '__none' ? null : v }))}>
              <SelectTrigger className={selectTrigger} aria-label="Requested amount question"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none" className="text-[13px]">None</SelectItem>
                {amountOptions.map(f => <SelectItem key={f.id} value={f.id} className="text-[13px]">{f.label || 'Untitled question'}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>
        </Group>
      )}
      {lists.map(l => (
        <Group key={l.key} title={<span className="inline-flex items-center gap-1.5">{l.icon}{l.label} <span className="tabular-nums">{l.items.length}</span></span>}>
          {l.items.length ? (
            <ul className="-mx-2 space-y-px">
              {l.items.map(f => (
                <li key={f.id}>
                  <button type="button" onClick={() => onSelect(f.id)} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-accent">
                    <FieldIcon type={f.type} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{f.label || 'Untitled question'}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">None yet.</p>
          )}
        </Group>
      ))}
    </div>
  );
}

// ── A selected question ───────────────────────────────────────────────────

function FieldInspector({ draft, field: f, kind, blindReview, submissionCount, onChangeField, onChangeDraft, onDuplicate, onRemove }: InspectorProps & { field: FormField }) {
  const set = (patch: Partial<FormField>, key?: string) => onChangeField(f.id, patch, key);
  const input = isInputField(f);
  const types = compatibleTypes(f.type);
  const [helpPreview, setHelpPreview] = useState(false);

  return (
    <div>
      <div className="flex h-11 items-center gap-2 border-b px-4">
        <span className="flex h-6 w-6 items-center justify-center rounded-md border bg-subtle text-muted-foreground"><FieldIcon type={f.type} className="h-3.5 w-3.5" /></span>
        {types.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="ghost-chip -ml-1 h-7 font-medium">{typeLabel(f)} <span className="text-muted-foreground">▾</span></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {types.map(t => (
                <DropdownMenuItem key={t} disabled={t === f.type} className="gap-2 text-[13px]" onSelect={() => onChangeField(f.id, changeType(f, t))}>
                  <FieldIcon type={t} className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1">{FIELD_CATALOG[t].label}</span>
                </DropdownMenuItem>
              ))}
              {submissionCount > 0 && <p className="px-2 pb-1.5 pt-1 text-2xs text-muted-foreground">Existing answers are kept.</p>}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="text-[13px] font-medium">{typeLabel(f)}</span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <Tip label="Duplicate" keys={[MOD, 'D']}>
            <IconButton aria-label="Duplicate question" onClick={() => onDuplicate(f.id)}><Copy /></IconButton>
          </Tip>
          <Tip label="Delete" keys={['⌫']}>
            <IconButton aria-label="Delete question" className="hover:text-tone-danger" onClick={() => onRemove(f.id)}><Trash2 /></IconButton>
          </Tip>
        </div>
      </div>

      <Group title={f.type === 'section' ? 'Section' : f.type === 'content' ? 'Text block' : 'Question'}>
        <Row label={f.type === 'section' ? 'Heading' : f.type === 'content' ? 'Title (optional)' : 'Label'} htmlFor={`label-${f.id}`}>
          <AutoTextarea id={`label-${f.id}`} value={f.label} maxLength={500} className={textareaClass} onChange={e => set({ label: e.target.value.replace(/\n/g, ' ') }, `label:${f.id}`)} />
        </Row>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor={`help-${f.id}`} className="text-[12.5px] font-medium">{f.type === 'content' ? 'Text' : f.type === 'section' ? 'Introduction' : 'Help text'}</label>
            <Segmented size="sm" value={helpPreview ? 'preview' : 'write'} onChange={v => setHelpPreview(v === 'preview')} options={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]} />
          </div>
          {helpPreview ? (
            <div className="min-h-[64px] rounded-md border bg-subtle px-2.5 py-2">
              {f.help?.trim() ? <Markdown compact className="text-[13px]">{f.help}</Markdown> : <p className="text-xs text-muted-foreground">Nothing to preview.</p>}
            </div>
          ) : (
            <AutoTextarea id={`help-${f.id}`} value={f.help ?? ''} minRows={f.type === 'content' ? 4 : 2} className={textareaClass} placeholder={f.type === 'content' ? 'Instructions or context for applicants' : f.type === 'section' ? 'Optional introduction shown at the top of this step' : 'Optional guidance under the question'} onChange={e => set({ help: e.target.value }, `help:${f.id}`)} />
          )}
          <p className="text-2xs text-muted-foreground">Markdown: **bold**, _italic_, lists and [links](https://example.org).</p>
        </div>
        {input && (
          <>
            {['short_text', 'long_text', 'email', 'phone', 'url', 'number', 'currency', 'dropdown'].includes(f.type) && (
              <Row label="Placeholder" htmlFor={`ph-${f.id}`}>
                <input id={`ph-${f.id}`} className={inputClass} value={f.placeholder ?? ''} maxLength={200} placeholder="Shown inside the empty box" onChange={e => set({ placeholder: e.target.value || undefined }, `ph:${f.id}`)} />
              </Row>
            )}
            <ToggleRow id={`req-${f.id}`} label="Required" checked={Boolean(f.required)} onChange={v => set({ required: v })} description={f.eligibility ? 'Screening questions should be required.' : undefined} />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-medium">Width</span>
              <Segmented size="sm" value={f.width === 'half' ? 'half' : 'full'} onChange={v => set({ width: v === 'half' ? 'half' : undefined })} options={[{ value: 'full', label: 'Full' }, { value: 'half', label: 'Half' }]} />
            </div>
          </>
        )}
      </Group>

      {isChoiceField(f) && (
        <Group title="Options">
          <OptionsEditor field={f} onChange={(options, key) => set({ options }, key)} />
          <ToggleRow id={`other-${f.id}`} label="Allow “Other”" description="Adds an Other option with a text box." checked={Boolean(f.allowOther)} onChange={v => set({ allowOther: v || undefined })} />
          {f.type === 'multiple_choice' && (
            <div className="grid grid-cols-2 gap-2">
              <Row label="Min selections"><NumberField ariaLabel="Minimum selections" value={f.min} min={0} max={500} placeholder="None" onChange={v => set({ min: v || null })} /></Row>
              <Row label="Max selections"><NumberField ariaLabel="Maximum selections" value={f.max} min={1} max={500} placeholder="None" onChange={v => set({ max: v })} /></Row>
            </div>
          )}
        </Group>
      )}

      {(f.type === 'number' || f.type === 'currency') && (
        <Group title="Limits">
          <div className="grid grid-cols-2 gap-2">
            <Row label="Minimum"><NumberField ariaLabel="Minimum value" integer={false} value={f.min} placeholder="None" onChange={v => set({ min: v }, `min:${f.id}`)} invalid={f.min != null && f.max != null && f.min > f.max} /></Row>
            <Row label="Maximum"><NumberField ariaLabel="Maximum value" integer={false} value={f.max} placeholder="None" onChange={v => set({ max: v }, `max:${f.id}`)} invalid={f.min != null && f.max != null && f.min > f.max} /></Row>
          </div>
          {f.min != null && f.max != null && f.min > f.max && <p className="text-xs text-tone-danger">The minimum is larger than the maximum.</p>}
        </Group>
      )}

      {(f.type === 'short_text' || f.type === 'long_text') && (
        <Group title="Length">
          <div className="grid grid-cols-2 gap-2">
            {f.type === 'long_text' && <Row label="Word limit"><NumberField ariaLabel="Word limit" value={f.maxWords} min={1} max={10000} placeholder="None" suffix="words" onChange={v => set({ maxWords: v }, `words:${f.id}`)} /></Row>}
            <Row label="Character limit"><NumberField ariaLabel="Character limit" value={f.maxLength} min={1} max={20000} placeholder="None" suffix="chars" onChange={v => set({ maxLength: v }, `chars:${f.id}`)} /></Row>
          </div>
        </Group>
      )}

      {f.type === 'file' && (
        <Group title="Files">
          <div className="space-y-1.5">
            <span className="text-[12.5px] font-medium">Accepted types</span>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(FILE_KINDS).map(([key, kind]) => {
                const on = (f.accept ?? []).includes(key);
                return (
                  <label key={key} className="flex h-7 cursor-pointer items-center gap-2 rounded-md px-1 text-[13px] hover:bg-accent">
                    <Checkbox checked={on} onCheckedChange={v => set({ accept: v ? [...(f.accept ?? []), key] : (f.accept ?? []).filter(k => k !== key) })} />
                    {kind.label}
                  </label>
                );
              })}
            </div>
            <p className="text-2xs text-muted-foreground">{f.accept?.length ? `.${f.accept.flatMap(k => FILE_KINDS[k]?.extensions ?? []).join(', .')}` : 'None ticked means any file type.'}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Max files"><NumberField ariaLabel="Maximum files" value={f.maxFiles} min={1} max={20} placeholder="1" onChange={v => set({ maxFiles: v })} /></Row>
            <Row label="Max size"><NumberField ariaLabel="Maximum size in MB" value={f.maxSizeMb} min={1} max={100} placeholder="None" suffix="MB" onChange={v => set({ maxSizeMb: v })} /></Row>
          </div>
        </Group>
      )}

      {f.type !== 'content' && <LogicEditor draft={draft} field={f} onChange={showIf => set({ showIf })} />}

      {canHaveEligibility(f) && <EligibilityEditor field={f} onChange={eligibility => set({ eligibility, ...(eligibility && !f.required ? { required: true } : {}) }, `elig:${f.id}`)} />}

      {input && (
        <Group title="Privacy">
          <ToggleRow
            id={`hide-${f.id}`}
            label="Hide from reviewers"
            description={`Reviewers never see this answer${blindReview ? ' (this program also hides applicant names)' : ''}. Use it for names, contact details and demographics.`}
            checked={Boolean(f.hideFromReviewers)}
            onChange={v => set({ hideFromReviewers: v || undefined })}
          />
        </Group>
      )}

      {kind === 'Application' && (TITLE_TYPES.includes(f.type) || AMOUNT_TYPES.includes(f.type)) && (
        <Group title="Submission details">
          {TITLE_TYPES.includes(f.type) && (
            <MappingToggle
              id={`title-${f.id}`}
              icon={<Heading className="h-3.5 w-3.5 text-tone-accent" />}
              label="Use as the submission title"
              current={draft.titleFieldId}
              fieldId={f.id}
              fields={draft.fields}
              onChange={on => onChangeDraft(d => ({ ...d, titleFieldId: on ? f.id : null }))}
            />
          )}
          {AMOUNT_TYPES.includes(f.type) && (
            <MappingToggle
              id={`amount-${f.id}`}
              icon={<Banknote className="h-3.5 w-3.5 text-tone-success" />}
              label="Use as the requested amount"
              current={draft.amountFieldId}
              fieldId={f.id}
              fields={draft.fields}
              onChange={on => onChangeDraft(d => ({ ...d, amountFieldId: on ? f.id : null }))}
            />
          )}
          <p className="text-2xs text-muted-foreground">Applies to applications saved from now on.</p>
        </Group>
      )}

      <div className="flex items-center gap-2 px-4 py-4">
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[12.5px]" onClick={() => onDuplicate(f.id)}><Copy className="!h-3.5 !w-3.5" /> Duplicate</Button>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[12.5px] text-tone-danger hover:text-tone-danger" onClick={() => onRemove(f.id)}><Trash2 className="!h-3.5 !w-3.5" /> Delete</Button>
        <span className="ml-auto truncate font-mono text-2xs text-muted-foreground" title="Question id — answers are stored under it">{f.id}</span>
      </div>
    </div>
  );
}

function MappingToggle({ id, icon, label, current, fieldId, fields, onChange }: { id: string; icon: React.ReactNode; label: string; current: string | null; fieldId: string; fields: FormField[]; onChange: (on: boolean) => void }) {
  const other = current && current !== fieldId ? fields.find(x => x.id === current) : null;
  return (
    <ToggleRow
      id={id}
      label={<span className="inline-flex items-center gap-1.5">{icon}{label}</span>}
      description={other ? `Currently “${other.label || 'Untitled question'}”. Turning this on replaces it.` : undefined}
      checked={current === fieldId}
      onChange={onChange}
    />
  );
}

// ── Options ───────────────────────────────────────────────────────────────

function OptionsEditor({ field, onChange }: { field: FormField; onChange: (options: ChoiceOption[], key?: string) => void }) {
  const options = field.options ?? [];
  const [bulk, setBulk] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const dupes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const o of options) {
      const k = o.label.trim().toLowerCase();
      if (k) seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [options]);

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = options.findIndex(o => o.id === e.active.id);
    const to = options.findIndex(o => o.id === e.over!.id);
    if (from >= 0 && to >= 0) onChange(arrayMove(options, from, to));
  };

  const applyBulk = () => {
    if (bulk === null) return;
    const byLabel = new Map(options.map(o => [o.label.trim().toLowerCase(), o]));
    const lines = bulk.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 500);
    // Lines that match an existing option keep its id, so answers and conditions that refer to it survive.
    const next = lines.map(label => {
      const hit = byLabel.get(label.toLowerCase());
      if (hit) byLabel.delete(label.toLowerCase());
      return hit ? { ...hit, label } : { id: newId('o'), label };
    });
    if (next.length) onChange(next);
    setBulk(null);
  };

  if (bulk !== null) {
    return (
      <div className="space-y-2">
        <AutoTextarea autoFocus value={bulk} minRows={6} maxHeight={320} className={textareaClass} aria-label="Options, one per line" onChange={e => setBulk(e.target.value)} />
        <p className="text-2xs text-muted-foreground">One option per line. Options you keep stay linked to existing answers.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-[12.5px]" onClick={() => setBulk(null)}>Cancel</Button>
          <Button size="sm" className="h-7 text-[12.5px]" onClick={applyBulk} disabled={!bulk.trim()}>Replace options</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={options.map(o => o.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {options.map((o, i) => (
              <SortableOption
                key={o.id}
                option={o}
                index={i}
                duplicate={dupes.has(o.label.trim().toLowerCase())}
                canRemove={options.length > 1}
                onLabel={label => onChange(options.map(x => (x.id === o.id ? { ...x, label } : x)), `option:${o.id}`)}
                onRemove={() => onChange(options.filter(x => x.id !== o.id))}
                onEnter={() => onChange([...options.slice(0, i + 1), { id: newId('o'), label: '' }, ...options.slice(i + 1)])}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {dupes.size > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-tone-warning"><AlertTriangle className="h-3.5 w-3.5" /> Some options have the same label.</p>
      )}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[12.5px]" onClick={() => onChange([...options, { id: newId('o'), label: `Option ${options.length + 1}` }])}>
          <Plus className="!h-3.5 !w-3.5" /> Add option
        </Button>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[12.5px] text-muted-foreground" onClick={() => setBulk(options.map(o => o.label).join('\n'))}>
          <ClipboardPaste className="!h-3.5 !w-3.5" /> Edit as list
        </Button>
      </div>
    </div>
  );
}

function SortableOption({ option, index, duplicate, canRemove, onLabel, onRemove, onEnter }: { option: ChoiceOption; index: number; duplicate: boolean; canRemove: boolean; onLabel: (l: string) => void; onRemove: () => void; onEnter: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: option.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn('group/o flex items-center gap-1', isDragging && 'relative z-10 opacity-60')}>
      <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Reorder option ${index + 1}`} style={{ touchAction: 'none' }} className="flex h-8 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing">
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <input
        value={option.label}
        aria-label={`Option ${index + 1}`}
        aria-invalid={!option.label.trim() || duplicate || undefined}
        placeholder={`Option ${index + 1}`}
        maxLength={300}
        className={inputClass}
        onChange={e => onLabel(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onEnter();
          }
        }}
      />
      <IconButton size="sm" aria-label={`Remove option ${index + 1}`} disabled={!canRemove} onClick={onRemove}><X /></IconButton>
    </div>
  );
}

// ── Conditional logic ─────────────────────────────────────────────────────

function defaultCondition(source: FormField): Condition {
  const op = operatorsFor(source.type)[0];
  const value = source.type === 'yes_no' ? 'yes' : isChoiceField(source) ? source.options?.[0]?.id ?? null : null;
  return { fieldId: source.id, operator: op, ...(operatorNeedsValue(op) && value != null ? { value } : {}) };
}

function LogicEditor({ draft, field, onChange }: { draft: Draft; field: FormField; onChange: (c: Condition | null) => void }) {
  const sources = conditionSources(draft.fields, field.id);
  const c = field.showIf?.fieldId ? field.showIf : null;
  const source = c ? draft.fields.find(f => f.id === c.fieldId) : undefined;
  const problem = c ? conditionProblem(draft.fields, field) : null;
  const noun = field.type === 'section' ? 'section' : 'question';

  // Group sources under their sections so long forms stay navigable.
  const grouped = useMemo(() => {
    const groups: Array<{ title: string; items: FormField[] }> = [];
    let current = { title: 'Start of form', items: [] as FormField[] };
    const index = draft.fields.findIndex(f => f.id === field.id);
    for (const f of draft.fields.slice(0, Math.max(0, index))) {
      if (f.type === 'section') {
        if (current.items.length) groups.push(current);
        current = { title: f.label || 'Untitled section', items: [] };
      } else if (isInputField(f)) current.items.push(f);
    }
    if (current.items.length) groups.push(current);
    return groups;
  }, [draft.fields, field.id]);

  return (
    <Group
      title="Conditional logic"
      action={c ? <button type="button" onClick={() => onChange(null)} className="text-xs text-muted-foreground hover:text-foreground">Remove</button> : undefined}
    >
      {!c ? (
        sources.length ? (
          <>
            <p className="text-xs text-muted-foreground">Always shown. Add a condition to show this {noun} only for some answers{field.type === 'section' ? ' — everything in the section is skipped otherwise' : ''}.</p>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[12.5px]" onClick={() => onChange(defaultCondition(sources.find(s => isChoiceField(s) || s.type === 'yes_no') ?? sources[sources.length - 1]))}>
              <CornerDownRight className="!h-3.5 !w-3.5" /> Add condition
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Conditions can only depend on questions that come before this {noun}. Move it lower or add a question above it first.</p>
        )
      ) : (
        <div className="space-y-2">
          <p className="text-[12.5px] font-medium">Show this {noun} when</p>
          <Select
            value={source && sources.some(s => s.id === source.id) ? source.id : undefined}
            onValueChange={id => {
              const next = sources.find(s => s.id === id);
              if (next) onChange(defaultCondition(next));
            }}
          >
            <SelectTrigger className={cn(selectTrigger, '[&>span]:truncate')} aria-label="Question the condition depends on">
              <SelectValue placeholder="Choose a question" />
            </SelectTrigger>
            <SelectContent className="max-h-80 max-w-[340px]">
              {grouped.map(g => (
                <SelectGroup key={g.title}>
                  <SelectLabel className="truncate text-2xs font-medium text-muted-foreground">{g.title}</SelectLabel>
                  {g.items.map(s => (
                    <SelectItem key={s.id} value={s.id} className="text-[13px]">
                      <span className="flex min-w-0 items-center gap-2">
                        <FieldIcon type={s.type} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{s.label || 'Untitled question'}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          {source && sources.some(s => s.id === source.id) && (
            <ConditionValue source={source} condition={c} onChange={onChange} />
          )}
          {problem && (
            <p className="flex items-start gap-1.5 rounded-md border border-tone-danger/30 bg-tone-danger/[0.06] px-2.5 py-2 text-xs text-tone-danger">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{problem} It will be removed when you save unless you fix it.</span>
            </p>
          )}
        </div>
      )}
    </Group>
  );
}

function ConditionValue({ source, condition: c, onChange }: { source: FormField; condition: Condition; onChange: (c: Condition) => void }) {
  const ops = operatorsFor(source.type);
  const op = ops.includes(c.operator) ? c.operator : ops[0];
  const [text, setText] = useState(c.value == null ? '' : String(c.value));
  useEffect(() => setText(c.value == null ? '' : String(c.value)), [c.fieldId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setOp = (next: typeof op) => {
    const keep = operatorNeedsValue(next);
    const base: Condition = { fieldId: c.fieldId, operator: next };
    if (!keep) return onChange(base);
    const value = c.value ?? (source.type === 'yes_no' ? 'yes' : isChoiceField(source) ? source.options?.[0]?.id : undefined);
    onChange(value == null ? base : { ...base, value });
  };

  return (
    <div className="space-y-2">
      <Select value={op} onValueChange={v => setOp(v as typeof op)}>
        <SelectTrigger className={selectTrigger} aria-label="Comparison"><SelectValue /></SelectTrigger>
        <SelectContent>
          {ops.map(o => <SelectItem key={o} value={o} className="text-[13px]">{operatorLabel(o, source.type)}</SelectItem>)}
        </SelectContent>
      </Select>
      {operatorNeedsValue(op) && (
        source.type === 'yes_no' ? (
          <Segmented value={c.value === 'no' ? 'no' : 'yes'} onChange={v => onChange({ ...c, operator: op, value: v })} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
        ) : isChoiceField(source) ? (
          <Select value={source.options?.some(o => o.id === String(c.value)) ? String(c.value) : undefined} onValueChange={v => onChange({ ...c, operator: op, value: v })}>
            <SelectTrigger className={selectTrigger} aria-label="Answer"><SelectValue placeholder="Choose an option" /></SelectTrigger>
            <SelectContent className="max-h-72">
              {(source.options ?? []).map(o => <SelectItem key={o.id} value={o.id} className="text-[13px]">{o.label || 'Untitled option'}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : source.type === 'number' || source.type === 'currency' ? (
          <NumberField ariaLabel="Value" integer={false} value={c.value == null || c.value === '' ? null : Number(c.value)} placeholder="A number" onChange={v => onChange({ ...c, operator: op, ...(v == null ? { value: null } : { value: v }) })} />
        ) : (
          <input
            className={inputClass}
            aria-label="Answer"
            value={text}
            placeholder="Exact answer"
            onChange={e => {
              setText(e.target.value);
              onChange({ ...c, operator: op, value: e.target.value });
            }}
          />
        )
      )}
    </div>
  );
}

// ── Eligibility ───────────────────────────────────────────────────────────

function EligibilityEditor({ field, onChange }: { field: FormField; onChange: (e: FormField['eligibility']) => void }) {
  const rule = field.eligibility;
  const on = Boolean(rule);
  const choices = answerChoices(field);
  const values = new Set(rule?.disqualifyValues ?? []);
  const toggle = (id: string, v: boolean) => {
    const next = choices.map(c => c.id).filter(cid => (cid === id ? v : values.has(cid)));
    onChange({ disqualifyValues: next, ...(rule?.message ? { message: rule.message } : {}) });
  };
  const all = choices.length > 0 && choices.every(c => values.has(c.id)) && !field.allowOther;
  return (
    <Group title="Eligibility">
      <ToggleRow
        id={`elig-${field.id}`}
        label="Screen applicants with this question"
        description="Applicants who choose a disqualifying answer see your message and can't submit."
        checked={on}
        onChange={v => onChange(v ? { disqualifyValues: [], message: '' } : null)}
      />
      {on && (
        <>
          <div className="space-y-1">
            <span className="text-[12.5px] font-medium">Not eligible if the answer is</span>
            {choices.map(c => (
              <label key={c.id} className="flex min-h-7 cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-[13px] hover:bg-accent">
                <Checkbox checked={values.has(c.id)} onCheckedChange={v => toggle(c.id, Boolean(v))} />
                <span className="min-w-0 flex-1 truncate">{c.label || 'Untitled option'}</span>
              </label>
            ))}
            {!values.size && <p className="text-xs text-muted-foreground">Tick at least one answer, or turn screening off.</p>}
            {all && <p className="text-xs text-tone-danger">Every answer disqualifies — leave at least one eligible.</p>}
          </div>
          <Row label="Message applicants see" htmlFor={`elig-msg-${field.id}`}>
            <AutoTextarea
              id={`elig-msg-${field.id}`}
              value={rule?.message ?? ''}
              minRows={3}
              maxLength={500}
              className={textareaClass}
              placeholder="Explain why, and where they might apply instead."
              onChange={e => onChange({ disqualifyValues: [...values], message: e.target.value })}
            />
          </Row>
          {values.size > 0 && (
            <div role="note" className="flex gap-2 rounded-lg border border-tone-warning/30 bg-tone-warning/[0.07] px-3 py-2 text-[12.5px]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tone-warning" />
              <span>{rule?.message?.trim() || "Based on this answer, you aren't eligible for this program."}</span>
            </div>
          )}
        </>
      )}
    </Group>
  );
}

