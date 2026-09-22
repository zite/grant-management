import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, Check, CheckCircle2, Mail, MessageSquare, Pencil, Search, Send } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { submitApplication, type SubmitApplicationOutputType } from 'zitejs/api';
import { cn } from '@project/components/lib/utils';
import { checkEligibility, formSteps, validateAnswers } from '@project/shared/forms/logic';
import type { Answers } from '@project/shared/forms/types';
import { AnswersView } from '@project/shared/ui/AnswersView';
import { Markdown } from '@project/shared/ui/Markdown';
import { SignInPrompt } from '../components/SignInPrompt';
import { Alert, BackLink, Button, Card, Container, EmptyState, LinkButton, PageSkeleton, ProgramGlyph } from '../components/ui';
import { useSession } from '../lib/auth';
import { errorMessage, isNotFound } from '../lib/errors';
import { fullDateTime, mediumDateTime } from '../lib/format';
import { qk, useApplication, type ApplicationDetail } from '../lib/queries';
import { readBackup } from '../lib/useAutosave';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export function ReviewSubmitPage() {
  const { id } = useParams();
  const { user, isLoading } = useSession();
  const q = useApplication(id);
  const [confirmation, setConfirmation] = useState<SubmitApplicationOutputType | null>(null);
  useDocumentTitle(confirmation ? 'Application submitted' : 'Review and submit');

  if (isLoading) return <PageSkeleton />;
  if (!user) return <SignInPrompt />;
  if (confirmation && q.data) return <Confirmation data={q.data} result={confirmation} email={user.email} />;
  if (q.isPending) return <PageSkeleton />;
  if (q.isError || !q.data) {
    return (
      <Container size="narrow" className="py-16">
        <EmptyState icon={Search} title={isNotFound(q.error) ? "We couldn't find that application" : "Your application didn't load"} action={<LinkButton to="/applications">My applications</LinkButton>}>
          {errorMessage(q.error, 'Check your connection and try again.')}
        </EmptyState>
      </Container>
    );
  }
  if (q.data.application.status !== 'Draft') return <Navigate to={`/applications/${q.data.application.id}`} replace />;
  return <ReviewBody data={q.data} onSubmitted={setConfirmation} />;
}

function ReviewBody({ data, onSubmitted }: { data: ApplicationDetail; onSubmitted: (r: SubmitApplicationOutputType) => void }) {
  const { application: app, program, form } = data;
  const qc = useQueryClient();
  const answers = app.answers as Answers;
  const fields = form.fields;
  const [attested, setAttested] = useState(false);
  const [attestError, setAttestError] = useState<string | null>(null);
  const checkboxId = useId();
  const unsaved = useMemo(() => readBackup<Answers>(`grants:draft:${app.id}`, app.lastSavedAt), [app.id, app.lastSavedAt]);

  const steps = useMemo(() => formSteps(fields, answers), [fields, answers]);
  const problems = useMemo(() => {
    const errors = validateAnswers(fields, answers);
    const list: Array<{ fieldId: string; label: string; message: string; stepId: string; stepTitle: string }> = [];
    for (const s of steps) {
      for (const f of s.fields) {
        if (errors[f.id]) list.push({ fieldId: f.id, label: f.label, message: errors[f.id], stepId: s.id, stepTitle: s.title });
      }
    }
    for (const r of checkEligibility(fields, answers).reasons) {
      const s = steps.find(x => x.fields.some(f => f.id === r.fieldId));
      if (s) list.push({ fieldId: r.fieldId, label: s.fields.find(f => f.id === r.fieldId)?.label ?? '', message: r.message, stepId: s.id, stepTitle: s.title });
    }
    return list;
  }, [fields, answers, steps]);

  const submit = useMutation({
    mutationFn: () => submitApplication({ id: app.id }),
    onSuccess: res => {
      try {
        localStorage.removeItem(`grants:draft:${app.id}`);
      } catch {
        /* ignore */
      }
      onSubmitted(res);
      window.scrollTo({ top: 0 });
      qc.invalidateQueries({ queryKey: qk.application(app.id) });
      qc.invalidateQueries({ queryKey: qk.myApplications });
      qc.invalidateQueries({ queryKey: qk.me });
    },
  });

  const onSubmit = () => {
    if (!attested) {
      setAttestError('Tick the box to confirm your application is accurate before submitting.');
      document.getElementById(checkboxId)?.focus();
      return;
    }
    submit.mutate();
  };

  const canSubmit = app.canEdit && problems.length === 0;

  return (
    <div className="pb-16">
      <div className="border-b bg-background">
        <Container size="narrow" className="py-6">
          <BackLink to={`/applications/${app.id}?step=${steps[steps.length - 1]?.id ?? ''}`}>Back to editing</BackLink>
          <div className="mt-4 flex items-center gap-3">
            {program && <ProgramGlyph icon={program.icon} color={program.color} name={program.name} size="lg" />}
            <div className="min-w-0">
              <p className="truncate text-sm text-muted-foreground">{program?.name}</p>
              <h1 className="font-serif text-2xl font-semibold sm:text-3xl">Review and submit</h1>
            </div>
          </div>
          <p className="mt-3 text-[15px] text-muted-foreground">Check everything below. You can't change your answers after you submit.</p>
        </Container>
      </div>

      <Container size="narrow" className="space-y-6 pt-8">
        {unsaved && (
          <Alert tone="warning" title="Some of your latest changes haven't saved" action={<LinkButton to={`/applications/${app.id}`} size="sm" variant="secondary">Return to the form</LinkButton>}>
            Open the form again so they save, then come back here to submit.
          </Alert>
        )}
        {!app.canEdit && (
          <Alert tone="danger" title="This program is no longer accepting applications">
            {program?.deadline ? `The deadline was ${fullDateTime(program.deadline)}.` : 'Applications are closed.'}
          </Alert>
        )}

        {problems.length > 0 && (
          <section aria-labelledby="problems-heading" className="rounded-xl border border-tone-danger/25 bg-tone-danger/[0.05] p-5 sm:p-6">
            <h2 id="problems-heading" className="flex items-center gap-2 text-lg font-semibold">
              <AlertCircle className="h-5 w-5 text-tone-danger" aria-hidden />
              {problems.length === 1 ? 'One thing to fix before you submit' : `${problems.length} things to fix before you submit`}
            </h2>
            <ul className="mt-4 space-y-2">
              {problems.map(p => (
                <li key={`${p.fieldId}-${p.message}`}>
                  <Link
                    to={`/applications/${app.id}?step=${p.stepId}&focus=${p.fieldId}`}
                    className="group flex items-start gap-3 rounded-xl bg-background px-4 py-3 ring-1 ring-inset ring-border transition-colors hover:ring-tone-danger/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-muted-foreground">{p.stepTitle || 'Getting started'}</span>
                      <span className="block font-medium">{p.label}</span>
                      <span className="block text-sm text-tone-danger">{p.message}</span>
                    </span>
                    <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
                      Fix <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {steps.map(s => (
          <Card as="section" key={s.id} aria-labelledby={`sec-${s.id}`} className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b bg-subtle px-5 py-3.5">
              <h2 id={`sec-${s.id}`} className="text-[15px] font-semibold">
                {s.title || 'Getting started'}
              </h2>
              {app.canEdit && (
                <LinkButton to={`/applications/${app.id}?step=${s.id}`} variant="ghost" size="sm" aria-label={`Edit ${s.title || 'this section'}`}>
                  <Pencil aria-hidden /> Edit
                </LinkButton>
              )}
            </div>
            <div className="p-3 sm:p-4 [&_dl]:border-0 [&_dl]:shadow-none">
              <AnswersView fields={s.fields.map(f => (f.showIf ? { ...f, showIf: null } : f))} answers={answers} currency={data.currency} />
            </div>
          </Card>
        ))}

        <Card className="p-5 sm:p-6">
          <div className="flex gap-3">
            <input
              id={checkboxId}
              type="checkbox"
              checked={attested}
              onChange={e => {
                setAttested(e.target.checked);
                if (e.target.checked) setAttestError(null);
              }}
              aria-invalid={Boolean(attestError) || undefined}
              aria-describedby={attestError ? `${checkboxId}-error` : undefined}
              className="mt-1 h-5 w-5 shrink-0 cursor-pointer rounded border-input accent-[hsl(var(--primary))]"
            />
            <label htmlFor={checkboxId} className="cursor-pointer text-[15px] leading-relaxed">
              I confirm that the information in this application is accurate and complete to the best of my knowledge, and that I have permission to share everything I've uploaded.
            </label>
          </div>
          {attestError && (
            <p id={`${checkboxId}-error`} role="alert" className="ml-8 mt-2 text-sm text-tone-danger">
              {attestError}
            </p>
          )}
          {submit.isError && (
            <Alert tone="danger" className="mt-5" title="Your application wasn't submitted">
              {errorMessage(submit.error, 'Check your connection and try again. Your answers are saved.')}
            </Alert>
          )}
          <div className="mt-6 flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {program?.deadline && program.accepting ? `Deadline: ${fullDateTime(program.deadline)}` : app.lastSavedAt ? `Last saved ${mediumDateTime(app.lastSavedAt)}` : ''}
            </p>
            <Button size="lg" onClick={onSubmit} loading={submit.isPending} disabled={!canSubmit} className="sm:min-w-[12rem]">
              <Send aria-hidden /> Submit application
            </Button>
          </div>
          {!canSubmit && app.canEdit && <p className="mt-3 text-right text-sm text-muted-foreground">Fix the {problems.length === 1 ? 'item' : 'items'} listed above to submit.</p>}
        </Card>
      </Container>
    </div>
  );
}

function Confirmation({ data, result, email }: { data: ApplicationDetail; result: SubmitApplicationOutputType; email: string }) {
  const { application: app, program } = data;
  const headingId = useId();
  useEffect(() => {
    document.getElementById(headingId)?.focus();
  }, [headingId]);
  const steps = [
    { icon: Search, title: 'We review your application', body: program?.deadline && program.phase !== 'closed' ? `The team starts reviewing after the deadline on ${fullDateTime(program.deadline)}.` : 'The team reviews applications as they arrive.' },
    { icon: MessageSquare, title: 'We may ask a question', body: "If we need anything else, you'll get a message here in the portal and by email." },
    { icon: CheckCircle2, title: 'You hear about a decision', body: "We'll let you know by email, and your application's status here will update." },
  ];
  return (
    <Container size="narrow" className="py-12 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <Card className="overflow-hidden text-center">
          <div className="relative px-6 pb-8 pt-10 sm:px-10">
            <div className="color-wash pointer-events-none absolute inset-0 opacity-[0.08]" aria-hidden />
            <span className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-tone-success text-white shadow-md animate-pop dark:text-[hsl(240_10%_6%)]">
              <Check className="h-8 w-8" strokeWidth={3} aria-hidden />
            </span>
            <h1 id={headingId} tabIndex={-1} className="relative mt-6 font-serif text-3xl font-semibold outline-none">
              Application submitted
            </h1>
            <p className="relative mt-2 text-lg text-muted-foreground">
              Your application to {program?.name ?? 'the program'} is in.
            </p>
            <div className="relative mx-auto mt-6 inline-flex flex-col items-center rounded-xl border bg-background px-6 py-3">
              <span className="text-sm text-muted-foreground">Your reference number</span>
              <span className="font-mono font-serif text-2xl font-semibold tracking-tight">{result.reference}</span>
            </div>
            {result.confirmationMessage && <Markdown compact className="relative mx-auto mt-6 max-w-lg text-[15px] text-foreground/85">{result.confirmationMessage}</Markdown>}
            <p className={cn('relative mx-auto mt-4 flex max-w-lg items-center justify-center gap-2 text-sm text-muted-foreground')}>
              <Mail className="h-4 w-4 shrink-0" aria-hidden />
              {result.emailed ? `We emailed a confirmation to ${email}.` : 'Keep your reference number for your records — you can find this application any time under My applications.'}
            </p>
          </div>
          <div className="border-t bg-subtle px-6 py-7 text-left sm:px-10">
            <h2 className="text-lg font-semibold">What happens next</h2>
            <ol className="mt-4 space-y-4">
              {steps.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{i + 1}</span>
                  <div>
                    <p className="font-medium">{s.title}</p>
                    <p className="text-[15px] text-muted-foreground">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-col gap-2 border-t px-6 py-5 sm:flex-row sm:justify-center">
            <LinkButton to={`/applications/${app.id}`} size="lg">
              View your application <ArrowRight aria-hidden />
            </LinkButton>
            <LinkButton to="/" size="lg" variant="secondary">
              Browse more programs
            </LinkButton>
          </div>
        </Card>
      </div>
    </Container>
  );
}
