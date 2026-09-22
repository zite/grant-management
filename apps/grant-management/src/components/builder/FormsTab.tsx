import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, ClipboardList, Copy, FilePlus2, FileText, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { saveForm } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@project/components/ui/dropdown-menu';
import { cn } from '@project/components/lib/utils';
import { STARTERS, type StarterKey } from '@project/shared/forms/builder';
import { useAppActions } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import { qk } from '../../lib/queries';
import type { FormMeta } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { EmptyState, IconButton } from '../primitives/bits';
import { FormBuilder, type BuilderControl } from './FormBuilder';

/**
 * CONTRACT (owned by the Form builder area): the "Forms" tab of a program — the application form
 * and any follow-up forms, with the full builder for the selected one. `formId` comes from the
 * route (/programs/:programId/form/:formId); when absent, show the application form.
 */
export function FormsTab({ programId, formId }: { programId: string; formId?: string }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const control = useRef<BuilderControl | null>(null);
  const [dirty, setDirty] = useState(false);
  const [working, setWorking] = useState(false);

  const program = ws.programById.get(programId);
  const forms = ws.forms.filter(f => f.programId === programId);
  const application = forms.find(f => f.id === program?.applicationFormId) ?? forms.find(f => f.kind === 'Application');
  const followUps = forms.filter(f => f.kind !== 'Application').sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const selectedId = formId ?? application?.id ?? null;

  const go = (id: string) => navigate(`/programs/${programId}/form/${id}`);

  /** Structural changes (create, duplicate, delete) navigate away, so settle unsaved edits first. */
  const settleEdits = async () => {
    if (!control.current?.dirty) return true;
    const ok = await app.confirm({
      title: 'Discard unsaved changes?',
      description: 'The form you are editing has changes that haven’t been saved. Continuing discards them.',
      confirmLabel: 'Discard changes',
      destructive: true,
    });
    if (ok) control.current.allowLeave();
    return ok;
  };

  const run = async (task: () => Promise<void>) => {
    if (working) return;
    setWorking(true);
    try {
      await task();
    } finally {
      setWorking(false);
    }
  };

  const create = (starter: StarterKey) =>
    run(async () => {
      if (!(await settleEdits())) return;
      try {
        const res = await saveForm({ action: 'create', programId, kind: 'Follow-up', starter });
        qc.setQueryData(['form', res.id], res);
        await qc.invalidateQueries({ queryKey: qk.bootstrap });
        go(res.id);
        toast.success(`Created “${res.name}”`, { description: starter === 'blank' ? 'Add questions, then save.' : 'Adjust the questions to fit, then send it from an award.' });
      } catch (e) {
        toast.error(errorMessage(e, "Couldn't create the form"));
      }
    });

  const createApplication = () =>
    run(async () => {
      try {
        const res = await saveForm({ action: 'create', programId, kind: 'Application' });
        qc.setQueryData(['form', res.id], res);
        await qc.invalidateQueries({ queryKey: qk.bootstrap });
        go(res.id);
      } catch (e) {
        toast.error(errorMessage(e, "Couldn't create the application form"));
      }
    });

  const duplicate = (id: string) =>
    run(async () => {
      if (!(await settleEdits())) return;
      try {
        const res = await saveForm({ action: 'duplicate', id });
        qc.setQueryData(['form', res.id], res);
        await qc.invalidateQueries({ queryKey: qk.bootstrap });
        go(res.id);
        toast.success(`Created “${res.name}”`);
      } catch (e) {
        toast.error(errorMessage(e, "Couldn't duplicate the form"));
      }
    });

  const remove = (meta: Pick<FormMeta, 'id' | 'name'>) =>
    run(async () => {
      const ok = await app.confirm({
        title: `Delete “${meta.name}”?`,
        description: 'The form and its questions are deleted for good. Forms that tasks already use can’t be deleted.',
        confirmLabel: 'Delete form',
        destructive: true,
      });
      if (!ok) return;
      try {
        await saveForm({ action: 'delete', id: meta.id });
        if (meta.id === selectedId) {
          control.current?.allowLeave();
          navigate(`/programs/${programId}/form${application ? `/${application.id}` : ''}`);
        }
        qc.removeQueries({ queryKey: ['form', meta.id] });
        await qc.invalidateQueries({ queryKey: qk.bootstrap });
        toast.success(`Deleted “${meta.name}”`);
      } catch (e) {
        toast.error(errorMessage(e, "Couldn't delete the form"), { duration: 8000 });
      }
    });

  const newMenu = (trigger: React.ReactNode, align: 'start' | 'end' = 'end') => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-72">
        <DropdownMenuLabel className="text-2xs font-medium text-muted-foreground">New follow-up form</DropdownMenuLabel>
        {STARTERS.map(s => (
          <DropdownMenuItem key={s.key} className="items-start gap-2.5 py-2" onSelect={() => void create(s.key)}>
            {s.key === 'blank' ? <FilePlus2 className="mt-0.5 h-4 w-4 text-muted-foreground" /> : <ClipboardList className="mt-0.5 h-4 w-4 text-muted-foreground" />}
            <span className="min-w-0">
              <span className="block text-[13px] font-medium leading-5">{s.name}</span>
              <span className="block text-xs text-muted-foreground">{s.description}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const row = (meta: FormMeta, isApplication: boolean) => {
    const active = meta.id === selectedId;
    return (
      <div key={meta.id} className="group/form relative">
        <button
          type="button"
          onClick={() => !active && go(meta.id)}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'flex h-8 w-full items-center gap-2 rounded-md pl-2 pr-8 text-left text-[13px] transition-colors',
            active ? 'bg-accent font-medium text-foreground' : 'text-foreground/90 hover:bg-accent/60',
          )}
        >
          {isApplication ? <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ClipboardList className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 flex-1 truncate">{meta.name || 'Untitled form'}</span>
          {active && dirty ? (
            <span aria-label="Unsaved changes" title="Unsaved changes" className="h-1.5 w-1.5 shrink-0 rounded-full bg-tone-warning" />
          ) : (
            <span className="shrink-0 text-2xs tabular-nums text-muted-foreground group-hover/form:opacity-0">{meta.questionCount}</span>
          )}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton size="sm" aria-label={`Actions for ${meta.name}`} className="absolute right-1 top-1 opacity-0 focus-visible:opacity-100 group-hover/form:opacity-100 data-[state=open]:opacity-100">
              <MoreHorizontal />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem className="gap-2 text-[13px]" onSelect={() => void duplicate(meta.id)}>
              <Copy className="h-3.5 w-3.5" /> {isApplication ? 'Duplicate as follow-up form' : 'Duplicate'}
            </DropdownMenuItem>
            {!isApplication && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 text-[13px] text-tone-danger focus:text-tone-danger" onSelect={() => void remove(meta)}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete…
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const formsNav = (
    <nav aria-label="Forms" className="px-2 pb-2 pt-3">
      <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">Application form</p>
      {application ? row(application, true) : <p className="px-2 py-1 text-xs text-muted-foreground">None yet.</p>}
      <div className="mt-3 flex items-center justify-between pb-1 pl-2">
        <span className="text-xs font-medium text-muted-foreground">Follow-up forms</span>
        {newMenu(
          <IconButton size="sm" aria-label="New follow-up form" disabled={working}>
            <Plus />
          </IconButton>,
        )}
      </div>
      {followUps.map(f => row(f, false))}
      {followUps.length === 0 && (
        <p className="px-2 pb-1 text-xs text-muted-foreground">Grant agreements and reports you send to awardees.</p>
      )}
      {newMenu(
        <button type="button" disabled={working} className="mt-0.5 flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground data-[state=open]:bg-accent">
          <Plus className="h-3.5 w-3.5" /> New follow-up form
        </button>,
        'start',
      )}
    </nav>
  );

  const current = forms.find(f => f.id === selectedId);
  const formSwitcher = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="ghost-chip h-8 max-w-[150px] gap-1.5 border-border bg-background font-medium shadow-2xs sm:max-w-[260px]">
          {current?.kind === 'Follow-up' ? <ClipboardList className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate">{current?.name ?? 'Forms'}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-2xs font-medium text-muted-foreground">Application form</DropdownMenuLabel>
        {application && (
          <DropdownMenuItem className="gap-2 text-[13px]" onSelect={() => go(application.id)}>
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1 truncate">{application.name}</span>
            {application.id === selectedId && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-2xs font-medium text-muted-foreground">Follow-up forms</DropdownMenuLabel>
        {followUps.map(f => (
          <DropdownMenuItem key={f.id} className="gap-2 text-[13px]" onSelect={() => go(f.id)}>
            <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1 truncate">{f.name}</span>
            {f.id === selectedId && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
        {followUps.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">None yet.</p>}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 text-[13px]"><Plus className="h-3.5 w-3.5" /> New follow-up form</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64">
            {STARTERS.map(s => (
              <DropdownMenuItem key={s.key} className="flex-col items-start gap-0 py-1.5" onSelect={() => void create(s.key)}>
                <span className="text-[13px] font-medium">{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.description}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (!program) {
    return <EmptyState icon={<FileText />} title="Program not found" description="It may have been deleted." />;
  }

  if (!selectedId) {
    return (
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[260px] shrink-0 border-r xl:block">{formsNav}</aside>
        <div className="min-w-0 flex-1">
          <EmptyState
            icon={<FileText />}
            title="This program has no application form"
            description="Applicants need one to apply. Start from a form built for this kind of program and edit it from there."
            action={<Button size="sm" onClick={() => void createApplication()} disabled={working}>Create the application form</Button>}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FormBuilder
        key={selectedId}
        programId={programId}
        formId={selectedId}
        formsNav={formsNav}
        formSwitcher={formSwitcher}
        controlRef={control}
        onDirtyChange={setDirty}
        onDuplicateForm={id => void duplicate(id)}
        onDeleteForm={id => {
          const meta = forms.find(f => f.id === id);
          if (meta) void remove(meta);
        }}
      />
    </div>
  );
}

