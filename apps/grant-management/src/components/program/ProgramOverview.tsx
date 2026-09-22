import { AlertTriangle, ArrowRight, BarChart3, CalendarClock, ClipboardCheck, History, Send, Sparkles, UserPlus, Wallet } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@project/components/lib/utils';
import { scoreTone } from '@project/shared/scoring';
import { useAppActions } from '../../lib/app-actions';
import { STATUS_META } from '../../lib/constants';
import { dateTime, percent, plural, timeAgo } from '../../lib/format';
import { useSubmissions } from '../../lib/queries';
import type { Program, SubmissionFilters } from '../../lib/types';
import { useWorkspace, type Workspace } from '../../lib/workspace';
import { MemberAvatar } from '../primitives/Avatar';
import { EmptyState, ProgressBar } from '../primitives/bits';
import { OutcomeGlyph, PhaseDot, ReviewProgress, StageGlyph } from '../primitives/icons';
import { statusLine, toneText } from './ProgramBits';
import { useProgramOverview, type ProgramStats } from './programData';
import { SubmissionsChart } from './SubmissionsChart';

/** Open the program's submissions with a filter already applied — written where SubmissionsView reads it on mount. */
export function useOpenSubmissions(programId: string) {
  const navigate = useNavigate();
  return (filters: SubmissionFilters) => {
    try {
      localStorage.setItem(`grants:filters:program:${programId}`, JSON.stringify(filters));
    } catch {
      /* storage may be unavailable; the tab still opens */
    }
    navigate(`/programs/${programId}/submissions`);
  };
}

function Card({ title, icon, action, children, className }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('min-w-0 rounded-lg border bg-background', className)}>
      <header className="flex h-10 items-center gap-2 border-b px-4">
        {icon && <span className="text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>}
        <h2 className="text-[13px] font-medium">{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Tile({ label, value, sub, children, tone }: { label: string; value: ReactNode; sub?: ReactNode; children?: ReactNode; tone?: 'danger' | 'warning' }) {
  return (
    <div className="min-w-0 rounded-lg border bg-background px-3.5 py-3">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className={cn('mt-1 truncate text-[22px] font-semibold leading-7 tracking-tight', tone === 'danger' && 'text-tone-danger', tone === 'warning' && 'text-tone-warning')}>{value}</div>
      {children}
      {sub && <div className="mt-1 truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function LinkButton({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
      {children} <ArrowRight className="h-3 w-3" />
    </Link>
  );
}

function Hero({ program, onPublish }: { program: Program; onPublish: () => void }) {
  const ws = useWorkspace();
  const status = statusLine(program);
  const owner = program.ownerId ? ws.memberById.get(program.ownerId) : undefined;
  const opened = program.opensAt && Date.parse(program.opensAt) <= Date.now();
  return (
    <div className="rounded-lg border bg-background px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className={cn('flex items-center gap-2 text-[15px] font-medium', toneText(status.tone === 'neutral' ? 'neutral' : status.tone))}>
            <PhaseDot phase={program.phase} />
            <span className={cn(status.tone === 'neutral' && 'text-foreground')}>{status.text}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              {program.opensAt ? `${opened ? 'Opened' : 'Opens'} ${dateTime(program.opensAt)}` : 'Opens when published'}
            </span>
            <span>{program.deadline ? `Deadline ${dateTime(program.deadline)}` : 'No deadline (rolling)'}</span>
            {program.allowLate && program.deadline && <span>Late submissions allowed</span>}
          </div>
          {program.summary && <p className="mt-3 max-w-[760px] text-[13px] leading-5 text-muted-foreground">{program.summary}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
          {owner && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MemberAvatar member={owner} size={20} />
              <span>
                <span className="text-foreground">{owner.id === ws.me.id ? 'You' : owner.name}</span> {owner.id === ws.me.id ? 'own' : 'owns'} this program
              </span>
            </div>
          )}
          {program.status === 'Draft' ? (
            <button type="button" onClick={onPublish} className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12.5px] font-medium text-primary-foreground shadow-xs hover:bg-primary/90">
              <Sparkles className="h-3.5 w-3.5" /> Review and publish
            </button>
          ) : (
            <Link to={`/programs/${program.id}/settings/application`} className="text-xs text-muted-foreground hover:text-foreground">
              Edit dates and application page
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function ReleaseCallout({ program, count }: { program: Program; count: number }) {
  const app = useAppActions();
  const { data, isPending } = useSubmissions({ programIds: [program.id], release: 'unreleased' }, 'submitted_desc');
  const rows = data?.submissions ?? [];
  const byStatus = ['Accepted', 'Waitlisted', 'Declined'].map(s => [s, rows.filter(r => r.status === s).length] as const).filter(([, n]) => n > 0);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-tone-warning/30 bg-tone-warning/[0.06] px-4 py-3 sm:flex-row sm:items-center">
      <Send className="hidden h-4 w-4 shrink-0 text-tone-warning sm:block" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{plural(count, 'decision')} ready to release</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {byStatus.length ? `${byStatus.map(([s, n]) => `${n} ${s.toLowerCase()}`).join(' · ')} — ` : ''}applicants won’t see {count === 1 ? 'it' : 'them'} until you release.
        </div>
      </div>
      <button
        type="button"
        disabled={isPending || rows.length === 0}
        onClick={() => app.openDecision(rows, 'release')}
        className="flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md border bg-background px-2.5 text-[12.5px] font-medium shadow-2xs hover:bg-accent disabled:opacity-60"
      >
        Review and release…
      </button>
    </div>
  );
}

function Kpis({ program, stats }: { program: Program; stats: ProgramStats }) {
  const ws = useWorkspace();
  const c = stats.counts;
  const decided = c.accepted + c.waitlisted + c.declined;
  const conversion = percent(c.submitted, c.started);
  const budget = stats.budget.budget;
  const mean = stats.reviews.mean;
  const reviewStages = ws.stagesFor(program.id).filter(s => s.kind === 'Review').length;
  const segments = [
    { key: 'Accepted', n: c.accepted, cls: 'bg-tone-success' },
    { key: 'Waitlisted', n: c.waitlisted, cls: 'bg-tone-warning' },
    { key: 'Declined', n: c.declined, cls: 'bg-tone-danger' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Tile label="Submitted" value={c.submitted.toLocaleString()} sub={!c.submitted ? 'None yet' : c.late ? `${c.late} after the deadline` : c.withdrawn ? `${c.withdrawn} withdrawn since` : 'All on time'} />
      <Tile label="Drafts started" value={c.started.toLocaleString()} sub={c.started ? `${conversion}% submitted · ${c.drafts} open` : 'None yet'} />
      <Tile
        label="In review"
        value={c.inReview.toLocaleString()}
        tone={c.needsReviewers ? 'warning' : undefined}
        sub={c.needsReviewers ? `${c.needsReviewers} waiting for reviewers` : reviewStages ? `${plural(reviewStages, 'review stage')}` : 'No review stage'}
      />
      <Tile label="Decided" value={decided.toLocaleString()} sub={decided ? `${c.accepted} accepted · ${c.waitlisted} waitlisted · ${c.declined} declined` : 'No decisions yet'}>
        {decided > 0 && (
          <div className="mt-1.5 flex h-1.5 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={`${c.accepted} accepted, ${c.waitlisted} waitlisted, ${c.declined} declined`}>
            {segments.filter(s => s.n > 0).map(s => (
              <span key={s.key} className={cn('h-full first:rounded-l-full last:rounded-r-full', s.cls)} style={{ width: `${(s.n / decided) * 100}%` }} />
            ))}
          </div>
        )}
      </Tile>
      <Tile label="Awarded" value={ws.money(stats.budget.awarded, { compact: true })} sub={budget ? `of ${ws.money(budget, { compact: true })} budget · ${percent(stats.budget.awarded, budget)}%` : 'No budget set'}>
        {budget ? <ProgressBar value={stats.budget.awarded / budget} className="mt-1.5" tone={stats.budget.awarded > budget ? 'danger' : 'primary'} /> : null}
      </Tile>
      <Tile
        label="Average score"
        value={mean == null ? '—' : <span className={toneText(scoreTone(mean))}>{Math.round(mean)}</span>}
        sub={stats.reviews.submitted ? `out of 100 · ${plural(stats.reviews.submitted, 'review')}` : 'No reviews yet'}
      />
    </div>
  );
}

function Funnel({ program, stats }: { program: Program; stats: ProgramStats }) {
  const ws = useWorkspace();
  const open = useOpenSubmissions(program.id);
  const stages = ws.stagesFor(program.id);
  const byStage = new Map(stats.funnel.map(f => [f.stageId, f]));
  const c = stats.counts;
  const max = Math.max(1, c.submitted, ...stats.funnel.map(f => f.reached));
  const outcomes = (['Accepted', 'Waitlisted', 'Declined', 'Withdrawn'] as const).map(s => ({ status: s, n: c[s.toLowerCase() as 'accepted' | 'waitlisted' | 'declined' | 'withdrawn'] }));

  return (
    <div>
      {c.submitted === 0 && <p className="mb-3 text-xs text-muted-foreground">No submissions yet — the bars fill in as they move through {plural(stages.length, 'stage')}.</p>}
      <div className="mb-3 flex items-center gap-3 text-2xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-primary" aria-hidden /> In stage now</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-primary/25" aria-hidden /> Reached it</span>
      </div>
      <ul className="space-y-0.5">
        {stages.map((s, i) => {
          const f = byStage.get(s.id) ?? { current: 0, reached: 0 };
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => open({ statuses: ['Submitted'], stageIds: [s.id] })}
                className="group -mx-2 block w-[calc(100%+16px)] rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60"
                aria-label={`${s.name}: ${f.current} in stage now, ${f.reached} reached it. Show submissions in this stage.`}
              >
                <div className="flex items-center gap-2 text-[13px]">
                  <StageGlyph kind={s.kind} color={s.color} fraction={(i + 1) / (stages.length + 1)} />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-medium">{f.current}</span>
                    <span className="text-muted-foreground"> now · {f.reached} reached</span>
                  </span>
                </div>
                <div className="relative mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-primary/25" style={{ width: `${(f.reached / max) * 100}%` }} />
                  <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${(f.current / max) * 100}%` }} />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-1 border-t pt-3">
        {outcomes.map(o => (
          <button
            key={o.status}
            type="button"
            onClick={() => open({ statuses: [o.status] })}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-accent/60"
          >
            <OutcomeGlyph status={o.status} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{STATUS_META[o.status]?.label ?? o.status}</span>
            <span className="font-medium tabular-nums">{o.n}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ReviewsCard({ program, stats }: { program: Program; stats: ProgramStats }) {
  const ws = useWorkspace();
  const r = stats.reviews;
  const pool = ws.reviewerPool(program.id);
  if (r.assigned === 0) {
    return (
      <div className="py-4 text-center">
        <p className="text-[13px] text-muted-foreground">No reviews assigned yet.</p>
        {pool.length === 0 ? (
          <Link to={`/programs/${program.id}/settings/team`} className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-primary hover:underline">
            <UserPlus className="h-3.5 w-3.5" /> Add reviewers to the pool
          </Link>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">{plural(pool.length, 'reviewer')} in the pool, ready when submissions reach a review stage.</p>
        )}
      </div>
    );
  }
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <Mini label="Assigned" value={r.assigned} />
        <Mini label="Submitted" value={r.submitted} hint={`${percent(r.submitted, r.assigned)}%`} />
        <Mini label="Overdue" value={r.overdue} tone={r.overdue ? 'danger' : undefined} />
      </div>
      <ProgressBar value={r.assigned ? r.submitted / r.assigned : 0} className="mt-3" tone="success" />
      {r.top.length > 0 && (
        <ul className="mt-4 space-y-1">
          <li className="text-2xs font-medium text-muted-foreground">Most open reviews</li>
          {r.top.map(t => {
            const m = ws.memberById.get(t.memberId);
            return (
              <li key={t.memberId} className="flex h-8 items-center gap-2 text-[13px]">
                <MemberAvatar member={m} size={18} />
                <span className="min-w-0 flex-1 truncate">{m ? (m.id === ws.me.id ? `${m.name} (you)` : m.name) : 'Former member'}</span>
                {t.overdue > 0 && <span className="shrink-0 text-xs text-tone-danger">{t.overdue} overdue</span>}
                <ReviewProgress done={t.submitted} total={t.submitted + t.open} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Mini({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: 'danger' }) {
  return (
    <div>
      <div className="text-2xs text-muted-foreground">{label}</div>
      <div className={cn('text-[17px] font-semibold leading-6', tone === 'danger' && 'text-tone-danger')}>
        {value.toLocaleString()}
        {hint && <span className="ml-1 text-xs font-normal text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

function BudgetCard({ program, stats }: { program: Program; stats: ProgramStats }) {
  const ws = useWorkspace();
  const b = stats.budget;
  const unpaid = Math.max(0, b.awarded - b.paid);
  const remaining = b.budget != null ? b.budget - b.awarded : null;
  const scale = Math.max(b.budget ?? 0, b.awarded, 1);
  const segs = [
    { key: 'paid', label: 'Paid', n: Math.min(b.paid, b.awarded || b.paid), cls: 'bg-primary' },
    { key: 'unpaid', label: 'Awarded, not yet paid', n: unpaid, cls: 'bg-primary/45' },
    { key: 'left', label: 'Remaining', n: Math.max(0, remaining ?? 0), cls: 'bg-muted-foreground/15' },
  ].filter(s => s.n > 0);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-2xs text-muted-foreground">Awarded</div>
          <div className="text-[20px] font-semibold leading-7">{ws.money(b.awarded)}</div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {b.budget != null ? <>of {ws.money(b.budget)} budget</> : <Link to={`/programs/${program.id}/settings/general`} className="text-primary hover:underline">Set a budget</Link>}
        </div>
      </div>
      {segs.length > 0 && (
        <div className="mt-3 flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-muted" role="img" aria-label={segs.map(s => `${s.label} ${ws.money(s.n)}`).join(', ')}>
          {segs.map(s => (
            <span key={s.key} className={cn('h-full first:rounded-l-full last:rounded-r-full', s.cls)} style={{ width: `${(s.n / scale) * 100}%` }} />
          ))}
        </div>
      )}
      <dl className="mt-3 space-y-1.5 text-[13px]">
        <Row swatch="bg-primary" label="Paid" value={ws.money(b.paid)} />
        <Row swatch="bg-primary/45" label="Awarded, not yet paid" value={ws.money(unpaid)} hint={b.scheduled ? `${ws.money(b.scheduled, { compact: true })} scheduled` : undefined} />
        {remaining != null && <Row swatch="bg-muted-foreground/15" label={remaining < 0 ? 'Over budget' : 'Remaining'} value={ws.money(Math.abs(remaining))} danger={remaining < 0} />}
        <div className="border-t pt-1.5">
          <Row label="Requested by applicants" value={ws.money(b.requested, { compact: true })} />
        </div>
      </dl>
    </div>
  );
}

function Row({ label, value, swatch, hint, danger }: { label: string; value: string; swatch?: string; hint?: string; danger?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {swatch ? <span className={cn('h-2 w-2 shrink-0 rounded-[2px]', swatch)} aria-hidden /> : <span className="w-2" />}
      <dt className="min-w-0 flex-1 truncate text-muted-foreground">
        {label}
        {hint && <span className="ml-1 text-xs">· {hint}</span>}
      </dt>
      <dd className={cn('shrink-0 font-medium tabular-nums', danger && 'text-tone-danger')}>{value}</dd>
    </div>
  );
}

type Entry = ProgramStats['activity'][number];

function describe(e: Entry, ws: Workspace): { actor: string; text: ReactNode } {
  const d = e.data as Record<string, unknown>;
  const member = (id: unknown) => {
    const m = typeof id === 'string' ? ws.memberById.get(id) : undefined;
    return m ? (m.id === ws.me.id ? 'you' : m.name) : 'someone';
  };
  const actor =
    e.actorType === 'Applicant' ? e.actorName || 'An applicant' : e.actorType === 'System' || !e.actorId ? 'System' : e.actorId === ws.me.id ? 'You' : ws.memberById.get(e.actorId)?.name ?? 'A former member';
  const ref = e.reference ? <span className="font-medium text-foreground">{e.reference}</span> : e.title ? <span className="font-medium text-foreground">{e.title}</span> : 'a submission';
  const stage = (id: unknown) => (typeof id === 'string' ? ws.stageById.get(id)?.name : undefined) ?? 'another stage';
  switch (e.type) {
    case 'submitted':
      return { actor, text: <>submitted {ref}</> };
    case 'created_by_staff':
      return { actor, text: <>added {ref} on the applicant’s behalf</> };
    case 'stage_changed':
      return { actor, text: <>moved {ref} to {stage(d.to)}</> };
    case 'owner_changed':
      return { actor, text: !d.to ? <>removed the owner of {ref}</> : d.to === e.actorId ? <>took ownership of {ref}</> : <>made {member(d.to)} the owner of {ref}</> };
    case 'decision':
      return { actor, text: <>marked {ref} {String(d.decision ?? 'decided').toLowerCase()}</> };
    case 'decision_released':
      return { actor, text: <>released the decision on {ref}</> };
    case 'reopened':
      return { actor, text: <>reopened {ref}</> };
    case 'withdrawn':
      return { actor, text: <>withdrew {ref}</> };
    case 'labels_changed':
      return { actor, text: <>changed labels on {ref}</> };
    case 'reviewer_assigned':
      return { actor, text: <>asked {member(d.reviewerId)} to review {ref}</> };
    case 'reviewer_removed':
      return { actor, text: <>removed {member(d.reviewerId)} from {ref}</> };
    case 'review_submitted':
      return { actor, text: <>reviewed {ref}{typeof d.score === 'number' ? <> · scored {Math.round(d.score)}</> : null}</> };
    case 'review_recused':
      return { actor, text: <>recused from reviewing {ref}</> };
    case 'review_reopened':
      return { actor, text: <>reopened a review of {ref}</> };
    case 'message_sent':
      return { actor, text: <>emailed the applicant about {ref}{d.subject ? <> · “{String(d.subject)}”</> : null}</> };
    case 'message_received':
      return { actor, text: <>replied about {ref}</> };
    case 'task_requested':
      return { actor, text: <>requested “{String(d.title ?? 'a task')}” on {ref}</> };
    case 'task_submitted':
      return { actor, text: <>completed “{String(d.title ?? 'a task')}” on {ref}</> };
    case 'task_approved':
      return { actor, text: <>approved “{String(d.title ?? 'a task')}” on {ref}</> };
    case 'task_returned':
      return { actor, text: <>sent back “{String(d.title ?? 'a task')}” on {ref}</> };
    case 'payment_recorded':
      return { actor, text: <>recorded a {typeof d.amount === 'number' ? ws.money(d.amount) : ''} payment on {ref}</> };
    case 'payment_updated':
      return { actor, text: <>updated a payment on {ref}</> };
    case 'award_updated':
      return { actor, text: <>updated the award for {ref}</> };
    case 'amount_changed':
      return { actor, text: <>changed the amount on {ref}</> };
    case 'title_changed':
      return { actor, text: <>renamed {ref}</> };
    case 'answers_edited':
      return { actor, text: <>edited answers on {ref}</> };
    case 'attachment_added':
      return { actor, text: <>attached a document to {ref}</> };
    case 'attachment_removed':
      return { actor, text: <>removed a document from {ref}</> };
    case 'program_created':
      return { actor, text: <>created this program</> };
    case 'program_published':
      return { actor, text: <>published the program</> };
    case 'program_unpublished':
      return { actor, text: <>unpublished the program</> };
    case 'program_archived':
      return { actor, text: <>archived the program</> };
    case 'program_unarchived':
      return { actor, text: <>unarchived the program</> };
    default:
      return { actor, text: <>{e.type.replace(/_/g, ' ')} {e.reference ? ref : null}</> };
  }
}

function ActivityCard({ stats }: { stats: ProgramStats }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  if (!stats.activity.length) return <p className="py-6 text-center text-[13px] text-muted-foreground">Nothing has happened here yet.</p>;
  return (
    <ul className="-mx-1 -my-1 max-h-[420px] space-y-px overflow-y-auto px-1">
      {stats.activity.map(e => {
        const { actor, text } = describe(e, ws);
        const member = e.actorType === 'Member' && e.actorId ? ws.memberById.get(e.actorId) : undefined;
        const body = (
          <>
            <span className="mt-px shrink-0">
              {member ? <MemberAvatar member={member} size={18} /> : <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">{actor.slice(0, 1).toUpperCase()}</span>}
            </span>
            <span className="min-w-0 flex-1 text-[12.5px] leading-[18px] text-muted-foreground">
              <span className="text-foreground">{actor}</span> {text}
            </span>
            <span className="shrink-0 pt-px text-2xs text-muted-foreground" title={e.occurredAt ? dateTime(e.occurredAt) : undefined}>
              {timeAgo(e.occurredAt)}
            </span>
          </>
        );
        return (
          <li key={e.id}>
            {e.reference ? (
              <button type="button" onClick={() => navigate(`/submission/${e.reference}`)} className="-mx-2 flex w-[calc(100%+16px)] items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60">
                {body}
              </button>
            ) : (
              <div className="flex items-start gap-2 py-1.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function OverviewSkeleton() {
  return (
    <div className="mx-auto max-w-[1180px] space-y-4 p-3 sm:p-5">
      <div className="skeleton h-[104px] w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-[86px] rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="skeleton h-[320px] rounded-lg lg:col-span-2" />
        <div className="skeleton h-[320px] rounded-lg" />
      </div>
    </div>
  );
}

export function ProgramOverview({ program, onPublish }: { program: Program; onPublish: () => void }) {
  const { data, isPending, isError, refetch } = useProgramOverview(program.id);
  const stats = data?.stats ?? null;
  const baseline = useMemo(() => (stats ? Math.max(0, stats.counts.submitted - stats.series.reduce((a, s) => a + s.submitted, 0)) : 0), [stats]);
  const base = `/programs/${program.id}`;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-subtle/40" data-scroll="program-overview">
      {isPending ? (
        <OverviewSkeleton />
      ) : isError || !stats ? (
        <EmptyState
          icon={<AlertTriangle />}
          title="Couldn't load the overview"
          description="Check your connection and try again."
          action={<button type="button" onClick={() => refetch()} className="text-[13px] text-primary hover:underline">Retry</button>}
        />
      ) : (
        <div className="mx-auto max-w-[1180px] space-y-4 p-3 animate-fade-in sm:p-5">
          <Hero program={program} onPublish={onPublish} />
          {stats.counts.unreleased > 0 && <ReleaseCallout program={program} count={stats.counts.unreleased} />}
          <Kpis program={program} stats={stats} />
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Submissions over time" icon={<BarChart3 />} className="lg:col-span-2">
              {stats.counts.submitted === 0 ? (
                <div className="flex h-[250px] flex-col items-center justify-center text-center">
                  <p className="text-[13px] font-medium">No submissions yet</p>
                  <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                    {program.status === 'Draft' ? 'Publish the program and the chart starts with the first submission.' : 'The chart starts with the first submission.'}
                    {stats.counts.drafts > 0 ? ` ${plural(stats.counts.drafts, 'draft')} in progress.` : ''}
                  </p>
                </div>
              ) : (
                <SubmissionsChart series={stats.series} baseline={baseline} deadline={program.deadline} />
              )}
            </Card>
            <Card title="Pipeline" icon={<ClipboardCheck />} action={<LinkButton to={`${base}/submissions`}>Board</LinkButton>}>
              <Funnel program={program} stats={stats} />
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
            <Card title="Review progress" icon={<ClipboardCheck />} action={<LinkButton to={`${base}/reviews`}>Reviews</LinkButton>}>
              <ReviewsCard program={program} stats={stats} />
            </Card>
            <Card title="Budget" icon={<Wallet />} action={<LinkButton to="/awards">Awards</LinkButton>}>
              <BudgetCard program={program} stats={stats} />
            </Card>
            <Card title="Recent activity" icon={<History />}>
              <ActivityCard stats={stats} />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
