import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BellRing, Clock, Copy, Loader2, Mail, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { saveTemplate, sendReminders } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { Input } from '@project/components/ui/input';
import { Switch } from '@project/components/ui/switch';
import { cn } from '@project/components/lib/utils';
import { useAppActions } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import { qk } from '../../lib/queries';
import type { Bootstrap, EmailTemplate } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Glyph, IconButton, Tip } from '../primitives/bits';
import { TRIGGER_INFO, TRIGGERS, type Trigger } from './constants';
import { TemplateEditor, type TemplateDraft } from './TemplateEditor';
import { SettingsCard, SettingsPageTitle, inputClass } from './ui';

const asTrigger = (t: string): Trigger => ((TRIGGERS as readonly string[]).includes(t) ? (t as Trigger) : 'Manual');

/**
 * Which enabled template actually sends, per trigger and scope. The send path
 * takes the first by position, so a later one with the same trigger and scope
 * never goes out — worth saying out loud.
 */
function shadowedBy(templates: EmailTemplate[]) {
  const winner = new Map<string, EmailTemplate>();
  const out = new Map<string, EmailTemplate>();
  for (const t of templates) {
    if (!t.enabled || !TRIGGER_INFO[asTrigger(t.trigger)].automatic) continue;
    const key = `${t.trigger}|${t.programId ?? ''}`;
    const first = winner.get(key);
    if (first) out.set(t.id, first);
    else winner.set(key, t);
  }
  return out;
}

export function TemplatesSettings() {
  const ws = useWorkspace();
  const app = useAppActions();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<{ open: boolean; id: string | null; initial?: Partial<TemplateDraft> }>({ open: false, id: null });
  const shadows = useMemo(() => shadowedBy(ws.templates), [ws.templates]);

  const q = query.trim().toLowerCase();
  const visible = ws.templates.filter(t => !q || `${t.name} ${t.subject}`.toLowerCase().includes(q));
  const editing = editor.id ? ws.templateById.get(editor.id) ?? null : null;

  const toggle = async (t: EmailTemplate, enabled: boolean) => {
    const previous = qc.getQueryData<Bootstrap>(qk.bootstrap);
    qc.setQueryData<Bootstrap>(qk.bootstrap, old => (old ? { ...old, templates: old.templates.map(x => (x.id === t.id ? { ...x, enabled } : x)) } : old));
    try {
      await saveTemplate({ action: 'update', id: t.id, enabled });
      toast.success(enabled ? `“${t.name}” will send automatically` : `“${t.name}” is switched off`);
    } catch (e) {
      if (previous) qc.setQueryData(qk.bootstrap, previous);
      toast.error(errorMessage(e, "Couldn't change that template"));
    } finally {
      void qc.invalidateQueries({ queryKey: qk.bootstrap });
    }
  };

  const duplicate = async (t: EmailTemplate) => {
    try {
      const res = await saveTemplate({ action: 'duplicate', id: t.id });
      await qc.invalidateQueries({ queryKey: qk.bootstrap });
      toast.success(`Duplicated “${t.name}”`, { description: TRIGGER_INFO[asTrigger(t.trigger)].automatic ? 'The copy is switched off until you turn it on.' : undefined });
      setEditor({ open: true, id: res.id });
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't duplicate the template"));
    }
  };

  const remove = async (t: EmailTemplate) => {
    const auto = TRIGGER_INFO[asTrigger(t.trigger)].automatic && t.enabled;
    const ok = await app.confirm({
      title: `Delete “${t.name}”?`,
      description: auto ? 'This template sends automatically. Without it, those emails fall back to another enabled template for the same trigger, or aren’t sent at all. Messages already sent stay in each applicant’s thread.' : 'Messages already sent with it stay in each applicant’s thread. This can’t be undone.',
      confirmLabel: 'Delete template',
      destructive: true,
    });
    if (!ok) return;
    const previous = qc.getQueryData<Bootstrap>(qk.bootstrap);
    qc.setQueryData<Bootstrap>(qk.bootstrap, old => (old ? { ...old, templates: old.templates.filter(x => x.id !== t.id) } : old));
    try {
      await saveTemplate({ action: 'delete', id: t.id });
      toast.success(`Deleted “${t.name}”`);
    } catch (e) {
      if (previous) qc.setQueryData(qk.bootstrap, previous);
      toast.error(errorMessage(e, "Couldn't delete the template"));
    } finally {
      void qc.invalidateQueries({ queryKey: qk.bootstrap });
    }
  };

  return (
    <>
      <SettingsPageTitle
        title="Email templates"
        description="The emails applicants get when something happens to their application, and reusable messages for the composer. Merge tags fill in each applicant’s details."
        actions={
          <Button size="sm" onClick={() => setEditor({ open: true, id: null })}>
            <Plus /> New template
          </Button>
        }
      />
      {ws.templates.length > 6 && (
        <div className="relative mb-5 sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search templates" aria-label="Search templates" className={cn(inputClass, 'pl-8')} />
        </div>
      )}

      <div className="space-y-8">
        {TRIGGERS.map(trigger => {
          const info = TRIGGER_INFO[trigger];
          const items = visible.filter(t => asTrigger(t.trigger) === trigger);
          if (q && !items.length) return null;
          const liveGlobal = items.some(t => t.enabled && !t.programId);
          return (
            <section key={trigger}>
              <div className="mb-2 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 text-[14px] font-semibold">
                    {info.title}
                    <span className={cn('rounded px-1.5 py-px text-2xs font-medium', info.automatic ? 'bg-tone-accent/[0.1] text-tone-accent' : 'bg-muted text-muted-foreground')}>{info.automatic ? 'Automatic' : 'Manual'}</span>
                  </h3>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">{info.when}</p>
                </div>
                <Tip label={`New ${info.automatic ? `“${info.title}”` : 'manual'} template`}>
                  <IconButton aria-label={`New ${info.title} template`} onClick={() => setEditor({ open: true, id: null, initial: { trigger, enabled: true } })}>
                    <Plus />
                  </IconButton>
                </Tip>
              </div>
              <SettingsCard>
                {items.length === 0 ? (
                  <div className="flex items-center gap-3 px-4 py-3 text-[13px] text-muted-foreground">
                    <span className="min-w-0 flex-1">{info.automatic ? 'No template, so nothing is sent.' : 'No manual templates yet.'}</span>
                    <Button size="sm" variant="ghost" className="h-7 text-[12.5px]" onClick={() => setEditor({ open: true, id: null, initial: { trigger, enabled: true } })}>
                      <Plus className="!size-3.5" /> Create one
                    </Button>
                  </div>
                ) : (
                  items.map(t => {
                    const program = t.programId ? ws.programById.get(t.programId) : undefined;
                    const shadow = shadows.get(t.id);
                    return (
                      <div key={t.id} className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40">
                        <button type="button" onClick={() => setEditor({ open: true, id: t.id })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-subtle text-muted-foreground">
                            <Mail className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className={cn('truncate text-[13px] font-medium', info.automatic && !t.enabled && 'text-muted-foreground')}>{t.name}</span>
                              {program ? (
                                <span className="chip h-5 shrink-0 gap-1 border-transparent bg-muted px-1.5 text-2xs font-medium text-muted-foreground">
                                  <Glyph icon={program.icon} color={program.color} size={11} className="text-[7px]" /> {program.key}
                                </span>
                              ) : (
                                <span className="shrink-0 rounded bg-muted px-1.5 py-px text-2xs font-medium text-muted-foreground">All programs</span>
                              )}
                              {shadow && (
                                <Tip label={`“${shadow.name}” comes first for the same trigger and programs, so this one never sends. Switch one of them off.`}>
                                  <span className="flex shrink-0 items-center gap-1 text-2xs font-medium text-tone-warning"><AlertTriangle className="h-3 w-3" /> Not used</span>
                                </Tip>
                              )}
                              {program && info.automatic && t.enabled && liveGlobal && !shadow && <span className="hidden shrink-0 text-2xs text-muted-foreground sm:inline">replaces the all-programs one in {program.key}</span>}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{t.subject}</span>
                          </span>
                        </button>
                        {info.automatic && (
                          <Tip label={t.enabled ? 'Sending automatically — click to switch off' : 'Switched off — click to send automatically'}>
                            <span className="flex items-center">
                              <Switch checked={t.enabled} onCheckedChange={v => void toggle(t, v)} aria-label={`Send “${t.name}” automatically`} />
                            </span>
                          </Tip>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton aria-label={`Actions for ${t.name}`}>
                              <MoreHorizontal />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem className="text-[13px]" onSelect={() => setEditor({ open: true, id: t.id })}>
                              <Pencil className="h-3.5 w-3.5" /> Edit and preview
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-[13px]" onSelect={() => void duplicate(t)}>
                              <Copy className="h-3.5 w-3.5" /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-[13px] text-tone-danger focus:text-tone-danger" onSelect={() => void remove(t)}>
                              <Trash2 className="h-3.5 w-3.5" /> Delete…
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })
                )}
              </SettingsCard>
            </section>
          );
        })}
        {q && visible.length === 0 && <p className="py-8 text-center text-[13px] text-muted-foreground">No templates match “{query}”.</p>}
        {!q && <DailyReminders canRun={ws.isAdmin} />}
      </div>

      <TemplateEditor
        open={editor.open}
        onOpenChange={o => setEditor(e => ({ ...e, open: o }))}
        template={editing}
        initial={editor.initial}
        onOpenTemplate={id => setEditor({ open: true, id })}
      />
    </>
  );
}

const REMINDER_KINDS: Array<{ key: 'drafts' | 'reviews' | 'tasks' | 'deadlines' | 'payments'; label: string; when: string }> = [
  { key: 'drafts', label: 'Unsubmitted drafts', when: 'Applicants, three days and one day before the deadline' },
  { key: 'reviews', label: 'Reviews', when: 'Reviewers, the day before a review is due and once it’s overdue' },
  { key: 'tasks', label: 'Follow-ups', when: 'Recipients, two days before a task is due and once it’s late' },
  { key: 'deadlines', label: 'Closed programs', when: 'Program managers, once a deadline has passed' },
  { key: 'payments', label: 'Payments', when: 'Program managers, when a scheduled payment falls due' },
];

/** The scheduled `sendReminders` job, explained, with a manual run for admins. Every nudge is idempotent, so running it twice is safe. */
function DailyReminders({ canRun }: { canRun: boolean }) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const res = await sendReminders({});
      const sent = REMINDER_KINDS.filter(k => res[k.key] > 0).map(k => `${res[k.key]} ${k.label.toLowerCase()}`);
      if (sent.length) toast.success('Reminders sent', { description: sent.join(' · ') });
      else toast.message('Nothing needed a reminder', { description: 'Anyone already reminded recently is skipped.' });
      void qc.invalidateQueries();
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't run reminders"));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold">
            Daily reminders
            <span className="rounded bg-tone-accent/[0.1] px-1.5 py-px text-2xs font-medium text-tone-accent">Automatic</span>
          </h3>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">Every day at 14:00 UTC. Each person is nudged once per milestone, so a manual run never double-sends.</p>
        </div>
        {canRun && (
          <Button size="sm" variant="outline" className="h-7 shrink-0 text-[12.5px]" disabled={running} onClick={() => void run()}>
            {running ? <Loader2 className="!size-3.5 animate-spin" /> : <BellRing className="!size-3.5" />} Run now
          </Button>
        )}
      </div>
      <SettingsCard>
        {REMINDER_KINDS.map(k => (
          <div key={k.key} className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-subtle text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{k.label}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{k.when}</span>
            </span>
          </div>
        ))}
      </SettingsCard>
    </section>
  );
}
