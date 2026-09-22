import {
  closestCenter, DndContext, DragOverlay, KeyboardSensor, MeasuringStrategy, PointerSensor, pointerWithin, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent, type Modifier,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, ChevronRight, GripVertical } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@project/components/lib/utils';
import type { FormField } from '@project/shared/forms/types';
import { FieldIcon } from '@project/shared/ui/FieldIcon';
import { childrenOf, sectionOf, type Draft } from './draft';
import { FieldBadges } from './ui';

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** Prefer the row under the pointer; fall back to the nearest when the pointer leaves the list. */
const collision: CollisionDetection = args => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
};

type Row = { field: FormField; depth: 0 | 1; childCount: number };

/**
 * The form's structure at a glance. Sections collapse; fields drag anywhere
 * (including into another section); a section drags as a block with its
 * fields — while one is held, every section folds so the order being changed
 * is the order of steps.
 */
export function Outline({ draft, selectedId, onSelect, onReorder, issues }: {
  draft: Draft;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (ids: string[]) => void;
  issues: Map<string, string>;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const fields = draft.fields;
  const active = activeId ? fields.find(f => f.id === activeId) ?? null : null;
  const draggingSection = active?.type === 'section';
  const listRef = useRef<HTMLDivElement>(null);

  // Selecting a field inside a folded section unfolds it.
  useEffect(() => {
    if (!selectedId) return;
    const section = sectionOf(fields, selectedId);
    if (section && section.id !== selectedId && collapsed.has(section.id)) {
      setCollapsed(c => {
        const next = new Set(c);
        next.delete(section.id);
        return next;
      });
    }
    listRef.current?.querySelector(`[data-outline-id="${window.CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const out: Row[] = [];
    let section: FormField | null = null;
    for (const f of fields) {
      if (f.type === 'section') {
        section = f;
        out.push({ field: f, depth: 0, childCount: childrenOf(fields, f.id).length });
        continue;
      }
      if (section && (draggingSection || collapsed.has(section.id))) continue;
      out.push({ field: f, depth: section ? 1 : 0, childCount: 0 });
    }
    return out;
  }, [fields, collapsed, draggingSection]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = (e: DragEndEvent) => {
    const wasSection = draggingSection;
    setActiveId(null);
    const overId = e.over ? String(e.over.id) : null;
    const activeKey = String(e.active.id);
    if (!overId || overId === activeKey) return;
    const visible = rows.map(r => r.field.id);
    const from = visible.indexOf(activeKey);
    const to = visible.indexOf(overId);
    if (from < 0 || to < 0) return;
    let order = arrayMove(visible, from, to);
    // Fields before the first section have no heading; a section dropped above them would swallow them.
    if (wasSection) {
      const intro: string[] = [];
      for (const f of fields) {
        if (f.type === 'section') break;
        intro.push(f.id);
      }
      order = [...intro, ...order.filter(id => !intro.includes(id))];
    }
    // Re-expand the rows that were folded away (collapsed sections, or all of them during a section drag).
    const shown = new Set(visible);
    const ids: string[] = [];
    for (const id of order) {
      ids.push(id);
      const f = fields.find(x => x.id === id);
      if (f?.type === 'section') for (const child of childrenOf(fields, id)) if (!shown.has(child)) ids.push(child);
    }
    onReorder(ids);
  };

  if (!fields.length) {
    return <p className="px-4 py-3 text-xs text-muted-foreground">Questions you add appear here.</p>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      modifiers={[verticalOnly]}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={rows.map(r => r.field.id)} strategy={verticalListSortingStrategy}>
        <div ref={listRef} role="tree" aria-label="Form outline" className="select-none px-2 pb-3">
          {rows.map(row => (
            <SortableRow
              key={row.field.id}
              row={row}
              draft={draft}
              selected={row.field.id === selectedId}
              collapsed={collapsed.has(row.field.id) || (draggingSection && row.field.type === 'section')}
              issue={issues.get(row.field.id)}
              onSelect={onSelect}
              onToggle={() =>
                setCollapsed(c => {
                  const next = new Set(c);
                  if (next.has(row.field.id)) next.delete(row.field.id);
                  else next.add(row.field.id);
                  return next;
                })
              }
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {active ? <RowPreview row={{ field: active, depth: 0, childCount: active.type === 'section' ? childrenOf(fields, active.id).length : 0 }} draft={draft} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableRow({ row, draft, selected, collapsed, issue, onSelect, onToggle }: {
  row: Row;
  draft: Draft;
  selected: boolean;
  collapsed: boolean;
  issue?: string;
  onSelect: (id: string) => void;
  onToggle: () => void;
}) {
  const f = row.field;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: f.id });
  const isSection = f.type === 'section';
  return (
    <div
      ref={setNodeRef}
      data-outline-id={f.id}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={isSection ? !collapsed : undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10 opacity-40', isSection && 'mt-2 first:mt-0')}
    >
      <div
        onClick={() => onSelect(f.id)}
        className={cn(
          'group/row flex h-8 cursor-default items-center gap-1 rounded-md pr-2 text-[13px] transition-colors',
          row.depth === 1 ? 'pl-5' : 'pl-0.5',
          selected ? 'bg-primary/[0.1] text-foreground' : 'text-foreground/90 hover:bg-accent',
        )}
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${f.label || 'question'}`}
          style={{ touchAction: 'none' }}
          onClick={e => e.stopPropagation()}
          className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 active:cursor-grabbing group-hover/row:opacity-100"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        {isSection ? (
          <button
            type="button"
            aria-label={collapsed ? 'Expand section' : 'Collapse section'}
            onClick={e => {
              e.stopPropagation();
              onToggle();
            }}
            className="-ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', !collapsed && 'rotate-90')} />
          </button>
        ) : (
          <FieldIcon type={f.type} className={cn('h-3.5 w-3.5 shrink-0', selected ? 'text-primary' : 'text-muted-foreground')} />
        )}
        <span className={cn('min-w-0 flex-1 truncate pl-1', isSection ? 'font-medium' : '', !f.label && 'text-muted-foreground')}>
          {f.type === 'content' ? f.label || (f.help ?? '').replace(/[#*_>`[\]()]/g, '').trim().slice(0, 60) || 'Text block' : f.label || (isSection ? 'Untitled section' : 'Untitled question')}
        </span>
        {issue && <AlertTriangle aria-label={issue} className="h-3 w-3 shrink-0 text-tone-danger"><title>{issue}</title></AlertTriangle>}
        <FieldBadges field={f} titleFieldId={draft.titleFieldId} amountFieldId={draft.amountFieldId} />
        {f.required && <span aria-label="Required" title="Required" className="h-1.5 w-1.5 shrink-0 rounded-full bg-tone-danger/70" />}
        {isSection && collapsed && <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{row.childCount}</span>}
      </div>
    </div>
  );
}

function RowPreview({ row, draft }: { row: Row; draft: Draft }) {
  const f = row.field;
  return (
    <div className="flex h-8 cursor-grabbing items-center gap-1.5 rounded-md border bg-background pl-1.5 pr-2 text-[13px] shadow-lg">
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      <FieldIcon type={f.type} className="h-3.5 w-3.5 text-muted-foreground" />
      <span className={cn('min-w-0 flex-1 truncate', f.type === 'section' && 'font-medium')}>{f.label || (f.type === 'section' ? 'Untitled section' : 'Untitled question')}</span>
      <FieldBadges field={f} titleFieldId={draft.titleFieldId} amountFieldId={draft.amountFieldId} />
      {f.type === 'section' && <span className="text-2xs text-muted-foreground">{row.childCount} questions</span>}
    </div>
  );
}
