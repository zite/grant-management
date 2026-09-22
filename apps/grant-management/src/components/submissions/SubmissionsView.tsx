import { Download, Inbox, Loader2, MoreHorizontal, RotateCcw, Save, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { exportSubmissions } from 'zitejs/api';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { cn } from '@project/components/lib/utils';
import { isInputField } from '@project/shared/forms/types';
import { useAppActions } from '../../lib/app-actions';
import { downloadText } from '../../lib/download';
import { errorMessage } from '../../lib/errors';
import { useHotkeys } from '../../lib/hotkeys';
import { useSubmissionActions } from '../../lib/mutations';
import { useForm, useSubmissions } from '../../lib/queries';
import type { Submission, SubmissionFilters } from '../../lib/types';
import { effectiveFilters, groupSubmissions, useViewState, type SubmissionGroup, type ViewOptions } from '../../lib/view';
import { useWorkspace } from '../../lib/workspace';
import { EmptyState, IconButton, SkeletonRows, Tip } from '../primitives/bits';
import { BulkActionBar } from './BulkActionBar';
import { DisplayMenu, LayoutToggle } from './DisplayMenu';
import { FilterChips, FilterMenu, type FilterKey } from './filters';
import { SaveViewDialog } from './SaveViewDialog';
import { SubmissionBoard, type BoardMove } from './SubmissionBoard';
import { SubmissionList } from './SubmissionList';
import type { PickerKind } from './SubmissionPropertyPicker';
import { SubmissionTable } from './SubmissionTable';

export type SubmissionsViewProps = {
  surfaceKey: string;
  /** The surface's fixed scope, merged under the user's own filters. */
  baseFilters?: SubmissionFilters;
  /** When the surface is one program — enables its stages as board columns and its questions as table columns. */
  programId?: string | null;
  lockedFilters?: FilterKey[];
  defaults?: Partial<ViewOptions>;
  defaultFilters?: SubmissionFilters;
  savedView?: { id: string; name: string; scope: string } | null;
  hideSaveView?: boolean;
  toolbarStart?: ReactNode;
  emptyState?: ReactNode;
};

function useCollapsed(key: string) {
  const storage = `grants:collapsed:${key}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(storage) ?? '[]'));
    } catch {
      return new Set();
    }
  });
  const toggle = useCallback(
    (group: string) =>
      setCollapsed(prev => {
        const next = new Set(prev);
        if (next.has(group)) next.delete(group);
        else next.add(group);
        try {
          localStorage.setItem(storage, JSON.stringify([...next]));
        } catch {
          /* ignore */
        }
        return next;
      }),
    [storage],
  );
  return [collapsed, toggle] as const;
}

/**
 * Every submission list, board and table in the staff app is this component: fetching,
 * filtering, grouping, selection, keyboard navigation, bulk actions, export and
 * saved views. A new surface only says what it's scoped to.
 */
export function SubmissionsView({ surfaceKey, baseFilters = {}, programId = null, lockedFilters = [], defaults, defaultFilters, savedView, hideSaveView, toolbarStart, emptyState }: SubmissionsViewProps) {
  const ws = useWorkspace();
  const app = useAppActions();
  const actions = useSubmissionActions();
  const navigate = useNavigate();
  const view = useViewState(surfaceKey, defaults, defaultFilters);
  const { options, setOptions, filters, setFilters } = view;

  const [searchOpen, setSearchOpen] = useState(Boolean(filters.search));
  const [searchText, setSearchText] = useState(filters.search ?? '');
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setFilters(f => ({ ...f, search: searchText.trim() || undefined })), 220);
    return () => window.clearTimeout(t);
  }, [searchText, setFilters]);

  // A single program in scope, from the surface or from the user's own Program filter.
  const scopedProgramId = programId ?? (filters.programIds?.length === 1 ? filters.programIds[0] : null);
  const program = scopedProgramId ? ws.programById.get(scopedProgramId) : undefined;
  const layout = options.layout;
  const wantsAnswers = layout === 'table' && Boolean(program) && options.answerColumns.length > 0;
  const query = useMemo(() => effectiveFilters(baseFilters, filters), [baseFilters, filters]);
  const { data, isPending, isFetching, isError, refetch } = useSubmissions(query, options.ordering, { includeAnswers: wantsAnswers });
  const rows = data?.submissions ?? [];
  const { data: form } = useForm(layout === 'table' ? program?.applicationFormId : null);
  const answerFields = useMemo(() => (form?.fields ?? []).filter(isInputField), [form]);
  const shownAnswerFields = useMemo(() => answerFields.filter(f => options.answerColumns.includes(f.id)), [answerFields, options.answerColumns]);

  const grouping = layout === 'board' && options.grouping === 'none' ? 'stage' : options.grouping;
  const groups = useMemo(
    () => (layout === 'table' ? [{ key: 'all', label: 'All', submissions: rows } as SubmissionGroup] : groupSubmissions(rows, grouping, ws, { programId: scopedProgramId, emptyGroups: options.emptyGroups, board: layout === 'board' })),
    [rows, grouping, ws, scopedProgramId, options.emptyGroups, layout],
  );
  const multiProgram = !scopedProgramId && new Set(rows.map(r => r.programId)).size > 1;
  const [collapsed, toggleCollapsed] = useCollapsed(surfaceKey);

  const visible = useMemo(() => {
    const seen = new Set<string>();
    const out: Submission[] = [];
    for (const g of groups) {
      if (layout === 'list' && collapsed.has(g.key)) continue;
      for (const s of g.submissions) if (!seen.has(s.id)) {
        seen.add(s.id);
        out.push(s);
      }
    }
    return out;
  }, [groups, collapsed, layout]);
  const byId = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows]);

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [activePicker, setActivePicker] = useState<{ id: string; kind: PickerKind } | null>(null);
  const [bulkKind, setBulkKind] = useState<PickerKind | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const anchor = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelection(prev => {
      const next = new Set([...prev].filter(id => byId.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [byId]);
  useEffect(() => {
    setSelection(new Set());
    setFocusedId(null);
  }, [surfaceKey]);

  const selected = useMemo(() => visible.filter(s => selection.has(s.id)), [visible, selection]);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const byIdRef = useRef(byId);
  byIdRef.current = byId;

  const getTargets = useCallback((s: Submission) => {
    const sel = selectionRef.current;
    if (sel.size > 1 && sel.has(s.id)) return [...sel].map(id => byIdRef.current.get(id)).filter(Boolean) as Submission[];
    return [byIdRef.current.get(s.id) ?? s];
  }, []);

  const toggleSelect = useCallback(
    (s: Submission, e?: MouseEvent | KeyboardEvent) => {
      setSelection(prev => {
        const next = new Set(prev);
        if (e?.shiftKey && anchor.current) {
          const a = visible.findIndex(v => v.id === anchor.current);
          const b = visible.findIndex(v => v.id === s.id);
          if (a >= 0 && b >= 0) {
            for (let n = Math.min(a, b); n <= Math.max(a, b); n++) next.add(visible[n].id);
            return next;
          }
        }
        if (next.has(s.id)) next.delete(s.id);
        else next.add(s.id);
        anchor.current = s.id;
        return next;
      });
      setFocusedId(s.id);
    },
    [visible],
  );

  const onRowClick = useCallback(
    (s: Submission, e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey) {
        e.preventDefault();
        toggleSelect(s, e);
        return;
      }
      if (selectionRef.current.size > 0) {
        toggleSelect(s, e);
        return;
      }
      if (s.status === 'Draft') {
        app.openPeek(s.id);
        return;
      }
      navigate(`/submission/${s.reference}`);
    },
    [navigate, toggleSelect, app],
  );
  const onHover = useCallback((s: Submission) => setFocusedId(s.id), []);
  const onPickerChange = useCallback((id: string, kind: PickerKind | null) => setActivePicker(kind ? { id, kind } : null), []);

  const focusIndex = visible.findIndex(s => s.id === focusedId);
  const focusAt = (idx: number, extend?: boolean) => {
    const next = visible[Math.max(0, Math.min(visible.length - 1, idx))];
    if (!next) return;
    setFocusedId(next.id);
    if (extend) setSelection(prev => new Set(prev).add(next.id).add(focusedId ?? next.id));
    requestAnimationFrame(() => scrollRef.current?.querySelector(`[data-row-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' }));
  };
  const focused = focusedId ? byId.get(focusedId) : undefined;
  const targets = () => (selection.size ? selected : focused ? [focused] : []);

  const openPickerFor = (kind: PickerKind) => {
    if (selection.size > 0) setBulkKind(kind);
    else if (focused) {
      if (layout !== 'list') {
        setSelection(new Set([focused.id]));
        setBulkKind(kind);
      } else setActivePicker({ id: focused.id, kind });
    }
  };

  const doExport = async (ids?: string[]) => {
    setExporting(true);
    try {
      const res = await exportSubmissions(ids?.length ? { ids, ordering: options.ordering } : { filters: query, ordering: options.ordering });
      downloadText(res.filename, res.csv);
      toast.success(`Exported ${res.rows} submission${res.rows === 1 ? '' : 's'}`);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't export"));
    } finally {
      setExporting(false);
    }
  };

  useHotkeys({
    j: () => focusAt(focusIndex + 1),
    down: () => focusAt(focusIndex + 1),
    k: () => focusAt(focusIndex < 0 ? 0 : focusIndex - 1),
    up: () => focusAt(focusIndex < 0 ? 0 : focusIndex - 1),
    'shift+j': () => focusAt(focusIndex + 1, true),
    'shift+down': () => focusAt(focusIndex + 1, true),
    'shift+k': () => focusAt(focusIndex - 1, true),
    'shift+up': () => focusAt(focusIndex - 1, true),
    x: () => focused && toggleSelect(focused),
    'mod+a': () => setSelection(new Set(visible.map(s => s.id))),
    esc: () => (selection.size ? setSelection(new Set()) : setFocusedId(null)),
    enter: () => focused && (focused.status === 'Draft' ? app.openPeek(focused.id) : navigate(`/submission/${focused.reference}`)),
    space: () => focused && app.openPeek(focused.status === 'Draft' ? focused.id : focused.reference),
    s: () => openPickerFor('stage'),
    o: () => openPickerFor('owner'),
    l: () => openPickerFor('labels'),
    i: () => {
      const t = targets();
      if (t.length === 1) actions.update(t[0], { ownerId: ws.me.id }).catch(() => undefined);
      else if (t.length > 1) actions.bulkUpdate(t, { ownerId: ws.me.id });
    },
    r: () => {
      const t = targets().filter(s => s.status === 'Submitted');
      if (t.length) app.openAssignReviewers(t);
    },
    m: () => targets().length && app.openCompose(targets()),
    'shift+a': () => targets().length && app.openDecision(targets(), 'Accepted'),
    'shift+w': () => targets().length && app.openDecision(targets(), 'Waitlisted'),
    'shift+d': () => targets().length && app.openDecision(targets(), 'Declined'),
    '/': () => {
      setSearchOpen(true);
      requestAnimationFrame(() => searchRef.current?.focus());
    },
  });

  const onMove = useCallback(
    (m: BoardMove) => {
      const drop = m.toGroup.drop;
      if (!drop) return;
      const moving = getTargets(m.submission);
      if (drop.field === 'decision') {
        app.openDecision(moving, drop.value);
        return;
      }
      if (drop.field === 'ownerId') {
        if (moving.length > 1) actions.bulkUpdate(moving, { ownerId: drop.value });
        else actions.update(m.submission, { ownerId: drop.value }).catch(() => undefined);
        return;
      }
      if (m.submission.status !== 'Submitted') {
        toast.message('Reopen the decision first to move this back into the pipeline', { action: { label: 'Reopen…', onClick: () => app.openDecision([m.submission], 'reopen') } });
        return;
      }
      const stageName = drop.stageName;
      // Across programs, a column is a stage NAME; resolve it in the card's own program.
      const own = ws.stagesFor(m.submission.programId);
      const target = own.find(s => s.id === drop.value) ?? own.find(s => s.name.toLowerCase() === stageName?.toLowerCase());
      if (!target) {
        toast.message(`${ws.programById.get(m.submission.programId)?.name ?? 'That program'} has no “${stageName}” stage`);
        return;
      }
      actions.update(m.submission, { stageId: target.id }, { success: `Moved ${m.submission.reference} to ${target.name}` }).catch(() => undefined);
    },
    [actions, app, ws, getTargets],
  );

  const properties = useMemo(() => new Set(options.properties), [options.properties]);
  const hasUserFilters = Object.keys(filters).some(k => k !== 'search');

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 border-b px-3 py-1.5">
        {toolbarStart}
        <FilterMenu filters={filters} onChange={setFilters} programId={scopedProgramId} locked={lockedFilters} />
        <FilterChips filters={filters} onChange={setFilters} programId={scopedProgramId} locked={lockedFilters} />
        <div className="ml-auto flex items-center gap-1">
          {isFetching && !isPending && <span className="mr-1 h-1.5 w-1.5 animate-pulse rounded-full bg-primary/70" aria-label="Refreshing" />}
          {searchOpen ? (
            <div className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 animate-fade-in">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                ref={searchRef}
                autoFocus
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    setSearchText('');
                    setSearchOpen(false);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="Search titles, names, answers…"
                className="w-48 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
              />
              <button type="button" aria-label="Clear search" onClick={() => { setSearchText(''); setSearchOpen(false); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <Tip label="Search in view" keys={['/']}>
              <IconButton onClick={() => setSearchOpen(true)} aria-label="Search in view">
                <Search />
              </IconButton>
            </Tip>
          )}
          <span className="hidden px-1.5 text-xs tabular-nums text-muted-foreground sm:inline">{data ? `${data.total.toLocaleString()} submission${data.total === 1 ? '' : 's'}` : ''}</span>
          <LayoutToggle layout={layout} onChange={l => setOptions({ layout: l })} />
          <DisplayMenu options={options} onChange={setOptions} onReset={view.reset} isDirty={view.isDirty} answerFields={program ? answerFields : undefined} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton aria-label="More view actions">{exporting ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}</IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {!hideSaveView && (
                <DropdownMenuItem className="text-[13px]" onSelect={() => setSaveOpen(true)}>
                  <Save className="h-3.5 w-3.5" /> {savedView ? 'Save changes to view…' : 'Save as view…'}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="text-[13px]" onSelect={() => doExport()}>
                <Download className="h-3.5 w-3.5" /> Export to CSV
              </DropdownMenuItem>
              {view.isDirty && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-[13px]" onSelect={view.reset}>
                    <RotateCcw className="h-3.5 w-3.5" /> Reset view
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div ref={scrollRef} className={cn('relative min-h-0 flex-1', layout === 'list' ? 'overflow-y-auto' : 'overflow-hidden')}>
        {isPending ? (
          <SkeletonRows rows={10} className="pt-2" />
        ) : isError ? (
          <EmptyState icon={<Inbox />} title="Couldn't load submissions" description="Check your connection and try again." action={<button type="button" onClick={() => refetch()} className="text-[13px] text-primary hover:underline">Retry</button>} />
        ) : rows.length === 0 ? (
          ws.programs.length === 0 ? (
            <EmptyState
              icon={<Inbox />}
              title="No programs yet"
              description="Submissions arrive once a program is published and applicants apply through the portal."
              action={<button type="button" onClick={() => navigate('/programs')} className="text-[13px] text-primary hover:underline">Create a program</button>}
            />
          ) : hasUserFilters || filters.search ? (
            <EmptyState
              icon={<Search />}
              title="Nothing matches these filters"
              description="Try removing a filter, or search for something else."
              action={<button type="button" onClick={() => { setFilters({}); setSearchText(''); }} className="text-[13px] text-primary hover:underline">Clear filters</button>}
            />
          ) : (
            emptyState ?? <EmptyState icon={<Inbox />} title="No submissions yet" description="When applicants submit through the portal, they'll appear here." />
          )
        ) : layout === 'board' ? (
          <SubmissionBoard groups={groups} grouping={grouping} properties={properties} selection={selection} focusedId={focusedId} multiProgram={multiProgram} onMove={onMove} onCardClick={onRowClick} getTargets={getTargets} />
        ) : layout === 'table' ? (
          <SubmissionTable
            rows={rows}
            properties={properties}
            selection={selection}
            focusedId={focusedId}
            multiProgram={multiProgram}
            answerFields={wantsAnswers ? shownAnswerFields : []}
            currency={ws.settings.currency}
            ordering={options.ordering}
            onOrdering={o => setOptions({ ordering: o })}
            onRowClick={onRowClick}
            onToggleSelect={toggleSelect}
            onHover={onHover}
            getTargets={getTargets}
            onSelectAll={all => setSelection(all ? new Set(rows.map(r => r.id)) : new Set())}
          />
        ) : (
          <SubmissionList
            groups={groups}
            grouping={grouping}
            properties={properties}
            selection={selection}
            focusedId={focusedId}
            multiProgram={multiProgram}
            activePicker={activePicker}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapsed}
            onPickerChange={onPickerChange}
            onRowClick={onRowClick}
            onToggleSelect={toggleSelect}
            onHover={onHover}
            getTargets={getTargets}
            onSelectGroup={g => setSelection(prev => new Set([...prev, ...g.submissions.map(s => s.id)]))}
          />
        )}
      </div>

      <BulkActionBar submissions={selected} onClear={() => setSelection(new Set())} openKind={bulkKind} onOpenKind={setBulkKind} onExport={ids => doExport(ids)} />
      <SaveViewDialog open={saveOpen} onOpenChange={setSaveOpen} filters={{ ...baseFilters, ...filters, search: undefined }} options={options} programId={scopedProgramId} existing={savedView} />
    </div>
  );
}
