import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Award, ChevronRight, ClipboardCheck, FileSearch, Mail, Printer, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { withdrawApplication } from 'zitejs/api';
import { cn } from '@project/components/lib/utils';
import { formatMoney } from '@project/shared/forms/logic';
import { AnswersView } from '@project/shared/ui/AnswersView';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MessageThread } from '../components/MessageThread';
import { SignInPrompt } from '../components/SignInPrompt';
import { Timeline } from '../components/Timeline';
import { Alert, BackLink, Button, Card, Container, EmptyState, LinkButton, PageSkeleton, ProgramGlyph, StatusPill } from '../components/ui';
import { useSession } from '../lib/auth';
import { errorMessage, isNotFound } from '../lib/errors';
import { dueLabel, mediumDateTime, shortDate } from '../lib/format';
import { qk, useApplication, type ApplicationDetail } from '../lib/queries';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { DraftStepper } from './DraftStepper';

export function ApplicationPage() {
  const { id } = useParams();
  const { user, isLoading } = useSession();
  const q = useApplication(id);
  useDocumentTitle(q.data ? q.data.application.title || q.data.program?.name || 'Application' : null);

  if (isLoading) return <PageSkeleton />;
  if (!user) return <SignInPrompt title="Sign in to see your application" body="Sign in with the email you applied with to continue your application, read messages and check its status." />;
  if (q.isPending) return <PageSkeleton />;
  if (q.isError || !q.data) {
    return (
      <Container size="narrow" className="py-16">
        <EmptyState
          icon={FileSearch}
          title={isNotFound(q.error) ? "We couldn't find that application" : "Your application didn't load"}
          action={
            <>
              {!isNotFound(q.error) && <Button variant="secondary" onClick={() => q.refetch()}>Try again</Button>}
              <LinkButton to="/applications">My applications</LinkButton>
            </>
          }
        >
          {isNotFound(q.error) ? `It may have been deleted, or it belongs to a different account. You're signed in as ${user.email}.` : errorMessage(q.error, 'Check your connection and try again.')}
        </EmptyState>
      </Container>
    );
  }
  if (q.data.application.status === 'Draft') return <DraftStepper key={q.data.application.id} data={q.data} />;
  return <SubmittedApplication data={q.data} />;
}

function SubmittedApplication({ data }: { data: ApplicationDetail }) {
  const { application: app, program, status, messages, tasks, timeline, form } = data;
  const qc = useQueryClient();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const openTasks = tasks.filter(t => t.status === 'Open' || t.status === 'Returned');
  const color = program?.color ?? '#8a8177';

  // Opening the application marked its messages read on the server; the badges elsewhere should agree.
  const hadUnread = messages.some(m => m.unread);
  useEffect(() => {
    if (!hadUnread) return;
    qc.invalidateQueries({ queryKey: qk.me });
    qc.invalidateQueries({ queryKey: qk.myApplications });
  }, [hadUnread, qc]);

  const withdraw = useMutation({
    mutationFn: (reason: string) => withdrawApplication({ id: app.id, reason: reason || undefined }),
    onSuccess: () => {
      setWithdrawOpen(false);
      toast.success('Your application was withdrawn. The program team has been told.');
      qc.invalidateQueries({ queryKey: qk.application(app.id) });
      qc.invalidateQueries({ queryKey: qk.myApplications });
      qc.invalidateQueries({ queryKey: qk.me });
    },
  });

  return (
    <div>
      <header className="relative border-b bg-background">
        <Container className="pb-8 pt-7">
          <BackLink to="/applications">My applications</BackLink>
          <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 gap-4">
              <ProgramGlyph icon={program?.icon} color={color} name={program?.name} size="lg" className="hidden sm:inline-flex" />
              <div className="min-w-0">
                {program && (
                  <Link to={`/programs/${program.slug}`} className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline">
                    {program.name}
                  </Link>
                )}
                <h1 className="mt-1 font-serif text-2xl font-semibold leading-tight sm:text-3xl">{app.title || 'Untitled application'}</h1>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {app.reference && (
                    <span>
                      Reference <span className="font-mono font-medium text-foreground">{app.reference}</span>
                    </span>
                  )}
                  {app.submittedAt && <span>Submitted {mediumDateTime(app.submittedAt)}</span>}
                </p>
              </div>
            </div>
            <div className="shrink-0 md:text-right">
              <StatusPill tone={status.tone}>{status.label}</StatusPill>
              <p className="mt-2 max-w-xs text-[15px] text-muted-foreground">{status.description}</p>
            </div>
          </div>
          {app.awardAmount != null && (
            <div className="mt-6 flex items-center gap-3 rounded-xl border border-tone-success/25 bg-tone-success/[0.06] px-4 py-3">
              <Award className="h-5 w-5 shrink-0 text-tone-success" aria-hidden />
              <p className="text-[15px]">
                Award: <span className="font-semibold">{formatMoney(app.awardAmount, data.currency)}</span>
              </p>
            </div>
          )}
        </Container>
      </header>

      <Container className="py-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] print:block">
          <div className="min-w-0 space-y-8">
            {openTasks.length > 0 && (
              <Alert
                className="no-print"
                tone="warning"
                icon={ClipboardCheck}
                title={openTasks.length === 1 ? 'The program team needs something from you' : `The program team needs ${openTasks.length} things from you`}
                action={
                  <LinkButton to={`/tasks/${openTasks[0].id}`} size="sm">
                    {openTasks[0].status === 'Returned' ? 'Update' : 'Start'} <ArrowRight aria-hidden />
                  </LinkButton>
                }
              >
                {openTasks[0].title}
                {openTasks[0].dueDate ? ` · ${dueLabel(openTasks[0].dueDate)?.label}` : ''}
              </Alert>
            )}

            <Card as="section" aria-labelledby="messages-heading" className="no-print p-5 sm:p-6">
              <h2 id="messages-heading" className="mb-5 text-lg font-semibold">Messages</h2>
              <MessageThread applicationId={app.id} messages={messages} organizationName={data.organizationName} canReply={app.status !== 'Withdrawn'} />
            </Card>

            <section aria-labelledby="submitted-heading">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 id="submitted-heading" className="font-serif text-xl font-semibold">What you submitted</h2>
                <Button variant="ghost" size="sm" className="no-print" onClick={() => window.print()}>
                  <Printer aria-hidden /> Print or save a copy
                </Button>
              </div>
              <AnswersView fields={form.fields} answers={app.answers} currency={data.currency} />
            </section>
          </div>

          <aside className="no-print space-y-5">
            <Card className="p-5">
              <h2 className="mb-4 text-[15px] font-semibold">Progress</h2>
              <Timeline items={timeline} />
            </Card>

            <Card className="p-5">
              <h2 className="mb-3 text-[15px] font-semibold">Requests</h2>
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing needed from you right now. If the program team asks for something, it will show up here.</p>
              ) : (
                <ul className="-mx-2 space-y-1">
                  {tasks.map(t => {
                    const due = t.status === 'Open' || t.status === 'Returned' ? dueLabel(t.dueDate) : null;
                    return (
                      <li key={t.id}>
                        <Link to={`/tasks/${t.id}`} className="group flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-medium">{t.title}</p>
                            <p className={cn('text-sm', due?.tone === 'overdue' ? 'text-tone-danger' : 'text-muted-foreground')}>
                              {taskStatusText(t)}
                              {due ? ` · ${due.label}` : ''}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card className="no-print p-5">
              <h2 className="mb-3 text-[15px] font-semibold">Need help?</h2>
              {program?.contactEmail && (
                <a href={`mailto:${program.contactEmail}?subject=${encodeURIComponent(`${app.reference ?? ''} ${app.title}`.trim())}`} className="flex items-center gap-2 text-[15px] text-primary underline-offset-2 hover:underline">
                  <Mail className="h-4 w-4" aria-hidden /> {program.contactEmail}
                </a>
              )}
              <p className="mt-2 text-sm text-muted-foreground">Or send a message above — it goes straight to the team reviewing your application.</p>
              {app.canWithdraw && (
                <div className="mt-4 border-t pt-4">
                  <Button variant="ghost" size="sm" className="-ml-3 text-tone-danger hover:bg-tone-danger/[0.07] hover:text-tone-danger" onClick={() => setWithdrawOpen(true)}>
                    <Undo2 aria-hidden /> Withdraw application
                  </Button>
                </div>
              )}
            </Card>
            {app.status === 'Withdrawn' && app.withdrawnAt && (
              <p className="text-sm text-muted-foreground">You withdrew this application on {shortDate(app.withdrawnAt)}.</p>
            )}
          </aside>
        </div>
      </Container>

      <ConfirmDialog
        open={withdrawOpen}
        onOpenChange={o => {
          setWithdrawOpen(o);
          if (!o) withdraw.reset();
        }}
        title="Withdraw this application?"
        description={
          <>
            <p>
              {program?.name ?? 'The program'} will stop considering <span className="font-medium text-foreground">{app.title || 'your application'}</span>, and the team will be told. This can't be undone
              {program?.accepting ? ' — to be considered again, you would need to contact the program team.' : '.'}
            </p>
          </>
        }
        confirmLabel="Withdraw application"
        tone="danger"
        pending={withdraw.isPending}
        error={withdraw.isError ? errorMessage(withdraw.error, "The application wasn't withdrawn. Try again.") : null}
        note={{ label: 'Would you like to tell us why?', placeholder: 'For example, the project was funded elsewhere.' }}
        onConfirm={reason => withdraw.mutate(reason)}
      />
    </div>
  );
}

function taskStatusText(t: ApplicationDetail['tasks'][number]) {
  switch (t.status) {
    case 'Open':
      return 'To do';
    case 'Returned':
      return 'Needs changes';
    case 'Submitted':
      return `Sent${t.submittedAt ? ` ${shortDate(t.submittedAt)}` : ''} · awaiting review`;
    case 'Approved':
      return 'Approved';
    default:
      return t.status;
  }
}
