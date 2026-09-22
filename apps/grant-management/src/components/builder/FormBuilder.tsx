import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, AlignLeft, Check, Eye, FileQuestion, Info, ListTree, Loader2, Monitor, MoreHorizontal, PenLine, Plus, Redo2, RotateCcw, SlidersHorizontal, Smartphone, Sparkles, Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { toast } from 'sonner';
import { saveForm } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@project/components/ui/popover';
import { Sheet, SheetContent, SheetTitle } from '@project/components/ui/sheet';
import { cn } from '@project/components/lib/utils';
import { STARTERS, checkForm, repairReferences, starterFields, type FormKind, type StarterKey } from '@project/shared/forms/builder';
import { newField, starterApplicationForm } from '@project/shared/forms/catalog';
import { isInputField, type FieldType, type FormField } from '@project/shared/forms/types';
import { Markdown } from '@project/shared/ui/Markdown';
import { useAppActions } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import { MOD, useHotkeys } from '../../lib/hotkeys';
import { qk, useForm } from '../../lib/queries';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { useWorkspace } from '../../lib/workspace';
import { EmptyState, IconButton, Kbd, Tip } from '../primitives/bits';
import { AiGenerateDialog, type GeneratedForm } from './AiGenerateDialog';
import { Canvas, type FocusRequest } from './Canvas';
import {
  duplicateField, inputCount, insertAt, nudge, removeFromDraft, reorder, toDraft, updateField, type Draft,
} from './draft';
import { FieldPalette } from './FieldPalette';
import { Inspector } from './Inspector';
import { draftStore, useLeaveGuard } from './leaveGuard';
import { Outline } from './Outline';
import { Preview, emptyPreview, type PreviewState } from './Preview';
import { AutoTextarea, Segmented, textareaClass } from './ui';
import { useDraft } from './useDraft';

export type BuilderControl = { dirty: boolean; allowLeave: () => void };

type Props = {
  programId: string;
  formId: string;
  /** The program's form list, shown above the outline on wide screens. */
  formsNav: ReactNode;
  /** A compact form picker for narrower screens. */
  formSwitcher: ReactNode;
  controlRef: MutableRefObject<BuilderControl | null>;
  onDirtyChange: (dirty: boolean) => void;
  onDuplicateForm: (id: string) => void;
  onDeleteForm: (id: string) => void;
};

export function FormBuilder({ programId, formId, formsNav, formSwitcher, controlRef, onDirtyChange, onDuplicateForm, onDeleteForm }: Props) {
  const ws = useWorkspace();
  const app = useAppActions();
  const qc = useQueryClient();
  const program = ws.programById.get(programId);
  const { data: form, isPending, isError, error, refetch } = useForm(formId);
  const d = useDraft();
  const draft = d.draft;
  const stamp = useRef<string | null>(null);
  const loaded = useRef(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [paletteAt, setPaletteAt] = useState<string | null>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const [preview, setPreview] = useState<PreviewState>(emptyPreview);
  const [descOpen, setDescOpen] = useState(false);
  const [descPreview, setDescPreview] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restored, setRestored] = useState(false);
  const [outlineSheet, setOutlineSheet] = useState(false);
  const [inspectorSheet, setInspectorSheet] = useState(false);
  const busy = useRef(false);
  const wide = useMediaQuery('(min-width: 1280px)');
  const large = useMediaQuery('(min-width: 1024px)');

  const kind: FormKind = form?.kind === 'Follow-up' ? 'Follow-up' : 'Application';
  const wrongProgram = Boolean(form && form.programId !== programId);

  // ── Loading and server refreshes ────────────────────────────────────────
  useEffect(() => {
    if (!form || wrongProgram) return;
    if (!loaded.current) {
      loaded.current = true;
      const stored = draftStore.get(formId);
      const restore = stored && stored.stamp === form.updatedAt ? stored.draft : null;
      d.load(toDraft(form), restore);
      if (restore) setRestored(true);
      else draftStore.clear(formId);
    } else if (form.updatedAt !== stamp.current && !d.dirty) {
      // Someone else saved while this was open and nothing here is unsaved: show theirs.
      d.load(toDraft(form));
    }
    stamp.current = form.updatedAt;
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = d.dirty;
  useEffect(() => onDirtyChange(dirty), [dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const bypass = useLeaveGuard({
    when: dirty,
    allow: p => p === `/programs/${programId}/form/${formId}` || (kind === 'Application' && p === `/programs/${programId}/form`),
    confirm: () =>
      app.confirm({
        title: 'Leave without saving?',
        description: `Your changes to “${draft?.name || 'this form'}” haven't been saved. Leaving now discards them.`,
        confirmLabel: 'Discard changes',
        destructive: true,
      }),
    onLeave: () => {
      draftStore.clear(formId);
      d.discard();
    },
  });

  controlRef.current = {
    dirty,
    allowLeave: () => {
      bypass.current = true;
      draftStore.clear(formId);
    },
  };

  useEffect(() => {
    if (!draft) return;
    if (dirty && !bypass.current) draftStore.set(formId, draft, stamp.current);
    else draftStore.clear(formId);
  }, [draft, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Validation, live ────────────────────────────────────────────────────
  const check = useMemo(() => {
    if (!draft) return null;
    const repaired = repairReferences(draft.fields);
    const result = checkForm(repaired.fields, { kind, titleFieldId: draft.titleFieldId, amountFieldId: draft.amountFieldId });
    return { ...result, stripped: repaired.stripped };
  }, [draft, kind]);

  const issues = useMemo(() => {
    const m = new Map<string, string>();
    if (!check) return m;
    for (const s of check.stripped) m.set(s.id, `This condition will be removed when you save: ${s.reason}`);
    if (attempted) for (const e of check.errors) if (e.fieldId && !m.has(e.fieldId)) m.set(e.fieldId, e.message);
    return m;
  }, [check, attempted]);

  // ── Edits ───────────────────────────────────────────────────────────────
  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    setPaletteAt(null);
    // A pending "focus the label" belongs to the question it was made for; selecting elsewhere drops it.
    setFocus(f => (f && f.id === id ? f : null));
  }, []);

  const changeField = useCallback((id: string, patch: Partial<FormField>, key?: string) => {
    d.commit(dr => ({ ...dr, fields: updateField(dr.fields, id, patch) }), key);
  }, [d.commit]); // eslint-disable-line react-hooks/exhaustive-deps

  const insert = (index: number, type: FieldType) => {
    // A new text block starts empty (its placeholder explains it), so typing never appends to sample copy.
    const f = type === 'content' ? newField('content', { help: '' }) : newField(type);
    d.commit(dr => ({ ...dr, fields: insertAt(dr.fields, index, [f]) }));
    setMode('edit');
    setSelectedId(f.id);
    setPaletteAt(null);
    setFocus({ id: f.id, target: type === 'content' ? 'help' : 'label', nonce: Date.now() });
  };

  const duplicate = (id: string) => {
    const current = d.latest.current;
    if (!current) return;
    const res = duplicateField(current.fields, id);
    if (!res.newId) return;
    d.commit({ ...current, fields: res.fields });
    setSelectedId(res.newId);
  };

  const remove = async (id: string) => {
    const current = d.latest.current;
    if (!current || busy.current) return;
    const index = current.fields.findIndex(f => f.id === id);
    const f = current.fields[index];
    if (!f) return;
    const dependents = current.fields.filter(x => x.showIf?.fieldId === id).length;
    const used = form?.submissionCount ?? 0;
    if (isInputField(f) && used > 0) {
      busy.current = true;
      const ok = await app.confirm({
        title: `Delete “${f.label || 'this question'}”?`,
        description: `${kind === 'Application' ? `${used} application${used === 1 ? '' : 's'} already exist` : `${used} task${used === 1 ? ' uses' : 's use'} this form`}. Answers people already gave are kept, but they won't be shown once you save.${dependents ? ` ${dependents} question${dependents === 1 ? '' : 's'} that depend on it will always show.` : ''}`,
        confirmLabel: 'Delete question',
        destructive: true,
      });
      busy.current = false;
      if (!ok) return;
    }
    const neighbour = current.fields[index + 1]?.id ?? current.fields[index - 1]?.id ?? null;
    d.commit(dr => removeFromDraft(dr, id));
    setSelectedId(neighbour);
    toast(f.type === 'section' ? 'Section deleted — its questions joined the step above' : f.type === 'content' ? 'Text block deleted' : 'Question deleted', {
      description: dependents && used === 0 ? `${dependents} question${dependents === 1 ? '' : 's'} that depended on it will always show.` : undefined,
      action: { label: 'Undo', onClick: () => d.undo() },
    });
  };

  const move = (id: string, dir: -1 | 1) => d.commit(dr => ({ ...dr, fields: nudge(dr.fields, id, dir) }));

  const applyFields = (next: Pick<Draft, 'fields' | 'titleFieldId' | 'amountFieldId'>, message: string) => {
    d.commit(dr => ({ ...dr, ...next }));
    setSelectedId(null);
    setMode('edit');
    toast.success(message, { description: 'Review the questions, then save.', action: { label: 'Undo', onClick: () => d.undo() } });
  };

  const applyRecommended = (starter?: StarterKey) => {
    if (kind === 'Application') {
      const s = starterApplicationForm(program?.type ?? 'Grant');
      applyFields({ fields: s.fields, titleFieldId: s.titleFieldId, amountFieldId: s.amountFieldId }, 'Recommended form added');
    } else {
      const key = starter ?? (/report/i.test(draft?.name ?? '') ? 'final' : 'agreement');
      applyFields({ fields: starterFields(key), titleFieldId: null, amountFieldId: null }, `${STARTERS.find(s => s.key === key)!.name} added`);
    }
  };

  const confirmReplace = async () => {
    const used = form?.submissionCount ?? 0;
    if (!draft?.fields.length) return true;
    return app.confirm({
      title: 'Replace every question?',
      description: used > 0
        ? `${used} ${kind === 'Application' ? `application${used === 1 ? '' : 's'} already exist` : `task${used === 1 ? ' uses' : 's use'} this form`}. Their answers are kept but won't be shown with the new questions. You can undo before saving.`
        : 'The current questions are replaced. You can undo before saving.',
      confirmLabel: 'Replace form',
      destructive: used > 0,
    });
  };

  const onAiReplace = async (g: GeneratedForm) => {
    if (!(await confirmReplace())) return;
    setAiOpen(false);
    applyFields({ fields: g.fields, titleFieldId: kind === 'Application' ? g.titleFieldId : null, amountFieldId: kind === 'Application' ? g.amountFieldId : null }, 'Form replaced with the AI draft');
  };
  const onAiAppend = (g: GeneratedForm) => {
    setAiOpen(false);
    d.commit(dr => ({
      ...dr,
      fields: [...dr.fields, ...g.fields],
      titleFieldId: dr.titleFieldId ?? (kind === 'Application' ? g.titleFieldId : null),
      amountFieldId: dr.amountFieldId ?? (kind === 'Application' ? g.amountFieldId : null),
    }));
    setSelectedId(g.fields[0]?.id ?? null);
    toast.success(`Added ${inputCount(g.fields)} questions to the end`, { action: { label: 'Undo', onClick: () => d.undo() } });
  };

  // ── Save and discard ────────────────────────────────────────────────────
  const save = async (force = false): Promise<void> => {
    const current = d.latest.current;
    if (!current || saving || !form) return;
    if (!current.name.trim()) {
      toast.error('Give the form a name before saving.');
      document.getElementById('builder-form-name')?.focus();
      return;
    }
    const repaired = repairReferences(current.fields);
    const result = checkForm(repaired.fields, { kind, titleFieldId: current.titleFieldId, amountFieldId: current.amountFieldId });
    if (result.errors.length) {
      setAttempted(true);
      setIssuesOpen(true);
      setMode('edit');
      const first = result.errors.find(e => e.fieldId)?.fieldId;
      if (first) setSelectedId(first);
      return;
    }
    setSaving(true);
    try {
      const out = await saveForm({
        action: 'update',
        id: formId,
        name: current.name.trim(),
        description: current.description,
        fields: result.fields,
        titleFieldId: result.titleFieldId,
        amountFieldId: result.amountFieldId,
        expectedUpdatedAt: force ? null : stamp.current,
      });
      stamp.current = out.updatedAt;
      qc.setQueryData(['form', formId], out);
      const saved = toDraft(out);
      if (d.latest.current === current) d.saved(saved);
      else d.saved(saved, true);
      setAttempted(false);
      setIssuesOpen(false);
      setRestored(false);
      draftStore.clear(formId);
      const n = repaired.stripped.length;
      toast.success('Form saved', {
        description: n ? `Removed ${n} condition${n === 1 ? '' : 's'} that no longer worked (${repaired.stripped.slice(0, 3).map(s => `“${s.label || 'Untitled'}”`).join(', ')}${n > 3 ? '…' : ''}). Those questions now always show.` : undefined,
      });
      void qc.invalidateQueries({ queryKey: qk.bootstrap });
    } catch (e) {
      const message = errorMessage(e, "Couldn't save the form");
      if (/someone else saved/i.test(message)) {
        const ok = await app.confirm({
          title: 'This form changed while you were editing',
          description: 'Someone saved a newer version after you opened it. Saving now replaces their version with yours.',
          confirmLabel: 'Save my version',
          destructive: true,
        });
        setSaving(false);
        if (ok) return save(true);
        return;
      }
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    d.discard();
    draftStore.clear(formId);
    setAttempted(false);
    setRestored(false);
    toast('Changes discarded', { action: { label: 'Undo', onClick: () => d.undo() } });
  };

  // ── Keyboard ────────────────────────────────────────────────────────────
  const fields = draft?.fields ?? [];
  const indexOfSelected = selectedId ? fields.findIndex(f => f.id === selectedId) : -1;
  const alertOpen = () => Boolean(document.querySelector('[role="alertdialog"]'));
  const guard = (fn: () => void) => () => {
    if (!alertOpen()) fn();
  };
  useHotkeys(
    {
      'mod+s': guard(() => void save()),
      'mod+z': guard(d.undo),
      'mod+shift+z': guard(d.redo),
      'mod+d': guard(() => selectedId && mode === 'edit' && duplicate(selectedId)),
      'alt+up': guard(() => selectedId && mode === 'edit' && move(selectedId, -1)),
      'alt+down': guard(() => selectedId && mode === 'edit' && move(selectedId, 1)),
      up: guard(() => mode === 'edit' && fields.length && select(fields[Math.max(0, indexOfSelected < 0 ? fields.length - 1 : indexOfSelected - 1)].id)),
      down: guard(() => mode === 'edit' && fields.length && select(fields[Math.min(fields.length - 1, indexOfSelected + 1)].id)),
      backspace: guard(() => selectedId && mode === 'edit' && void remove(selectedId)),
      escape: guard(() => mode === 'edit' && select(null)),
      a: guard(() => {
        if (mode !== 'edit' || !draft) return;
        const at = indexOfSelected >= 0 ? indexOfSelected + 1 : fields.length;
        setPaletteAt(fields.length === 0 ? 'empty' : fields[at] ? `before:${fields[at].id}` : 'end');
      }),
    },
    { enabled: Boolean(draft) && !aiOpen, allowInInputs: ['mod+s', 'mod+z', 'mod+shift+z', 'mod+d'] },
  );

  // Enter edits the selected question's text — but only when nothing focusable has the keyboard, so Enter still presses buttons.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.defaultPrevented || !selectedId || mode !== 'edit') return;
      const t = e.target as HTMLElement | null;
      if (t && t !== document.body && t.closest('input, textarea, select, button, a, [role], [contenteditable="true"], [tabindex]')) return;
      if (alertOpen()) return;
      e.preventDefault();
      setFocus({ id: selectedId, target: fields[indexOfSelected]?.type === 'content' ? 'help' : 'label', nonce: Date.now() });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── Render ──────────────────────────────────────────────────────────────
  const selected = selectedId ? fields.find(f => f.id === selectedId) ?? null : null;
  const count = inputCount(fields);
  const errorCount = check?.errors.length ?? 0;
  const warningCount = (check?.warnings.length ?? 0) + (check?.stripped.length ?? 0);
  const used = form?.submissionCount ?? 0;
  const live = kind === 'Application' ? program?.status === 'Published' && used > 0 : used > 0;

  const leftPanel = (
    <aside className="hidden w-[260px] shrink-0 flex-col border-r bg-background xl:flex">
      <div className="max-h-[45%] shrink-0 overflow-y-auto border-b">{formsNav}</div>
      <div className="flex h-9 shrink-0 items-center justify-between px-4">
        <span className="text-xs font-medium text-muted-foreground">Outline</span>
        {draft && <span className="text-2xs tabular-nums text-muted-foreground">{count} question{count === 1 ? '' : 's'}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {draft ? (
          <Outline draft={draft} selectedId={selectedId} issues={issues} onReorder={ids => d.commit(dr => ({ ...dr, fields: reorder(dr.fields, ids) }))} onSelect={id => { setMode('edit'); select(id); }} />
        ) : (
          <div className="space-y-2 px-4 py-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-4" style={{ width: `${45 + ((i * 23) % 45)}%` }} />)}</div>
        )}
      </div>
    </aside>
  );

  if (isError || wrongProgram) {
    const notFound = wrongProgram || /not found|404/i.test(String((error as Error)?.message ?? ''));
    return (
      <div className="flex min-h-0 flex-1">
        {leftPanel}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 items-center gap-2 border-b px-3 xl:hidden">{formSwitcher}</div>
          <EmptyState
            icon={<FileQuestion />}
            title={notFound ? "This form doesn't exist" : "The form couldn't be loaded"}
            description={notFound ? 'It may have been deleted. Choose another form from the list.' : errorMessage(error, 'Check your connection and try again.')}
            action={notFound ? undefined : <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>}
          />
        </div>
      </div>
    );
  }

  const empty = (
    <div className="rounded-xl border border-dashed bg-background px-6 py-10 text-center animate-fade-up">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl border bg-subtle text-muted-foreground"><PenLine className="h-5 w-5" /></div>
      <h3 className="text-[14px] font-medium">No questions yet</h3>
      <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
        {kind === 'Application' ? `Start from a form built for ${(program?.type ?? 'grant').toLowerCase()} programs, or add questions one at a time.` : 'Start from a common follow-up form, or add questions one at a time.'}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {kind === 'Application' ? (
          <Button size="sm" className="h-8" onClick={() => applyRecommended()}>Start from the recommended form</Button>
        ) : (
          STARTERS.filter(s => s.key !== 'blank').map(s => (
            <Button key={s.key} size="sm" variant="outline" className="h-8" onClick={() => applyRecommended(s.key)}>{s.name}</Button>
          ))
        )}
        <FieldPalette
          open={paletteAt === 'empty'}
          onOpenChange={o => setPaletteAt(o ? 'empty' : null)}
          onPick={type => insert(0, type)}
          trigger={<Button size="sm" variant="outline" className="h-8 gap-1.5"><Plus className="!h-3.5 !w-3.5" /> Add your first question</Button>}
        />
        {ws.features.ai && (
          <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={() => setAiOpen(true)}><Sparkles className="!h-3.5 !w-3.5 text-tone-accent" /> Generate with AI</Button>
        )}
      </div>
    </div>
  );

  const inspector = draft && (
    <Inspector
      draft={draft}
      field={selected}
      kind={kind}
      blindReview={Boolean(program?.blindReview)}
      submissionCount={used}
      onChangeField={changeField}
      onChangeDraft={(update, key) => d.commit(update, key)}
      onDuplicate={duplicate}
      onRemove={id => void remove(id)}
      onSelect={select}
    />
  );

  return (
    <div className="flex min-h-0 flex-1">
      {leftPanel}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="flex h-12 shrink-0 items-center gap-1.5 border-b px-2 sm:px-3">
          <div className="xl:hidden">{formSwitcher}</div>
          {draft ? (
            <>
              <input
                id="builder-form-name"
                value={draft.name}
                maxLength={120}
                aria-label="Form name"
                placeholder="Form name"
                onChange={e => d.commit(dr => ({ ...dr, name: e.target.value }), 'name')}
                onKeyDown={e => (e.key === 'Enter' || e.key === 'Escape') && (e.target as HTMLInputElement).blur()}
                size={Math.max(8, Math.min(34, draft.name.length + 1))}
                className="hidden h-8 min-w-0 max-w-[300px] rounded-md border border-transparent bg-transparent px-2 text-[14px] font-medium outline-none transition-colors hover:border-border focus:border-primary focus:ring-[3px] focus:ring-primary/15 xl:block"
              />
              <Tip label={descOpen ? 'Hide description' : 'Description shown to applicants'}>
                <IconButton aria-label="Form description" active={descOpen} onClick={() => setDescOpen(o => !o)} className="hidden sm:inline-flex"><AlignLeft /></IconButton>
              </Tip>
              <span className="hidden whitespace-nowrap text-xs text-muted-foreground 2xl:inline">{kind === 'Application' ? 'Application form' : 'Follow-up form'} · {count} question{count === 1 ? '' : 's'}</span>
              <SaveState dirty={dirty} saving={saving} />
            </>
          ) : (
            <div className="skeleton ml-2 h-4 w-40" />
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1">
            {draft && (errorCount > 0 || warningCount > 0) && (
              <Popover open={issuesOpen} onOpenChange={setIssuesOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn('inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors hover:bg-accent', errorCount ? 'text-tone-danger' : 'text-tone-warning')}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{errorCount ? `${errorCount} to fix` : `${warningCount} note${warningCount === 1 ? '' : 's'}`}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[360px] p-0">
                  <IssuesList
                    check={check!}
                    fields={fields}
                    onPick={id => {
                      setMode('edit');
                      select(id);
                      setIssuesOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            )}
            <div className="hidden items-center md:flex">
              <Tip label="Undo" keys={[MOD, 'Z']}>
                <IconButton aria-label="Undo" disabled={!d.canUndo} onClick={d.undo}><Undo2 /></IconButton>
              </Tip>
              <Tip label="Redo" keys={[MOD, '⇧', 'Z']}>
                <IconButton aria-label="Redo" disabled={!d.canRedo} onClick={d.redo}><Redo2 /></IconButton>
              </Tip>
            </div>
            <div className="xl:hidden">
              <Tip label="Outline">
                <IconButton aria-label="Show outline" onClick={() => setOutlineSheet(true)}><ListTree /></IconButton>
              </Tip>
            </div>
            {mode === 'edit' && (
              <div className="lg:hidden">
                <Tip label={selected ? 'Question settings' : 'Form settings'}>
                  <IconButton aria-label="Settings" onClick={() => setInspectorSheet(true)} disabled={!draft}><SlidersHorizontal /></IconButton>
                </Tip>
              </div>
            )}
            {mode === 'preview' && (
              <>
                <Segmented
                  size="sm"
                  className="hidden sm:inline-flex"
                  value={device}
                  onChange={v => setDevice(v as "desktop" | "phone")}
                  options={[
                    { value: 'desktop', label: '', icon: <Monitor />, tip: 'Desktop width' },
                    { value: 'phone', label: '', icon: <Smartphone />, tip: 'Phone width' },
                  ]}
                />
                <Tip label="Reset answers">
                  <IconButton aria-label="Reset answers" onClick={() => setPreview(emptyPreview())}><RotateCcw /></IconButton>
                </Tip>
              </>
            )}
            <Segmented
              value={mode}
              onChange={m => {
                setMode(m);
                setPaletteAt(null);
              }}
              options={[
                { value: 'edit', label: <span className="hidden sm:inline">Edit</span>, icon: <PenLine />, tip: 'Edit' },
                { value: 'preview', label: <span className="hidden sm:inline">Preview</span>, icon: <Eye />, tip: 'Preview' },
              ]}
              className="[&_button]:px-2 sm:[&_button]:px-2.5"
            />
            {ws.features.ai && draft && (
              <Button variant="ghost" size="sm" className="hidden h-7 gap-1.5 px-2 text-[12.5px] sm:inline-flex" onClick={() => setAiOpen(true)}>
                <Sparkles className="!h-3.5 !w-3.5 text-tone-accent" /> <span className="hidden lg:inline">Generate with AI</span>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton aria-label="Form actions" disabled={!draft}><MoreHorizontal /></IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {ws.features.ai && <DropdownMenuItem className="gap-2 text-[13px] sm:hidden" onSelect={() => setAiOpen(true)}><Sparkles className="h-3.5 w-3.5 text-tone-accent" /> Generate with AI</DropdownMenuItem>}
                <DropdownMenuItem className="text-[13px] sm:hidden" onSelect={() => setDescOpen(true)}>Edit description</DropdownMenuItem>
                <DropdownMenuItem className="text-[13px] md:hidden" disabled={!d.canUndo} onSelect={d.undo}>Undo</DropdownMenuItem>
                {dirty && <DropdownMenuItem className="text-[13px] sm:hidden" onSelect={discard}>Discard changes</DropdownMenuItem>}
                <DropdownMenuItem className="text-[13px]" onSelect={() => onDuplicateForm(formId)}>Duplicate as follow-up form</DropdownMenuItem>
                {kind === 'Follow-up' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-[13px] text-tone-danger focus:text-tone-danger" onSelect={() => onDeleteForm(formId)}>Delete form…</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {dirty && (
              <Button variant="ghost" size="sm" className="hidden h-7 px-2.5 text-[12.5px] sm:inline-flex" onClick={discard} disabled={saving}>Discard</Button>
            )}
            <Tip label="Save" keys={[MOD, 'S']}>
              <Button size="sm" className="h-7 gap-1.5 px-3 text-[12.5px]" disabled={!dirty || saving || !draft} onClick={() => void save()}>
                {saving && <Loader2 className="!h-3.5 !w-3.5 animate-spin" />} Save
              </Button>
            </Tip>
          </div>
        </div>

        {/* Name on narrow screens */}
        {draft && (
          <div className="flex h-10 shrink-0 items-center border-b px-2 xl:hidden">
            <input
              value={draft.name}
              maxLength={120}
              aria-label="Form name"
              placeholder="Form name"
              onChange={e => d.commit(dr => ({ ...dr, name: e.target.value }), 'name')}
              onKeyDown={e => (e.key === 'Enter' || e.key === 'Escape') && (e.target as HTMLInputElement).blur()}
              className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-[14px] font-medium outline-none hover:border-border focus:border-primary focus:ring-[3px] focus:ring-primary/15"
            />
            <span className="shrink-0 pr-2 text-xs text-muted-foreground">{count} question{count === 1 ? '' : 's'}</span>
          </div>
        )}

        {descOpen && draft && (
          <div className="shrink-0 border-b bg-subtle px-4 py-3 animate-fade-in">
            <div className="mx-auto max-w-[720px] space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="builder-form-description" className="text-[12.5px] font-medium">Description <span className="font-normal text-muted-foreground">— shown to applicants at the top of the form</span></label>
                <Segmented size="sm" value={descPreview ? 'preview' : 'write'} onChange={v => setDescPreview(v === 'preview')} options={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]} />
              </div>
              {descPreview ? (
                <div className="min-h-[60px] rounded-md border bg-background px-3 py-2">
                  {draft.description.trim() ? <Markdown compact className="text-[13.5px]">{draft.description}</Markdown> : <p className="text-xs text-muted-foreground">Nothing to preview.</p>}
                </div>
              ) : (
                <AutoTextarea
                  id="builder-form-description"
                  autoFocus
                  onFocus={e => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
                  value={draft.description}
                  minRows={2}
                  maxHeight={220}
                  maxLength={5000}
                  placeholder="How long it takes, what to have ready, and where to get help. Markdown works."
                  className={cn(textareaClass, 'bg-background')}
                  onChange={e => d.commit(dr => ({ ...dr, description: e.target.value }), 'description')}
                  onKeyDown={e => e.key === 'Escape' && setDescOpen(false)}
                />
              )}
            </div>
          </div>
        )}

        {live && (
          <div className="flex shrink-0 items-center gap-2 border-b bg-tone-info/[0.05] px-4 py-2 text-[12.5px]">
            <Info className="h-3.5 w-3.5 shrink-0 text-tone-info" />
            <span className="min-w-0">
              {kind === 'Application'
                ? 'This form is live. Changes apply to new and in-progress applications as soon as you save.'
                : `${used} task${used === 1 ? ' uses' : 's use'} this form. Changes apply to open tasks as soon as you save; submitted answers are kept.`}
            </span>
          </div>
        )}
        {restored && dirty && (
          <div className="flex shrink-0 items-center gap-2 border-b bg-tone-warning/[0.06] px-4 py-2 text-[12.5px]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-tone-warning" />
            <span className="min-w-0 flex-1">We kept the unsaved changes you made to this form earlier.</span>
            <button type="button" className="shrink-0 font-medium text-foreground hover:underline" onClick={discard}>Discard them</button>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          {!draft || isPending ? (
            <CanvasSkeleton />
          ) : mode === 'preview' ? (
            <Preview
              draft={draft}
              device={device}
              currency={ws.settings.currency}
              programName={program?.name ?? ''}
              submitLabel={kind === 'Application' ? 'Submit application' : 'Submit'}
              state={preview}
              setState={setPreview}
            />
          ) : (
            <Canvas
              draft={draft}
              selectedId={selectedId}
              onSelect={select}
              onChangeField={changeField}
              onInsert={insert}
              onDuplicate={duplicate}
              onRemove={id => void remove(id)}
              onNudge={move}
              onOpenSettings={large ? undefined : id => { select(id); setInspectorSheet(true); }}
              paletteAt={paletteAt}
              setPaletteAt={setPaletteAt}
              focus={focus}
              requestFocus={req => setFocus({ ...req, nonce: Date.now() })}
              currency={ws.settings.currency}
              issues={issues}
              onEditDescription={() => setDescOpen(true)}
              empty={empty}
            />
          )}
          {mode === 'edit' && draft && large && (
            <aside className="w-[300px] shrink-0 overflow-y-auto border-l bg-background xl:w-[320px]">{inspector}</aside>
          )}
        </div>
      </div>

      {!wide && (
        <Sheet open={outlineSheet} onOpenChange={setOutlineSheet}>
          <SheetContent side="left" className="flex w-[300px] flex-col gap-0 p-0 [&>button.absolute]:hidden">
            <div className="flex h-11 shrink-0 items-center justify-between border-b px-4">
              <SheetTitle className="text-[13px] font-medium">Outline</SheetTitle>
              <Button variant="ghost" size="sm" className="h-7 px-2.5 text-[12.5px]" onClick={() => setOutlineSheet(false)}>Done</Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pt-2">
              {draft && (
                <Outline
                  draft={draft}
                  selectedId={selectedId}
                  issues={issues}
                  onReorder={ids => d.commit(dr => ({ ...dr, fields: reorder(dr.fields, ids) }))}
                  onSelect={id => {
                    setMode('edit');
                    select(id);
                    setOutlineSheet(false);
                  }}
                />
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}
      {!large && (
        <Sheet open={inspectorSheet} onOpenChange={setInspectorSheet}>
          <SheetContent side="right" className="flex w-[min(360px,92vw)] flex-col gap-0 p-0 sm:max-w-none [&>button.absolute]:hidden">
            <div className="flex h-11 shrink-0 items-center justify-between border-b px-4">
              <SheetTitle className="text-[13px] font-medium">{selected ? 'Question settings' : 'Form settings'}</SheetTitle>
              <Button variant="ghost" size="sm" className="h-7 px-2.5 text-[12.5px]" onClick={() => setInspectorSheet(false)}>Done</Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{inspector}</div>
          </SheetContent>
        </Sheet>
      )}

      {draft && ws.features.ai && (
        <AiGenerateDialog
          open={aiOpen}
          onOpenChange={setAiOpen}
          programId={programId}
          kind={kind}
          existingLabels={fields.filter(isInputField).map(f => f.label)}
          hasFields={fields.length > 0}
          onReplace={g => void onAiReplace(g)}
          onAppend={onAiAppend}
          onUseStarter={async () => {
            if (await confirmReplace()) applyRecommended();
          }}
        />
      )}
    </div>
  );
}

function SaveState({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  if (saving) return <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</span>;
  if (dirty)
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-1 text-xs font-medium text-tone-warning">
        <span className="h-1.5 w-1.5 rounded-full bg-tone-warning" /> <span className="hidden sm:inline">Unsaved changes</span><span className="sm:hidden">Unsaved</span>
      </span>
    );
  return <span className="hidden shrink-0 items-center gap-1 whitespace-nowrap px-1 text-xs text-muted-foreground sm:inline-flex"><Check className="h-3 w-3" /> Saved</span>;
}

function IssuesList({ check, fields, onPick }: { check: NonNullable<ReturnType<typeof checkForm>> & { stripped: Array<{ id: string; label: string; reason: string }> }; fields: FormField[]; onPick: (id: string) => void }) {
  const label = (id: string | null) => (id ? fields.find(f => f.id === id)?.label || 'Untitled question' : null);
  const groups = [
    { title: 'Fix before saving', tone: 'text-tone-danger', items: check.errors.map(e => ({ id: e.fieldId, text: e.message })) },
    { title: 'Removed when you save', tone: 'text-tone-warning', items: check.stripped.map(s => ({ id: s.id, text: `Condition on “${s.label || 'Untitled question'}”: ${s.reason}` })) },
    { title: 'Worth a look', tone: 'text-muted-foreground', items: check.warnings.map(w => ({ id: w.fieldId, text: w.message })) },
  ].filter(g => g.items.length);
  return (
    <div className="max-h-[420px] overflow-y-auto py-1">
      {groups.map(g => (
        <div key={g.title} className="px-1 py-1">
          <p className={cn('px-2 pb-1 pt-1.5 text-2xs font-medium', g.tone)}>{g.title}</p>
          {g.items.map((item, i) => (
            <button
              key={i}
              type="button"
              disabled={!item.id}
              onClick={() => item.id && onPick(item.id)}
              className="block w-full rounded-md px-2 py-1.5 text-left text-[12.5px] leading-snug hover:bg-accent disabled:hover:bg-transparent"
            >
              {item.text}
              {item.id && label(item.id) && <span className="mt-0.5 block text-2xs text-muted-foreground">Go to question <Kbd className="ml-1 scale-90">↵</Kbd></span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function CanvasSkeleton() {
  return (
    <div className="min-h-0 flex-1 overflow-hidden bg-canvas">
      <div className="mx-auto max-w-[720px] space-y-3 px-8 pt-8">
        <div className="skeleton h-6 w-48" />
        <div className="skeleton h-4 w-72" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2.5 rounded-lg border bg-background p-4">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

