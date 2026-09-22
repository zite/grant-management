import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Braces, Copy, Globe, Loader2, Send, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { saveTemplate, sendTestEmail } from 'zitejs/api';
import { formatMoney } from '@project/shared/forms/logic';
import { MERGE_TAGS, renderMerge, sampleMergeContext } from '@project/shared/merge';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@project/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { Input } from '@project/components/ui/input';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Switch } from '@project/components/ui/switch';
import { cn } from '@project/components/lib/utils';
import { useAppActions } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import { MOD } from '../../lib/hotkeys';
import { qk } from '../../lib/queries';
import type { Bootstrap, EmailTemplate } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Glyph, Kbd, Tip } from '../primitives/bits';
import { TRIGGER_INFO, TRIGGERS, type Trigger } from './constants';
import { Field, inputClass, selectItemClass, selectTriggerClass } from './ui';

const ALL = '__all__';
const KNOWN = new Set(MERGE_TAGS.map(t => t.tag));

export type TemplateDraft = { name: string; subject: string; body: string; trigger: Trigger; programId: string | null; enabled: boolean };

const asTrigger = (t: string): Trigger => ((TRIGGERS as readonly string[]).includes(t) ? (t as Trigger) : 'Manual');

function unknownTags(...texts: string[]) {
  const found = new Set<string>();
  for (const text of texts) for (const m of text.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) if (!KNOWN.has(m[1].toLowerCase())) found.add(m[1]);
  return [...found];
}

/** The email as an applicant would see it: the same paragraphs, button and signature the send path builds. */
function EmailPreview({ draft }: { draft: TemplateDraft }) {
  const ws = useWorkspace();
  const ctx = useMemo(
    () => ({ ...sampleMergeContext(), organization_name: ws.settings.organizationName, award_amount: formatMoney(5000, ws.settings.currency), ...(ws.settings.portalUrl ? { portal_link: ws.settings.portalUrl } : {}) }),
    [ws.settings],
  );
  const subject = renderMerge(draft.subject, ctx);
  const paragraphs = renderMerge(draft.body, ctx).replace(/\r\n/g, '\n').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const signature = ws.settings.emailSignature.trim();
  const sample = sampleMergeContext();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-4 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Preview</span>
        <span>· filled in with sample data</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <div className="mx-auto max-w-[520px] overflow-hidden rounded-lg border bg-background shadow-xs">
          <dl className="space-y-1 border-b px-4 py-3 text-xs">
            <div className="flex gap-2"><dt className="w-14 shrink-0 text-muted-foreground">To</dt><dd className="truncate">{sample.applicant_name} &lt;{sample.applicant_email}&gt;</dd></div>
            <div className="flex gap-2"><dt className="w-14 shrink-0 text-muted-foreground">Reply to</dt><dd className="truncate">{ws.settings.supportEmail || <span className="text-faint">No support email set</span>}</dd></div>
            <div className="flex gap-2"><dt className="w-14 shrink-0 text-muted-foreground">Subject</dt><dd className="truncate font-medium">{subject || <span className="font-normal text-faint">No subject</span>}</dd></div>
          </dl>
          <div className="space-y-3 px-5 py-5 text-[13.5px] leading-relaxed">
            {ws.settings.logoUrl && <img src={ws.settings.logoUrl} alt="" className="h-8 w-auto max-w-[140px] object-contain" onError={e => (e.currentTarget.style.display = 'none')} />}
            {paragraphs.length ? paragraphs.map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>) : <p className="text-faint">Start writing the message…</p>}
            <div className="pt-1">
              <span className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground">View in the portal</span>
            </div>
            {signature && (
              <>
                <hr className="!my-4 border-border" />
                <p className="whitespace-pre-line text-[13px] text-muted-foreground">{signature}</p>
              </>
            )}
          </div>
        </div>
        {!ws.settings.portalUrl && <p className="mx-auto mt-3 max-w-[520px] text-xs text-muted-foreground">The portal button only appears once the Applicant Portal app is published.</p>}
      </div>
    </div>
  );
}

export function TemplateEditor({ open, onOpenChange, template, initial, onOpenTemplate }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: EmailTemplate | null;
  /** Starting values for a new template (a trigger chosen from its group). */
  initial?: Partial<TemplateDraft>;
  onOpenTemplate: (id: string) => void;
}) {
  const ws = useWorkspace();
  const app = useAppActions();
  const qc = useQueryClient();
  const blank: TemplateDraft = { name: '', subject: '', body: '', trigger: 'Manual', programId: null, enabled: true };
  const [draft, setDraft] = useState<TemplateDraft>(blank);
  const [base, setBase] = useState<TemplateDraft>(blank);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'test' | 'duplicate' | 'delete'>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<'subject' | 'body'>('body');

  useEffect(() => {
    if (!open) return;
    const next: TemplateDraft = template
      ? { name: template.name, subject: template.subject, body: template.body, trigger: asTrigger(template.trigger), programId: template.programId, enabled: template.enabled }
      : { ...blank, ...initial };
    setDraft(next);
    setBase(next);
    setTouched(false);
  }, [open, template?.id]);

  const set = (patch: Partial<TemplateDraft>) => setDraft(d => ({ ...d, ...patch }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  const automatic = TRIGGER_INFO[draft.trigger].automatic;
  const errors = {
    name: draft.name.trim() ? null : 'Name the template',
    subject: draft.subject.trim() ? null : 'Add a subject line',
    body: draft.body.trim() ? null : 'Write the message',
  };
  const invalid = Object.values(errors).some(Boolean);
  const unknown = unknownTags(draft.subject, draft.body);

  const close = async () => {
    if (dirty && !(await app.confirm({ title: 'Discard your changes?', description: 'Your edits to this template haven’t been saved.', confirmLabel: 'Discard', destructive: true }))) return;
    onOpenChange(false);
  };

  const insertTag = (tag: string) => {
    const token = `{{${tag}}}`;
    const field = lastField.current;
    const el = field === 'subject' ? subjectRef.current : bodyRef.current;
    const value = field === 'subject' ? draft.subject : draft.body;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    set(field === 'subject' ? { subject: next } : { body: next });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    setTouched(true);
    if (invalid || busy) return;
    setBusy('save');
    const payload = { name: draft.name.trim(), subject: draft.subject.trim(), body: draft.body.trim(), trigger: draft.trigger, programId: draft.programId, enabled: automatic ? draft.enabled : true };
    try {
      if (template) {
        qc.setQueryData<Bootstrap>(qk.bootstrap, old => (old ? { ...old, templates: old.templates.map(t => (t.id === template.id ? { ...t, ...payload } : t)) } : old));
        await saveTemplate({ action: 'update', id: template.id, ...payload });
        toast.success(`Saved “${payload.name}”`);
      } else {
        await saveTemplate({ action: 'create', ...payload });
        toast.success(`Created “${payload.name}”`);
      }
      setBase(draft);
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't save the template"));
    } finally {
      setBusy(null);
      void qc.invalidateQueries({ queryKey: qk.bootstrap });
    }
  };

  const sendTest = async () => {
    if (errors.subject || errors.body) {
      setTouched(true);
      toast.error('Add a subject and a message before sending a test');
      return;
    }
    setBusy('test');
    try {
      const res = await sendTestEmail({ subject: draft.subject, body: draft.body });
      if (res.delivery === 'Sent') toast.success(`Sent a test to ${res.to}`, { description: 'It’s filled in with sample data, just like the preview.' });
      else toast.error(`The test to ${res.to} didn’t send`, { description: 'Email delivery isn’t available right now.' });
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't send the test email"));
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async () => {
    if (!template) return;
    if (dirty && !(await app.confirm({ title: 'Duplicate without your changes?', description: 'The copy is made from the saved template. Save first if you want your edits in it.', confirmLabel: 'Duplicate saved version' }))) return;
    setBusy('duplicate');
    try {
      const res = await saveTemplate({ action: 'duplicate', id: template.id });
      await qc.invalidateQueries({ queryKey: qk.bootstrap });
      toast.success(`Duplicated “${template.name}”`, { description: TRIGGER_INFO[asTrigger(template.trigger)].automatic ? 'The copy is switched off until you turn it on.' : undefined });
      onOpenTemplate(res.id);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't duplicate the template"));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!template) return;
    const ok = await app.confirm({
      title: `Delete “${template.name}”?`,
      description: automatic && template.enabled ? `This template sends automatically. Once it’s gone, ${TRIGGER_INFO[draft.trigger].title.toLowerCase()} emails fall back to another enabled template for the same trigger, or aren’t sent at all. Messages already sent stay in each applicant’s thread.` : 'Messages already sent with it stay in each applicant’s thread. This can’t be undone.',
      confirmLabel: 'Delete template',
      destructive: true,
    });
    if (!ok) return;
    setBusy('delete');
    try {
      qc.setQueryData<Bootstrap>(qk.bootstrap, old => (old ? { ...old, templates: old.templates.filter(t => t.id !== template.id) } : old));
      await saveTemplate({ action: 'delete', id: template.id });
      toast.success(`Deleted “${template.name}”`);
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't delete the template"));
    } finally {
      setBusy(null);
      void qc.invalidateQueries({ queryKey: qk.bootstrap });
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => (o ? onOpenChange(true) : void close())}>
      <DialogContent
        className="flex h-[min(780px,94dvh)] max-w-[1040px] flex-col gap-0 overflow-hidden p-0 sm:rounded-xl"
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            void save();
          }
        }}
      >
        <div className="flex shrink-0 items-start gap-3 border-b px-5 py-3.5 pr-12">
          <div className="min-w-0">
            <DialogTitle className="text-[15px]">{template ? 'Edit email template' : 'New email template'}</DialogTitle>
            <DialogDescription className="mt-0.5 text-[12.5px]">{TRIGGER_INFO[draft.trigger].when}</DialogDescription>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start overflow-y-auto md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:content-stretch md:overflow-hidden">
          <div className="space-y-4 px-5 py-4 md:min-h-0 md:overflow-y-auto">
            <Field label="Name" htmlFor="tpl-name" error={touched ? errors.name : null} hint="Only your team sees this.">
              <Input id="tpl-name" autoFocus={!template} value={draft.name} maxLength={120} placeholder="Acceptance with next steps" onChange={e => set({ name: e.target.value })} className={inputClass} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sends" htmlFor="tpl-trigger">
                <Select value={draft.trigger} onValueChange={v => set({ trigger: v as Trigger })}>
                  <SelectTrigger id="tpl-trigger" className={selectTriggerClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="w-80">
                    {TRIGGERS.map(t => (
                      <SelectItem key={t} value={t} className={cn(selectItemClass, 'py-1.5')}>
                        {TRIGGER_INFO[t].automatic ? `When: ${t.toLowerCase()}` : 'Manually, from the composer'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Program" htmlFor="tpl-program">
                <Select value={draft.programId ?? ALL} onValueChange={v => set({ programId: v === ALL ? null : v })}>
                  <SelectTrigger id="tpl-program" className={cn(selectTriggerClass, '[&>span]:flex [&>span]:items-center [&>span]:gap-1.5')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL} className={selectItemClass}>
                      <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-muted-foreground" /> All programs</span>
                    </SelectItem>
                    <SelectSeparator />
                    {ws.orderedPrograms.map(p => (
                      <SelectItem key={p.id} value={p.id} className={selectItemClass}>
                        <span className="flex items-center gap-1.5"><Glyph icon={p.icon} color={p.color} size={14} /> {p.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {draft.programId && automatic && <p className="-mt-2 text-xs text-muted-foreground">Used instead of the all-programs template for this program.</p>}

            <Field label="Subject" htmlFor="tpl-subject" error={touched ? errors.subject : null}>
              <Input
                id="tpl-subject"
                ref={subjectRef}
                value={draft.subject}
                maxLength={200}
                placeholder="An update on your application to {{program_name}}"
                onFocus={() => (lastField.current = 'subject')}
                onChange={e => set({ subject: e.target.value })}
                className={inputClass}
              />
            </Field>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="tpl-body" className="text-xs font-medium">Message</label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="-mr-2 h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground">
                      <Braces className="!size-3.5" /> Insert merge tag
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-[360px] w-72 overflow-y-auto" onCloseAutoFocus={e => e.preventDefault()}>
                    <DropdownMenuLabel className="text-2xs font-medium text-muted-foreground">Inserts into the {lastField.current === 'subject' ? 'subject' : 'message'} at your cursor</DropdownMenuLabel>
                    {MERGE_TAGS.map(t => (
                      <DropdownMenuItem key={t.tag} className="flex-col items-start gap-0 text-[13px]" onSelect={() => insertTag(t.tag)}>
                        <span>{t.label}</span>
                        <span className="font-mono text-2xs text-muted-foreground">{`{{${t.tag}}}`} · {t.sample}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <textarea
                id="tpl-body"
                ref={bodyRef}
                value={draft.body}
                maxLength={20000}
                onFocus={() => (lastField.current = 'body')}
                onChange={e => set({ body: e.target.value })}
                placeholder={'Hi {{applicant_first_name}},\n\nThank you for applying to {{program_name}}…'}
                className="block min-h-[240px] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-[13px] leading-relaxed shadow-sm outline-none placeholder:text-faint focus-visible:ring-1 focus-visible:ring-ring md:min-h-[300px]"
              />
              {touched && errors.body ? (
                <p className="text-xs text-tone-danger">{errors.body}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Leave a blank line between paragraphs. Your email signature is added at the end.</p>
              )}
              {unknown.length > 0 && (
                <p className="flex items-start gap-1.5 text-xs text-tone-warning">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>{unknown.map(u => `{{${u}}}`).join(', ')} {unknown.length === 1 ? 'isn’t a merge tag' : 'aren’t merge tags'} and will be left blank.</span>
                </p>
              )}
            </div>

            {automatic && (
              <label className="flex items-start justify-between gap-4 rounded-lg border px-3 py-2.5">
                <span>
                  <span className="block text-[13px] font-medium">Send automatically</span>
                  <span className="block text-xs text-muted-foreground">Turn off to stop sending without deleting the template.</span>
                </span>
                <Switch checked={draft.enabled} onCheckedChange={enabled => set({ enabled })} aria-label="Send automatically" />
              </label>
            )}
          </div>
          <div className="min-h-[420px] border-t bg-subtle md:min-h-0 md:border-l md:border-t-0">
            <EmailPreview draft={draft} />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t px-4 py-2.5">
          {template && (
            <>
              <Tip label="Duplicate">
                <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" disabled={Boolean(busy)} onClick={() => void duplicate()} aria-label="Duplicate template">
                  {busy === 'duplicate' ? <Loader2 className="animate-spin" /> : <Copy />} <span className="hidden sm:inline">Duplicate</span>
                </Button>
              </Tip>
              <Tip label="Delete">
                <Button type="button" size="sm" variant="ghost" className="text-muted-foreground hover:text-tone-danger" disabled={Boolean(busy)} onClick={() => void remove()} aria-label="Delete template">
                  <Trash2 /> <span className="hidden sm:inline">Delete</span>
                </Button>
              </Tip>
            </>
          )}
          <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void sendTest()}>
            {busy === 'test' ? <Loader2 className="animate-spin" /> : <Send />} Send a test to me
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1 text-xs text-muted-foreground lg:flex"><Kbd>{MOD}</Kbd><Kbd>↵</Kbd> to save</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => void close()}>Cancel</Button>
            <Button type="button" size="sm" disabled={Boolean(busy) || (touched && invalid)} onClick={() => void save()}>
              {busy === 'save' ? 'Saving…' : template ? 'Save template' : 'Create template'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
