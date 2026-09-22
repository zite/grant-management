import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ChevronRight, ClipboardList, FilePlus2, MessageSquare, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { deleteDraft } from 'zitejs/api';
import { cn } from '@project/components/lib/utils';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DeadlineText } from '../components/program';
import { SignInPrompt } from '../components/SignInPrompt';
import { Alert, Button, Card, Container, EmptyState, LinkButton, PageSkeleton, ProgramGlyph, ProgressBar, StatusPill } from '../components/ui';
import { useSession } from '../lib/auth';
import { errorMessage } from '../lib/errors';
import { dueLabel, firstName, shortDate, timeAgo } from '../lib/format';
import { qk, useMe, useMyApplications, type MyApplication, type MyApplications, type MyTask } from '../lib/queries';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export function MyApplicationsPage() {
  const { user, isLoading, name } = useSession();
  const q = useMyApplications();
  const me = useMe();
  useDocumentTitle('My applications');

  if (isLoading) return <PageSkeleton variant="list" />;
  if (!user) return <SignInPrompt title="Sign in to see your applications" body="Sign in with the email you applied with to continue drafts, answer requests and check on anything you've submitted." hashPath="/applications" />;
  if (q.isPending) return <PageSkeleton variant="list" />;

  const greeting = firstName(me.data?.profile.name || name);
  return (
    <div>
      <div className="border-b bg-background">
        <Container className="py-8 sm:py-10">
          <h1 className="font-serif text-3xl font-semibold">My applications</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">{greeting ? `Welcome back, ${greeting}. ` : ''}Everything you've started, submitted and been asked for, in one place.</p>
        </Container>
      </div>
      <Container className="py-8">
        {q.isError || !q.data ? (
          <Alert tone="danger" title="Your applications didn't load" action={<Button variant="secondary" size="sm" onClick={() => q.refetch()}>Try again</Button>}>
            {errorMessage(q.error, 'Check your connection and try again.')}
          </Alert>
        ) : (
          <Dashboard data={q.data} />
        )}
      </Container>
    </div>
  );
}

function Dashboard({ data }: { data: MyApplications }) {
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState<MyApplication | null>(null);
  const drafts = data.applications.filter(a => a.status === 'Draft');
  const active = data.applications.filter(a => a.status === 'Submitted');
  const past = data.applications.filter(a => a.status !== 'Draft' && a.status !== 'Submitted');
  const todoMessages = data.applications.filter(a => a.unreadMessages > 0 && a.status !== 'Draft');

  const remove = useMutation({
    mutationFn: (id: string) => deleteDraft({ id }),
    onSuccess: (_, id) => {
      qc.setQueryData<MyApplications>(qk.myApplications, prev => (prev ? { ...prev, applications: prev.applications.filter(a => a.id !== id) } : prev));
      qc.invalidateQueries({ queryKey: qk.me });
      try {
        localStorage.removeItem(`grants:draft:${id}`);
      } catch {
        /* ignore */
      }
      setDeleting(null);
      toast.success('Draft deleted.');
    },
  });

  if (data.applications.length === 0) {
    return (
      <Card>
        <EmptyState icon={FilePlus2} title="You haven't started an application yet" action={<LinkButton to="/">Find a program <ArrowRight aria-hidden /></LinkButton>}>
          Browse open programs, check whether you're eligible, and start applying. Your progress saves automatically, so you can finish whenever suits you.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-12">
      {(data.tasks.length > 0 || todoMessages.length > 0) && (
        <Section title="To do" count={data.tasks.length + todoMessages.length} description="Things the program team is waiting on.">
          <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
            {data.tasks.map(t => (
              <TaskRow key={t.id} task={t} />
            ))}
            {todoMessages.map(a => (
              <li key={`msg-${a.id}`}>
                <RowLink to={`/applications/${a.id}`}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
                    <MessageSquare className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {a.unreadMessages === 1 ? 'New message' : `${a.unreadMessages} new messages`} about {a.title || a.programName}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {a.programName}
                      {a.reference ? ` · ${a.reference}` : ''}
                    </p>
                  </div>
                </RowLink>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {drafts.length > 0 && (
        <Section title="Drafts" count={drafts.length} description="Not submitted yet. Your answers are saved.">
          <ul className="grid gap-4 md:grid-cols-2">
            {drafts.map(d => (
              <li key={d.id}>
                <Card className="flex h-full flex-col p-5">
                  <div className="flex items-start gap-3">
                    <ProgramGlyph icon={d.programIcon} color={d.programColor} name={d.programName} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-muted-foreground">{d.programName}</p>
                      <h3 className="truncate font-serif text-lg font-semibold">{d.title || 'Untitled application'}</h3>
                    </div>
                  </div>
                  {d.progress && (
                    <div className="mt-4">
                      <div className="mb-1.5 flex justify-between text-sm">
                        <span className="font-medium">{Math.round(d.progress.ratio * 100)}% complete</span>
                        <span className="text-muted-foreground">{d.lastSavedAt ? `Saved ${timeAgo(d.lastSavedAt)}` : ''}</span>
                      </div>
                      <ProgressBar value={d.progress.ratio} label={`${d.title || d.programName} progress`} />
                    </div>
                  )}
                  <div className="mt-3 text-sm">
                    <DeadlineText program={{ phase: d.phase, deadline: d.deadline, opensAt: null, allowLate: d.allowLate }} />
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-5">
                    <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground hover:text-tone-danger" onClick={() => setDeleting(d)} aria-label={`Delete draft ${d.title || d.programName}`}>
                      <Trash2 aria-hidden /> Delete
                    </Button>
                    <LinkButton to={`/applications/${d.id}`} size="sm" variant={d.accepting ? 'primary' : 'secondary'}>
                      {d.accepting ? 'Continue' : 'View draft'} <ArrowRight aria-hidden />
                    </LinkButton>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {active.length > 0 && (
        <Section title="Submitted" count={active.length} description="Being considered now.">
          <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
            {active.map(a => (
              <ApplicationRow key={a.id} app={a} />
            ))}
          </ul>
        </Section>
      )}

      {past.length > 0 && (
        <Section title="Past" count={past.length} description="Decided or withdrawn.">
          <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
            {past.map(a => (
              <ApplicationRow key={a.id} app={a} />
            ))}
          </ul>
        </Section>
      )}

      {active.length === 0 && drafts.length === 0 && (
        <p className="text-center text-[15px] text-muted-foreground">
          Looking for something else? <Link to="/" className="font-medium text-primary hover:underline">Browse open programs</Link>
        </p>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={o => {
          if (!o) {
            setDeleting(null);
            remove.reset();
          }
        }}
        title="Delete this draft?"
        description={
          <p>
            Everything you've written for <span className="font-medium text-foreground">{deleting?.title || deleting?.programName}</span> will be permanently deleted. You can start a new application later if the program is still open.
          </p>
        }
        confirmLabel="Delete draft"
        tone="danger"
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error, "The draft wasn't deleted. Try again.") : null}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}

function Section({ title, count, description, children }: { title: string; count: number; description: string; children: ReactNode }) {
  const id = `section-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section aria-labelledby={id}>
      <div className="mb-4 border-b pb-2.5">
        <h2 id={id} className="flex items-baseline gap-2 font-serif text-xl font-semibold">
          {title}
          <span className="text-sm font-normal tabular-nums text-faint">{count}</span>
        </h2>
        <p className="mt-0.5 text-[15px] text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function RowLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none sm:px-5">
      {children}
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

function TaskRow({ task }: { task: MyTask }) {
  const due = dueLabel(task.dueDate);
  return (
    <li>
      <RowLink to={`/tasks/${task.id}`}>
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', task.status === 'Returned' ? 'bg-tone-warning/10 text-tone-warning' : 'border bg-muted text-muted-foreground')}>
          <ClipboardList className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-lg font-semibold">{task.title}</p>
          <p className="truncate text-sm text-muted-foreground">
            {task.applicationTitle || task.programName}
            {task.reference ? ` · ${task.reference}` : ''}
          </p>
        </div>
        <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
          {task.status === 'Returned' ? <StatusPill tone="warning">Needs changes</StatusPill> : <StatusPill tone="info">To do</StatusPill>}
          {due && <span className={cn('text-sm', due.tone === 'overdue' ? 'font-medium text-tone-danger' : due.tone === 'soon' ? 'text-tone-warning' : 'text-muted-foreground')}>{due.label}</span>}
        </div>
      </RowLink>
    </li>
  );
}

function ApplicationRow({ app }: { app: MyApplication }) {
  return (
    <li>
      <RowLink to={`/applications/${app.id}`}>
        <ProgramGlyph icon={app.programIcon} color={app.programColor} name={app.programName} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="truncate font-serif text-lg font-semibold">{app.title || 'Untitled application'}</span>
            {app.unreadMessages > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-px text-2xs font-semibold text-primary-foreground">
                <MessageSquare className="h-3 w-3" aria-hidden /> {app.unreadMessages} new
              </span>
            )}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {app.programName}
            {app.reference ? ` · ${app.reference}` : ''}
            {app.status === 'Withdrawn' && app.withdrawnAt ? ` · Withdrawn ${shortDate(app.withdrawnAt)}` : app.submittedAt ? ` · Submitted ${shortDate(app.submittedAt)}` : ''}
          </p>
          <p className="mt-1 text-sm text-muted-foreground sm:hidden">{app.applicantStatus.label}</p>
        </div>
        <div className="hidden max-w-[240px] shrink-0 flex-col items-end gap-1 text-right sm:flex">
          <StatusPill tone={app.applicantStatus.tone}>{app.applicantStatus.label}</StatusPill>
          <span className="text-sm text-muted-foreground">{app.applicantStatus.description}</span>
        </div>
      </RowLink>
    </li>
  );
}
