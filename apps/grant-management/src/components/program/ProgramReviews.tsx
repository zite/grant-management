import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BellRing, ClipboardCheck, Layers, MoreHorizontal, Scale, UserPlus, Users } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { manageReview } from 'zitejs/api';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { cn } from '@project/components/lib/utils';
import { useAppActions } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import { percent, plural, shortDate, timeAgo } from '../../lib/format';
import { useSubmissions, qk } from '../../lib/queries';
import type { Program } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { MemberAvatar } from '../primitives/Avatar';
import { EmptyState, IconButton, SkeletonRows, Tip } from '../primitives/bits';
import { ScorePill, StageGlyph } from '../primitives/icons';
import { useOpenSubmissions } from './ProgramOverview';
import { useReviewProgress, type ReviewerRow } from './programData';

/** A reviewer whose average sits this far from the program's, over enough reviews, is worth a look. */
const CALIBRATION_FLAG = 10;
const CALIBRATION_MIN_REVIEWS = 3;
const DELTA_RANGE = 30;

function flagFor(r: ReviewerRow): 'harsh' | 'lenient' | null {
  if (r.delta == null || r.submitted < CALIBRATION_MIN_REVIEWS) return null;
  if (r.delta <= -CALIBRATION_FLAG) return 'harsh';
  if (r.delta >= CALIBRATION_FLAG) return 'lenient';
  return null;
}

/**
 * Score given minus the program's average, as a bar growing left (lower) or
 * right (higher) from a neutral centre. Two opposing hues, gray midpoint.
 */
function DeltaBar({ row, mean }: { row: ReviewerRow; mean: number | null }) {
  if (row.delta == null || mean == null) return <span className="text-xs text-muted-foreground">—</span>;
  const d = Math.max(-DELTA_RANGE, Math.min(DELTA_RANGE, row.delta));
  const width = (Math.abs(d) / DELTA_RANGE) * 50;
  const flag = flagFor(row);
  const paired = row.pairedDelta != null && row.pairedCount > 0
    ? ` On the ${plural(row.pairedCount, 'application')} they shared with other reviewers, they scored ${Math.abs(row.pairedDelta)} points ${row.pairedDelta < 0 ? 'lower' : 'higher'} on average.`
    : '';
  const label = `Averages ${row.avgGiven} — ${Math.abs(row.delta)} points ${row.delta < 0 ? 'below' : 'above'} the program average of ${mean}.${paired}`;
  return (
    <Tip label={<span className="block max-w-[260px] whitespace-normal">{label}</span>}>
      <span className="flex items-center gap-2" aria-label={label}>
        <span className="relative h-2 w-[88px] shrink-0 rounded-full bg-muted" aria-hidden>
          <span className="absolute inset-y-[-3px] left-1/2 w-px bg-muted-foreground/40" />
          <span
            className={cn('absolute inset-y-0 rounded-full', d < 0 ? 'bg-[hsl(var(--chart-3))]' : 'bg-[hsl(var(--chart-5))]')}
            style={d < 0 ? { right: '50%', width: `${width}%` } : { left: '50%', width: `${width}%` }}
          />
        </span>
        <span className="w-9 shrink-0 text-right text-xs tabular-nums">{row.delta > 0 ? '+' : ''}{row.delta}</span>
        {flag && (
          <span className="inline-flex h-5 items-center gap-1 rounded-full bg-tone-warning/[0.12] px-1.5 text-2xs font-medium text-tone-warning">
            <Scale className="h-3 w-3" /> {flag === 'harsh' ? 'Harsh' : 'Lenient'}
          </span>
        )}
      </span>
    </Tip>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'danger' }) {
  return (
    <div className="min-w-0 rounded-lg border bg-background px-3.5 py-2.5">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 text-[20px] font-semibold leading-7', tone === 'danger' && 'text-tone-danger')}>{value}</div>
      {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Section({ title, icon, count, action, children, description }: { title: string; icon: ReactNode; count?: number; action?: ReactNode; children: ReactNode; description?: string }) {
  return (
    <section className="min-w-0 rounded-lg border bg-background">
      <header className="flex min-h-10 flex-wrap items-center gap-2 border-b px-4 py-2">
        <span className="text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
        <h2 className="text-[13px] font-medium">{title}</h2>
        {count != null && <span className="text-xs tabular-nums text-muted-foreground">{count}</span>}
        {description && <span className="hidden text-xs text-muted-foreground lg:inline">· {description}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </header>
      {children}
    </section>
  );
}

export function ProgramReviews({ program }: { program: Program }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const openSubmissions = useOpenSubmissions(program.id);
  const reviewStages = ws.stagesFor(program.id).filter(s => s.kind === 'Review');
  const [stageId, setStageId] = useState<string | null>(null);
  const activeStage = stageId && reviewStages.some(s => s.id === stageId) ? stageId : null;
  const { data, isPending, isError, refetch, isFetching } = useReviewProgress(program.id, activeStage);
  const [reminding, setReminding] = useState<string | null>(null);

  const needsCount = data?.needsReviewers.length ?? 0;
  const { data: unassigned } = useSubmissions(
    { programIds: [program.id], reviewState: 'unassigned', ...(activeStage ? { stageIds: [activeStage] } : {}) },
    'submitted_asc',
    { enabled: needsCount > 0 },
  );
  const targetsById = useMemo(() => new Map((unassigned?.submissions ?? []).map(s => [s.id, s])), [unassigned]);

  const remind = async (rows: ReviewerRow[]) => {
    const ids = rows.flatMap(r => r.overdueReviewIds);
    if (!ids.length) return;
    setReminding(rows.length === 1 ? rows[0].memberId : 'all');
    let sent = 0;
    let failed: unknown = null;
    for (const reviewId of ids) {
      try {
        await manageReview({ reviewId, action: 'remind' });
        sent += 1;
      } catch (e) {
        failed = e;
      }
    }
    setReminding(null);
    qc.invalidateQueries({ queryKey: qk.programRoot });
    if (failed && !sent) toast.error(errorMessage(failed, "Couldn't send the reminders"));
    else {
      const who = rows.length === 1 ? ws.memberById.get(rows[0].memberId)?.name ?? 'the reviewer' : plural(rows.length, 'reviewer');
      toast.success(`Reminded ${who} about ${plural(sent, 'overdue review')}${failed ? ` · ${ids.length - sent} failed` : ''}`);
    }
  };

  const pool = ws.reviewerPool(program.id);
  const noReviewStage = reviewStages.length === 0;

  const toolbar = (
    <div className="flex min-h-11 flex-wrap items-center gap-1.5 border-b px-3 py-1.5">
      {reviewStages.length > 1 ? (
        <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-none" role="tablist" aria-label="Review stage">
          {[{ id: null as string | null, name: 'All review stages', color: '', kind: '' }, ...reviewStages].map(s => (
            <button
              key={s.id ?? 'all'}
              type="button"
              role="tab"
              aria-selected={activeStage === s.id}
              onClick={() => setStageId(s.id)}
              className={cn(
                'flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] transition-colors',
                activeStage === s.id ? 'border-border bg-accent font-medium text-foreground shadow-2xs' : 'border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              {s.id && <StageGlyph kind={s.kind} color={s.color} size={12} />}
              {s.name}
            </button>
          ))}
        </div>
      ) : (
        <span className="flex items-center gap-2 px-1 text-[13px] text-muted-foreground">
          {reviewStages[0] ? <><StageGlyph kind="Review" color={reviewStages[0].color} size={12} /> {reviewStages[0].name}</> : 'No review stage'}
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {isFetching && !isPending && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/70" aria-label="Refreshing" />}
        <Link to={`/programs/${program.id}/settings/team`} className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground">
          <Users className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Reviewer pool</span> <span className="tabular-nums">{pool.length}</span>
        </Link>
      </div>
    </div>
  );

  if (isPending) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {toolbar}
        <SkeletonRows rows={8} className="pt-3" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {toolbar}
        <EmptyState icon={<AlertTriangle />} title="Couldn't load review progress" description="Check your connection and try again." action={<button type="button" onClick={() => refetch()} className="text-[13px] text-primary hover:underline">Retry</button>} />
      </div>
    );
  }

  const t = data.totals;
  const mean = data.programMean;
  const overdueRows = data.reviewers.filter(r => r.overdue > 0);

  if (data.reviewers.length === 0 && pool.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {toolbar}
        <EmptyState
          icon={<UserPlus />}
          title="No reviewers yet"
          description={noReviewStage ? 'This program has no review stage. Add one in the pipeline, then choose who reviews.' : 'Add people to the reviewer pool and submissions entering a review stage are assigned to them automatically.'}
          action={
            <Link to={`/programs/${program.id}/settings/${noReviewStage ? 'pipeline' : 'team'}`} className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-xs hover:bg-primary/90">
              {noReviewStage ? 'Edit the pipeline' : 'Add reviewers'}
            </Link>
          }
        />
      </div>
    );
  }

  const cols = 'grid-cols-[minmax(170px,1.4fr)_60px_52px_74px_74px_60px_60px_66px_minmax(232px,1fr)_88px_32px]';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="min-h-0 flex-1 overflow-y-auto bg-subtle/40">
        <div className="mx-auto max-w-[1240px] space-y-4 p-3 animate-fade-in sm:p-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Assigned" value={t.assigned} sub={`${plural(data.reviewers.filter(r => r.assigned > 0).length, 'reviewer')}`} />
            <Stat label="Submitted" value={t.submitted} sub={t.assigned ? `${percent(t.submitted, t.assigned)}% of assigned` : 'None yet'} />
            <Stat label="In progress" value={t.inProgress} sub="Started, not submitted" />
            <Stat label="Not started" value={t.notStarted} sub="Assigned, untouched" />
            <Stat label="Overdue" value={t.overdue} tone={t.overdue ? 'danger' : undefined} sub={t.overdue ? 'Past their due date' : 'Nothing late'} />
            <Stat label="Program average" value={mean == null ? '—' : Math.round(mean)} sub={t.recused ? `${t.recused} recused` : 'Out of 100'} />
          </div>

          <Section
            title="Reviewer workload"
            icon={<Users />}
            count={data.reviewers.length}
            description="calibration compares each reviewer’s average with the program’s"
            action={
              overdueRows.length > 0 ? (
                <button type="button" disabled={reminding !== null} onClick={() => remind(overdueRows)} className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-[12.5px] shadow-2xs hover:bg-accent disabled:opacity-60">
                  <BellRing className="h-3.5 w-3.5" /> {reminding === 'all' ? 'Reminding…' : `Remind all overdue (${t.overdue})`}
                </button>
              ) : undefined
            }
          >
            {data.reviewers.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">Nobody has been assigned a review {activeStage ? 'in this stage ' : ''}yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[1040px]">
                  <div className={cn('grid h-8 items-center gap-2 border-b bg-subtle px-4 text-2xs font-medium text-muted-foreground', cols)}>
                    <span>Reviewer</span>
                    <span className="text-right">Assigned</span>
                    <span className="text-right">Done</span>
                    <span className="text-right">In progress</span>
                    <span className="text-right">Not started</span>
                    <span className="text-right">Overdue</span>
                    <span className="text-right">Recused</span>
                    <span className="text-right">Avg given</span>
                    <span>vs program average</span>
                    <span>Last submitted</span>
                    <span />
                  </div>
                  {data.reviewers.map(r => {
                    const m = ws.memberById.get(r.memberId);
                    return (
                      <div key={r.memberId} className={cn('group grid h-11 items-center gap-2 border-b px-4 text-[13px] last:border-b-0 hover:bg-accent/40', cols)}>
                        <div className="flex min-w-0 items-center gap-2">
                          <MemberAvatar member={m} size={20} />
                          <span className="truncate">{m ? (m.id === ws.me.id ? `${m.name} (you)` : m.name) : 'Former member'}</span>
                          {!r.inPool && (
                            <Tip label="Has reviews here but isn’t in the reviewer pool, so won’t be auto-assigned">
                              <span className="shrink-0 rounded-full bg-muted px-1.5 text-2xs text-muted-foreground">Not in pool</span>
                            </Tip>
                          )}
                        </div>
                        <span className="text-right tabular-nums">{r.assigned}</span>
                        <span className="text-right tabular-nums">{r.submitted}</span>
                        <span className="text-right tabular-nums">{r.inProgress}</span>
                        <span className="text-right tabular-nums">{r.notStarted}</span>
                        <span className={cn('text-right tabular-nums', r.overdue ? 'font-medium text-tone-danger' : 'text-muted-foreground')}>{r.overdue}</span>
                        <span className="text-right tabular-nums text-muted-foreground">{r.recused}</span>
                        <span className="flex justify-end">{r.avgGiven == null ? <span className="text-muted-foreground">—</span> : <ScorePill score={r.avgGiven} count={r.submitted} />}</span>
                        <DeltaBar row={r} mean={mean} />
                        <span className="truncate text-xs text-muted-foreground" title={r.lastSubmittedAt ? shortDate(r.lastSubmittedAt) : undefined}>{r.lastSubmittedAt ? timeAgo(r.lastSubmittedAt) : 'Never'}</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton size="sm" aria-label={`Actions for ${m?.name ?? 'reviewer'}`}>
                              <MoreHorizontal />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-60">
                            <DropdownMenuItem className="text-[13px]" disabled={r.overdue === 0 || reminding !== null} onSelect={() => remind([r])}>
                              <BellRing className="h-3.5 w-3.5" /> {r.overdue ? `Remind about ${plural(r.overdue, 'overdue review')}` : 'Nothing overdue to remind about'}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-[13px]" onSelect={() => openSubmissions({ reviewerIds: [r.memberId] })}>
                              <Layers className="h-3.5 w-3.5" /> See their submissions
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section
              title="Needs reviewers"
              icon={<UserPlus />}
              count={data.needsReviewers.length}
              action={
                data.needsReviewers.length > 0 ? (
                  <button
                    type="button"
                    disabled={!unassigned}
                    onClick={() => {
                      const rows = data.needsReviewers.flatMap(n => {
                        const row = targetsById.get(n.id);
                        return row ? [row] : [];
                      });
                      if (rows.length) app.openAssignReviewers(rows);
                    }}
                    className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12.5px] font-medium text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-60"
                  >
                    Assign all…
                  </button>
                ) : undefined
              }
            >
              {data.needsReviewers.length === 0 ? (
                <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">{noReviewStage ? 'This program has no review stage.' : 'Every submission in review has reviewers.'}</p>
              ) : (
                <ul className="max-h-[360px] divide-y overflow-y-auto">
                  {data.needsReviewers.map(n => {
                    const st = n.stageId ? ws.stageById.get(n.stageId) : undefined;
                    const target = targetsById.get(n.id);
                    return (
                      <li key={n.id} className="group flex h-11 items-center gap-2.5 px-4 text-[13px] hover:bg-accent/40">
                        <button type="button" onClick={() => navigate(`/submission/${n.reference}`)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                          <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{n.reference}</span>
                          <span className="min-w-0 flex-1 truncate">{n.title || n.applicantName || 'Untitled'}</span>
                        </button>
                        {st && reviewStages.length > 1 && !activeStage && <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex"><StageGlyph kind={st.kind} color={st.color} size={12} />{st.name}</span>}
                        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{n.stageEnteredAt ? `waiting ${timeAgo(n.stageEnteredAt).replace(' ago', '')}` : ''}</span>
                        <button type="button" disabled={!target} onClick={() => target && app.openAssignReviewers([target])} className="h-6 shrink-0 rounded-md border bg-background px-2 text-xs shadow-2xs hover:bg-accent disabled:opacity-50">
                          Assign…
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>

            <Section title="Reviewers disagree" icon={<AlertTriangle />} count={data.disagreements.length} description="25+ points apart">
              {data.disagreements.length === 0 ? (
                <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">No big disagreements among submitted reviews.</p>
              ) : (
                <ul className="max-h-[360px] divide-y overflow-y-auto">
                  {data.disagreements.map(d => (
                    <li key={d.id}>
                      <button type="button" onClick={() => navigate(`/submission/${d.reference}`)} className="flex h-11 w-full items-center gap-2.5 px-4 text-left text-[13px] hover:bg-accent/40">
                        <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{d.reference}</span>
                        <span className="min-w-0 flex-1 truncate">{d.title || d.applicantName || 'Untitled'}</span>
                        <Tip label={`${d.count} reviews from ${Math.round(d.min)} to ${Math.round(d.max)}, averaging ${Math.round(d.mean)}`}>
                          <span className="relative hidden h-2 w-24 shrink-0 rounded-full bg-muted sm:block" aria-hidden>
                            <span className="absolute inset-y-0 rounded-full bg-tone-warning/50" style={{ left: `${d.min}%`, width: `${Math.max(2, d.max - d.min)}%` }} />
                            <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground" style={{ left: `${d.mean}%` }} />
                          </span>
                        </Tip>
                        <span className="w-[70px] shrink-0 text-right text-xs tabular-nums text-tone-warning">{Math.round(d.spread)} pts apart</span>
                        <ScorePill score={d.mean} spread={d.spread} count={d.count} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
          {!activeStage && reviewStages.length === 0 && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ClipboardCheck className="h-3.5 w-3.5" /> This program has no review stage — <Link to={`/programs/${program.id}/settings/pipeline`} className="text-primary hover:underline">add one in the pipeline</Link>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
