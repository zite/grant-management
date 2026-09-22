import { Bell, CalendarClock, Check, ChevronRight, ClipboardList, Loader2, MoreHorizontal, Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { saveTask } from 'zitejs/api';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { Textarea } from '@project/components/ui/textarea';
import { cn } from '@project/components/lib/utils';
import type { FileValue } from '@project/shared/forms/types';
import { AnswersView, FileList } from '@project/shared/ui/AnswersView';
import { Markdown } from '@project/shared/ui/Markdown';
import { useAppActions } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import { dueLabel, shortDate } from '../../lib/format';
import type { SubmissionDetail, Task } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { MemberAvatar } from '../primitives/Avatar';
import { DatePicker } from '../pickers/pickers';
import { RelTime, ToneChip, useDetailCache, type Tone } from './detailBits';
import { RequestInfoDialog } from './RequestInfoDialog';

export const TASK_META: Record<string, { label: string; tone: Tone }> = {
  Open: { label: 'Waiting on applicant', tone: 'neutral' },
  Submitted: { label: 'Ready to review', tone: 'accent' },
  Approved: { label: 'Approved', tone: 'success' },
  Returned: { label: 'Returned for changes', tone: 'warning' },
};

export function TasksTab({ detail, onRequest }: { detail: SubmissionDetail; onRequest: () => void }) {
  const { tasks } = detail;
  const [editing, setEditing] = useState<Task | null>(null);
  const order: Record<string, number> = { Submitted: 0, Returned: 1, Open: 2, Approved: 3 };
  const sorted = [...tasks].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || (b.requestedAt ?? '').localeCompare(a.requestedAt ?? ''));
  const canRequest = detail.submission.status !== 'Withdrawn' && Boolean(detail.submission.applicantId);

  return (
    <div className="animate-fade-in">
      <div className="mb-3 flex items-center gap-2">
        <p className="text-[13px] text-muted-foreground">
          {tasks.length ? `${tasks.filter(t => t.status === 'Submitted').length} to review · ${tasks.filter(t => t.status === 'Open' || t.status === 'Returned').length} waiting on the applicant` : 'Follow-up requests the applicant answers in the portal.'}
        </p>
        {canRequest && (
          <button type="button" onClick={onRequest} className="ml-auto flex h-7 shrink-0 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium shadow-2xs hover:bg-accent">
            <Plus className="h-3.5 w-3.5" /> Request information
          </button>
        )}
      </div>
      {tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-10 text-center">
          <ClipboardList className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-[13.5px] font-medium">No follow-up requests</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">Ask for a revised budget, a signed agreement or a final report. The applicant answers in the portal and you approve it here.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {sorted.map(t => (
            <TaskCard key={t.id} task={t} detail={detail} onEdit={() => setEditing(t)} />
          ))}
        </div>
      )}
      <RequestInfoDialog open={Boolean(editing)} onOpenChange={o => !o && setEditing(null)} detail={detail} task={editing} />
    </div>
  );
}

function TaskCard({ task, detail, onEdit }: { task: Task; detail: SubmissionDetail; onEdit: () => void }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const { patch, refresh } = useDetailCache(detail.submission.id);
  const [open, setOpen] = useState(task.status === 'Submitted');
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [dueOpen, setDueOpen] = useState(false);
  // Opening the date picker from the menu waits for the menu to finish closing, or its focus return would dismiss the picker.
  const pendingDue = useRef(false);
  const meta = TASK_META[task.status] ?? TASK_META.Open;
  const waiting = task.status === 'Open' || task.status === 'Returned';
  const due = waiting ? dueLabel(task.dueDate) : null;
  const requester = task.requestedById ? ws.memberById.get(task.requestedById) : undefined;
  const reviewer = task.reviewedById ? ws.memberById.get(task.reviewedById) : undefined;
  const answered = task.status !== 'Open' || Boolean(task.submittedAt);
  const firstName = detail.applicant?.name?.split(' ')[0] || 'the applicant';

  const run = async (action: 'approve' | 'return' | 'remind' | 'delete' | 'update', extra: Record<string, unknown> = {}, success?: string) => {
    setBusy(action);
    try {
      const res = await saveTask({ action, id: task.id, ...extra });
      if (action === 'delete') patch(d => ({ ...d, tasks: d.tasks.filter(x => x.id !== task.id) }));
      else if (res.status) patch(d => ({ ...d, tasks: d.tasks.map(x => (x.id === task.id ? { ...x, status: res.status!, ...(extra.dueDate !== undefined ? { dueDate: extra.dueDate as string | null } : {}), ...(action === 'approve' || action === 'return' ? { reviewedAt: new Date().toISOString(), reviewedById: ws.me.id, reviewNote: String(extra.reviewNote ?? '') } : {}) } : x)) }));
      if (success) toast.success(res.delivery === 'Failed' ? `${success} — the email failed, but it’s in their portal` : success);
      refresh({ delay: 400 });
      return true;
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't update the request"));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const response = task.answers as { response?: unknown; files?: unknown };
  const freeText = typeof response.response === 'string' ? response.response : '';
  const freeFiles = Array.isArray(response.files) ? (response.files as FileValue[]) : [];

  return (
    <div className={cn('overflow-hidden rounded-lg border bg-card shadow-2xs', task.status === 'Submitted' && 'border-tone-accent/40')}>
      <div className="flex items-start gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-label={open ? 'Collapse request' : 'Expand request'}
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-90')} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button type="button" onClick={() => setOpen(o => !o)} className="text-left text-[13.5px] font-medium hover:underline">{task.title}</button>
            <ToneChip tone={meta.tone}>{meta.label}</ToneChip>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span>{task.formId ? (task.formName && task.formName !== task.title ? task.formName : 'Follow-up form') : 'Free-form'}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              {requester && <MemberAvatar member={requester} size={14} />}
              {requester ? requester.name.split(' ')[0] : 'Requested'} <RelTime iso={task.requestedAt} />
            </span>
            {task.submittedAt && (
              <>
                <span aria-hidden>·</span>
                <RelTime iso={task.submittedAt} prefix={`${firstName} answered`} />
              </>
            )}
            {waiting && (
              <>
                <span aria-hidden>·</span>
                <DatePicker
                  open={dueOpen}
                  onOpenChange={setDueOpen}
                  value={task.dueDate}
                  clearLabel="No due date"
                  onChange={v => run('update', { dueDate: v }, v ? `Due ${shortDate(v)}` : 'Due date cleared')}
                  trigger={
                    <button type="button" className={cn('inline-flex items-center gap-1 rounded px-1 hover:bg-accent hover:text-foreground', due?.tone === 'overdue' && 'font-medium text-tone-danger', due?.tone === 'soon' && 'text-tone-warning')}>
                      <CalendarClock className="h-3 w-3" />
                      {due ? (due.tone === 'overdue' ? `Overdue · ${due.label}` : `Due ${due.label}`) : 'No due date'}
                    </button>
                  }
                />
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {task.status === 'Submitted' && !returning && (
            <>
              <button type="button" disabled={Boolean(busy)} onClick={() => setReturning(true)} className="hidden h-7 items-center gap-1 rounded-md border bg-background px-2 text-xs hover:bg-accent sm:flex">
                <Undo2 className="h-3.5 w-3.5" /> Return
              </button>
              <button type="button" disabled={Boolean(busy)} onClick={() => run('approve', {}, `Approved “${task.title}”`)} className="flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                {busy === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
              </button>
            </>
          )}
          {waiting && (
            <button type="button" disabled={Boolean(busy)} onClick={() => run('remind', {}, `Reminded ${firstName}`)} className="hidden h-7 items-center gap-1 rounded-md border bg-background px-2 text-xs hover:bg-accent sm:flex">
              {busy === 'remind' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />} Remind
            </button>
          )}
          {(waiting || task.status === 'Submitted') && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Request actions" className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52" onCloseAutoFocus={e => { if (pendingDue.current) { e.preventDefault(); pendingDue.current = false; setDueOpen(true); } }}>
                {task.status === 'Submitted' && (
                  <>
                    <DropdownMenuItem className="text-[13px]" onSelect={() => run('approve', {}, `Approved “${task.title}”`)}><Check className="h-3.5 w-3.5" /> Approve</DropdownMenuItem>
                    <DropdownMenuItem className="text-[13px]" onSelect={() => { setOpen(true); setReturning(true); }}><Undo2 className="h-3.5 w-3.5" /> Return with a note…</DropdownMenuItem>
                  </>
                )}
                {waiting && (
                  <>
                    <DropdownMenuItem className="text-[13px]" onSelect={() => run('remind', {}, `Reminded ${firstName}`)}><Bell className="h-3.5 w-3.5" /> Send a reminder</DropdownMenuItem>
                    <DropdownMenuItem className="text-[13px]" onSelect={onEdit}><Pencil className="h-3.5 w-3.5" /> Edit request…</DropdownMenuItem>
                    <DropdownMenuItem className="text-[13px]" onSelect={() => { pendingDue.current = true; }}><CalendarClock className="h-3.5 w-3.5" /> Change due date…</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-[13px] text-destructive focus:text-destructive"
                      onSelect={async () => {
                        const ok = await app.confirm({ title: `Delete “${task.title}”?`, description: `It disappears from ${firstName}’s portal. Anything they started filling in is lost.`, confirmLabel: 'Delete request', destructive: true });
                        if (ok) run('delete', {}, 'Request deleted');
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete…
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {returning && (
        <div className="border-t bg-subtle px-3 py-3 animate-fade-in">
          <label htmlFor={`return-${task.id}`} className="text-xs font-medium text-muted-foreground">What needs to change? {firstName} sees this note.</label>
          <Textarea
            id={`return-${task.id}`}
            autoFocus
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && note.trim()) {
                e.preventDefault();
                run('return', { reviewNote: note.trim(), notify: true }, `Returned to ${firstName}`).then(ok => ok && (setReturning(false), setNote('')));
              }
            }}
            placeholder="e.g. The budget still lists transportation — please remove it or explain who covers it."
            className="mt-1.5 min-h-[72px] bg-background text-[13px]"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button type="button" onClick={() => { setReturning(false); setNote(''); }} className="h-7 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">Cancel</button>
            <button
              type="button"
              disabled={!note.trim() || Boolean(busy)}
              onClick={() => run('return', { reviewNote: note.trim(), notify: true }, `Returned to ${firstName}`).then(ok => ok && (setReturning(false), setNote('')))}
              className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy === 'return' && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Return and email {firstName}
            </button>
          </div>
        </div>
      )}

      {open && (
        <div className="space-y-3 border-t px-3 pb-3 pt-3 sm:pl-10">
          {task.instructions && (
            <div>
              <div className="mb-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground">Instructions</div>
              <Markdown compact className="text-[13px] text-foreground/90">{task.instructions}</Markdown>
            </div>
          )}
          {task.reviewNote && (task.status === 'Returned' || task.status === 'Approved') && (
            <div className={cn('rounded-md border px-3 py-2 text-[13px]', task.status === 'Returned' ? 'border-tone-warning/30 bg-tone-warning/[0.05]' : 'bg-subtle')}>
              <div className="mb-0.5 text-xs text-muted-foreground">
                {reviewer?.name ?? 'Staff'} {task.status === 'Returned' ? 'asked for changes' : 'approved'} <RelTime iso={task.reviewedAt} />
              </div>
              <div className="whitespace-pre-wrap">{task.reviewNote}</div>
            </div>
          )}
          {task.status === 'Approved' && !task.reviewNote && reviewer && (
            <p className="text-xs text-muted-foreground">Approved by {reviewer.name} <RelTime iso={task.reviewedAt} /></p>
          )}
          {answered ? (
            <div>
              <div className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">{firstName}’s response</div>
              {task.formId && task.fields.length ? (
                <AnswersView fields={task.fields} answers={task.answers} currency={ws.settings.currency} dense hideEmpty />
              ) : freeText || freeFiles.length ? (
                <div className="rounded-lg border bg-background px-3.5 py-3">
                  {freeText && <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{freeText}</div>}
                  {freeFiles.length > 0 && <FileList files={freeFiles} />}
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground">Nothing was included.</p>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">{firstName} hasn’t responded yet{task.dueDate ? `. It’s due ${shortDate(task.dueDate)}` : ''}.</p>
          )}
        </div>
      )}
    </div>
  );
}
