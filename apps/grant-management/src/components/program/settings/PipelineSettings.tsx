import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, ChevronDown, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { saveStage } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { Input } from '@project/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { cn } from '@project/components/lib/utils';
import { STAGE_COLORS, STAGE_KIND_DEFAULT_COLOR } from '@project/shared/programSetup';
import { STAGE_KIND_META } from '../../../lib/constants';
import { plural } from '../../../lib/format';
import { useSubmissions } from '../../../lib/queries';
import type { Bootstrap, Program, Stage } from '../../../lib/types';
import { useWorkspace } from '../../../lib/workspace';
import { IconButton, Tip } from '../../primitives/bits';
import { StageGlyph } from '../../primitives/icons';
import { ColorPopover, Field, InlineInput, PageTitle, SettingsSection, inputClass, selectItemClass, selectTriggerClass } from '../fields';
import { useProgramMutation } from '../programData';

const KINDS = ['Intake', 'Review', 'Decision'] as const;
type Kind = (typeof KINDS)[number];

const KIND_ABOUT: Record<Kind, string> = {
  Intake: 'Where submissions land and get screened. No scoring.',
  Review: 'Reviewers score with a rubric. Entering it assigns reviewers from the pool.',
  Decision: 'Final discussion. Decisions are recorded here and released when ready.',
};

const patchStage = (id: string, patch: Partial<Stage>) => (data: Bootstrap): Bootstrap => ({ ...data, stages: data.stages.map(s => (s.id === id ? { ...s, ...patch } : s)) });

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

type RowActions = {
  rename: (s: Stage, name: string) => void;
  describe: (s: Stage, d: string) => void;
  recolor: (s: Stage, c: string) => void;
  retype: (s: Stage, k: Kind) => void;
  setRubric: (s: Stage, rubricId: string | null) => void;
  remove: (s: Stage) => void;
  onlyOne: boolean;
};

function KindMenu({ stage, onPick }: { stage: Stage; onPick: (k: Kind) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex h-7 w-full items-center gap-1.5 rounded-md border border-transparent px-2 text-[12.5px] text-muted-foreground hover:border-border hover:text-foreground data-[state=open]:border-border">
          <span className="truncate">{stage.kind}</span>
          <ChevronDown className="ml-auto h-3 w-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-2xs font-medium text-muted-foreground">What happens in this stage</DropdownMenuLabel>
        {KINDS.map(k => (
          <DropdownMenuItem key={k} className="items-start gap-2 py-2 text-[13px]" onSelect={() => k !== stage.kind && onPick(k)}>
            <StageGlyph kind={k} color={stage.color} className="mt-0.5" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{STAGE_KIND_META[k]?.label ?? k}</span>
              <span className="block text-xs text-muted-foreground">{KIND_ABOUT[k]}</span>
            </span>
            {k === stage.kind && <Check className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RubricMenu({ stage, programId, onPick }: { stage: Stage; programId: string; onPick: (id: string | null) => void }) {
  const ws = useWorkspace();
  const rubrics = ws.rubrics.filter(r => r.programId === programId);
  const current = stage.rubricId ? ws.rubricById.get(stage.rubricId) : undefined;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-7 w-full items-center gap-1.5 rounded-md border border-transparent px-2 text-[12.5px] hover:border-border data-[state=open]:border-border',
            current ? 'text-muted-foreground hover:text-foreground' : 'text-tone-warning',
          )}
        >
          <span className="truncate">{current ? current.name : 'Choose a rubric'}</span>
          <ChevronDown className="ml-auto h-3 w-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-2xs font-medium text-muted-foreground">Reviewers score with</DropdownMenuLabel>
        {rubrics.map(r => (
          <DropdownMenuItem key={r.id} className="text-[13px]" onSelect={() => onPick(r.id)}>
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            <span className="text-xs text-muted-foreground">{plural(r.criteria.length, 'criterion', 'criteria')}</span>
            {r.id === stage.rubricId && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
          </DropdownMenuItem>
        ))}
        {rubrics.length === 0 && <div className="px-2 py-2 text-xs text-muted-foreground">No rubrics yet — add one in Review.</div>}
        {current && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-[13px] text-muted-foreground" onSelect={() => onPick(null)}>
              No rubric
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StageRow({ stage, stages, actions, handle, programId }: { stage: Stage; stages: Stage[]; actions: RowActions; handle: ReactNode; programId: string }) {
  const index = stages.findIndex(s => s.id === stage.id);
  return (
    <div className="grid grid-cols-[16px_28px_minmax(0,1fr)_28px] items-center gap-x-1 gap-y-0.5 py-2 pl-1.5 pr-2 sm:grid-cols-[16px_28px_minmax(0,1fr)_112px_150px_44px_28px]">
      <div className="row-span-2 self-start pt-0.5 sm:row-span-1 sm:self-center sm:pt-0">{handle}</div>
      <ColorPopover value={stage.color} colors={STAGE_COLORS} onChange={c => actions.recolor(stage, c)}>
        <button type="button" aria-label={`Colour of ${stage.name}`} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent data-[state=open]:bg-accent">
          <StageGlyph kind={stage.kind} color={stage.color} fraction={(index + 1) / (stages.length + 1)} />
        </button>
      </ColorPopover>
      <div className="min-w-0">
        <InlineInput value={stage.name} required maxLength={60} aria-label="Stage name" className="font-medium" onCommit={name => actions.rename(stage, name)} />
      </div>
      <div className="col-start-3 row-start-2 flex min-w-0 gap-1 sm:col-start-auto sm:row-start-auto sm:contents">
        <div className="w-[112px] shrink-0 sm:w-auto">
          <KindMenu stage={stage} onPick={k => actions.retype(stage, k)} />
        </div>
        <div className="min-w-0 flex-1 sm:flex-none">{stage.kind === 'Review' ? <RubricMenu stage={stage} programId={programId} onPick={id => actions.setRubric(stage, id)} /> : <span className="hidden px-2 text-xs text-muted-foreground/70 sm:block">No scoring</span>}</div>
      </div>
      <Tip label={`${plural(stage.count, 'submission')} in this stage now`}>
        <span className="hidden text-right text-xs tabular-nums text-muted-foreground sm:block">{stage.count}</span>
      </Tip>
      <div className="col-start-4 row-start-1 sm:col-start-auto sm:row-start-auto">
        <Tip label={actions.onlyOne ? 'A program needs at least one stage' : `Delete ${stage.name}`}>
          <span>
            <IconButton aria-label={`Delete ${stage.name}`} disabled={actions.onlyOne} onClick={() => actions.remove(stage)} className="hover:text-tone-danger">
              <Trash2 />
            </IconButton>
          </span>
        </Tip>
      </div>
      <div className="col-span-1 col-start-3 sm:col-span-4 sm:col-start-3">
        <InlineInput value={stage.description} maxLength={300} placeholder="Add a description for your team" aria-label={`Description of ${stage.name}`} className="h-7 text-[12.5px] text-muted-foreground focus:text-foreground" onCommit={d => actions.describe(stage, d)} />
      </div>
    </div>
  );
}

function SortableStageRow(props: { stage: Stage; stages: Stage[]; actions: RowActions; programId: string }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: props.stage.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn('relative bg-background', isDragging && 'z-10 opacity-40')}>
      <StageRow
        {...props}
        handle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${props.stage.name}`}
            style={{ touchAction: 'none' }}
            className="flex h-7 w-4 cursor-grab items-center justify-center rounded text-muted-foreground hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        }
      />
    </div>
  );
}

/** A static copy for the drag overlay — never the sortable itself, or dnd-kit registers the id twice. */
function StageRowPreview({ stage, stages }: { stage: Stage; stages: Stage[] }) {
  const index = stages.findIndex(s => s.id === stage.id);
  return (
    <div className="flex h-11 cursor-grabbing items-center gap-2 rounded-md border bg-background pl-1.5 pr-3 shadow-lg">
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="flex w-7 justify-center">
        <StageGlyph kind={stage.kind} color={stage.color} fraction={(index + 1) / (stages.length + 1)} />
      </span>
      <span className="truncate text-[13px] font-medium">{stage.name}</span>
      <span className="ml-auto text-xs text-muted-foreground">{stage.kind}</span>
    </div>
  );
}

function DeleteStageDialog({ stage: requested, stages, programId, onOpenChange }: { stage: Stage | null; stages: Stage[]; programId: string; onOpenChange: (o: boolean) => void }) {
  const run = useProgramMutation();
  const last = useRef(requested);
  if (requested) last.current = requested;
  const stage = requested ?? last.current;
  const others = stages.filter(s => s.id !== stage?.id);
  const index = stage ? stages.findIndex(s => s.id === stage.id) : -1;
  const fallback = others[Math.max(0, Math.min(index, others.length - 1))] ?? others[0];
  const [target, setTarget] = useState<string | undefined>(fallback?.id);
  const [saving, setSaving] = useState(false);
  const counts = useSubmissions(
    { programIds: [programId], stageIds: [stage?.id ?? '__none__'], statuses: ['Draft', 'Submitted', 'Accepted', 'Waitlisted', 'Declined', 'Withdrawn'] },
    'submitted_desc',
    { enabled: Boolean(requested) },
  );
  const rows = counts.data?.submissions ?? [];
  const inReview = rows.filter(r => r.status === 'Submitted').length;
  const counting = counts.isPending || counts.isPlaceholderData;
  const destination = others.find(s => s.id === target);

  useEffect(() => {
    if (requested) setTarget(fallback?.id);
  }, [requested?.id]);

  const submit = async () => {
    if (!stage || saving) return;
    if (rows.length > 0 && !target) return;
    setSaving(true);
    const res = await run(() => saveStage({ action: 'delete', id: stage.id, moveToStageId: rows.length ? target : undefined }), {
      optimistic: data => ({ ...data, stages: data.stages.filter(s => s.id !== stage.id) }),
      success: r => (r.moved ? `Deleted “${stage.name}” · moved ${plural(r.moved, 'submission')} to “${destination?.name ?? 'another stage'}”` : `Deleted “${stage.name}”`),
      error: "Couldn't delete the stage",
      submissions: true,
    });
    setSaving(false);
    if (res) onOpenChange(false);
  };

  return (
    <Dialog open={Boolean(requested)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-5">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Delete “{stage?.name}”?</DialogTitle>
          <DialogDescription asChild>
            <div className="text-[13px] text-muted-foreground">
              {counting ? (
                <span className="skeleton inline-block h-3.5 w-56 align-middle" />
              ) : rows.length === 0 ? (
                'No submissions are in this stage, so nothing needs to move.'
              ) : (
                <>
                  <span className="font-medium text-foreground">{plural(rows.length, 'submission')}</span> {rows.length === 1 ? 'is' : 'are'} in this stage
                  {inReview !== rows.length ? `, ${inReview} still in review` : ''}. Choose where {rows.length === 1 ? 'it goes' : 'they go'}.
                </>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        {!counting && rows.length > 0 && (
          <Field
            label={`Move ${plural(rows.length, 'submission')} to`}
            htmlFor="move-stage"
            hint={destination?.kind === 'Review' ? 'Entering a review stage assigns reviewers from the pool, and open reviews from this stage move with them.' : undefined}
          >
            <Select value={target ?? ''} onValueChange={setTarget}>
              <SelectTrigger id="move-stage" className={cn(selectTriggerClass, '[&>span]:flex [&>span]:items-center [&>span]:gap-2')}>
                <SelectValue placeholder="Choose a stage" />
              </SelectTrigger>
              <SelectContent>
                {others.map((s, i) => (
                  <SelectItem key={s.id} value={s.id} className={selectItemClass}>
                    <span className="flex items-center gap-2">
                      <StageGlyph kind={s.kind} color={s.color} fraction={(i + 1) / (others.length + 1)} /> {s.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={submit} disabled={saving || counting || (rows.length > 0 && !target)}>
            {saving ? 'Deleting…' : rows.length ? 'Move and delete' : 'Delete stage'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddStageRow({ onAdd, onCancel }: { onAdd: (name: string, kind: Kind) => Promise<boolean>; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('Review');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    const ok = await onAdd(name.trim(), kind);
    setSaving(false);
    if (ok) setName('');
  };
  return (
    <form
      className="flex flex-wrap items-center gap-1.5 bg-subtle py-2 pl-[26px] pr-3"
      onSubmit={e => {
        e.preventDefault();
        submit();
      }}
    >
      <StageGlyph kind={kind} color={STAGE_KIND_DEFAULT_COLOR[kind]} className="mx-1.5" />
      <Input
        autoFocus
        value={name}
        maxLength={60}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
        }}
        placeholder="Stage name, like Interviews"
        aria-label="New stage name"
        className={cn(inputClass, 'min-w-[160px] flex-1 bg-background')}
      />
      <Select value={kind} onValueChange={v => setKind(v as Kind)}>
        <SelectTrigger aria-label="Stage kind" className={cn(selectTriggerClass, 'w-[112px] bg-background')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {KINDS.map(k => (
            <SelectItem key={k} value={k} className={selectItemClass}>
              {k}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" size="sm" disabled={!name.trim() || saving}>
        {saving ? 'Adding…' : 'Add stage'}
      </Button>
    </form>
  );
}

export function PipelineSettings({ program }: { program: Program }) {
  const ws = useWorkspace();
  const run = useProgramMutation();
  const stages = ws.stagesFor(program.id);
  const propIds = useMemo(() => stages.map(s => s.id), [stages]);
  const [ids, setIds] = useState(propIds);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Stage | null>(null);
  const byId = useMemo(() => new Map(stages.map(s => [s.id, s])), [stages]);

  useEffect(() => {
    if (!activeId) setIds(propIds);
  }, [propIds.join('|'), activeId]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const collision: CollisionDetection = args => {
    const hits = pointerWithin(args);
    return hits.length ? hits : closestCenter(args);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    setIds(next);
    const pos = new Map(next.map((id, i) => [id, i]));
    run(() => saveStage({ action: 'reorder', programId: program.id, orderedIds: next }), {
      optimistic: data => ({ ...data, stages: data.stages.map(s => (pos.has(s.id) ? { ...s, position: pos.get(s.id)! } : s)) }),
      success: 'Stage order saved',
      error: "Couldn't reorder the stages",
    });
  };

  const actions: RowActions = {
    onlyOne: stages.length <= 1,
    rename: (s, name) => run(() => saveStage({ action: 'update', id: s.id, name }), { optimistic: patchStage(s.id, { name }), success: `Renamed to “${name}”`, error: "Couldn't rename the stage" }),
    describe: (s, description) => run(() => saveStage({ action: 'update', id: s.id, description: description || null }), { optimistic: patchStage(s.id, { description }), success: `Updated “${s.name}”`, error: "Couldn't save the description" }),
    recolor: (s, color) => run(() => saveStage({ action: 'update', id: s.id, color }), { optimistic: patchStage(s.id, { color }), error: "Couldn't change the colour" }),
    retype: (s, kind) =>
      run(() => saveStage({ action: 'update', id: s.id, kind }), {
        optimistic: patchStage(s.id, { kind, rubricId: kind === 'Review' ? s.rubricId ?? ws.rubrics.find(r => r.programId === program.id)?.id ?? null : null }),
        success: `“${s.name}” is now ${kind === 'Intake' ? 'an intake' : `a ${kind.toLowerCase()}`} stage`,
        error: "Couldn't change the stage kind",
      }),
    setRubric: (s, rubricId) => run(() => saveStage({ action: 'update', id: s.id, rubricId }), { optimistic: patchStage(s.id, { rubricId }), success: rubricId ? `“${s.name}” scores with ${ws.rubricById.get(rubricId)?.name ?? 'that rubric'}` : `“${s.name}” has no rubric`, error: "Couldn't change the rubric" }),
    remove: s => setDeleting(s),
  };

  const add = async (name: string, kind: Kind) => {
    const res = await run(() => saveStage({ action: 'create', programId: program.id, name, kind }), { success: `Added “${name}”`, error: "Couldn't add the stage" });
    if (res) setAdding(false);
    return Boolean(res);
  };

  const active = activeId ? byId.get(activeId) : undefined;
  const ordered = ids.map(id => byId.get(id)).filter(Boolean) as Stage[];

  return (
    <div>
      <PageTitle title="Pipeline" description="The steps every submission moves through, and the columns of the program’s board. Changes save as you make them." />

      <div className="mb-6 grid gap-2 sm:grid-cols-3">
        {KINDS.map(k => (
          <div key={k} className="rounded-lg border bg-subtle/60 px-3 py-2.5">
            <div className="flex items-center gap-2 text-[13px] font-medium">
              <StageGlyph kind={k} color={STAGE_KIND_DEFAULT_COLOR[k]} /> {k}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{KIND_ABOUT[k]}</p>
          </div>
        ))}
      </div>

      <SettingsSection
        title="Stages"
        description="Drag to reorder. Submissions arrive in the first stage."
        actions={
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => setAdding(true)}>
            <Plus /> Add stage
          </Button>
        }
      >
        <div className="overflow-hidden rounded-lg border bg-background">
          <div className="hidden h-8 grid-cols-[16px_28px_minmax(0,1fr)_112px_150px_44px_28px] items-center gap-x-1 border-b bg-subtle pl-1.5 pr-2 text-2xs font-medium text-muted-foreground sm:grid">
            <span />
            <span />
            <span className="px-2">Name</span>
            <span className="px-2">Kind</span>
            <span className="px-2">Rubric</span>
            <span className="text-right">Now</span>
            <span />
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={collision}
            modifiers={[verticalOnly]}
            onDragStart={e => setActiveId(String(e.active.id))}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
              setActiveId(null);
              setIds(propIds);
            }}
          >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <div className="divide-y">
                {ordered.map(s => (
                  <SortableStageRow key={s.id} stage={s} stages={ordered} actions={actions} programId={program.id} />
                ))}
              </div>
            </SortableContext>
            <DragOverlay dropAnimation={null} modifiers={[verticalOnly]}>
              {active ? <StageRowPreview stage={active} stages={ordered} /> : null}
            </DragOverlay>
          </DndContext>
          {ordered.length === 0 && !adding && <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">No stages yet. Add one so submissions have somewhere to land.</div>}
          {adding && <div className="border-t"><AddStageRow onAdd={add} onCancel={() => setAdding(false)} /></div>}
        </div>
      </SettingsSection>

      <DeleteStageDialog stage={deleting} stages={stages} programId={program.id} onOpenChange={o => !o && setDeleting(null)} />
    </div>
  );
}
