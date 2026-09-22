import { AlertTriangle, Check, CircleDashed, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveProgram } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { cn } from '@project/components/lib/utils';
import { useAppActions } from '../../lib/app-actions';
import { longDate, plural } from '../../lib/format';
import type { Program } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { useProgramMutation } from './programData';

export const totalSubmissions = (p: Program) => p.counts.drafts + p.counts.inPipeline + p.counts.accepted + p.counts.declined + p.counts.waitlisted + p.counts.withdrawn;

/** Lifecycle actions shared by the program header, its settings and the programs list. */
export function useProgramLifecycle() {
  const run = useProgramMutation();
  const app = useAppActions();
  const navigate = useNavigate();

  const unpublish = async (p: Program) => {
    const ok = await app.confirm({
      title: `Unpublish ${p.name}?`,
      description: `It disappears from the portal and nobody can start or submit an application.${p.counts.drafts ? ` ${plural(p.counts.drafts, 'applicant')} with a draft in progress won't be able to submit until you publish again.` : ''} Submissions you already have aren't affected.`,
      confirmLabel: 'Unpublish',
    });
    if (!ok) return;
    await run(() => saveProgram({ action: 'unpublish', id: p.id }), { success: `${p.name} is back to draft`, error: "Couldn't unpublish the program" });
  };

  const archive = async (p: Program) => {
    const ok = await app.confirm({
      title: `Archive ${p.name}?`,
      description: 'It leaves the portal, the sidebar and cross-program lists. Submissions, reviews, awards and payments are all kept, and you can unarchive it at any time.',
      confirmLabel: 'Archive',
    });
    if (!ok) return;
    await run(() => saveProgram({ action: 'archive', id: p.id }), { success: `Archived ${p.name}`, error: "Couldn't archive the program" });
  };

  const unarchive = async (p: Program) => {
    await run(() => saveProgram({ action: 'unarchive', id: p.id }), {
      success: p.publishedAt ? `${p.name} is back and published` : `${p.name} is back as a draft`,
      error: "Couldn't unarchive the program",
    });
  };

  const duplicate = async (p: Program) => {
    const res = await run(() => saveProgram({ action: 'duplicate', id: p.id }), {
      success: `Duplicated ${p.name} — the copy is a draft`,
      error: "Couldn't duplicate the program",
    });
    if (res?.id) navigate(`/programs/${res.id}/settings/general`);
  };

  const remove = async (p: Program) => {
    const total = totalSubmissions(p);
    if (total > 0) {
      await app.confirm({
        title: `${p.name} can't be deleted`,
        description: `It has ${plural(total, 'submission')}, drafts included. Archive it instead — that hides it everywhere while keeping its history.`,
        confirmLabel: 'OK',
      });
      return;
    }
    const ok = await app.confirm({
      title: `Delete ${p.name}?`,
      description: 'Its forms, stages, rubrics, team and program email templates are deleted with it. This can’t be undone.',
      confirmLabel: 'Delete program',
      destructive: true,
    });
    if (!ok) return;
    const res = await run(() => saveProgram({ action: 'delete', id: p.id }), { success: `Deleted ${p.name}`, error: "Couldn't delete the program" });
    if (res) navigate('/programs');
  };

  return { unpublish, archive, unarchive, duplicate, remove };
}

type CheckState = 'ok' | 'fail' | 'warn' | 'info';

function CheckRow({ state, title, detail, action }: { state: CheckState; title: string; detail?: ReactNode; action?: ReactNode }) {
  const icon = {
    ok: <Check className="h-3 w-3" strokeWidth={3} />,
    fail: <X className="h-3 w-3" strokeWidth={3} />,
    warn: <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />,
    info: <CircleDashed className="h-3 w-3" strokeWidth={2.5} />,
  }[state];
  return (
    <li className="flex items-start gap-2.5 px-3 py-2.5">
      <span
        className={cn(
          'mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
          state === 'ok' && 'bg-tone-success/[0.14] text-tone-success',
          state === 'fail' && 'bg-tone-danger/[0.14] text-tone-danger',
          state === 'warn' && 'bg-tone-warning/[0.14] text-tone-warning',
          state === 'info' && 'bg-muted text-muted-foreground',
        )}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{title}</div>
        {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
      </div>
      {action}
    </li>
  );
}

/**
 * Publishing is the one switch that puts a program in front of applicants, so
 * it shows what applicants will meet first: the form, the pipeline behind it,
 * and the dates. The server enforces the first two; the rest are judgement calls.
 */
export function PublishDialog({ program, open, onOpenChange }: { program: Program | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const ws = useWorkspace();
  const run = useProgramMutation();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  if (!program) return null;

  const form = program.applicationFormId ? ws.formById.get(program.applicationFormId) : undefined;
  const questions = form?.questionCount ?? 0;
  const stages = ws.stagesFor(program.id);
  const reviewStages = stages.filter(s => s.kind === 'Review');
  const pool = ws.reviewerPool(program.id);
  const now = Date.now();
  const deadline = program.deadline ? Date.parse(program.deadline) : null;
  const opens = program.opensAt ? Date.parse(program.opensAt) : null;
  const go = (path: string) => {
    onOpenChange(false);
    navigate(`/programs/${program.id}/${path}`);
  };
  const fix = (label: string, path: string) => (
    <button type="button" onClick={() => go(path)} className="shrink-0 text-xs font-medium text-primary hover:underline">
      {label}
    </button>
  );
  const blocked = questions === 0 || stages.length === 0;

  const publish = async () => {
    setSaving(true);
    const res = await run(() => saveProgram({ action: 'publish', id: program.id }), {
      success: opens && opens > now ? `Published — ${program.name} opens ${longDate(program.opensAt)}` : `Published — ${program.name} is live in the portal`,
      error: "Couldn't publish the program",
    });
    setSaving(false);
    if (res) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-4">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Publish {program.name}?</DialogTitle>
          <DialogDescription className="text-[13px]">
            Applicants will be able to find it in the portal{opens && opens > now ? ` and apply from ${longDate(program.opensAt)}` : ' and start applying straight away'}.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y overflow-hidden rounded-lg border">
          <CheckRow
            state={questions > 0 ? 'ok' : 'fail'}
            title={questions > 0 ? `Application form has ${plural(questions, 'question')}` : 'The application form has no questions'}
            detail={questions > 0 ? undefined : 'Add at least one question before publishing.'}
            action={fix(questions > 0 ? 'Review' : 'Add questions', 'form')}
          />
          <CheckRow
            state={stages.length > 0 ? 'ok' : 'fail'}
            title={stages.length > 0 ? `Pipeline has ${plural(stages.length, 'stage')}` : 'The pipeline has no stages'}
            detail={stages.length > 0 ? stages.map(s => s.name).join(' → ') : 'New submissions need a stage to land in.'}
            action={fix('Edit', 'settings/pipeline')}
          />
          {deadline == null ? (
            <CheckRow state="info" title="No deadline — rolling applications" detail="The program stays open until you set a deadline or unpublish it." action={fix('Set a deadline', 'settings/application')} />
          ) : deadline <= now ? (
            <CheckRow
              state="warn"
              title={`The deadline already passed (${longDate(program.deadline)})`}
              detail={program.allowLate ? 'Late submissions are allowed, so applicants can still submit.' : 'Applicants will see it as closed and won’t be able to submit.'}
              action={fix('Change', 'settings/application')}
            />
          ) : (
            <CheckRow state="ok" title={`Deadline ${longDate(program.deadline)}`} detail={opens && opens > now ? `Opens ${longDate(program.opensAt)}` : undefined} action={fix('Change', 'settings/application')} />
          )}
          {reviewStages.length > 0 && (
            <CheckRow
              state={pool.length > 0 ? 'ok' : 'warn'}
              title={pool.length > 0 ? `${plural(pool.length, 'reviewer')} in the pool` : 'Nobody is in the reviewer pool yet'}
              detail={pool.length > 0 ? undefined : 'Submissions entering a review stage won’t be assigned automatically.'}
              action={fix(pool.length > 0 ? 'Manage' : 'Add reviewers', 'settings/team')}
            />
          )}
        </ul>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={publish} disabled={blocked || saving}>
            {saving ? 'Publishing…' : 'Publish program'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
