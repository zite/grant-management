import { AlertCircle, ArrowRight, CalendarClock, CheckCircle2, CircleDashed, ClipboardCheck, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '@project/components/lib/utils';
import { ProgressBar, EmptyState, Glyph, Kbd, SkeletonRows, Tip } from '../components/primitives/bits';
import { DUE_TONE, ReviewQueueRow } from '../components/review/ReviewQueueRow';
import { LAST_REVIEW_LIST_KEY, groupByProgram, inTab, isTodo, matchesText, parseTab, queueStats, type ReviewTab } from '../components/review/reviewModel';
import { PageHeader, useDocumentTitle } from '../components/shell/PageHeader';
import { useAppActions } from '../lib/app-actions';
import { dueLabel, plural, shortDate } from '../lib/format';
import { useHotkeys } from '../lib/hotkeys';
import { useMyReviews } from '../lib/queries';
import type { ReviewQueueItem } from '../lib/types';
import { useWorkspace } from '../lib/workspace';

const TABS: Array<{ id: ReviewTab; label: string }> = [
  { id: 'todo', label: 'To do' },
  { id: 'done', label: 'Done' },
  { id: 'all', label: 'All' },
];

function Stat({ icon, value, label, tone }: { icon: React.ReactNode; value: number; label: string; tone?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 px-4 py-2.5 sm:px-5">
      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5', value > 0 && tone)}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold leading-5 tabular-nums">{value}</span>
        <span className="block truncate text-xs text-muted-foreground">{label}</span>
      </span>
    </div>
  );
}

export function MyReviewsPage() {
  useDocumentTitle('My reviews');
  const ws = useWorkspace();
  const app = useAppActions();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get('tab'));
  const programId = params.get('program');
  const { data, isPending, isError, refetch, isFetching } = useMyReviews('all');
  const all = data?.reviews ?? [];

  const [text, setText] = useState('');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => app.setContextProgram(null), []);
  useEffect(() => {
    try {
      sessionStorage.setItem(LAST_REVIEW_LIST_KEY, params.toString());
    } catch {
      /* ignore */
    }
  }, [params]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const stats = useMemo(() => queueStats(all), [all]);
  const programs = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; icon: string; color: string; count: number }>();
    for (const r of all) {
      if (!seen.has(r.programId)) seen.set(r.programId, { id: r.programId, name: r.programName, icon: r.programIcon, color: r.programColor, count: 0 });
      if (inTab(r, tab)) seen.get(r.programId)!.count += 1;
    }
    return [...seen.values()];
  }, [all, tab]);
  const program = programId ? programs.find(p => p.id === programId) : undefined;

  const counts = useMemo(() => {
    const scoped = programId ? all.filter(r => r.programId === programId) : all;
    return { todo: scoped.filter(r => inTab(r, 'todo')).length, done: scoped.filter(r => inTab(r, 'done')).length, all: scoped.length };
  }, [all, programId]);

  const rows = useMemo(() => all.filter(r => inTab(r, tab) && (!programId || r.programId === programId) && matchesText(r, text)), [all, tab, programId, text]);
  const groups = useMemo(() => groupByProgram(rows, all), [rows, all]);
  const visible = useMemo(() => groups.flatMap(g => g.rows), [groups]);
  const nextUp = useMemo(() => all.find(isTodo), [all]);

  const open = useCallback((r: ReviewQueueItem) => navigate(`/reviews/${r.id}`), [navigate]);
  const focusIndex = visible.findIndex(r => r.id === focusedId);
  const focusAt = (i: number) => {
    const r = visible[Math.max(0, Math.min(visible.length - 1, i))];
    if (!r) return;
    setFocusedId(r.id);
    window.setTimeout(() => scrollRef.current?.querySelector(`[data-review-id="${r.id}"]`)?.scrollIntoView({ block: 'nearest' }), 0);
  };

  useHotkeys({
    j: () => focusAt(focusIndex + 1),
    down: () => focusAt(focusIndex + 1),
    k: () => focusAt(focusIndex < 0 ? 0 : focusIndex - 1),
    up: () => focusAt(focusIndex < 0 ? 0 : focusIndex - 1),
    enter: () => {
      const r = focusIndex >= 0 ? visible[focusIndex] : undefined;
      if (r) open(r);
    },
    esc: () => setFocusedId(null),
    '/': () => filterRef.current?.focus(),
  });

  const clearFilters = () => {
    setText('');
    setParam('program', null);
  };

  const hasAny = all.length > 0;

  return (
    <>
      <PageHeader
        icon={<ClipboardCheck />}
        title="My reviews"
        actions={
          nextUp ? (
            <Tip label={`Open ${nextUp.reference} — ${nextUp.status === 'In progress' ? 'you started this one' : 'due soonest'}`}>
              <button type="button" onClick={() => open(nextUp)} aria-label={nextUp.status === 'In progress' ? 'Continue reviewing' : 'Start reviewing'} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2 text-[12.5px] font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 sm:px-2.5">
                <span className="hidden sm:inline">{nextUp.status === 'In progress' ? 'Continue reviewing' : 'Start reviewing'}</span> <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </Tip>
          ) : null
        }
      >
        <nav className="ml-1 flex min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-none sm:ml-2" aria-label="Review tabs">
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  setParam('tab', t.id === 'todo' ? null : t.id);
                  setFocusedId(null);
                }}
                className={cn(
                  'flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] transition-colors',
                  active ? 'border-border bg-accent font-medium text-foreground shadow-2xs' : 'border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                {t.label}
                {t.id === 'todo' && counts.todo > 0 && <span className="tabular-nums text-muted-foreground">{counts.todo}</span>}
              </button>
            );
          })}
        </nav>
      </PageHeader>

      {hasAny && (
        <div className="grid shrink-0 grid-cols-2 divide-border border-b sm:grid-cols-4 sm:divide-x [&>*:nth-child(-n+2)]:border-b sm:[&>*:nth-child(-n+2)]:border-b-0">
          <Stat icon={<CircleDashed />} value={stats.open} label="Open" tone="bg-primary/[0.1] text-primary" />
          <Stat icon={<AlertCircle />} value={stats.overdue} label="Overdue" tone="bg-tone-danger/[0.1] text-tone-danger" />
          <Stat icon={<CalendarClock />} value={stats.dueThisWeek} label="Due this week" tone="bg-tone-warning/[0.1] text-tone-warning" />
          <Stat icon={<CheckCircle2 />} value={stats.submitted30} label="Submitted in 30 days" tone="bg-tone-success/[0.1] text-tone-success" />
        </div>
      )}

      {hasAny && (
        <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scrollbar-none">
            <button
              type="button"
              onClick={() => setParam('program', null)}
              className={cn('chip h-7 shrink-0 px-2.5', !programId ? 'border-primary/40 bg-primary/[0.07] font-medium' : 'bg-background hover:bg-accent')}
            >
              All programs
            </button>
            {programs.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setParam('program', programId === p.id ? null : p.id)}
                className={cn('chip h-7 shrink-0 px-2.5', programId === p.id ? 'border-primary/40 bg-primary/[0.07] font-medium' : 'bg-background hover:bg-accent')}
              >
                <Glyph icon={p.icon} color={p.color} size={15} className="text-[9px]" />
                <span className="max-w-[180px] truncate">{p.name}</span>
                <span className="tabular-nums text-muted-foreground">{p.count}</span>
              </button>
            ))}
          </div>
          <div className="flex h-7 w-full items-center gap-1.5 rounded-md border bg-background px-2 focus-within:border-foreground/30 sm:w-56">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={filterRef}
              value={text}
              onChange={e => {
                setText(e.target.value);
                setFocusedId(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  setText('');
                  e.currentTarget.blur();
                } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                  if (e.key === 'Enter' && visible.length === 1) open(visible[0]);
                  else focusAt(0);
                }
              }}
              placeholder="Filter by title, reference…"
              aria-label="Filter reviews"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            />
            {text ? (
              <button type="button" aria-label="Clear filter" onClick={() => setText('')} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <Kbd className="hidden sm:inline-flex">/</Kbd>
            )}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        {isPending ? (
          <SkeletonRows rows={8} className="pt-2" />
        ) : isError ? (
          <EmptyState
            icon={<AlertCircle />}
            title="Couldn't load your reviews"
            description="Check your connection and try again."
            action={<button type="button" onClick={() => refetch()} className="text-[13px] text-primary hover:underline">Retry</button>}
          />
        ) : !hasAny ? (
          <EmptyState
            icon={<ClipboardCheck />}
            title="No reviews assigned to you yet"
            description="When a program manager adds you to a review panel, the applications you're asked to score appear here — with due dates and everything you need to score them."
            action={ws.isManager ? <Link to="/submissions" className="text-[13px] text-primary hover:underline">Go to submissions</Link> : undefined}
          />
        ) : rows.length === 0 ? (
          text ? (
            <EmptyState icon={<Search />} title={`No reviews match “${text}”`} description="Try a reference like ARTS-4, or part of a title." action={<button type="button" onClick={clearFilters} className="text-[13px] text-primary hover:underline">Clear filter</button>} />
          ) : tab === 'todo' ? (
            <EmptyState
              icon={<CheckCircle2 />}
              title="You're all caught up"
              description={`Nothing is waiting for your score${program ? ` in ${program.name}` : ''}. ${stats.done ? `You've finished ${plural(stats.done, 'review')}.` : ''} New assignments will show up here.`}
              action={
                <div className="flex items-center gap-4">
                  <button type="button" onClick={() => setParam('tab', 'done')} className="text-[13px] font-medium text-primary hover:underline">See what you've reviewed</button>
                  {program && <button type="button" onClick={() => setParam('program', null)} className="text-[13px] text-muted-foreground hover:text-foreground">All programs</button>}
                </div>
              }
            />
          ) : tab === 'done' ? (
            <EmptyState icon={<CircleDashed />} title="Nothing finished yet" description="Reviews you submit, or step back from, are kept here so you can look back or reopen them." action={<button type="button" onClick={() => setParam('tab', null)} className="text-[13px] text-primary hover:underline">Go to To do</button>} />
          ) : (
            <EmptyState icon={<ClipboardCheck />} title="No reviews in this program" action={<button type="button" onClick={clearFilters} className="text-[13px] text-primary hover:underline">Show all programs</button>} />
          )
        ) : (
          <div role="grid" aria-label="My reviews" className={cn('pb-16 transition-opacity', isFetching && !isPending && 'opacity-[0.985]')}>
            {groups.map(g => {
              const due = dueLabel(g.earliestDue);
              return (
                <section key={g.programId} aria-label={g.name}>
                  <div className="sticky top-0 z-10 flex h-9 items-center gap-2 border-b bg-subtle/95 pl-4 pr-4 backdrop-blur supports-[backdrop-filter]:bg-subtle/80">
                    <Glyph icon={g.icon} color={g.color} size={16} className="text-[10px]" />
                    <button type="button" onClick={() => setParam('program', programId === g.programId ? null : g.programId)} className="truncate text-[13px] font-medium hover:underline">
                      {g.name}
                    </button>
                    <span className="shrink-0 text-[12.5px] tabular-nums text-muted-foreground">{g.rows.length}</span>
                    <div className="ml-auto flex shrink-0 items-center gap-3">
                      {due && (
                        <Tip label={`Your next review in ${g.name} is due ${shortDate(g.earliestDue)}`}>
                          <span className={cn('hidden text-xs sm:inline', DUE_TONE[due.tone])}>{due.tone === 'overdue' ? `Overdue since ${due.label}` : `Next due ${due.label}`}</span>
                        </Tip>
                      )}
                      {g.total > 0 && (
                        <Tip label={`${g.done} of ${g.total} reviews finished in ${g.name}`}>
                          <span className="flex items-center gap-2">
                            <span className="text-xs tabular-nums text-muted-foreground">{g.done} of {g.total} done</span>
                            <ProgressBar value={g.done / g.total} tone={g.done >= g.total ? 'success' : 'primary'} className="hidden w-20 sm:block" />
                          </span>
                        </Tip>
                      )}
                    </div>
                  </div>
                  {g.rows.map(r => (
                    <ReviewQueueRow key={r.id} review={r} focused={focusedId === r.id} onOpen={open} onFocus={setFocusedId} />
                  ))}
                </section>
              );
            })}
            <div className="hidden items-center justify-center gap-4 pt-6 text-xs text-muted-foreground md:flex">
              <span className="flex items-center gap-1.5"><Kbd>J</Kbd><Kbd>K</Kbd> move</span>
              <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> open</span>
              <span className="flex items-center gap-1.5"><Kbd>/</Kbd> filter</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
