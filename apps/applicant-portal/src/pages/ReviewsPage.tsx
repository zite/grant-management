import { CheckCircle2, ChevronRight, EyeOff, Inbox, Star } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@project/components/lib/utils';
import { SignInPrompt } from '../components/SignInPrompt';
import { Alert, Button, Card, Container, EmptyState, LinkButton, PageSkeleton, ProgramGlyph, Skeleton, StatusPill } from '../components/ui';
import { useSession } from '../lib/auth';
import { errorMessage, errorStatus } from '../lib/errors';
import { dueLabel, shortDate } from '../lib/format';
import { useReviewQueue, type ReviewQueue } from '../lib/queries';
import { useDocumentTitle } from '../lib/useDocumentTitle';

type Filter = 'todo' | 'done' | 'all';
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'todo', label: 'To do' },
  { key: 'done', label: 'Done' },
  { key: 'all', label: 'All' },
];

/** The queue for volunteer panelists who review through the portal rather than the staff app. */
export function ReviewsPage() {
  const { user, isLoading } = useSession();
  const [filter, setFilter] = useState<Filter>('todo');
  const q = useReviewQueue(filter);
  useDocumentTitle('Reviews');

  if (isLoading) return <PageSkeleton variant="list" />;
  if (!user) return <SignInPrompt title="Sign in to review" body="Sign in with the email address your reviewer invitation was sent to." hashPath="/reviews" />;
  if (q.isError && errorStatus(q.error) === 403) {
    return (
      <Container size="narrow" className="py-16">
        <Card>
          <EmptyState icon={Star} title="Reviews are for invited panelists" action={<LinkButton to="/" variant="secondary">Browse programs</LinkButton>}>
            {errorMessage(q.error, `You're signed in as ${user.email}, which doesn't have reviews here.`)}
          </EmptyState>
        </Card>
      </Container>
    );
  }

  const todoCount = q.data?.todoCount ?? 0;
  return (
    <div>
      <div className="border-b bg-background">
        <Container className="py-8 sm:py-10">
          <h1 className="font-serif text-3xl font-semibold">Reviews</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            {q.data ? (todoCount ? `You have ${todoCount} ${todoCount === 1 ? 'application' : 'applications'} to review. Thank you for lending your time.` : 'You’re all caught up. Thank you for lending your time.') : ' '}
          </p>
          {/* The same underline tabs the programs index uses, so filters read alike across the portal. */}
          <div role="group" aria-label="Show" className="-mb-px mt-6 flex gap-6">
            {FILTERS.map(f => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'border-b-2 pb-2.5 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
                  filter === f.key ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
                {f.key === 'todo' && todoCount > 0 && <span className="ml-1.5 tabular-nums text-faint">{todoCount}</span>}
              </button>
            ))}
          </div>
        </Container>
      </div>
      <Container className="py-8">
        {q.isError ? (
          <Alert tone="danger" title="Your reviews didn't load" action={<Button variant="secondary" size="sm" onClick={() => q.refetch()}>Try again</Button>}>
            {errorMessage(q.error, 'Check your connection and try again.')}
          </Alert>
        ) : !q.data ? (
          <div className="space-y-3" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : q.data.reviews.length === 0 ? (
          <Card>
            <EmptyState icon={filter === 'todo' ? CheckCircle2 : Inbox} title={filter === 'todo' ? 'Nothing to review right now' : filter === 'done' ? 'No finished reviews yet' : 'No reviews assigned yet'}>
              {filter === 'todo' ? "When the program team assigns you an application, it will appear here and we'll email you." : 'Reviews you submit or step back from will appear here.'}
            </EmptyState>
          </Card>
        ) : (
          <ul className={cn('divide-y overflow-hidden rounded-xl border bg-card shadow-xs transition-opacity', q.isFetching && 'opacity-70')}>
            {q.data.reviews.map(r => (
              <ReviewRow key={r.id} review={r} />
            ))}
          </ul>
        )}
      </Container>
    </div>
  );
}

function ReviewRow({ review: r }: { review: ReviewQueue['reviews'][number] }) {
  const open = r.status === 'Assigned' || r.status === 'In progress';
  const due = open && !r.closed ? dueLabel(r.dueDate) : null;
  const status =
    r.closed ? { label: 'Closed', tone: 'neutral' as const }
    : r.status === 'Submitted' ? { label: 'Submitted', tone: 'success' as const }
    : r.status === 'Recused' ? { label: 'Stepped back', tone: 'neutral' as const }
    : r.status === 'In progress' ? { label: 'In progress', tone: 'info' as const }
    : { label: 'Not started', tone: 'accent' as const };
  return (
    <li>
      <Link to={`/reviews/${r.id}`} className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none sm:px-5">
        <ProgramGlyph icon={r.programIcon} color={r.programColor} name={r.programName} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{r.title}</p>
          <p className="flex min-w-0 items-center gap-1.5 truncate text-sm text-muted-foreground">
            <span className="font-mono">{r.reference}</span>
            <span aria-hidden>·</span>
            {r.blind ? (
              <span className="inline-flex items-center gap-1">
                <EyeOff className="h-3.5 w-3.5" aria-hidden /> Anonymous
              </span>
            ) : (
              <span className="truncate">{r.applicantLabel ?? r.programName}</span>
            )}
          </p>
        </div>
        <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
          {due ? (
            <span className={cn('text-sm', due.tone === 'overdue' ? 'font-medium text-tone-danger' : due.tone === 'soon' ? 'text-tone-warning' : 'text-muted-foreground')}>{due.label}</span>
          ) : r.submittedAt ? (
            <span className="text-sm text-muted-foreground">{r.totalScore != null ? `Score ${Math.round(r.totalScore)} · ` : ''}{shortDate(r.submittedAt)}</span>
          ) : null}
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </li>
  );
}
