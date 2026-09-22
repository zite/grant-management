import { Building2, Copy, MailX, MoreHorizontal, Pencil, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { saveTemplate, type SaveTemplateInputType } from 'zitejs/api';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { Switch } from '@project/components/ui/switch';
import { cn } from '@project/components/lib/utils';
import { renderMerge, sampleMergeContext } from '@project/shared/merge';
import { useAppActions } from '../../../lib/app-actions';
import type { Bootstrap, EmailTemplate, Program } from '../../../lib/types';
import { useWorkspace } from '../../../lib/workspace';
import { IconButton, Tip } from '../../primitives/bits';
import { PageTitle, SettingsSection } from '../fields';
import { useProgramMutation } from '../programData';

const TRIGGERS: Array<{ trigger: string; when: string }> = [
  { trigger: 'Submission received', when: 'When an applicant submits' },
  { trigger: 'Accepted', when: 'When you release an acceptance' },
  { trigger: 'Waitlisted', when: 'When you release a waitlist decision' },
  { trigger: 'Declined', when: 'When you release a decline' },
  { trigger: 'Task requested', when: 'When you ask an applicant for a follow-up' },
  { trigger: 'Draft reminder', when: 'Before the deadline, to applicants with unfinished drafts' },
];

type Trigger = NonNullable<SaveTemplateInputType['trigger']>;

const byPosition = (a: EmailTemplate, b: EmailTemplate) => a.position - b.position;

/**
 * Which email each automatic moment sends for this program. A program uses
 * the organization's template unless it has its own copy; customizing makes
 * that copy, and switching an organization template off here makes a copy
 * that's switched off — other programs keep sending theirs.
 */
export function EmailSettings({ program }: { program: Program }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const run = useProgramMutation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const sample = { ...sampleMergeContext(), program_name: program.name, organization_name: ws.settings.organizationName, reference: `${program.key}-12` };

  const programTemplates = ws.templates.filter(t => t.programId === program.id);
  const orgTemplates = ws.templates.filter(t => !t.programId);
  const manual = programTemplates.filter(t => t.trigger === 'Manual');

  const customize = async (source: EmailTemplate, opts: { enabled?: boolean } = {}) => {
    setBusy(source.trigger);
    const res = await run(
      () => saveTemplate({ action: 'duplicate', id: source.id, name: `${source.name} · ${program.key}`, programId: program.id, trigger: source.trigger as Trigger, enabled: opts.enabled ?? source.enabled }),
      {
        success: opts.enabled === false ? `${source.trigger} emails are off for ${program.name} — other programs still send them` : `Made a copy of “${source.name}” for ${program.name}`,
        error: "Couldn't customize the template",
      },
    );
    setBusy(null);
    return res;
  };

  const setEnabled = async (t: EmailTemplate, enabled: boolean) => {
    setBusy(t.trigger);
    await run(() => saveTemplate({ action: 'update', id: t.id, enabled }), {
      optimistic: (data: Bootstrap): Bootstrap => ({ ...data, templates: data.templates.map(x => (x.id === t.id ? { ...x, enabled } : x)) }),
      success: enabled ? `${t.trigger} emails are on for ${program.name}` : `${t.trigger} emails are off for ${program.name}`,
      error: "Couldn't change the template",
    });
    setBusy(null);
  };

  const revert = async (t: EmailTemplate, fallback: EmailTemplate | undefined) => {
    const ok = await app.confirm({
      title: `Use the organization’s ${t.trigger.toLowerCase()} email?`,
      description: fallback ? `This program’s copy, “${t.name}”, is deleted and “${fallback.name}” is sent instead.` : `This program’s copy, “${t.name}”, is deleted. There’s no organization template for this moment, so nothing will be sent.`,
      confirmLabel: 'Delete the copy',
      destructive: true,
    });
    if (!ok) return;
    setBusy(t.trigger);
    await run(() => saveTemplate({ action: 'delete', id: t.id }), { success: `${program.name} uses the organization template again`, error: "Couldn't delete the copy" });
    setBusy(null);
  };

  return (
    <div>
      <PageTitle title="Emails" description="The emails applicants get at each step. Every program uses your organization’s templates unless you customize one here." />

      <SettingsSection title="Automatic emails">
        <div className="divide-y overflow-hidden rounded-lg border bg-background">
          {TRIGGERS.map(({ trigger, when }) => {
            const own = programTemplates.filter(t => t.trigger === trigger).sort(byPosition)[0];
            const fallback = orgTemplates.filter(t => t.trigger === trigger).sort(byPosition)[0];
            const applied = own ?? fallback;
            const on = Boolean(applied?.enabled);
            const subject = applied ? renderMerge(applied.subject, sample) : '';
            return (
              <div key={trigger} className={cn('flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center', busy === trigger && 'opacity-70')}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium">{trigger}</span>
                    {applied ? (
                      own ? (
                        <span className="inline-flex h-5 items-center rounded-full bg-primary/[0.1] px-1.5 text-2xs font-medium text-primary">This program</span>
                      ) : (
                        <span className="inline-flex h-5 items-center gap-1 rounded-full bg-muted px-1.5 text-2xs text-muted-foreground">
                          <Building2 className="h-3 w-3" /> Organization
                        </span>
                      )
                    ) : (
                      <span className="inline-flex h-5 items-center gap-1 rounded-full bg-muted px-1.5 text-2xs text-muted-foreground">
                        <MailX className="h-3 w-3" /> No template
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{when}</div>
                  {applied && (
                    <div className={cn('mt-1.5 truncate text-[12.5px]', !on && 'text-muted-foreground line-through decoration-muted-foreground/50')}>
                      <span className="text-muted-foreground">{applied.name}:</span> {subject}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {applied && (
                    <Tip label={own ? (on ? 'Turn off for this program' : 'Turn on for this program') : on ? 'Turn off for this program only' : 'Off for every program — turn it on in Settings › Templates, or customize it here'}>
                      <span>
                        <Switch
                          checked={on}
                          disabled={busy === trigger || (!own && !on)}
                          aria-label={`${trigger} email for ${program.name}`}
                          onCheckedChange={v => (own ? setEnabled(own, v) : !v && customize(applied, { enabled: false }))}
                        />
                      </span>
                    </Tip>
                  )}
                  {!own && applied && (
                    <button type="button" disabled={busy === trigger} onClick={() => customize(applied)} className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-[12.5px] shadow-2xs hover:bg-accent disabled:opacity-60">
                      <Copy className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Customize for this program</span><span className="sm:hidden">Customize</span>
                    </button>
                  )}
                  {!applied && (
                    <Link to="/settings/templates" className="flex h-7 items-center rounded-md border bg-background px-2.5 text-[12.5px] shadow-2xs hover:bg-accent">
                      Create in Templates
                    </Link>
                  )}
                  {own && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton aria-label={`More for ${trigger}`}>
                          <MoreHorizontal />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64">
                        <DropdownMenuItem className="text-[13px]" onSelect={() => navigate('/settings/templates')}>
                          <Pencil className="h-3.5 w-3.5" /> Edit in Settings › Templates
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-[13px]" onSelect={() => revert(own, fallback)}>
                          <RotateCcw className="h-3.5 w-3.5" /> Use the organization template
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Subjects are previewed with sample details. Write and edit template text in <Link to="/settings/templates" className="text-primary hover:underline">Settings › Templates</Link>.
        </p>
      </SettingsSection>

      <SettingsSection title="Templates for writing by hand" description="Program-specific templates offered first when you message this program’s applicants.">
        <div className="overflow-hidden rounded-lg border bg-background">
          {manual.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-muted-foreground">None yet — the composer offers your organization’s manual templates.</p>
          ) : (
            <ul className="divide-y">
              {manual.map(t => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{t.name}</span>
                    <span className="text-muted-foreground"> · {renderMerge(t.subject, sample)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
