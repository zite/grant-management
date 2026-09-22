import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Eye, Loader2, Megaphone, PenLine, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { decideSubmissions } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Switch } from '@project/components/ui/switch';
import { Textarea } from '@project/components/ui/textarea';
import { cn } from '@project/components/lib/utils';
import { renderMerge } from '@project/shared/merge';
import { DECLINE_REASONS } from '@project/shared/status';
import { currencySymbol } from '@project/shared/ui/FormRenderer';
import type { DecisionIntent, SubmissionTarget } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import { refreshEverythingSoon } from '../../lib/mutations';
import type { EmailTemplate } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { OutcomeGlyph } from '../primitives/icons';
import { previewContext } from './mergePreview';

const VERB: Record<string, { title: string; button: string; past: string }> = {
  Accepted: { title: 'Accept', button: 'Accept', past: 'accepted' },
  Waitlisted: { title: 'Waitlist', button: 'Waitlist', past: 'waitlisted' },
  Declined: { title: 'Decline', button: 'Decline', past: 'declined' },
};

function templateFor(templates: EmailTemplate[], trigger: string, programId: string | undefined) {
  return templates.find(t => t.trigger === trigger && t.programId === programId) ?? templates.find(t => t.trigger === trigger && !t.programId) ?? null;
}

/**
 * Decisions are recorded privately and released deliberately. Deciding and
 * telling the applicant are separate by default so a committee can settle a
 * whole slate first; the switch sends it straight away when that's wanted.
 */
export function DecisionDialog({ open, onOpenChange, targets, intent }: { open: boolean; onOpenChange: (o: boolean) => void; targets: SubmissionTarget[]; intent: DecisionIntent }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [award, setAward] = useState('');
  const [notify, setNotify] = useState(false);
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const single = targets.length === 1 ? targets[0] : null;
  const programIds = [...new Set(targets.map(t => t.programId))];
  const decision = intent === 'Accepted' || intent === 'Waitlisted' || intent === 'Declined' ? intent : null;
  const template = decision ? templateFor(ws.templates, decision, programIds.length === 1 ? programIds[0] : undefined) : null;

  useEffect(() => {
    if (!open) return;
    setReason('');
    setNote('');
    setNotify(false);
    setEditing(false);
    setSubject(template?.subject ?? '');
    setBody(template?.body ?? '');
    setAward(single ? String(single.awardAmount ?? single.requestedAmount ?? '') : '');
  }, [open, intent, single?.id]);

  const skipped = useMemo(() => {
    if (decision) return targets.filter(t => t.status === 'Draft' || t.status === 'Withdrawn' || (t.notifiedAt && t.status !== decision));
    if (intent === 'release') return targets.filter(t => !['Accepted', 'Declined', 'Waitlisted'].includes(t.status) || t.notifiedAt);
    return targets.filter(t => !['Accepted', 'Declined', 'Waitlisted'].includes(t.status));
  }, [targets, decision, intent]);
  const acting = targets.length - skipped.length;
  const released = targets.filter(t => t.notifiedAt && ['Accepted', 'Declined', 'Waitlisted'].includes(t.status));
  const byOutcome = (['Accepted', 'Waitlisted', 'Declined'] as const).map(o => ({ outcome: o, count: targets.filter(t => t.status === o && !t.notifiedAt).length })).filter(x => x.count);

  const ctx = previewContext(ws, targets.find(t => !skipped.includes(t)) ?? targets[0], { awardAmount: award ? Number(award) : undefined });

  const submit = async () => {
    setBusy(true);
    try {
      const ids = targets.map(t => t.id);
      const res =
        intent === 'release'
          ? await decideSubmissions({ ids, action: 'release' })
          : intent === 'reopen'
            ? await decideSubmissions({ ids, action: 'reopen' })
            : await decideSubmissions({
                ids,
                action: 'decide',
                decision: decision!,
                reason: decision === 'Declined' ? reason || null : null,
                note: note.trim() || undefined,
                awardAmount: decision === 'Accepted' && single && award !== '' ? Number(award) : undefined,
                release: notify,
                ...(notify && editing ? { subject, body } : {}),
              });
      refreshEverythingSoon(qc, 200);
      const parts: string[] = [];
      if (res.decided) parts.push(`${res.decided} ${VERB[decision!]?.past ?? 'decided'}`);
      if (res.reopened) parts.push(`${res.reopened} reopened`);
      if (res.released) parts.push(`${res.released} released`);
      if (res.failed) parts.push(`${res.failed} email${res.failed === 1 ? '' : 's'} failed — the message is in the portal`);
      if (res.skipped || res.alreadyReleased) parts.push(`${res.skipped + (intent === 'reopen' ? 0 : res.alreadyReleased)} skipped`);
      toast.success(parts.join(' · ') || 'Nothing changed');
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't save the decision"));
    } finally {
      setBusy(false);
    }
  };

  const title =
    intent === 'release' ? `Release ${acting} decision${acting === 1 ? '' : 's'}`
    : intent === 'reopen' ? `Reopen ${acting === 1 && single ? single.reference : `${acting} decisions`}`
    : `${VERB[decision!].title} ${single ? single.reference : `${targets.length} submissions`}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 p-0">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            {decision ? <OutcomeGlyph status={decision} size={16} /> : intent === 'release' ? <Megaphone className="h-4 w-4 text-primary" /> : <RotateCcw className="h-4 w-4 text-muted-foreground" />}
            {title}
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            {decision && (single ? single.title || single.applicantName : `${acting} will be ${VERB[decision].past}.`)}
            {intent === 'release' && 'Each applicant gets the email for their outcome, and their portal status updates.'}
            {intent === 'reopen' && 'They go back into the pipeline at their current stage, and awards are cancelled.'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 pb-5">
          {!single && (
            <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto rounded-lg border bg-subtle p-2">
              {targets.map(t => (
                <span key={t.id} className={cn('chip h-6 bg-background', skipped.includes(t) && 'line-through opacity-50')} title={t.title}>
                  {t.reference}
                </span>
              ))}
            </div>
          )}
          {skipped.length > 0 && (
            <p className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tone-warning" />
              {intent === 'release'
                ? `${skipped.length} ${skipped.length === 1 ? "isn't" : "aren't"} decided or ${skipped.length === 1 ? 'was' : 'were'} already released, and will be skipped.`
                : intent === 'reopen'
                  ? `${skipped.length} ${skipped.length === 1 ? "isn't" : "aren't"} decided and will be skipped.`
                  : `${skipped.length} will be skipped: drafts, withdrawn applications, and decisions already released to the applicant (reopen those first).`}
            </p>
          )}

          {intent === 'reopen' && released.length > 0 && (
            <div className="flex gap-2.5 rounded-lg border border-tone-warning/30 bg-tone-warning/[0.06] p-3 text-[13px]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-tone-warning" />
              <span>{released.length === 1 ? 'This applicant has' : `${released.length} applicants have`} already been told the outcome. Reopening won't send anything, so let them know if the decision changes.</span>
            </div>
          )}

          {intent === 'release' && (
            <div className="space-y-2">
              {byOutcome.map(({ outcome, count }) => {
                const t = templateFor(ws.templates, outcome, programIds.length === 1 ? programIds[0] : undefined);
                return (
                  <div key={outcome} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                    <OutcomeGlyph status={outcome} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium">{count} {outcome.toLowerCase()}</div>
                      <div className="truncate text-xs text-muted-foreground">{t ? `Email: ${renderMerge(t.subject, ctx)}` : 'A standard message (no template set)'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {decision === 'Declined' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Reason (internal, for reporting)</label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue placeholder="Choose a reason" />
                </SelectTrigger>
                <SelectContent>
                  {DECLINE_REASONS.map(r => (
                    <SelectItem key={r} value={r} className="text-[13px]">{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {decision === 'Accepted' && single && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Award amount</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">{currencySymbol(ws.settings.currency)}</span>
                <input inputMode="decimal" value={award} onChange={e => setAward(e.target.value.replace(/[^0-9.]/g, ''))} className="h-9 w-full rounded-md border border-input bg-background pl-7 pr-3 text-[13px] tabular-nums outline-none focus:border-primary" />
              </div>
              {single.requestedAmount != null && <p className="text-xs text-muted-foreground">Requested {ws.money(single.requestedAmount)}</p>}
            </div>
          )}
          {decision === 'Accepted' && !single && <p className="text-[12.5px] text-muted-foreground">Each award starts at the amount requested. Adjust individual awards on the submission or in Awards.</p>}

          {decision && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Internal note</label>
              <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Why, for the record. Applicants never see this." className="min-h-[64px] text-[13px]" />
            </div>
          )}

          {decision && (
            <div className="rounded-lg border">
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">Tell the applicant now</div>
                  <div className="text-xs text-muted-foreground">{notify ? 'Emails them and updates their portal status.' : 'Stays private until you release it — good for finishing a whole slate first.'}</div>
                </div>
                <Switch checked={notify} onCheckedChange={setNotify} />
              </label>
              {notify && (
                <div className="border-t px-3 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{template && !editing ? `Using “${template.name}”` : editing ? 'Custom message for this batch' : 'Standard message'}</span>
                    <button type="button" onClick={() => setEditing(e => !e)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                      {editing ? <><Eye className="h-3 w-3" /> Preview</> : <><PenLine className="h-3 w-3" /> Edit</>}
                    </button>
                  </div>
                  {editing ? (
                    <div className="space-y-2">
                      <input value={subject} onChange={e => setSubject(e.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-[13px] outline-none focus:border-primary" />
                      <Textarea value={body} onChange={e => setBody(e.target.value)} className="min-h-[180px] font-mono text-[12.5px]" />
                      <p className="text-2xs text-muted-foreground">Merge tags like {'{{applicant_first_name}}'} fill in for each applicant.</p>
                    </div>
                  ) : (
                    <div className="rounded-md bg-subtle p-3">
                      <div className="text-[13px] font-medium">{renderMerge(subject || template?.subject || '', ctx) || '(standard subject)'}</div>
                      <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted-foreground">{renderMerge(body || template?.body || '', ctx) || 'A short standard message about the outcome.'}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t px-5 py-3">
          <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm"
            className={cn('h-8 text-[13px]', decision === 'Declined' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90')}
            disabled={busy || acting === 0}
            onClick={submit}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {intent === 'release' ? `Release and email ${acting}` : intent === 'reopen' ? 'Reopen' : `${VERB[decision!].button}${notify ? ' and notify' : ''}${acting > 1 ? ` ${acting}` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
