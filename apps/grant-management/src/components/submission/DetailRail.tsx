import { ArrowUpRight, Copy, Globe, Loader2, Mail, MapPin, Phone, Sparkles, Tag, Users, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { aiSummarizeSubmission, type AiSummarizeSubmissionOutputType } from 'zitejs/api';
import { cn } from '@project/components/lib/utils';
import { useAppActions } from '../../lib/app-actions';
import { copyText } from '../../lib/clipboard';
import { STATUS_META } from '../../lib/constants';
import { errorMessage } from '../../lib/errors';
import { shortDate } from '../../lib/format';
import { useSubmissionActions } from '../../lib/mutations';
import type { SubmissionDetail } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { AvatarStack, MemberAvatar } from '../primitives/Avatar';
import { Glyph, LabelDot, Tip } from '../primitives/bits';
import { OutcomeGlyph, ReviewProgress, ScorePill, StageGlyph, SubmissionGlyph } from '../primitives/icons';
import { SubmissionPropertyPicker, type PickerKind } from '../submissions/SubmissionPropertyPicker';
import { InlineMoney, PropRow, RailSection, RelTime, StatusChip, ToneChip } from './detailBits';

export type DetailTab = 'application' | 'reviews' | 'messages' | 'tasks' | 'award' | 'activity';

/** Pickers are controlled when the page's shortcuts drive them, and manage themselves otherwise. */
type PickerProps = { openKind?: PickerKind | null; onOpenKind?: (k: PickerKind | null) => void };

function usePickerState(props: PickerProps) {
  const [local, setLocal] = useState<PickerKind | null>(null);
  const controlled = props.openKind !== undefined && props.onOpenKind !== undefined;
  return controlled ? ([props.openKind ?? null, props.onOpenKind!] as const) : ([local, setLocal] as const);
}

function useSubmissionBits(detail: SubmissionDetail) {
  const ws = useWorkspace();
  const s = detail.submission;
  return {
    stage: s.stageId ? ws.stageById.get(s.stageId) : undefined,
    stages: ws.stagesFor(s.programId),
    owner: s.ownerId ? ws.memberById.get(s.ownerId) : undefined,
    labels: s.labelIds.map(id => ws.labelById.get(id)).filter(Boolean) as NonNullable<ReturnType<typeof ws.labelById.get>>[],
  };
}

const valueBtn = 'ghost-chip -ml-2 w-full max-w-full justify-start text-left';

export function PropertiesSection({ detail, ...pickerProps }: { detail: SubmissionDetail } & PickerProps) {
  const ws = useWorkspace();
  const [openKind, onOpenKind] = usePickerState(pickerProps);
  const actions = useSubmissionActions();
  const s = detail.submission;
  const { stage, stages, owner, labels } = useSubmissionBits(detail);
  const pick = (kind: PickerKind, trigger: ReactNode) => (
    <SubmissionPropertyPicker submissions={[s]} kind={kind} open={openKind === kind} onOpenChange={o => onOpenKind(o ? kind : null)} trigger={trigger} />
  );
  const decided = ['Accepted', 'Declined', 'Waitlisted'].includes(s.status);

  return (
    <RailSection title="Properties">
      <div className="space-y-0.5">
        <PropRow label="Stage">
          {s.status === 'Draft' ? (
            <span className="px-0 text-[13px] text-muted-foreground">Not in the pipeline yet</span>
          ) : (
            pick('stage', (
              <button type="button" className={valueBtn}>
                <SubmissionGlyph submission={s} stage={stage} stages={stages} />
                <span className="truncate">{stage?.name ?? 'No stage'}</span>
              </button>
            ))
          )}
        </PropRow>
        <PropRow label="Status">
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusChip status={s.status} />
            {decided && !s.notifiedAt && <span className="text-2xs text-tone-warning">not released</span>}
          </span>
        </PropRow>
        <PropRow label="Owner">
          {pick('owner', (
            <button type="button" className={valueBtn}>
              <MemberAvatar member={owner} size={18} />
              <span className={cn('truncate', !owner && 'text-muted-foreground')}>{owner ? `${owner.name}${owner.id === ws.me.id ? ' (you)' : ''}` : 'No owner'}</span>
            </button>
          ))}
        </PropRow>
        <PropRow label="Labels">
          {pick('labels', (
            <button type="button" className={cn(valueBtn, 'h-auto min-h-7 flex-wrap gap-1 py-1')}>
              {labels.length === 0 ? (
                <span className="flex items-center gap-1.5 text-muted-foreground"><Tag className="h-3.5 w-3.5" /> Add label</span>
              ) : (
                labels.map(l => (
                  <span key={l.id} className="chip h-[22px] bg-background">
                    <LabelDot color={l.color} />
                    <span className="max-w-[120px] truncate">{l.name}</span>
                  </span>
                ))
              )}
            </button>
          ))}
        </PropRow>
        <PropRow label="Requested">
          <InlineMoney label="Requested amount" value={s.requestedAmount} onSave={v => actions.update(s, { requestedAmount: v }).catch(() => undefined)} />
        </PropRow>
        {s.status === 'Accepted' && (
          <PropRow label="Award">
            <InlineMoney label="Award amount" value={s.awardAmount} allowEmpty={false} placeholder="Set award" onSave={v => actions.update(s, { awardAmount: v }).catch(() => undefined)} className="font-medium text-tone-success" />
          </PropRow>
        )}
        {s.avgScore != null && (
          <PropRow label="Score">
            <span className="flex items-center gap-2">
              <ScorePill score={s.avgScore} spread={s.scoreSpread} count={s.reviewsSubmitted} />
              <span className="text-xs text-muted-foreground">{s.reviewsSubmitted} review{s.reviewsSubmitted === 1 ? '' : 's'}</span>
            </span>
          </PropRow>
        )}
      </div>
      <div className="mt-3 space-y-1 border-t pt-3 text-[12.5px]">
        {([
          ['Started', s.startedAt],
          ['Submitted', s.submittedAt],
          ['Decided', s.decidedAt],
          ['Released', s.notifiedAt],
          ['Withdrawn', s.withdrawnAt],
          ['Last activity', s.lastActivityAt],
        ] as const).filter(([, v]) => v).map(([label, v]) => (
          <div key={label} className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
            <span className="text-muted-foreground">{label}</span>
            <span className="flex min-w-0 items-center gap-1.5">
              {label === 'Last activity' ? (
                <RelTime iso={v} className="truncate" />
              ) : (
                <Tip label={new Date(v!).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}>
                  <span className="truncate">{shortDate(v)}</span>
                </Tip>
              )}
              {label === 'Submitted' && s.late && <ToneChip tone="warning">Late</ToneChip>}
            </span>
          </div>
        ))}
      </div>
    </RailSection>
  );
}

export function ReviewersSection({ detail, onOpenTab }: { detail: SubmissionDetail; onOpenTab: (t: DetailTab) => void }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const s = detail.submission;
  const current = detail.reviews.filter(r => r.stageId === s.stageId && r.status !== 'Recused');
  const shown = current.length ? current : detail.reviews.filter(r => r.status !== 'Recused');
  const done = shown.filter(r => r.status === 'Submitted').length;

  return (
    <RailSection
      title={current.length || !shown.length ? 'Reviewers' : 'Reviewers · earlier stages'}
      action={
        s.status === 'Submitted' ? (
          <button type="button" onClick={() => app.openAssignReviewers([s])} className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
            Assign
          </button>
        ) : undefined
      }
    >
      {shown.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{s.status === 'Submitted' ? 'Nobody is reviewing this yet.' : s.status === 'Draft' ? 'Reviews start once it’s submitted.' : 'No reviews.'}</p>
      ) : (
        <>
          <button type="button" onClick={() => onOpenTab('reviews')} className="-mx-1.5 flex w-[calc(100%+12px)] items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent">
            <AvatarStack members={shown.map(r => ws.memberById.get(r.reviewerId))} size={20} max={5} />
            <ReviewProgress done={done} total={shown.length} className="ml-auto" />
          </button>
          <ul className="mt-1.5 space-y-0.5">
            {shown.map(r => {
              const m = ws.memberById.get(r.reviewerId);
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => onOpenTab('reviews')} className="-mx-1.5 flex h-7 w-[calc(100%+12px)] items-center gap-2 rounded-md px-1.5 text-left text-[13px] hover:bg-accent">
                    <MemberAvatar member={m} size={16} />
                    <span className="min-w-0 flex-1 truncate">{m?.name ?? 'Former reviewer'}</span>
                    {r.status === 'Submitted' ? <ScorePill score={r.totalScore} /> : <span className="text-xs text-muted-foreground">{r.status}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </RailSection>
  );
}

export function ApplicantSection({ detail, onNavigate }: { detail: SubmissionDetail; onNavigate?: () => void }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const navigate = useNavigate();
  const a = detail.applicant;
  if (!a) {
    return (
      <RailSection title="Applicant">
        <p className="text-[13px] text-muted-foreground">No applicant is linked to this submission.</p>
      </RailSection>
    );
  }
  const row = (icon: ReactNode, content: ReactNode, key: string) => (
    <div key={key} className="flex min-h-7 items-center gap-2 text-[13px]">
      <span className="flex w-4 shrink-0 justify-center text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
      <span className="min-w-0 flex-1">{content}</span>
    </div>
  );
  return (
    <RailSection
      title="Applicant"
      action={
        <Link to={`/applicants/${a.id}`} onClick={onNavigate} className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
          Open <ArrowUpRight className="h-3 w-3" />
        </Link>
      }
    >
      <div className="rounded-lg border bg-background p-3 shadow-2xs">
        <Link to={`/applicants/${a.id}`} onClick={onNavigate} className="block text-[13.5px] font-medium hover:underline">{a.name || a.email}</Link>
        {a.organization && <div className="text-xs text-muted-foreground">{a.organization}</div>}
        <div className="mt-2 space-y-0.5">
          {a.email && row(<Mail />, (
            <span className="group/email flex items-center gap-1">
              <a href={`mailto:${a.email}`} className="truncate hover:underline">{a.email}</a>
              <Tip label="Copy email">
                <button type="button" onClick={() => copyText(a.email, 'Copied email')} aria-label="Copy email" className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/email:opacity-100 max-lg:opacity-100">
                  <Copy className="h-3 w-3" />
                </button>
              </Tip>
            </span>
          ), 'email')}
          {a.phone && row(<Phone />, <a href={`tel:${a.phone}`} className="truncate hover:underline">{a.phone}</a>, 'phone')}
          {a.location && row(<MapPin />, <span className="truncate">{a.location}</span>, 'location')}
          {a.website && row(<Globe />, <a href={/^https?:\/\//.test(a.website) ? a.website : `https://${a.website}`} target="_blank" rel="noreferrer" className="block truncate text-primary hover:underline">{a.website.replace(/^https?:\/\//, '')}</a>, 'website')}
        </div>
        {a.lastActiveAt && <div className="mt-2 text-2xs text-muted-foreground">Last in the portal <RelTime iso={a.lastActiveAt} /></div>}
      </div>
      {a.otherSubmissions.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-muted-foreground">Other applications · {a.otherSubmissions.length}</div>
          <ul className="space-y-0.5">
            {a.otherSubmissions.slice(0, 8).map(o => {
              const p = ws.programById.get(o.programId);
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (o.status === 'Draft') app.openPeek(o.id);
                      else {
                        onNavigate?.();
                        navigate(`/submission/${o.reference}`);
                      }
                    }}
                    className="-mx-1.5 flex h-8 w-[calc(100%+12px)] items-center gap-2 rounded-md px-1.5 text-left text-[13px] hover:bg-accent"
                  >
                    <Glyph icon={p?.icon} color={p?.color} size={16} />
                    <span className="w-14 shrink-0 truncate text-xs tabular-nums text-muted-foreground">{o.reference}</span>
                    <span className="min-w-0 flex-1 truncate">{o.title || 'Untitled'}</span>
                    <Tip label={`${STATUS_META[o.status]?.label ?? o.status}${o.awardAmount && o.status === 'Accepted' ? ` · ${ws.money(o.awardAmount)}` : ''}`}>
                      <span className="shrink-0">{o.status === 'Submitted' ? <StageGlyph kind="Review" color="#6943d0" /> : <OutcomeGlyph status={o.status} />}</span>
                    </Tip>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </RailSection>
  );
}

export function AiSummarySection({ detail }: { detail: SubmissionDetail }) {
  const [state, setState] = useState<{ loading: boolean; result?: AiSummarizeSubmissionOutputType }>({ loading: false });
  const run = async () => {
    setState({ loading: true });
    try {
      const result = await aiSummarizeSubmission({ id: detail.submission.id });
      if (!result.available) {
        toast.message('AI isn’t set up for this workspace');
        setState({ loading: false });
        return;
      }
      setState({ loading: false, result });
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't summarize this application"));
      setState({ loading: false });
    }
  };
  const r = state.result;
  return (
    <RailSection title={<span className="flex items-center gap-1.5"><Sparkles className="h-3 w-3 text-primary" /> AI summary</span>} action={r ? <button type="button" aria-label="Dismiss summary" onClick={() => setState({ loading: false })} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-3.5 w-3.5" /></button> : undefined}>
      {!r ? (
        <button type="button" onClick={run} disabled={state.loading} className="flex w-full items-center gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/[0.03] px-3 py-2 text-left text-[13px] transition-colors hover:bg-primary/[0.06] disabled:opacity-80">
          {state.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
          <span className="min-w-0">
            <span className="block font-medium">{state.loading ? 'Reading the application…' : 'Summarize this application'}</span>
            <span className="block text-xs text-muted-foreground">Strengths, concerns and questions to ask. Advisory only.</span>
          </span>
        </button>
      ) : (
        <div className="space-y-2.5 rounded-lg border border-primary/25 bg-primary/[0.035] p-3 text-[13px] animate-fade-up">
          <p className="leading-relaxed">{r.summary}</p>
          {([['Strengths', r.strengths], ['Concerns', r.concerns], ['Ask them', r.questions]] as const).map(([title, items]) =>
            items.length ? (
              <div key={title}>
                <div className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
                <ul className="mt-0.5 list-disc space-y-0.5 pl-4 leading-snug">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            ) : null,
          )}
          <div className="text-2xs text-muted-foreground">Generated by AI from the answers — check before relying on it.</div>
        </div>
      )}
    </RailSection>
  );
}

/** The compact property row for narrow screens and the peek panel. */
export function InlineProperties({ detail, ...pickerProps }: { detail: SubmissionDetail } & PickerProps) {
  const ws = useWorkspace();
  const [openKind, onOpenKind] = usePickerState(pickerProps);
  const s = detail.submission;
  const { stage, stages, owner, labels } = useSubmissionBits(detail);
  const chip = 'chip h-7 gap-1.5 bg-background px-2.5 hover:bg-accent';
  const pick = (kind: PickerKind, trigger: ReactNode) => (
    <SubmissionPropertyPicker submissions={[s]} kind={kind} open={openKind === kind} onOpenChange={o => onOpenKind(o ? kind : null)} trigger={trigger} />
  );
  return (
    <div className="flex flex-wrap items-center gap-1">
      {s.status !== 'Draft' && pick('stage', <button type="button" className={chip}><SubmissionGlyph submission={s} stage={stage} stages={stages} />{s.status === 'Submitted' ? stage?.name ?? 'Stage' : STATUS_META[s.status]?.label}</button>)}
      {pick('owner', <button type="button" className={chip}><MemberAvatar member={owner} size={16} /><span className="max-w-[140px] truncate">{owner?.name ?? 'Owner'}</span></button>)}
      {pick('labels', (
        <button type="button" className={chip}>
          {labels.length ? labels.slice(0, 3).map(l => <LabelDot key={l.id} color={l.color} />) : <Tag className="h-3 w-3 text-muted-foreground" />}
          <span className="max-w-[160px] truncate">{labels.length ? labels.map(l => l.name).join(', ') : 'Labels'}</span>
        </button>
      ))}
      {s.avgScore != null && <ScorePill score={s.avgScore} spread={s.scoreSpread} count={s.reviewsSubmitted} className="ml-0.5" />}
      {s.reviewsActive > 0 && (
        <span className="chip h-7 gap-1.5 bg-background px-2.5">
          <Users className="h-3 w-3 text-muted-foreground" />
          <ReviewProgress done={s.reviewsDoneInStage} total={s.reviewsActive} />
        </span>
      )}
      {s.requestedAmount != null && <span className="chip h-7 bg-background px-2.5 tabular-nums text-muted-foreground">{s.status === 'Accepted' && s.awardAmount != null ? `Award ${ws.money(s.awardAmount)}` : `Requests ${ws.money(s.requestedAmount)}`}</span>}
    </div>
  );
}
