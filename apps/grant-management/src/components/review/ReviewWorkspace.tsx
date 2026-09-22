import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronDown, ChevronUp, EyeOff, PanelLeft } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { getReview, listMyReviews, saveReview } from 'zitejs/api';
import { cn } from '@project/components/lib/utils';
import { missingCriteria, partialScore, totalScore, type RubricCriterion } from '@project/shared/scoring';
import { useAppActions } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import { dueLabel, shortDate } from '../../lib/format';
import { useHotkeys } from '../../lib/hotkeys';
import { qk } from '../../lib/queries';
import type { ReviewDetail } from '../../lib/types';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { Glyph, IconButton, Tip } from '../primitives/bits';
import { ApplicationPane } from './ApplicationPane';
import { RecuseDialog } from './RecuseDialog';
import { DUE_TONE } from './ReviewQueueRow';
import { LAST_REVIEW_LIST_KEY } from './reviewModel';
import { ScorecardPane, remainingLabel, type ScorecardMode } from './ScorecardPane';
import { criterionRows, focusElement, recommendationButtons } from './scorecardFocus';
import { useReviewDraft } from './useReviewDraft';

type ShellContext = { toggleSidebar: () => void; sidebarCollapsed: boolean } | undefined;

/** Reviews submitted since the app was opened — the completion screen celebrates the evening's work. */
export const reviewSession: { submitted: number; lastSubmitted: { id: string; reference: string; score: number | null; at: number } | null } = { submitted: 0, lastSubmitted: null };

/** "✓ ARTS-9 submitted · Undo" for a few seconds after landing on the next review. */
function JustSubmitted({ currentId }: { currentId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [item, setItem] = useState(() => {
    const last = reviewSession.lastSubmitted;
    return last && last.id !== currentId && Date.now() - last.at < 6000 ? last : null;
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!item) return;
    const t = window.setTimeout(() => setItem(null), 8000);
    return () => window.clearTimeout(t);
  }, [item]);
  if (!item) return null;
  const undo = async () => {
    setBusy(true);
    try {
      await saveReview({ id: item.id, action: 'reopen' });
      reviewSession.lastSubmitted = null;
      reviewSession.submitted = Math.max(0, reviewSession.submitted - 1);
      await qc.invalidateQueries({ queryKey: qk.review(item.id) });
      void qc.invalidateQueries({ queryKey: qk.myReviewsRoot });
      void qc.invalidateQueries({ queryKey: qk.bootstrap });
      navigate(`/reviews/${item.id}`);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't reopen that review"));
      setBusy(false);
    }
  };
  return (
    <span className="mr-1 inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md bg-tone-success/[0.1] px-2 text-xs text-tone-success animate-fade-in" role="status">
      <Check className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{item.reference} submitted{item.score != null ? ` · ${Math.round(item.score)}` : ''}</span>
      <span className="sm:hidden">Submitted</span>
      <button type="button" onClick={undo} disabled={busy} className="font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-60">Undo</button>
    </span>
  );
}

export function reviewListPath() {
  try {
    const q = sessionStorage.getItem(LAST_REVIEW_LIST_KEY);
    return q ? `/reviews?${q}` : '/reviews';
  } catch {
    return '/reviews';
  }
}

/**
 * One review, start to finish: the application on the left, the scorecard on
 * the right, and everything a reviewer does between opening it and landing on
 * the next one — autosave, submit, recuse, reopen, queue navigation — without
 * ever reaching for the mouse.
 */
export function ReviewWorkspace({ detail, onComplete }: { detail: ReviewDetail; onComplete: () => void }) {
  const qc = useQueryClient();
  const app = useAppActions();
  const navigate = useNavigate();
  const shell = useOutletContext<ShellContext>();
  const wide = useMediaQuery('(min-width: 1024px)');
  const { review, rubric, submission: sub, program, queue } = detail;
  const criteria = rubric.criteria as RubricCriterion[];

  const [submitting, setSubmitting] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [recuseOpen, setRecuseOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scorecardInView, setScorecardInView] = useState(false);

  const mode: ScorecardMode = review.locked ? 'locked' : review.status === 'Submitted' ? 'submitted' : review.status === 'Recused' ? 'recused' : 'edit';
  const editable = mode === 'edit' && !submitting;
  const autosave = useReviewDraft(detail, editable);
  const { draft } = autosave;

  const leftScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const scorecardRef = useRef<HTMLDivElement>(null);
  const scorecardTopRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);

  const due = mode === 'edit' ? dueLabel(review.dueDate) : null;
  const inQueue = queue.index >= 0;
  const prevId = queue.prevId;
  const nextId = queue.nextId && queue.nextId !== review.id ? queue.nextId : null;

  // Warm the neighbours so moving through the queue is instant.
  useEffect(() => {
    for (const id of [prevId, nextId]) {
      if (id) void qc.prefetchQuery({ queryKey: qk.review(id), queryFn: () => getReview({ id }), staleTime: 15_000 });
    }
  }, [prevId, nextId, qc]);

  // Land ready to score: the first unscored criterion takes the keyboard.
  useEffect(() => {
    if (mode !== 'edit' || !wide) return;
    const t = window.setTimeout(() => {
      const active = document.activeElement;
      if (active && active !== document.body && !scorecardRef.current?.contains(active)) return;
      const rows = criterionRows(scorecardRef.current);
      const i = criteria.findIndex(c => draft.scores[c.id] == null);
      if (i >= 0) rows[i]?.focus({ preventScroll: true });
      else if (rubric.askRecommendation && !draft.recommendation) recommendationButtons(scorecardRef.current)[0]?.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review.id, mode, wide]);

  // On a phone the scorecard sits below the application; the bottom bar swaps "Score" for "Submit" once it's on screen.
  useEffect(() => {
    if (wide) return;
    const root = bodyScrollRef.current;
    const target = scorecardTopRef.current;
    if (!root || !target) return;
    const onScroll = () => setScorecardInView(target.getBoundingClientRect().top < root.getBoundingClientRect().bottom - 120);
    onScroll();
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [wide]);

  /** Leave this review for another screen, making sure nothing typed is left behind. */
  const leave = useCallback(
    async (to: string) => {
      if (busy.current) return;
      busy.current = true;
      try {
        if (autosave.isDirty()) {
          const ok = await autosave.flush();
          if (!ok) {
            const go = await app.confirm({
              title: "Your latest changes haven't saved",
              description: "They're kept on this device and will come back when you reopen this review. Leave anyway?",
              confirmLabel: 'Leave anyway',
            });
            if (!go) return;
          }
        }
        navigate(to);
      } finally {
        busy.current = false;
      }
    },
    [autosave, app, navigate],
  );

  const refreshAfterFinish = () => {
    void qc.invalidateQueries({ queryKey: qk.myReviewsRoot });
    void qc.invalidateQueries({ queryKey: qk.bootstrap });
    // Every open review's queue position just shifted.
    void qc.invalidateQueries({ queryKey: qk.reviewRoot, predicate: q => q.queryKey[1] !== review.id });
  };

  const patchCache = (patch: Partial<ReviewDetail['review']>) =>
    qc.setQueryData(qk.review(review.id), (old: ReviewDetail | undefined) => (old ? { ...old, review: { ...old.review, ...patch } } : old));

  const goToNextAfterFinish = async () => {
    try {
      const todo = await qc.fetchQuery({ queryKey: qk.myReviews('todo'), queryFn: () => listMyReviews({ filter: 'todo' }), staleTime: 0 });
      const ids = todo.reviews.map(r => r.id).filter(id => id !== review.id);
      const target = nextId && ids.includes(nextId) ? nextId : ids[0] ?? null;
      if (target) navigate(`/reviews/${target}`);
      else onComplete();
    } catch {
      if (nextId) navigate(`/reviews/${nextId}`);
      else onComplete();
    }
  };

  const focusFirstProblem = () => {
    const rows = criterionRows(scorecardRef.current);
    const i = criteria.findIndex(c => draft.scores[c.id] == null);
    if (i >= 0) focusElement(rows[i], { center: true });
    else focusElement(recommendationButtons(scorecardRef.current)[0], { center: true });
  };

  const reopenReview = async () => {
    setReopening(true);
    try {
      await saveReview({ id: review.id, action: 'reopen' });
      patchCache({ status: 'In progress', submittedAt: null, recusalReason: '' });
      refreshAfterFinish();
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't reopen this review"));
      void qc.invalidateQueries({ queryKey: qk.review(review.id) });
    } finally {
      setReopening(false);
    }
  };

  const submit = async () => {
    if (mode !== 'edit' || submitting || busy.current) return;
    const missing = missingCriteria(criteria, draft.scores);
    if (missing.length || (rubric.askRecommendation && !draft.recommendation)) {
      setAttempted(true);
      focusFirstProblem();
      return;
    }
    busy.current = true;
    setSubmitting(true);
    const reviewId = review.id;
    const reference = sub.reference;
    try {
      await autosave.settle();
      const res = await saveReview({
        id: reviewId,
        action: 'submit',
        scores: draft.scores,
        comment: draft.comment,
        applicantFeedback: draft.applicantFeedback,
        recommendation: draft.recommendation,
      });
      autosave.markSaved();
      patchCache({ ...draft, status: res.status, totalScore: res.totalScore, submittedAt: new Date().toISOString() });
      reviewSession.submitted += 1;
      refreshAfterFinish();
      // Confirmed in the next review's header rather than a toast, which would sit on top of its Submit button.
      reviewSession.lastSubmitted = { id: reviewId, reference, score: res.totalScore, at: Date.now() };
      await goToNextAfterFinish();
    } catch (e) {
      const msg = errorMessage(e, "Couldn't submit your review");
      if (/score every criterion|choose a recommendation/i.test(msg)) {
        setAttempted(true);
        focusFirstProblem();
      } else {
        toast.error(msg);
        void qc.invalidateQueries({ queryKey: qk.review(reviewId) });
      }
      void autosave.save();
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  };

  const recuse = async (reason: string) => {
    try {
      await autosave.flush();
      await autosave.settle();
      await saveReview({ id: review.id, action: 'recuse', recusalReason: reason });
      autosave.markSaved();
      patchCache({ status: 'Recused', recusalReason: reason, submittedAt: new Date().toISOString() });
      refreshAfterFinish();
      return true;
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't recuse from this review"));
      return false;
    }
  };

  const scoreDigit = (n: number) => {
    if (mode !== 'edit') return;
    const i = criteria.findIndex(c => draft.scores[c.id] == null);
    const c = criteria[i];
    if (!c || n < c.min || n > c.max) return;
    const next = { ...draft.scores, [c.id]: n };
    autosave.update({ scores: next });
    const rows = criterionRows(scorecardRef.current);
    const after = criteria.findIndex((x, k) => k > i && next[x.id] == null);
    window.setTimeout(() => {
      if (after >= 0) focusElement(rows[after]);
      else focusElement(recommendationButtons(scorecardRef.current)[0] ?? notesRef.current);
    }, 0);
  };

  const digitKeys = useMemo(() => Object.fromEntries(Array.from({ length: 10 }, (_, n) => [String(n), () => scoreDigit(n)])), [draft.scores, mode, criteria]);

  useHotkeys({
    esc: () => void leave(reviewListPath()),
    'shift+k': () => prevId && void leave(`/reviews/${prevId}`),
    'shift+j': () => nextId && void leave(`/reviews/${nextId}`),
    '/': () => {
      setSearchOpen(true);
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    },
    ...digitKeys,
  });
  useHotkeys({ 'mod+enter': () => void submit(), 'mod+s': () => void autosave.flush() }, { allowInInputs: ['mod+enter', 'mod+s'] });

  const running = totalScore(criteria, draft.scores) ?? partialScore(criteria, draft.scores);
  const scored = criteria.filter(c => draft.scores[c.id] != null).length;
  const remaining = remainingLabel(criteria, draft.scores, rubric.askRecommendation && !draft.recommendation);

  const scorecard = (
    <ScorecardPane
      detail={detail}
      draft={draft}
      update={autosave.update}
      mode={mode}
      attempted={attempted}
      submitting={submitting}
      reopening={reopening}
      saveStatus={autosave.status}
      lastSavedAt={autosave.lastSavedAt}
      saveError={autosave.error}
      onRetrySave={() => void autosave.save()}
      onSubmit={() => void submit()}
      onRecuse={() => setRecuseOpen(true)}
      onReopen={() => void reopenReview()}
      onNext={nextId ? () => void leave(`/reviews/${nextId}`) : null}
      flush={autosave.flush}
      scorecardRef={scorecardRef}
      notesRef={notesRef}
      stacked={!wide}
    />
  );

  const application = (
    <ApplicationPane detail={detail} scrollRef={wide ? leftScrollRef : bodyScrollRef} searchOpen={searchOpen} onSearchOpenChange={setSearchOpen} searchInputRef={searchInputRef} />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-1.5 border-b px-2 sm:px-3">
        {shell?.sidebarCollapsed && (
          <Tip label="Show sidebar" keys={['[']}>
            <IconButton onClick={shell.toggleSidebar} aria-label="Show sidebar" className="hidden md:inline-flex"><PanelLeft /></IconButton>
          </Tip>
        )}
        <Tip label="Back to My reviews" keys={['Esc']}>
          <IconButton onClick={() => void leave(reviewListPath())} aria-label="Back to My reviews"><ArrowLeft /></IconButton>
        </Tip>
        <div className="flex min-w-0 items-center gap-2 pl-0.5">
          <Glyph icon={program.icon} color={program.color} size={18} className="text-[11px]" />
          <span className="hidden max-w-[220px] truncate text-[13px] text-muted-foreground md:inline">{program.name}</span>
          <span className="hidden text-muted-foreground/60 md:inline">›</span>
          <span className="shrink-0 text-[13.5px] font-medium tabular-nums">{sub.reference}</span>
          {detail.stageName && <span className="hidden shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground sm:inline">{detail.stageName}</span>}
          {program.blindReview && (
            <Tip label="Blind review — the applicant's identity is hidden">
              <span className="hidden shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground sm:inline-flex"><EyeOff className="h-3 w-3" /> Blind</span>
            </Tip>
          )}
          {due && (
            <Tip label={due.tone === 'overdue' ? `Overdue — was due ${shortDate(review.dueDate)}` : `Due ${shortDate(review.dueDate)}`}>
              <span className={cn('shrink-0 truncate text-xs', DUE_TONE[due.tone], due.tone === 'overdue' && 'font-medium')}>
                {due.tone === 'overdue' ? `Overdue · ${due.label}` : `Due ${due.label}`}
              </span>
            </Tip>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <JustSubmitted currentId={review.id} />
          {queue.total > 0 && (
            <span className="mr-1 text-xs tabular-nums text-muted-foreground">
              {inQueue ? `${queue.index + 1} of ${queue.total}` : `${queue.total} to do`}
            </span>
          )}
          <Tip label="Previous review" keys={['⇧', 'K']}>
            <IconButton aria-label="Previous review" disabled={!prevId} onClick={() => prevId && void leave(`/reviews/${prevId}`)}><ChevronUp /></IconButton>
          </Tip>
          <Tip label={inQueue ? 'Next review' : 'Next review to do'} keys={['⇧', 'J']}>
            <IconButton aria-label="Next review" disabled={!nextId} onClick={() => nextId && void leave(`/reviews/${nextId}`)}><ChevronDown /></IconButton>
          </Tip>
        </div>
      </header>

      {wide ? (
        <div className="flex min-h-0 flex-1">
          <div ref={leftScrollRef} className="min-w-0 flex-1 overflow-y-auto">{application}</div>
          <aside aria-label="Scorecard" className="flex w-[400px] shrink-0 flex-col border-l bg-background">{scorecard}</aside>
        </div>
      ) : (
        <div ref={bodyScrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
          {application}
          <div ref={scorecardTopRef} id="scorecard" className="border-t-4 border-muted">
            {scorecard}
          </div>
          <div className="sticky bottom-0 z-20 flex h-14 items-center gap-3 border-t bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/85">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[18px] font-semibold tabular-nums">{running == null ? '—' : Math.round(running)}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {mode === 'edit' ? (criteria.length ? `${scored} of ${criteria.length} scored` : 'No criteria') : mode === 'submitted' ? 'Submitted' : mode === 'recused' ? 'Recused' : 'Closed'}
                </span>
              </div>
              {mode === 'edit' && <div className="truncate text-2xs text-muted-foreground">{autosave.status === 'error' ? "Couldn't save — retrying" : autosave.status === 'pending' || autosave.status === 'saving' ? 'Saving…' : remaining ?? 'Ready to submit'}</div>}
            </div>
            {mode === 'edit' && scorecardInView ? (
              <button type="button" onClick={() => void submit()} disabled={submitting} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-70">
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            ) : !scorecardInView ? (
              <button
                type="button"
                onClick={() => scorecardTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="inline-flex h-9 items-center rounded-md border bg-background px-4 text-[13px] font-medium shadow-2xs hover:bg-accent"
              >
                {mode === 'edit' ? 'Score' : 'Scorecard'}
              </button>
            ) : nextId ? (
              <button type="button" onClick={() => void leave(`/reviews/${nextId}`)} className="inline-flex h-9 items-center rounded-md border bg-background px-4 text-[13px] font-medium shadow-2xs hover:bg-accent">
                Next review
              </button>
            ) : null}
          </div>
        </div>
      )}

      <RecuseDialog open={recuseOpen} onOpenChange={setRecuseOpen} reference={sub.reference} title={sub.title} onConfirm={recuse} />
      <span className="sr-only" aria-live="polite">{submitting ? 'Submitting review' : ''}</span>
    </div>
  );
}
