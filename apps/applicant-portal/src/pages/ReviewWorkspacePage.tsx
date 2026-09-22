import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, EyeOff, FileSearch, Lock, RotateCcw, Send, UserRoundX } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { savePortalReview } from 'zitejs/api';
import { cn } from '@project/components/lib/utils';
import { formatMoney } from '@project/shared/forms/logic';
import { RECOMMENDATION_LABEL, missingCriteria, type Recommendation, type Scores } from '@project/shared/scoring';
import { AnswersView } from '@project/shared/ui/AnswersView';
import { Markdown } from '@project/shared/ui/Markdown';
import { ScoreTotal, ScorecardInput } from '@project/shared/ui/ScorecardInput';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SaveIndicator } from '../components/SaveIndicator';
import { SignInPrompt } from '../components/SignInPrompt';
import { Alert, BackLink, Button, Card, Container, EmptyState, LinkButton, PageSkeleton, ProgramGlyph, StatusPill, Tip, textareaClass } from '../components/ui';
import { useSession } from '../lib/auth';
import { errorMessage, errorStatus } from '../lib/errors';
import { dueLabel, mediumDateTime } from '../lib/format';
import { qk, useReviewDetail, type ReviewDetail } from '../lib/queries';
import { useAutosave } from '../lib/useAutosave';
import { useDocumentTitle } from '../lib/useDocumentTitle';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function ReviewWorkspacePage() {
  const { reviewId } = useParams();
  const { user, isLoading } = useSession();
  const q = useReviewDetail(reviewId);
  useDocumentTitle(q.data ? `Review ${q.data.submission.reference}` : 'Review');

  if (isLoading) return <PageSkeleton />;
  if (!user) return <SignInPrompt title="Sign in to review" body="Sign in with the email address your reviewer invitation was sent to." />;
  if (q.isPending) return <PageSkeleton />;
  if (q.isError || !q.data) {
    const forbidden = errorStatus(q.error) === 403;
    return (
      <Container size="narrow" className="py-16">
        <EmptyState icon={FileSearch} title={forbidden ? 'Reviews are for invited panelists' : "We couldn't open that review"} action={<LinkButton to={forbidden ? '/' : '/reviews'}>{forbidden ? 'Browse programs' : 'Back to reviews'}</LinkButton>}>
          {errorMessage(q.error, 'It may have been reassigned, or it belongs to someone else.')}
        </EmptyState>
      </Container>
    );
  }
  return <Workspace key={`${q.data.review.id}:${q.data.review.status}`} data={q.data} />;
}

function Workspace({ data }: { data: ReviewDetail }) {
  const { review, rubric, submission, program, queue } = data;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const commentId = useId();
  const feedbackId = useId();
  const finished = review.status === 'Submitted' || review.status === 'Recused';
  const readOnly = review.locked || finished;

  const [scores, setScores] = useState<Scores>(review.scores);
  const [recommendation, setRecommendation] = useState<string | null>(review.recommendation);
  const [comment, setComment] = useState(review.comment);
  const [feedback, setFeedback] = useState(review.applicantFeedback);
  const [problem, setProblem] = useState<string | null>(null);
  const [recuseOpen, setRecuseOpen] = useState(false);

  const snapshot = (over: Partial<{ scores: Scores; recommendation: string | null; comment: string; feedback: string }> = {}) => ({
    scores: over.scores ?? scores,
    recommendation: over.recommendation !== undefined ? over.recommendation : recommendation,
    comment: over.comment ?? comment,
    feedback: over.feedback ?? feedback,
  });
  type Snap = ReturnType<typeof snapshot>;

  const autosave = useAutosave<Snap>({
    save: s =>
      savePortalReview({
        id: review.id,
        action: 'save',
        scores: s.scores,
        recommendation: (s.recommendation as Recommendation | null) ?? null,
        comment: s.comment,
        applicantFeedback: s.feedback,
      }),
    delay: 900,
    onFatal: () => qc.invalidateQueries({ queryKey: qk.review(review.id) }),
  });
  const change = (over: Parameters<typeof snapshot>[0]) => {
    setProblem(null);
    if (!readOnly) autosave.change(snapshot(over));
  };

  const refreshLists = () => {
    qc.invalidateQueries({ queryKey: qk.reviewsRoot });
    qc.invalidateQueries({ queryKey: qk.me });
  };

  const act = useMutation({
    mutationFn: async (input: { action: 'submit' | 'recuse' | 'reopen'; recusalReason?: string }) => {
      if (input.action !== 'reopen') await autosave.flush().catch(() => undefined);
      return savePortalReview({
        id: review.id,
        action: input.action,
        ...(input.action === 'submit' ? { scores, recommendation: (recommendation as Recommendation | null) ?? null, comment, applicantFeedback: feedback } : {}),
        ...(input.action === 'recuse' ? { recusalReason: input.recusalReason } : {}),
      });
    },
    onSuccess: (_, input) => {
      refreshLists();
      if (input.action === 'reopen') {
        toast.success('Reopened. Your scores are as you left them.');
        qc.invalidateQueries({ queryKey: qk.review(review.id) });
        return;
      }
      setRecuseOpen(false);
      const nextId = queue.nextId && queue.nextId !== review.id ? queue.nextId : null;
      toast.success(input.action === 'submit' ? (nextId ? 'Review submitted. Here’s the next one.' : 'Review submitted. That was your last one — thank you!') : 'You stepped back from this review. The program team has been told.');
      qc.invalidateQueries({ queryKey: qk.review(review.id) });
      navigate(nextId ? `/reviews/${nextId}` : '/reviews');
    },
    onError: e => setProblem(errorMessage(e, "That didn't go through. Try again.")),
  });

  const submit = useCallback(() => {
    if (readOnly || act.isPending) return;
    const missing = missingCriteria(rubric.criteria, scores);
    if (missing.length) {
      setProblem(`Score every criterion before submitting — ${missing.map(m => m.name).join(', ')} ${missing.length === 1 ? 'is' : 'are'} still blank.`);
      return;
    }
    if (rubric.askRecommendation && !recommendation) {
      setProblem('Choose a recommendation before submitting.');
      return;
    }
    act.mutate({ action: 'submit' });
  }, [readOnly, act, rubric, scores, recommendation]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submit]);

  const due = !finished ? dueLabel(review.dueDate) : null;
  const statusPill =
    review.status === 'Submitted' ? <StatusPill tone="success">Submitted</StatusPill>
    : review.status === 'Recused' ? <StatusPill tone="neutral">Stepped back</StatusPill>
    : review.status === 'In progress' ? <StatusPill tone="info">In progress</StatusPill>
    : <StatusPill tone="accent">Not started</StatusPill>;

  return (
    <div className="pb-16">
      <div className="border-b bg-background">
        <Container className="py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <BackLink to="/reviews">Reviews</BackLink>
            {queue.index >= 0 && queue.total > 0 && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <span className="mr-2 tabular-nums">
                  {queue.index + 1} of {queue.total} to do
                </span>
                <Tip label="Previous in your queue">
                  <Link aria-label="Previous review" to={queue.prevId ? `/reviews/${queue.prevId}` : '#'} aria-disabled={!queue.prevId} onClick={e => !queue.prevId && e.preventDefault()} className={cn('flex h-9 w-9 items-center justify-center rounded-lg border bg-background hover:bg-accent', !queue.prevId && 'pointer-events-none opacity-40')}>
                    <ChevronLeft className="h-4 w-4" />
                  </Link>
                </Tip>
                <Tip label="Next in your queue">
                  <Link aria-label="Next review" to={queue.nextId ? `/reviews/${queue.nextId}` : '#'} aria-disabled={!queue.nextId} onClick={e => !queue.nextId && e.preventDefault()} className={cn('flex h-9 w-9 items-center justify-center rounded-lg border bg-background hover:bg-accent', !queue.nextId && 'pointer-events-none opacity-40')}>
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </Tip>
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <ProgramGlyph icon={program.icon} color={program.color} name={program.name} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-sm text-muted-foreground">
                  {program.name}
                  {data.stageName ? ` · ${data.stageName}` : ''}
                </p>
                <h1 className="font-serif text-2xl font-semibold leading-tight">{submission.title}</h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="font-mono text-foreground">{submission.reference}</span>
                  {program.blindReview ? (
                    <span className="inline-flex items-center gap-1">
                      <EyeOff className="h-4 w-4" aria-hidden /> Anonymous — names and contact details are hidden
                    </span>
                  ) : (
                    [submission.applicantName, submission.applicantOrganization, submission.applicantLocation].filter(Boolean).join(' · ')
                  )}
                  {submission.requestedAmount != null && <span>{formatMoney(submission.requestedAmount, program.currency)} requested</span>}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 sm:flex-col sm:items-end">
              {statusPill}
              {due && <span className={cn('text-sm', due.tone === 'overdue' ? 'font-medium text-tone-danger' : 'text-muted-foreground')}>{due.label}</span>}
              <Button variant="soft" size="sm" className="lg:hidden" onClick={() => document.getElementById('scorecard')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                {readOnly ? 'See the scorecard' : 'Go to the scorecard'}
              </Button>
            </div>
          </div>
        </Container>
      </div>

      <Container className="pt-6">
        {review.locked && (
          <Alert tone="info" icon={Lock} title="This review is closed" className="mb-6">
            {review.lockedReason}
          </Alert>
        )}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
          <section aria-label="Application" className="min-w-0">
            <AnswersView fields={data.fields} answers={data.answers} currency={program.currency} hideEmpty />
          </section>

          <aside id="scorecard" aria-label="Your review" className="min-w-0 scroll-mt-20">
            <div className="space-y-4 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:pb-4 lg:pr-1">
              <Card className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">{rubric.name}</h2>
                  <ScoreTotal criteria={rubric.criteria} scores={scores} />
                </div>
                {rubric.instructions && <Markdown compact className="mt-2 text-sm text-muted-foreground">{rubric.instructions}</Markdown>}
                <p className="mt-2 text-xs text-muted-foreground">Tip: focus a criterion and press a number to score it and move to the next.</p>
                <div className="mt-4">
                  <ScorecardInput
                    criteria={rubric.criteria}
                    scores={scores}
                    onChange={next => {
                      setScores(next);
                      change({ scores: next });
                    }}
                    recommendation={recommendation}
                    onRecommendation={r => {
                      setRecommendation(r);
                      change({ recommendation: r });
                    }}
                    askRecommendation={rubric.askRecommendation}
                    disabled={readOnly}
                  />
                </div>
              </Card>

              <Card className="space-y-5 p-5">
                <div>
                  <label htmlFor={commentId} className="text-[15px] font-medium">Notes for the committee</label>
                  <p className="text-sm text-muted-foreground">Only the program team and fellow reviewers see these.</p>
                  <textarea
                    id={commentId}
                    value={comment}
                    disabled={readOnly}
                    onChange={e => {
                      setComment(e.target.value);
                      change({ comment: e.target.value });
                    }}
                    maxLength={20000}
                    className={textareaClass('mt-2 min-h-[120px]')}
                    placeholder="What stood out, and what gave you pause?"
                  />
                </div>
                <div>
                  <label htmlFor={feedbackId} className="text-[15px] font-medium">
                    Feedback for the applicant <span className="text-sm font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <p className="text-sm text-muted-foreground">The program team may share this with the applicant. Keep it kind and specific.</p>
                  <textarea
                    id={feedbackId}
                    value={feedback}
                    disabled={readOnly}
                    onChange={e => {
                      setFeedback(e.target.value);
                      change({ feedback: e.target.value });
                    }}
                    maxLength={5000}
                    className={textareaClass('mt-2 min-h-[96px]')}
                  />
                </div>
              </Card>

              {finished && review.recusalReason && (
                <Alert tone="info" icon={UserRoundX} title="You stepped back from this review">
                  {review.recusalReason}
                </Alert>
              )}

              {data.peers && data.peers.length > 0 && (
                <Card className="p-5">
                  <h2 className="text-[15px] font-semibold">Other reviewers</h2>
                  <ul className="mt-3 divide-y">
                    {data.peers.map((p, i) => (
                      <li key={i} className="py-2.5 first:pt-0 last:pb-0">
                        <p className="flex items-center justify-between text-[15px]">
                          <span className="font-medium">{p.reviewerName}</span>
                          <span className="tabular-nums">{p.totalScore != null ? Math.round(p.totalScore) : '—'}</span>
                        </p>
                        {p.recommendation && <p className="text-sm text-muted-foreground">{RECOMMENDATION_LABEL[p.recommendation as Recommendation] ?? p.recommendation}</p>}
                        {p.comment && <p className="mt-1 text-sm">{p.comment}</p>}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <Card className="no-print p-5">
                {problem && (
                  <p role="alert" className="mb-4 rounded-lg bg-tone-danger/[0.07] px-3 py-2 text-sm text-tone-danger">
                    {problem}
                  </p>
                )}
                {!readOnly ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <SaveIndicator state={autosave.state} savedAt={autosave.savedAt} onRetry={autosave.retryNow} />
                    </div>
                    <Button size="lg" className="mt-4 w-full" onClick={submit} loading={act.isPending && act.variables?.action === 'submit'}>
                      <Send aria-hidden /> Submit review
                      <span className="ml-1 hidden rounded bg-primary-foreground/20 px-1.5 py-0.5 text-2xs font-medium sm:inline">{isMac ? '⌘' : 'Ctrl'} ↵</span>
                    </Button>
                    <Button variant="ghost" size="sm" className="mt-2 w-full text-muted-foreground" onClick={() => setRecuseOpen(true)}>
                      <UserRoundX aria-hidden /> Step back from this review
                    </Button>
                  </>
                ) : finished && !review.locked ? (
                  <>
                    <p className="text-[15px]">
                      {review.status === 'Submitted' ? 'You submitted this review' : 'You stepped back'}
                      {review.submittedAt ? ` ${mediumDateTime(review.submittedAt)}` : ''}.
                    </p>
                    <Button variant="secondary" className="mt-3 w-full" onClick={() => act.mutate({ action: 'reopen' })} loading={act.isPending}>
                      <RotateCcw aria-hidden /> Reopen to make changes
                    </Button>
                  </>
                ) : (
                  <p className="text-[15px] text-muted-foreground">Nothing more to do here.</p>
                )}
              </Card>
            </div>
          </aside>
        </div>
      </Container>

      <ConfirmDialog
        open={recuseOpen}
        onOpenChange={setRecuseOpen}
        title="Step back from this review?"
        description="The program team will be told and may assign someone else. Your scores so far won't count."
        confirmLabel="Step back"
        tone="danger"
        pending={act.isPending && act.variables?.action === 'recuse'}
        error={act.isError && act.variables?.action === 'recuse' ? errorMessage(act.error, "That didn't go through. Try again.") : null}
        note={{ label: 'Why are you stepping back?', placeholder: 'For example, I know the applicant personally.', required: true, requiredMessage: 'Say briefly why — for example, a conflict of interest.' }}
        onConfirm={reason => act.mutate({ action: 'recuse', recusalReason: reason })}
      />
    </div>
  );
}
