import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, HeartHandshake, Loader2, Mail, SearchX, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { startApplication } from 'zitejs/api';
import { checkEligibility, eligibilityFields, validateAnswers, type EligibilityResult } from '@project/shared/forms/logic';
import type { Answers, FormField } from '@project/shared/forms/types';
import { FormRenderer } from '@project/shared/ui/FormRenderer';
import { SignInPrompt } from '../components/SignInPrompt';
import { Alert, BackLink, Button, Card, Container, EmptyState, LinkButton, PageSkeleton, ProgramGlyph } from '../components/ui';
import { useSession } from '../lib/auth';
import { errorMessage, isNotFound } from '../lib/errors';
import { fullDateTime } from '../lib/format';
import { qk, useMyApplications, usePortal, useProgram } from '../lib/queries';
import { mergeFieldChange } from '../lib/answers';
import { focusField } from '../lib/focus';
import { useDocumentTitle } from '../lib/useDocumentTitle';

// Two renders (StrictMode, a double click) must never start two applications.
const inFlight = new Map<string, Promise<{ id: string; existing: boolean }>>();

function start(slug: string, eligibilityAnswers: Answers) {
  const existing = inFlight.get(slug);
  if (existing) return existing;
  const p = startApplication({ slug, eligibilityAnswers }).finally(() => setTimeout(() => inFlight.delete(slug), 1500));
  inFlight.set(slug, p);
  return p;
}

/**
 * The step between "I'd like to apply" and a draft: a quick eligibility check
 * when the form has one, so nobody writes a whole application that can't be
 * funded. The server checks the same answers again.
 */
export function ApplyPage() {
  const { slug } = useParams();
  const { user, isLoading } = useSession();
  const program = useProgram(slug);
  const mine = useMyApplications();
  useDocumentTitle(program.data ? `Apply · ${program.data.program.name}` : null);

  if (isLoading) return <PageSkeleton variant="form" />;
  if (!user) return <SignInPrompt title="Sign in to apply" body="Sign in with your email to start your application. Your answers save as you go, so you can finish later on any device." hashPath={`/programs/${slug}/apply`} />;
  if (program.isPending || mine.isPending) return <PageSkeleton variant="form" />;
  if (program.isError || !program.data) {
    return (
      <Container size="narrow" className="py-16">
        <EmptyState icon={SearchX} title="We couldn't find that program" action={<LinkButton to="/">See all programs</LinkButton>}>
          {isNotFound(program.error) ? 'It may have been unpublished.' : errorMessage(program.error, 'Check your connection and try again.')}
        </EmptyState>
      </Container>
    );
  }
  return <ApplyFlow slug={slug!} detail={program.data} />;
}

function ApplyFlow({ slug, detail }: { slug: string; detail: NonNullable<ReturnType<typeof useProgram>['data']> }) {
  const { program, form } = detail;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const mine = useMyApplications();
  const portal = usePortal();
  const currency = portal.data?.settings.currency ?? 'USD';
  const supportEmail = program.contactEmail ?? portal.data?.settings.supportEmail ?? null;

  const eligibility = useMemo(() => {
    const all = form?.fields ?? [];
    const ids = new Set(eligibilityFields(all).map(f => f.id));
    // Conditions that point outside the check can't be answered here, so those questions are simply shown.
    return all.filter(f => ids.has(f.id)).map(f => (f.showIf && !ids.has(f.showIf.fieldId) ? { ...f, showIf: null } : f)) as FormField[];
  }, [form]);

  const apps = (mine.data?.applications ?? []).filter(a => a.programId === program.id && a.status !== 'Withdrawn');
  const draft = apps.find(a => a.status === 'Draft');
  const submitted = apps.filter(a => a.status !== 'Draft');

  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempted, setAttempted] = useState(false);
  const [result, setResult] = useState<EligibilityResult | null>(null);

  const begin = useMutation({
    mutationFn: (eligibilityAnswers: Answers) => start(slug, eligibilityAnswers),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: qk.myApplications });
      qc.invalidateQueries({ queryKey: qk.me });
      navigate(`/applications/${res.id}`, { replace: true });
    },
  });

  // A draft already exists: go straight to it. No eligibility questions: start right away.
  const auto = useRef(false);
  useEffect(() => {
    if (auto.current || !form) return;
    if (draft) {
      auto.current = true;
      navigate(`/applications/${draft.id}`, { replace: true });
    } else if (eligibility.length === 0 && program.accepting && submitted.length < program.maxPerApplicant) {
      auto.current = true;
      begin.mutate({});
    }
  }, [draft, eligibility.length, form, program.accepting, program.maxPerApplicant, submitted.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const header = (
    <div className="flex items-center gap-3">
      <ProgramGlyph icon={program.icon} color={program.color} name={program.name} />
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">Applying to</p>
        <p className="truncate font-semibold">{program.name}</p>
      </div>
    </div>
  );

  if (!form) {
    return (
      <Container size="narrow" className="py-16">
        <EmptyState icon={SearchX} title="The application isn't ready yet" action={<LinkButton to={`/programs/${slug}`} variant="secondary">Back to the program</LinkButton>}>
          {program.name} doesn't have an application form yet. Please check back soon.
        </EmptyState>
      </Container>
    );
  }

  if (!draft && submitted.length >= program.maxPerApplicant) {
    return (
      <Container size="narrow" className="py-16">
        <EmptyState icon={ShieldCheck} title="You've already applied" action={<LinkButton to={`/applications/${submitted[0].id}`}>View your application</LinkButton>}>
          {program.maxPerApplicant === 1 ? `Each applicant can submit one application to ${program.name}.` : `You've submitted the most applications allowed for ${program.name}.`}
        </EmptyState>
      </Container>
    );
  }

  if (!program.accepting) {
    return (
      <Container size="narrow" className="py-16">
        <EmptyState icon={SearchX} title={program.phase === 'scheduled' ? 'Applications aren’t open yet' : 'Applications are closed'} action={<LinkButton to="/" variant="secondary">See open programs</LinkButton>}>
          {program.phase === 'scheduled' && program.opensAt
            ? `${program.name} opens for applications ${fullDateTime(program.opensAt)}.`
            : program.deadline
              ? `${program.name} closed ${fullDateTime(program.deadline)}.`
              : `${program.name} isn't accepting applications right now.`}
        </EmptyState>
      </Container>
    );
  }

  if (draft || eligibility.length === 0) {
    return (
      <Container size="narrow" className="py-16">
        <div className="mx-auto max-w-md text-center" role="status">
          {begin.isError ? (
            <Alert tone="danger" title="We couldn't start your application" action={<Button variant="secondary" size="sm" onClick={() => begin.mutate({})}>Try again</Button>}>
              {errorMessage(begin.error, 'Check your connection and try again.')}
            </Alert>
          ) : (
            <>
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" aria-hidden />
              <p className="mt-4 text-[15px] text-muted-foreground">Setting up your application…</p>
            </>
          )}
        </div>
      </Container>
    );
  }

  const check = () => {
    setAttempted(true);
    const problems = validateAnswers(eligibility, answers);
    setErrors(problems);
    const first = eligibility.find(f => problems[f.id]);
    if (first) {
      focusField(first.id);
      return;
    }
    const r = checkEligibility(eligibility, answers);
    setResult(r);
    if (r.eligible) begin.mutate(answers);
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (result && !result.eligible) {
    return (
      <Container size="narrow" className="py-10 sm:py-14">
        <div className="mx-auto max-w-2xl animate-fade-up">
          <BackLink to={`/programs/${slug}`}>{program.name}</BackLink>
          <Card className="mt-6 overflow-hidden">
            <div className="border-b bg-subtle px-6 py-5">{header}</div>
            <div className="p-6 sm:p-8">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-tone-warning/10 text-tone-warning">
                <HeartHandshake className="h-6 w-6" aria-hidden />
              </span>
              <h1 className="mt-5 font-serif text-2xl font-semibold">This program isn't the right fit this time</h1>
              <p className="mt-2 text-[15px] text-muted-foreground">Thank you for checking before you applied. Based on your answers:</p>
              <ul className="mt-4 space-y-3">
                {result.reasons.map(r => (
                  <li key={r.fieldId} className="rounded-xl border border-tone-warning/25 bg-tone-warning/[0.06] px-4 py-3 text-[15px]">
                    <p className="text-sm font-medium text-muted-foreground">{eligibility.find(f => f.id === r.fieldId)?.label}</p>
                    <p className="mt-1 text-foreground">{r.message}</p>
                  </li>
                ))}
              </ul>
              {supportEmail && (
                <p className="mt-5 flex items-start gap-2 text-[15px] text-muted-foreground">
                  <Mail className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                  <span>
                    Think this doesn't describe your situation? Email{' '}
                    <a href={`mailto:${supportEmail}?subject=${encodeURIComponent(`Eligibility question: ${program.name}`)}`} className="font-medium text-primary underline-offset-2 hover:underline">
                      {supportEmail}
                    </a>{' '}
                    and a person will get back to you.
                  </span>
                </p>
              )}
              <div className="mt-7 flex flex-col gap-2 sm:flex-row">
                <Button variant="secondary" onClick={() => setResult(null)}>
                  Change my answers
                </Button>
                <LinkButton to="/">Browse other programs</LinkButton>
              </div>
            </div>
          </Card>
        </div>
      </Container>
    );
  }

  return (
    <Container size="narrow" className="py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <BackLink to={`/programs/${slug}`}>{program.name}</BackLink>
        <Card className="mt-6 overflow-hidden animate-fade-up">
          <div className="border-b bg-subtle px-6 py-5">{header}</div>
          <div className="p-6 sm:p-8">
            <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-faint">Before you start</p>
            <h1 className="mt-2 font-serif text-2xl font-semibold">Check that you're eligible</h1>
            <p className="mt-2 text-[15px] text-muted-foreground">
              {eligibility.length === 1 ? 'One quick question' : `${eligibility.length} quick questions`} to make sure this program is a fit. It takes under a minute, and your answers carry into the application.
            </p>
            <form
              className="mt-7"
              noValidate
              onSubmit={e => {
                e.preventDefault();
                check();
              }}
            >
              <FormRenderer
                fields={eligibility}
                answers={answers}
                onChange={(next, fieldId) => {
                  setAnswers(prev => {
                    const merged = mergeFieldChange(prev, next, fieldId);
                    if (attempted) setErrors(validateAnswers(eligibility, merged));
                    return merged;
                  });
                }}
                errors={errors}
                currency={currency}
                idPrefix="elig"
                showSections={false}
                size="lg"
              />
              {begin.isError && (
                <Alert tone="danger" className="mt-6" title="We couldn't start your application">
                  {errorMessage(begin.error, 'Check your connection and try again.')}
                </Alert>
              )}
              <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
                <Link to={`/programs/${slug}`} className="text-center text-[15px] font-medium text-muted-foreground hover:text-foreground">
                  Cancel
                </Link>
                <Button type="submit" size="lg" loading={begin.isPending}>
                  Check and continue <ArrowRight aria-hidden />
                </Button>
              </div>
            </form>
          </div>
        </Card>
      </div>
    </Container>
  );
}
