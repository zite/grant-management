import { useQueryClient } from '@tanstack/react-query';
import { Braces, Eye, FileText, Loader2, Mail, PenLine } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { sendMessage } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { Switch } from '@project/components/ui/switch';
import { cn } from '@project/components/lib/utils';
import { MERGE_TAGS, renderMerge } from '@project/shared/merge';
import type { SubmissionTarget } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import { useHotkeys } from '../../lib/hotkeys';
import { refreshEverythingSoon } from '../../lib/mutations';
import { useWorkspace } from '../../lib/workspace';
import { Kbd } from '../primitives/bits';
import { MOD } from '../../lib/hotkeys';
import { previewContext } from './mergePreview';

/**
 * Write to one applicant or a hundred. Merge tags make a bulk message read as
 * personal, and the preview shows exactly what the first recipient will get.
 */
export function ComposeDialog({ open, onOpenChange, targets, initial }: { open: boolean; onOpenChange: (o: boolean) => void; targets: SubmissionTarget[]; initial?: { templateId?: string; subject?: string; body?: string } | null }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [email, setEmail] = useState(true);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const programIds = new Set(targets.map(t => t.programId));

  useEffect(() => {
    if (!open) return;
    const t = initial?.templateId ? ws.templateById.get(initial.templateId) : undefined;
    setTemplateId(t?.id ?? null);
    setSubject(initial?.subject ?? t?.subject ?? '');
    setBody(initial?.body ?? t?.body ?? '');
    setEmail(true);
    setPreview(false);
  }, [open]);

  const templates = ws.templates.filter(t => !t.programId || programIds.has(t.programId));
  const ctx = previewContext(ws, targets[0]);
  const withEmail = targets.filter(t => t.applicantEmail);

  const insertTag = (tag: string) => {
    const el = bodyRef.current;
    const token = `{{${tag}}}`;
    if (!el) return setBody(b => b + token);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const send = async () => {
    if (!subject.trim() || !body.trim()) return;
    setBusy(true);
    try {
      const res = await sendMessage({ submissionIds: targets.map(t => t.id), subject, body, templateId, sendEmail: email, kind: 'Message' });
      refreshEverythingSoon(qc, 300);
      const parts: string[] = [];
      if (res.sent) parts.push(`${res.sent} emailed`);
      if (res.portalOnly) parts.push(`${res.portalOnly} in the portal only`);
      if (res.failed) parts.push(`${res.failed} failed to email (saved in the portal)`);
      toast.success(`Message sent · ${parts.join(' · ')}`);
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't send the message"));
    } finally {
      setBusy(false);
    }
  };

  useHotkeys({ 'mod+enter': () => open && send() }, { enabled: open, allowInOverlay: true, allowInInputs: ['mod+enter'] });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle className="flex items-center gap-2 text-[15px]"><Mail className="h-4 w-4 text-muted-foreground" /> Message {targets.length === 1 ? targets[0].applicantName || 'applicant' : `${targets.length} applicants`}</DialogTitle>
          <DialogDescription className="text-[13px]">
            {targets.length === 1 ? `About ${targets[0].reference} · ${targets[0].title || 'their application'}` : 'Each applicant gets their own copy, filled in with their details.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-5 pb-4">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="ghost-chip h-8 gap-1.5 border-border">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" /> {templateId ? ws.templateById.get(templateId)?.name : 'Start from a template'}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                <DropdownMenuLabel className="text-2xs text-muted-foreground">Templates</DropdownMenuLabel>
                {templates.map(t => (
                  <DropdownMenuItem key={t.id} className="flex-col items-start gap-0 text-[13px]" onSelect={() => { setTemplateId(t.id); setSubject(t.subject); setBody(t.body); }}>
                    <span>{t.name}</span>
                    <span className="text-xs text-muted-foreground">{t.trigger === 'Manual' ? 'Manual' : `Used for: ${t.trigger}`}</span>
                  </DropdownMenuItem>
                ))}
                {templates.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground">No templates yet — add some in Settings.</div>}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-[13px]" onSelect={() => { setTemplateId(null); setSubject(''); setBody(''); }}>Blank message</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="ghost-chip h-8 gap-1.5 border-border"><Braces className="h-3.5 w-3.5 text-muted-foreground" /> Insert field</button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
                {MERGE_TAGS.map(t => (
                  <DropdownMenuItem key={t.tag} className="flex-col items-start gap-0 text-[13px]" onSelect={() => insertTag(t.tag)}>
                    <span>{t.label}</span>
                    <span className="font-mono text-2xs text-muted-foreground">{`{{${t.tag}}}`}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <button type="button" onClick={() => setPreview(p => !p)} className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline">
              {preview ? <><PenLine className="h-3 w-3" /> Edit</> : <><Eye className="h-3 w-3" /> Preview for {targets[0]?.applicantName?.split(' ')[0] || 'applicant'}</>}
            </button>
          </div>
          {preview ? (
            <div className="rounded-lg border bg-subtle p-4">
              <div className="text-[14px] font-medium">{renderMerge(subject, ctx) || <span className="text-muted-foreground">No subject</span>}</div>
              <div className="mt-3 min-h-[200px] whitespace-pre-wrap text-[13.5px] leading-relaxed">{renderMerge(body, ctx)}</div>
              {ws.settings.emailSignature && <div className="mt-4 whitespace-pre-wrap border-t pt-3 text-[12.5px] text-muted-foreground">{ws.settings.emailSignature}</div>}
            </div>
          ) : (
            <>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-[14px] outline-none focus:border-primary" />
              <textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)} placeholder="Write your message…" className="min-h-[240px] w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-[13.5px] leading-relaxed outline-none focus:border-primary" />
            </>
          )}
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">Also send by email</div>
              <div className="text-xs text-muted-foreground">
                {email ? `${withEmail.length} of ${targets.length} have an email address. Everyone sees it in the portal.` : 'Only shown in the applicant portal.'}
              </div>
            </div>
            <Switch checked={email} onCheckedChange={setEmail} />
          </label>
        </div>
        <DialogFooter className={cn('items-center border-t px-5 py-3')}>
          <span className="mr-auto hidden items-center gap-1 text-2xs text-muted-foreground sm:flex"><Kbd>{MOD}</Kbd><Kbd>↵</Kbd> to send</span>
          <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" className="h-8 text-[13px]" disabled={busy || !subject.trim() || !body.trim()} onClick={send}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Send{targets.length > 1 ? ` to ${targets.length}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
