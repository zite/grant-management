import { AlertTriangle, Bell, CalendarClock, Loader2, MoreHorizontal, RotateCcw, Sparkles, Trash2, UserMinus, Users, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { aiSynthesizeReviews, manageReview, type AiSynthesizeReviewsOutputType } from 'zitejs/api';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { cn } from '@project/components/lib/utils';
import { DISAGREEMENT_SPREAD, RECOMMENDATION_LABEL, scoreStats, scoreTone, type Recommendation, type RubricCriterion } from '@project/shared/scoring';
import { useAppActions } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import { dueLabel, shortDate } from '../../lib/format';
import type { Review, SubmissionDetail } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { MemberAvatar } from '../primitives/Avatar';
import { RecommendationBar, ScorePill, StageGlyph } from '../primitives/icons';
import { Tip } from '../primitives/bits';
import { DatePicker } from '../pickers/pickers';
import { RelTime, ToneChip, useDetailCache, type Tone } from './detailBits';

const REVIEW_TONE: Record<string, Tone> = { Assigned: 'neutral', 'In progress': 'info', Submitted: 'success', Recused: 'warning' };
const REC_TONE: Record<string, Tone> = { Yes: 'success', Maybe: 'warning', No: 'danger' };

/** Cell tints by score share, on the same scale as the 0–100 pills. */
const CELL_TONE: Record<string, string> = {
  success: 'bg-tone-success/[0.14] text-tone-success',
  accent: 'bg-tone-accent/[0.12] text-tone-accent',
  warning: 'bg-tone-warning/[0.14] text-tone-warning',
  danger: 'bg-tone-danger/[0.12] text-tone-danger',
  neutral: 'text-muted-foreground',
};

export function ReviewsTab({ detail }: { detail: SubmissionDetail }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const { reviews, submission } = detail;
  const submitted = reviews.filter(r => r.status === 'Submitted');
  const active = reviews.filter(r => r.status !== 'Recused');
  const recused = reviews.filter(r => r.status === 'Recused');
  const stats = scoreStats(submitted.map(r => r.totalScore));
  const recs = { yes: submitted.filter(r => r.recommendation === 'Yes').length, maybe: submitted.filter(r => r.recommendation === 'Maybe').length, no: submitted.filter(r => r.recommendation === 'No').length };
  const disagree = stats.spread != null && stats.count > 1 && stats.spread >= DISAGREEMENT_SPREAD;
  const canAssign = submission.status === 'Submitted';

  const stages = useMemo(() => {
    const byStage = new Map<string, Review[]>();
    for (const r of reviews) {
      const k = r.stageId ?? '';
      if (!byStage.has(k)) byStage.set(k, []);
      byStage.get(k)!.push(r);
    }
    const order = ws.stagesFor(submission.programId).map(s => s.id);
    return [...byStage.entries()].sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [reviews, ws, submission.programId]);

  // One comparison table per rubric — reviews scored on different rubrics can't share rows.
  const comparisons = useMemo(() => {
    const byRubric = new Map<string, Review[]>();
    for (const r of submitted) {
      if (!r.rubricId) continue;
      if (!byRubric.has(r.rubricId)) byRubric.set(r.rubricId, []);
      byRubric.get(r.rubricId)!.push(r);
    }
    return [...byRubric.entries()]
      .map(([rubricId, rs]) => ({ rubric: ws.rubricById.get(rubricId), reviews: rs }))
      .filter(c => c.rubric && c.rubric.criteria.length > 0 && c.reviews.length >= 2);
  }, [submitted, ws.rubricById]);

  if (reviews.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-6 py-10 text-center animate-fade-in">
        <Users className="mx-auto h-5 w-5 text-muted-foreground" />
        <p className="mt-2 text-[13.5px] font-medium">No reviewers yet</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
          {canAssign ? 'Assign reviewers from the program’s pool, or choose people yourself. They score it with the stage’s rubric.' : submission.status === 'Draft' ? 'Reviews start once the applicant submits.' : 'This submission wasn’t reviewed.'}
        </p>
        {canAssign && (
          <button type="button" onClick={() => app.openAssignReviewers([submission])} className="mt-4 h-8 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">
            Assign reviewers
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="rounded-lg border bg-card p-4 shadow-2xs">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3">
            <ScorePill score={stats.mean} spread={stats.spread} count={stats.count} size="md" className="h-10 min-w-[56px] text-[18px]" />
            <div>
              <div className="text-[13px] font-medium">{stats.count ? `Average of ${stats.count} review${stats.count === 1 ? '' : 's'}` : 'No scores yet'}</div>
              <div className="text-xs text-muted-foreground">{stats.count > 1 ? `Range ${Math.round(stats.min!)}–${Math.round(stats.max!)}` : stats.count === 1 ? 'One reviewer so far' : 'Scores appear as reviewers submit'}</div>
            </div>
          </div>
          <div className="min-w-[140px]">
            <div className="text-xs text-muted-foreground">Recommendations</div>
            {recs.yes + recs.maybe + recs.no ? (
              <div className="mt-1 flex items-center gap-2">
                <RecommendationBar yes={recs.yes} maybe={recs.maybe} no={recs.no} className="w-24" />
                <span className="text-xs tabular-nums text-muted-foreground">{recs.yes} yes · {recs.maybe} unsure · {recs.no} no</span>
              </div>
            ) : (
              <div className="mt-0.5 text-[13px] text-muted-foreground">—</div>
            )}
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Progress</div>
            <div className="mt-0.5 text-[13px] tabular-nums">
              {submitted.length} of {active.length} submitted{recused.length ? <span className="text-muted-foreground"> · {recused.length} recused</span> : null}
            </div>
          </div>
          {canAssign && (
            <button type="button" onClick={() => app.openAssignReviewers([submission])} className="ml-auto flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium shadow-2xs hover:bg-accent">
              <Users className="h-3.5 w-3.5" /> Assign reviewers
            </button>
          )}
        </div>
        {disagree && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-tone-warning/30 bg-tone-warning/[0.06] px-3 py-2 text-[13px]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tone-warning" />
            <span>Reviewers are <b className="font-medium">{Math.round(stats.spread!)} points apart</b>. Compare their criteria below before deciding — it’s worth a conversation.</span>
          </div>
        )}
      </div>

      {ws.features.ai && submitted.length >= 2 && <SynthesisCard detail={detail} count={submitted.length} />}

      {comparisons.map(c => (
        <ComparisonTable key={c.rubric!.id} title={comparisons.length > 1 ? c.rubric!.name : undefined} criteria={c.rubric!.criteria} reviews={c.reviews} />
      ))}

      {stages.map(([stageId, list]) => {
        const stage = ws.stageById.get(stageId);
        const done = list.filter(r => r.status === 'Submitted');
        const s = scoreStats(done.map(r => r.totalScore));
        const current = stageId === submission.stageId && submission.status === 'Submitted';
        return (
          <section key={stageId || 'none'}>
            <div className="mb-2 flex items-center gap-2">
              <StageGlyph kind={stage?.kind ?? 'Review'} color={stage?.color} />
              <h3 className="text-[13px] font-medium">{stage?.name ?? 'Earlier stage'}</h3>
              {current && <ToneChip tone="accent">Current stage</ToneChip>}
              <span className="text-xs tabular-nums text-muted-foreground">{done.length}/{list.filter(r => r.status !== 'Recused').length} in</span>
              {s.mean != null && stages.length > 1 && <ScorePill score={s.mean} spread={s.spread} count={s.count} className="ml-auto" />}
            </div>
            <div className="space-y-2">
              {list.map(r => (
                <ReviewCard key={r.id} review={r} detail={detail} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ComparisonTable({ title, criteria, reviews }: { title?: string; criteria: RubricCriterion[]; reviews: Review[] }) {
  const ws = useWorkspace();
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-[13px] font-medium">Criteria comparison</h3>
        <span className="text-xs text-muted-foreground">{title ? `${title} · ` : ''}submitted reviews side by side</span>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card shadow-2xs">
        <table className="w-full min-w-[420px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b bg-subtle text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Criterion</th>
              {reviews.map(r => {
                const m = ws.memberById.get(r.reviewerId);
                return (
                  <th key={r.id} className="px-2 py-2 text-center font-medium">
                    <Tip label={m?.name ?? 'Reviewer'}>
                      <span className="inline-flex items-center gap-1.5">
                        <MemberAvatar member={m} size={16} />
                        <span className="max-w-[80px] truncate">{m?.name.split(' ')[0] ?? 'Reviewer'}</span>
                      </span>
                    </Tip>
                  </th>
                );
              })}
              <th className="px-3 py-2 text-right font-medium">Gap</th>
            </tr>
          </thead>
          <tbody>
            {criteria.map(c => {
              const values = reviews.map(r => r.scores[c.id]);
              const present = values.filter((v): v is number => v != null);
              const spread = present.length > 1 ? Math.max(...present) - Math.min(...present) : null;
              const wide = spread != null && spread / c.max >= 0.4;
              return (
                <tr key={c.id} className="border-b last:border-b-0">
                  <td className="px-3 py-1.5">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-2xs text-muted-foreground">out of {c.max}{c.weight !== 1 ? ` · weight ×${c.weight}` : ''}</div>
                  </td>
                  {values.map((v, i) => (
                    <td key={reviews[i].id} className="px-1.5 py-1.5 text-center">
                      <span className={cn('inline-flex h-7 min-w-[40px] items-center justify-center rounded-md px-1.5 font-semibold tabular-nums', v == null ? 'text-muted-foreground' : CELL_TONE[scoreTone((v / c.max) * 100)])}>
                        {v == null ? '—' : v}
                      </span>
                    </td>
                  ))}
                  <td className={cn('px-3 py-1.5 text-right tabular-nums', wide ? 'font-medium text-tone-warning' : 'text-muted-foreground')}>
                    {spread == null ? '—' : spread === 0 ? 'Agree' : `${spread} pt${spread === 1 ? '' : 's'}`}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-subtle">
              <td className="px-3 py-2 text-xs font-medium text-muted-foreground">Total (0–100)</td>
              {reviews.map(r => (
                <td key={r.id} className="px-1.5 py-2 text-center">
                  <ScorePill score={r.totalScore} />
                </td>
              ))}
              <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                {reviews.length > 1 ? `${Math.round(scoreStats(reviews.map(r => r.totalScore)).spread ?? 0)} pts` : '—'}
              </td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-xs font-medium text-muted-foreground">Recommendation</td>
              {reviews.map(r => (
                <td key={r.id} className="px-1.5 py-2 text-center">
                  {r.recommendation ? <ToneChip tone={REC_TONE[r.recommendation] ?? 'neutral'}>{r.recommendation === 'Yes' ? 'Yes' : r.recommendation === 'No' ? 'No' : 'Unsure'}</ToneChip> : <span className="text-muted-foreground">—</span>}
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReviewCard({ review: r, detail }: { review: Review; detail: SubmissionDetail }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const { patch, refresh } = useDetailCache(detail.submission.id);
  const [dueOpen, setDueOpen] = useState(false);
  // Opening the date picker from the menu waits for the menu to finish closing, or its focus return would dismiss the picker.
  const pendingDue = useRef(false);
  const [busy, setBusy] = useState(false);
  const m = ws.memberById.get(r.reviewerId);
  const rubric = r.rubricId ? ws.rubricById.get(r.rubricId) : undefined;
  const criteria = rubric?.criteria ?? [];
  const finished = r.status === 'Submitted' || r.status === 'Recused';
  const due = !finished ? dueLabel(r.dueDate) : null;
  const scoredCount = criteria.filter(c => r.scores[c.id] != null).length;
  const firstName = m?.name.split(' ')[0] ?? 'the reviewer';

  const act = async (action: 'remove' | 'set_due' | 'remind' | 'reopen', extra: { dueDate?: string | null } = {}, success?: string) => {
    setBusy(true);
    try {
      await manageReview({ reviewId: r.id, action, ...extra });
      if (action === 'remove') patch(d => ({ ...d, reviews: d.reviews.filter(x => x.id !== r.id) }));
      if (action === 'set_due') patch(d => ({ ...d, reviews: d.reviews.map(x => (x.id === r.id ? { ...x, dueDate: extra.dueDate ?? null } : x)) }));
      if (action === 'reopen') patch(d => ({ ...d, reviews: d.reviews.map(x => (x.id === r.id ? { ...x, status: 'In progress', submittedAt: null } : x)) }));
      if (success) toast.success(success);
      refresh({ delay: action === 'remind' ? 1500 : 400 });
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't update the review"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('rounded-lg border bg-card shadow-2xs', r.status === 'Recused' && 'opacity-80')}>
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <MemberAvatar member={m} size={26} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-[13.5px] font-medium">{m?.name ?? 'A former reviewer'}{m?.id === ws.me.id && <span className="font-normal text-muted-foreground"> (you)</span>}</span>
            <ToneChip tone={REVIEW_TONE[r.status] ?? 'neutral'}>{r.status}</ToneChip>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {r.status === 'Submitted' && <RelTime iso={r.submittedAt} prefix="Submitted" />}
            {r.status === 'In progress' && criteria.length > 0 && <span>{scoredCount} of {criteria.length} criteria scored</span>}
            {r.status === 'Assigned' && <RelTime iso={r.assignedAt} prefix="Assigned" />}
            {!finished && (
              <>
                <span aria-hidden>·</span>
                <DatePicker
                  open={dueOpen}
                  onOpenChange={setDueOpen}
                  value={r.dueDate}
                  clearLabel="No due date"
                  onChange={v => act('set_due', { dueDate: v }, v ? `${firstName}’s review is due ${shortDate(v)}` : 'Due date cleared')}
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
        {r.status === 'Submitted' && (
          <div className="flex shrink-0 items-center gap-2">
            {r.recommendation && <ToneChip tone={REC_TONE[r.recommendation] ?? 'neutral'} className="hidden sm:inline-flex">{RECOMMENDATION_LABEL[r.recommendation as Recommendation] ?? r.recommendation}</ToneChip>}
            <ScorePill score={r.totalScore} size="md" />
          </div>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`Actions for ${m?.name ?? 'this review'}`} disabled={busy} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52" onCloseAutoFocus={e => { if (pendingDue.current) { e.preventDefault(); pendingDue.current = false; setDueOpen(true); } }}>
            {!finished && (
              <>
                <DropdownMenuItem className="text-[13px]" onSelect={() => act('remind', {}, `Reminded ${firstName}`)}><Bell className="h-3.5 w-3.5" /> Send a reminder</DropdownMenuItem>
                <DropdownMenuItem className="text-[13px]" onSelect={() => { pendingDue.current = true; }}><CalendarClock className="h-3.5 w-3.5" /> Change due date…</DropdownMenuItem>
              </>
            )}
            {finished && (
              <DropdownMenuItem className="text-[13px]" onSelect={() => act('reopen', {}, `Reopened ${firstName}’s review`)}><RotateCcw className="h-3.5 w-3.5" /> Reopen for changes</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-[13px] text-destructive focus:text-destructive"
              onSelect={async () => {
                const ok = await app.confirm({
                  title: `Remove ${m?.name ?? 'this reviewer'}?`,
                  description: r.status === 'Submitted' ? 'Their submitted scores and comments are deleted and no longer count toward the average.' : 'The review disappears from their queue.',
                  confirmLabel: 'Remove reviewer',
                  destructive: true,
                });
                if (ok) act('remove', {}, `Removed ${m?.name ?? 'the reviewer'}`);
              }}
            >
              {r.status === 'Submitted' ? <Trash2 className="h-3.5 w-3.5" /> : <UserMinus className="h-3.5 w-3.5" />} Remove reviewer…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {r.status === 'Recused' && (
        <div className="border-t px-3.5 py-2.5 text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground/80">Recused</span>{r.recusalReason ? ` — “${r.recusalReason}”` : ''}
        </div>
      )}

      {(r.status === 'Submitted' || (r.status === 'In progress' && (r.comment || scoredCount > 0))) && (
        <div className="space-y-3 border-t px-3.5 py-3">
          {r.comment && <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{r.comment}</p>}
          {r.applicantFeedback && (
            <div className="rounded-md bg-subtle px-3 py-2">
              <div className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Feedback for the applicant</div>
              <p className="mt-0.5 whitespace-pre-wrap text-[13px]">{r.applicantFeedback}</p>
            </div>
          )}
          {criteria.length > 0 && scoredCount > 0 && (
            <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {criteria.map(c => {
                const v = r.scores[c.id];
                const pct = v == null ? 0 : v / c.max;
                return (
                  <div key={c.id} className="flex items-center gap-2 text-[12.5px]">
                    <span className="min-w-0 flex-1 truncate text-muted-foreground" title={c.description || c.name}>{c.name}</span>
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <span className={cn('block h-full rounded-full', v == null ? '' : { success: 'bg-tone-success', accent: 'bg-tone-accent', warning: 'bg-tone-warning', danger: 'bg-tone-danger', neutral: 'bg-muted-foreground' }[scoreTone(pct * 100)])} style={{ width: `${pct * 100}%` }} />
                    </span>
                    <span className="w-9 text-right tabular-nums">{v == null ? '—' : `${v}/${c.max}`}</span>
                  </div>
                );
              })}
            </div>
          )}
          {r.status === 'Submitted' && !r.comment && !scoredCount && <p className="text-[13px] text-muted-foreground">No comment.</p>}
        </div>
      )}
    </div>
  );
}

function SynthesisCard({ detail, count }: { detail: SubmissionDetail; count: number }) {
  const [state, setState] = useState<{ loading: boolean; result?: AiSynthesizeReviewsOutputType; forCount?: number }>({ loading: false });
  const run = async () => {
    setState({ loading: true });
    try {
      const result = await aiSynthesizeReviews({ id: detail.submission.id });
      if (!result.available) {
        toast.message('AI isn’t set up for this workspace');
        setState({ loading: false });
        return;
      }
      setState({ loading: false, result, forCount: count });
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't synthesize the reviews"));
      setState({ loading: false });
    }
  };
  if (!state.result) {
    return (
      <button type="button" onClick={run} disabled={state.loading} className="flex w-full items-center gap-2.5 rounded-lg border border-dashed border-primary/30 bg-primary/[0.03] px-3.5 py-2.5 text-left transition-colors hover:bg-primary/[0.06] disabled:opacity-80">
        {state.loading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Sparkles className="h-4 w-4 text-primary" />}
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium">{state.loading ? 'Reading the reviews…' : 'Synthesize the panel'}</span>
          <span className="block text-xs text-muted-foreground">Where {count} reviewers agree, where they split, and what to settle. Advisory — it doesn’t score.</span>
        </span>
      </button>
    );
  }
  const r = state.result;
  const block = (title: string, items: string[], tone?: string) =>
    items.length > 0 && (
      <div>
        <div className={cn('text-2xs font-medium uppercase tracking-wide text-muted-foreground', tone)}>{title}</div>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13px] leading-relaxed">{items.map((d, i) => <li key={i}>{d}</li>)}</ul>
      </div>
    );
  return (
    <div className="rounded-lg border border-primary/25 bg-primary/[0.035] p-4 animate-fade-up">
      <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <Sparkles className="h-3.5 w-3.5" /> Panel synthesis
        <span className="rounded bg-primary/10 px-1.5 py-px text-2xs">AI · advisory</span>
        {state.forCount !== count && <span className="text-2xs font-normal text-muted-foreground">· reviews changed since</span>}
        <button type="button" onClick={run} className="ml-auto rounded px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-accent hover:text-foreground">Refresh</button>
        <button type="button" onClick={() => setState({ loading: false })} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Dismiss synthesis">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {r.consensus && <p className="mt-2 text-[13.5px] leading-relaxed">{r.consensus}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {block('Agreements', r.agreements)}
        {block('Disagreements', r.disagreements)}
      </div>
      <div className="mt-3">{block('Open questions', r.openQuestions)}</div>
    </div>
  );
}
