import { CalendarDays, ClipboardList, Loader2, MessageSquareText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { saveTask } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Switch } from '@project/components/ui/switch';
import { Textarea } from '@project/components/ui/textarea';
import { cn } from '@project/components/lib/utils';
import { errorMessage } from '../../lib/errors';
import { MOD, useHotkeys } from '../../lib/hotkeys';
import { addDays, shortDate } from '../../lib/format';
import type { SubmissionDetail, Task } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Kbd } from '../primitives/bits';
import { DatePicker } from '../pickers/pickers';
import { useDetailCache } from './detailBits';

/**
 * Ask the applicant for something more: one of the program's follow-up forms,
 * or a free-form request they answer with a note and files. With `task`, edits
 * an existing request's title, instructions and due date instead.
 */
export function RequestInfoDialog({ open, onOpenChange, detail, task, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; detail: SubmissionDetail; task?: Task | null; onCreated?: () => void }) {
  const ws = useWorkspace();
  const { patch, refresh } = useDetailCache(detail.submission.id);
  const forms = useMemo(() => ws.forms.filter(f => f.programId === detail.submission.programId && f.kind === 'Follow-up').sort((a, b) => a.position - b.position), [ws.forms, detail.submission.programId]);
  const [formId, setFormId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [due, setDue] = useState<string | null>(addDays(14));
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  const editing = Boolean(task);

  useEffect(() => {
    if (!open) return;
    setFormId(task?.formId ?? null);
    setTitle(task?.title ?? '');
    setTitleTouched(Boolean(task));
    setInstructions(task?.instructions ?? '');
    setDue(task ? task.dueDate : addDays(14));
    setNotify(true);
  }, [open, task?.id]);

  const template = ws.templates.find(t => t.trigger === 'Task requested' && t.enabled && (!t.programId || t.programId === detail.submission.programId));
  const form = formId ? ws.formById.get(formId) : undefined;
  const firstName = detail.applicant?.name?.split(' ')[0] || 'the applicant';
  const canSubmit = Boolean((title.trim() || form) && (form || instructions.trim()));

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    if (task) {
      try {
        const next = { title: title.trim() || task.title, instructions: instructions.trim(), dueDate: due };
        await saveTask({ action: 'update', id: task.id, title: next.title, instructions: next.instructions || null, dueDate: next.dueDate });
        patch(d => ({ ...d, tasks: d.tasks.map(t => (t.id === task.id ? { ...t, ...next } : t)) }));
        toast.success('Request updated — the applicant sees the change in the portal');
        refresh({ delay: 300 });
        onOpenChange(false);
      } catch (e) {
        toast.error(errorMessage(e, "Couldn't update the request"));
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      const res = await saveTask({ action: 'create', submissionId: detail.submission.id, formId, title: title.trim() || form?.name, instructions: instructions.trim() || null, dueDate: due, notify });
      toast.success(notify ? (res.delivery === 'Failed' ? `Request created — the email to ${firstName} failed, but it’s in their portal` : `Asked ${firstName} for “${title.trim() || form?.name}”`) : 'Request created — it’s waiting in their portal');
      refresh({ delay: 300 });
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't create the request"));
    } finally {
      setBusy(false);
    }
  };

  useHotkeys({ 'mod+enter': submit }, { enabled: open, allowInOverlay: true, allowInInputs: ['mod+enter'] });

  const choice = (id: string | null, label: string, hint: string, Icon: typeof ClipboardList) => (
    <button
      key={id ?? 'free'}
      type="button"
      role="radio"
      aria-checked={formId === id}
      onClick={() => {
        setFormId(id);
        if (!titleTouched) setTitle(id ? ws.formById.get(id)?.name ?? '' : '');
      }}
      className={cn('flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors', formId === id ? 'border-primary/60 bg-primary/[0.05] ring-1 ring-primary/30' : 'hover:bg-accent')}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle className="flex items-center gap-2 text-[15px]"><ClipboardList className="h-4 w-4 text-muted-foreground" /> {editing ? 'Edit request' : 'Request information'}</DialogTitle>
          <DialogDescription className="text-[13px]">
            {editing ? `Changes show in ${firstName === 'the applicant' ? 'the applicant' : firstName}’s portal straight away. Nothing is emailed.` : `${firstName === 'the applicant' ? 'The applicant' : firstName} answers in the portal, and you review what comes back here.`}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 pb-5">
          {!editing && <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">What do you need?</div>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Request type">
              {forms.map(f => choice(f.id, f.name, `${f.questionCount} question${f.questionCount === 1 ? '' : 's'}${f.description ? ` · ${f.description}` : ''}`, ClipboardList))}
              {choice(null, 'Free-form request', 'They reply with a note and files', MessageSquareText)}
            </div>
            {forms.length === 0 && <p className="text-xs text-muted-foreground">This program has no follow-up forms. Build one in the program’s Forms tab to collect structured answers.</p>}
          </div>}
          <div className="space-y-1.5">
            <label htmlFor="task-title" className="text-xs font-medium text-muted-foreground">Title the applicant sees</label>
            <input
              id="task-title"
              value={title}
              onChange={e => { setTitle(e.target.value); setTitleTouched(true); }}
              placeholder={form ? form.name : 'e.g. Upload a revised budget'}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13px] outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="task-instructions" className="text-xs font-medium text-muted-foreground">Instructions {form ? '(optional)' : ''}</label>
            <Textarea
              id="task-instructions"
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder={form ? 'Anything to add to the form' : 'Say exactly what you need and why, so they can get it right the first time.'}
              className="min-h-[96px] text-[13px]"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-muted-foreground">Due</span>
            <DatePicker
              value={due}
              onChange={setDue}
              clearLabel="No due date"
              trigger={
                <button type="button" className="ghost-chip h-8 gap-1.5 border-border">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" /> {due ? shortDate(due) : 'No due date'}
                </button>
              }
            />
          </div>
          {!editing && <label className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">Email {firstName}</div>
              <div className="text-xs text-muted-foreground">
                {notify ? (template ? `Uses your “${template.name}” template.` : 'Sends a short standard request with a link to the portal.') : 'It still appears in their portal; they just won’t get an email.'}
              </div>
            </div>
            <Switch checked={notify} onCheckedChange={setNotify} />
          </label>}
        </div>
        <DialogFooter className="items-center border-t px-5 py-3">
          <span className="mr-auto hidden items-center gap-1 text-2xs text-muted-foreground sm:flex"><Kbd>{MOD}</Kbd><Kbd>↵</Kbd> {editing ? 'to save' : 'to send'}</span>
          <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" className="h-8 text-[13px]" disabled={busy || !canSubmit} onClick={submit}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {editing ? 'Save changes' : notify ? 'Send request' : 'Create request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
