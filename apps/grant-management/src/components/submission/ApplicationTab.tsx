import { FileText, ImageIcon, Loader2, Paperclip, PencilLine, Search, Trash2, Upload, X } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { saveAttachment, updateSubmission } from 'zitejs/api';
import { uploadFile } from 'zitejs/upload';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Switch } from '@project/components/ui/switch';
import { cn } from '@project/components/lib/utils';
import { answerToText, isEmptyValue, validateAnswers, visibleFieldIds } from '@project/shared/forms/logic';
import { isInputField, type Answers, type FileValue } from '@project/shared/forms/types';
import { AnswersView } from '@project/shared/ui/AnswersView';
import { FormRenderer } from '@project/shared/ui/FormRenderer';
import { fileSize } from '@project/shared/ui/Markdown';
import { useAppActions } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import type { Attachment, SubmissionDetail } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Kbd } from '../primitives/bits';
import { RelTime, useDetailCache } from './detailBits';

export type ApplicationTabHandle = { focusSearch: () => void };

function readShowEmpty() {
  try {
    return localStorage.getItem('grants:detail:show-unanswered') === '1';
  } catch {
    return false;
  }
}

export const ApplicationTab = forwardRef<ApplicationTabHandle, { detail: SubmissionDetail }>(function ApplicationTab({ detail }, ref) {
  const ws = useWorkspace();
  const { form, submission } = detail;
  const [showEmpty, setShowEmpty] = useState(readShowEmpty);
  const [query, setQuery] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const answersRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({ focusSearch: () => searchRef.current?.focus() }));

  const fields = form?.fields ?? [];
  const answers = submission.answers as Answers;
  const stats = useMemo(() => {
    const visible = visibleFieldIds(fields, answers);
    const inputs = fields.filter(f => isInputField(f) && visible.has(f.id));
    const unanswered = inputs.filter(f => isEmptyValue(answers[f.id])).length;
    const q = query.trim().toLowerCase();
    const matches = q.length >= 2 ? inputs.filter(f => answerToText(f, answers).toLowerCase().includes(q) || f.label.toLowerCase().includes(q)).length : 0;
    return { total: inputs.length, unanswered, answered: inputs.length - unanswered, matches };
  }, [fields, answers, query]);

  // Bring the first highlighted answer into view as the search narrows.
  useEffect(() => {
    if (query.trim().length < 2) return;
    const t = window.setTimeout(() => answersRef.current?.querySelector('mark')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 180);
    return () => window.clearTimeout(t);
  }, [query]);

  return (
    <div className="space-y-8 animate-fade-in">
      {form ? (
        <section>
          <div className="z-[9] -mx-1 mb-2 flex flex-wrap items-center gap-2 bg-background/95 px-1 pb-2 pt-0 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:sticky sm:top-[41px] sm:pt-2">
            <div className="flex h-8 min-w-0 basis-full items-center gap-1.5 rounded-md border bg-background px-2.5 focus-within:border-primary/60 sm:max-w-[280px] sm:flex-1 sm:basis-auto">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setQuery('');
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="Find in answers"
                aria-label="Find in answers"
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
              />
              {query ? (
                <>
                  <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{query.trim().length >= 2 ? `${stats.matches} match${stats.matches === 1 ? '' : 'es'}` : ''}</span>
                  <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                </>
              ) : (
                <Kbd className="shrink-0">/</Kbd>
              )}
            </div>
            <label className="flex cursor-pointer items-center gap-2 px-1 text-xs text-muted-foreground">
              <Switch
                checked={showEmpty}
                onCheckedChange={v => {
                  setShowEmpty(v);
                  try {
                    localStorage.setItem('grants:detail:show-unanswered', v ? '1' : '0');
                  } catch {
                    /* ignore */
                  }
                }}
                className="scale-90"
              />
              Show unanswered{stats.unanswered ? ` (${stats.unanswered})` : ''}
            </label>
            <button type="button" onClick={() => setEditOpen(true)} className="ml-auto flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
              <PencilLine className="h-3.5 w-3.5" /> Edit answers
            </button>
          </div>
          <div ref={answersRef}>
            {stats.answered === 0 && !showEmpty ? (
              <div className="rounded-lg border border-dashed px-6 py-8 text-center">
                <p className="text-[13.5px] font-medium">No answers yet</p>
                <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
                  {submission.status === 'Draft' ? 'The applicant hasn’t filled anything in. If it came in on paper or by email, you can type it in for them.' : 'Nothing was answered. If the application came in on paper or by email, type the answers in.'}
                </p>
                <button type="button" onClick={() => setEditOpen(true)} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-[13px] font-medium shadow-2xs hover:bg-accent">
                  <PencilLine className="h-3.5 w-3.5" /> Fill in the answers
                </button>
              </div>
            ) : (
              <AnswersView fields={fields} answers={answers} currency={ws.settings.currency} hideEmpty={!showEmpty} highlight={query.trim()} />
            )}
          </div>
          <EditAnswersDialog open={editOpen} onOpenChange={setEditOpen} detail={detail} />
        </section>
      ) : (
        <div className="rounded-lg border border-dashed px-6 py-10 text-center">
          <FileText className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-[13.5px] font-medium">This program has no application form</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">Build one in the program’s Forms tab. Anything staff attach below still stays with the submission.</p>
        </div>
      )}
      <StaffDocuments detail={detail} />
    </div>
  );
});

function EditAnswersDialog({ open, onOpenChange, detail }: { open: boolean; onOpenChange: (o: boolean) => void; detail: SubmissionDetail }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const { refresh } = useDetailCache(detail.submission.id);
  const [answers, setAnswers] = useState<Answers>({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const fields = detail.form?.fields ?? [];

  useEffect(() => {
    if (!open) return;
    setAnswers(detail.submission.answers as Answers);
    setDirty(false);
  }, [open]);

  const errors = useMemo(() => (open ? validateAnswers(fields, answers) : {}), [open, fields, answers]);
  const errorCount = Object.keys(errors).length;

  const save = async () => {
    setBusy(true);
    try {
      await updateSubmission({ id: detail.submission.id, answers });
      toast.success('Answers updated · the change is in the history');
      refresh({ delay: 300 });
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't save the answers"));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (dirty && !(await app.confirm({ title: 'Discard your changes?', description: 'The answers stay as they were before you started editing.', confirmLabel: 'Discard changes', destructive: true }))) return;
    onOpenChange(false);
  };

  const upload = async (file: File): Promise<FileValue> => {
    const { fileUrl } = await uploadFile({ data: file, filename: file.name });
    return { url: fileUrl, name: file.name, size: file.size, type: file.type };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90dvh] max-w-3xl flex-col gap-0 p-0"
        // Unsaved corrections never vanish on a stray Escape or click outside; Cancel asks first.
        onEscapeKeyDown={e => dirty && (e.preventDefault(), cancel())}
        onPointerDownOutside={e => dirty && e.preventDefault()}
      >
        <DialogHeader className="border-b px-5 pb-3 pt-5">
          <DialogTitle className="flex items-center gap-2 text-[15px]"><PencilLine className="h-4 w-4 text-muted-foreground" /> Edit answers</DialogTitle>
          <DialogDescription className="text-[13px]">
            For corrections — a typo, a figure the applicant confirmed by email, a paper form typed in. The change is recorded in the submission’s history with your name.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <FormRenderer
            fields={fields}
            answers={answers}
            onChange={next => {
              setAnswers(next);
              setDirty(true);
            }}
            currency={ws.settings.currency}
            upload={upload}
            idPrefix="staff-edit"
            eagerErrors
          />
        </div>
        <DialogFooter className="items-center border-t px-5 py-3">
          <span className="mr-auto text-xs text-muted-foreground">
            {errorCount ? `${errorCount} answer${errorCount === 1 ? '' : 's'} wouldn’t pass the applicant’s checks — staff can still save.` : dirty ? 'Unsaved changes' : 'No changes yet'}
          </span>
          <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={cancel}>Cancel</Button>
          <Button size="sm" className="h-8 text-[13px]" disabled={busy || !dirty} onClick={save}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save answers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Uploading = { key: string; name: string; size: number };

function StaffDocuments({ detail }: { detail: SubmissionDetail }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const { patch, refresh } = useDetailCache(detail.submission.id);
  const [uploading, setUploading] = useState<Uploading[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { attachments, submission } = detail;

  const addFiles = async (files: File[]) => {
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`${file.name} is over 50 MB — try a smaller file`);
        continue;
      }
      const key = `${file.name}-${Date.now()}-${Math.random()}`;
      setUploading(u => [...u, { key, name: file.name, size: file.size }]);
      try {
        const { fileUrl } = await uploadFile({ data: file, filename: file.name });
        const res = await saveAttachment({ action: 'create', submissionId: submission.id, name: file.name, url: fileUrl, size: file.size, mimeType: file.type || 'application/octet-stream' });
        const added: Attachment = { id: res.id, name: file.name, url: fileUrl, size: file.size, mimeType: file.type, uploadedById: ws.me.id, uploadedAt: new Date().toISOString() };
        patch(d => ({ ...d, attachments: [...d.attachments, added] }));
      } catch (e) {
        toast.error(errorMessage(e, `Couldn't upload ${file.name}`));
      } finally {
        setUploading(u => u.filter(x => x.key !== key));
      }
    }
    refresh({ delay: 600 });
  };

  const remove = async (a: Attachment) => {
    const ok = await app.confirm({ title: `Remove ${a.name}?`, description: 'It’s removed from this submission for your whole team.', confirmLabel: 'Remove', destructive: true });
    if (!ok) return;
    patch(d => ({ ...d, attachments: d.attachments.filter(x => x.id !== a.id) }));
    try {
      await saveAttachment({ action: 'delete', submissionId: submission.id, id: a.id });
      toast.success(`Removed ${a.name}`);
      refresh({ delay: 600 });
    } catch (e) {
      patch(d => ({ ...d, attachments: [...d.attachments, a] }));
      toast.error(errorMessage(e, "Couldn't remove the document"));
    }
  };

  return (
    <section
      onDragOver={e => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={e => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        addFiles([...e.dataTransfer.files]);
      }}
      className={cn('rounded-lg transition-shadow', dragging && 'ring-2 ring-primary/40 ring-offset-4 ring-offset-background')}
    >
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Staff documents</h3>
        <span className="text-xs text-muted-foreground">· only your team sees these</span>
        <button type="button" onClick={() => input.current?.click()} className="ml-auto flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium shadow-2xs hover:bg-accent">
          <Upload className="h-3.5 w-3.5" /> Upload
        </button>
        <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          onChange={e => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            if (files.length) addFiles(files);
          }}
        />
      </div>
      {attachments.length === 0 && uploading.length === 0 ? (
        <button type="button" onClick={() => input.current?.click()} className="flex w-full flex-col items-center rounded-lg border border-dashed px-6 py-6 text-center text-[13px] text-muted-foreground transition-colors hover:bg-accent/50">
          <Paperclip className="mb-1.5 h-4 w-4" />
          Drop site-visit notes, signed forms or due-diligence checks here
        </button>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {attachments.map(a => {
            const uploader = a.uploadedById ? ws.memberById.get(a.uploadedById) : undefined;
            const Icon = a.mimeType.startsWith('image/') ? ImageIcon : FileText;
            return (
              <li key={a.id} className="group flex items-center gap-3 px-3 py-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground"><Icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <a href={a.url} target="_blank" rel="noreferrer" className="block truncate text-[13px] font-medium hover:underline">{a.name}</a>
                  <span className="block truncate text-xs text-muted-foreground">
                    {fileSize(a.size)}{uploader ? ` · ${uploader.name}` : ''} · <RelTime iso={a.uploadedAt} />
                  </span>
                </span>
                <button type="button" onClick={() => remove(a)} aria-label={`Remove ${a.name}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
          {uploading.map(u => (
            <li key={u.key} className="flex items-center gap-3 px-3 py-2 text-muted-foreground">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted"><Loader2 className="h-4 w-4 animate-spin" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{u.name}</span>
                <span className="block text-xs">Uploading · {fileSize(u.size)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
