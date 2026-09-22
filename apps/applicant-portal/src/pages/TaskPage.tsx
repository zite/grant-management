import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, FileSearch, RotateCcw, Send } from 'lucide-react';
import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { saveTaskDraft, submitTask } from 'zitejs/api';
import { validateAnswers } from '@project/shared/forms/logic';
import type { Answers } from '@project/shared/forms/types';
import { AnswersView } from '@project/shared/ui/AnswersView';
import { FormRenderer } from '@project/shared/ui/FormRenderer';
import { Markdown } from '@project/shared/ui/Markdown';
import { SaveIndicator } from '../components/SaveIndicator';
import { SignInPrompt } from '../components/SignInPrompt';
import { Alert, BackLink, Button, Card, Container, EmptyState, LinkButton, PageSkeleton, ProgramGlyph, StatusPill } from '../components/ui';
import { useSession } from '../lib/auth';
import { mergeFieldChange } from '../lib/answers';
import { errorMessage, isNotFound } from '../lib/errors';
import { focusField } from '../lib/focus';
import { dueLabel, longDate, mediumDateTime } from '../lib/format';
import { qk, useTask, type TaskDetail } from '../lib/queries';
import { freeFormProblem } from '../lib/tasks';
import { uploadAnswerFile } from '../lib/upload';
import { readBackup, useAutosave } from '../lib/useAutosave';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export function TaskPage() {
  const { taskId } = useParams();
  const { user, isLoading } = useSession();
  const q = useTask(taskId);
  useDocumentTitle(q.data?.task.title ?? 'Request');

  if (isLoading) return <PageSkeleton variant="form" />;
  if (!user) return <SignInPrompt title="Sign in to complete this request" body="Sign in with the email you applied with to see what the program team needs." />;
  if (q.isPending) return <PageSkeleton variant="form" />;
  if (q.isError || !q.data) {
    return (
      <Container size="narrow" className="py-16">
        <EmptyState icon={FileSearch} title={isNotFound(q.error) ? "We couldn't find that request" : "This request didn't load"} action={<LinkButton to="/applications">My applications</LinkButton>}>
          {isNotFound(q.error) ? 'It may have been removed, or it belongs to a different account.' : errorMessage(q.error, 'Check your connection and try again.')}
        </EmptyState>
      </Container>
    );
  }
  return <TaskBody key={q.data.task.id} data={q.data} />;
}

const STATUS: Record<string, { label: string; tone: 'info' | 'warning' | 'success' | 'neutral' }> = {
  Open: { label: 'To do', tone: 'info' },
  Returned: { label: 'Needs changes', tone: 'warning' },
  Submitted: { label: 'Sent — awaiting review', tone: 'info' },
  Approved: { label: 'Approved', tone: 'success' },
};

function TaskBody({ data }: { data: TaskDetail }) {
  const { task, application } = data;
  const qc = useQueryClient();
  const storageKey = `grants:task:${task.id}`;
  const [restored] = useState(() => (task.canEdit ? readBackup<Answers>(storageKey, null) : null));
  const [answers, setAnswers] = useState<Answers>(() => restored ?? (task.answers as Answers));
  const [attempted, setAttempted] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const autosave = useAutosave<Answers>({
    save: value => saveTaskDraft({ id: task.id, answers: value }),
    storageKey: task.canEdit ? storageKey : null,
    onFatal: () => qc.invalidateQueries({ queryKey: qk.task(task.id) }),
  });

  const submit = useMutation({
    mutationFn: async () => {
      await autosave.flush().catch(() => undefined);
      return submitTask({ id: task.id, answers });
    },
    onSuccess: () => {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
      toast.success('Sent. The program team will review it and let you know if anything else is needed.');
      qc.invalidateQueries({ queryKey: qk.task(task.id) });
      qc.invalidateQueries({ queryKey: qk.application(application.id) });
      qc.invalidateQueries({ queryKey: qk.myApplications });
      qc.invalidateQueries({ queryKey: qk.me });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  });

  const errors = attempted ? validateAnswers(task.fields, answers) : {};
  const status = STATUS[task.status] ?? { label: task.status, tone: 'neutral' as const };
  const due = task.canEdit ? dueLabel(task.dueDate) : null;

  const onSubmit = () => {
    setAttempted(true);
    const problems = validateAnswers(task.fields, answers);
    const first = task.fields.find(f => problems[f.id]);
    if (first) {
      setProblem(Object.keys(problems).length === 1 ? 'One question needs your attention.' : `${Object.keys(problems).length} questions need your attention.`);
      focusField(first.id);
      return;
    }
    if (task.freeForm) {
      const p = freeFormProblem(answers);
      if (p) {
        setProblem(p);
        focusField('response');
        return;
      }
    }
    setProblem(null);
    submit.mutate();
  };

  return (
    <div className="pb-16">
      <div className="border-b bg-background">
        <Container size="narrow" className="py-6">
          <BackLink to={`/applications/${application.id}`}>{application.title || application.programName}</BackLink>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <ProgramGlyph icon={application.programIcon} color={application.programColor} name={application.programName} />
              <div className="min-w-0">
                <p className="truncate text-sm text-muted-foreground">
                  {application.programName}
                  {application.reference ? ` · ${application.reference}` : ''}
                </p>
                <h1 className="font-serif text-2xl font-semibold sm:text-3xl">{task.title}</h1>
                <p className="mt-1.5 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                  {task.requestedAt && <span>Requested {longDate(task.requestedAt)}</span>}
                  {due && <span className={due.tone === 'overdue' ? 'font-medium text-tone-danger' : due.tone === 'soon' ? 'text-tone-warning' : ''}>{due.label}</span>}
                </p>
              </div>
            </div>
            <StatusPill tone={status.tone} className="self-start">{status.label}</StatusPill>
          </div>
        </Container>
      </div>

      <Container size="narrow" className="space-y-6 pt-8">
        {task.status === 'Returned' && (
          <Alert tone="warning" icon={RotateCcw} title="The program team asked for changes">
            {task.reviewNote ? <p className="whitespace-pre-wrap">{task.reviewNote}</p> : 'Update your response below and send it again.'}
          </Alert>
        )}
        {task.status === 'Submitted' && (
          <Alert tone="info" icon={Send} title="Sent — thank you">
            You sent this {task.submittedAt ? mediumDateTime(task.submittedAt) : ''}. The program team will review it and let you know if anything else is needed.
          </Alert>
        )}
        {task.status === 'Approved' && (
          <Alert tone="success" icon={CheckCircle2} title="Approved">
            The program team reviewed and approved this{task.reviewedAt ? ` on ${longDate(task.reviewedAt)}` : ''}. Nothing more is needed.
          </Alert>
        )}

        {task.instructions && (
          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <ClipboardList className="h-5 w-5 text-primary" aria-hidden /> What we need
            </h2>
            <Markdown className="mt-3">{task.instructions}</Markdown>
          </Card>
        )}

        {task.canEdit ? (
          <Card className="p-5 sm:p-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-semibold">{task.freeForm ? 'Send your update' : task.formName ?? 'Your answers'}</h2>
              <SaveIndicator state={autosave.state} savedAt={autosave.savedAt} onRetry={autosave.retryNow} />
            </div>
            <form
              noValidate
              onSubmit={e => {
                e.preventDefault();
                onSubmit();
              }}
            >
              <FormRenderer
                fields={task.fields}
                answers={answers}
                onChange={(next, fieldId) => {
                  const merged = mergeFieldChange(answersRef.current, next, fieldId);
                  answersRef.current = merged;
                  setAnswers(merged);
                  setProblem(null);
                  autosave.change(merged);
                }}
                errors={errors}
                currency={data.currency}
                upload={uploadAnswerFile}
                idPrefix="task"
                eagerErrors
                size="lg"
              />
              {(problem || submit.isError) && (
                <Alert tone="danger" className="mt-7">
                  {problem ?? errorMessage(submit.error, "It wasn't sent. Check your connection and try again — your answers are saved.")}
                </Alert>
              )}
              <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">Your answers save as you go. The team sees them only when you send.</p>
                <Button type="submit" size="lg" loading={submit.isPending}>
                  <Send aria-hidden /> {task.status === 'Returned' ? 'Send again' : 'Send to the program team'}
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <section aria-labelledby="sent-heading">
            <h2 id="sent-heading" className="mb-4 text-lg font-semibold">What you sent</h2>
            <AnswersView fields={task.fields} answers={task.answers as Answers} currency={data.currency} />
          </section>
        )}
      </Container>
    </div>
  );
}
