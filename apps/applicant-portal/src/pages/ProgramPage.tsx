import { ArrowRight, CalendarCheck, CalendarClock, CheckCircle2, CircleDollarSign, Clock, FileUp, ListChecks, Mail, SearchX, ShieldQuestion, Tag, Timer } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cn } from '@project/components/lib/utils';
import { eligibilityFields, formSteps } from '@project/shared/forms/logic';
import { FILE_KINDS, isInputField, type FormField } from '@project/shared/forms/types';
import { Markdown } from '@project/shared/ui/Markdown';
import { DeadlineText } from '../components/program';
import { Alert, BackLink, Button, Card, Container, EmptyState, LinkButton, PageSkeleton } from '../components/ui';
import { useSession } from '../lib/auth';
import { errorMessage, isNotFound } from '../lib/errors';
import { awardLabel, fullDateTime, longDate, plural } from '../lib/format';
import { useMyApplications, usePortal, useProgram, type PublicProgramDetail } from '../lib/queries';
import { useDocumentTitle } from '../lib/useDocumentTitle';

type Program = PublicProgramDetail['program'];

export function ProgramPage() {
  const { slug } = useParams();
  const q = useProgram(slug);
  const portal = usePortal();
  useDocumentTitle(q.data?.program.name ?? (q.isError ? 'Program not found' : null));

  if (q.isPending) return <PageSkeleton />;
  if (q.isError || !q.data) {
    return (
      <Container size="narrow" className="py-16">
        <EmptyState
          icon={SearchX}
          title={isNotFound(q.error) ? "We couldn't find that program" : "This program didn't load"}
          action={
            <>
              {!isNotFound(q.error) && <Button variant="secondary" onClick={() => q.refetch()}>Try again</Button>}
              <LinkButton to="/">See all programs</LinkButton>
            </>
          }
        >
          {isNotFound(q.error) ? 'It may have been unpublished, or the link may be mistyped.' : errorMessage(q.error, 'Check your connection and try again.')}
        </EmptyState>
      </Container>
    );
  }

  const { program, form } = q.data;
  const currency = portal.data?.settings.currency ?? 'USD';
  const fields = form?.fields ?? [];

  return (
    <div className="pb-24 lg:pb-0">
      <header className="relative overflow-hidden border-b bg-background">
        {program.coverImageUrl && (
          <div className="absolute inset-0" aria-hidden>
            <img src={program.coverImageUrl} alt="" className="h-full w-full object-cover opacity-20 dark:opacity-15" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/40" />
          </div>
        )}
        <Container className="relative pb-11 pt-8 sm:pb-14">
          <BackLink to="/">All programs</BackLink>
          <div className="mt-8 max-w-3xl">
            <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-faint">{program.type}</p>
            <h1 className="mt-3 font-serif text-4xl font-semibold leading-[1.1] sm:text-[42px]">{program.name}</h1>
            {program.summary && <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{program.summary}</p>}
          </div>
        </Container>
      </header>

      <Container className="py-10">
        <div className="mb-10 lg:hidden">
          <KeyFacts program={program} currency={currency} />
        </div>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-12">
            {program.description && (
              <section aria-labelledby="about-heading">
                <h2 id="about-heading" className="font-serif text-2xl font-semibold">About this program</h2>
                <Markdown className="mt-4">{program.description}</Markdown>
              </section>
            )}
            {program.eligibility && (
              <section aria-labelledby="eligibility-heading">
                <h2 id="eligibility-heading" className="font-serif text-2xl font-semibold">Who can apply</h2>
                <Card className="mt-4 p-5 sm:p-6">
                  <Markdown>{program.eligibility}</Markdown>
                </Card>
              </section>
            )}
            {form && <WhatYoullNeed fields={fields} description={form.description} />}
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-4">
              <KeyFacts program={program} currency={currency} />
              <Card className="p-5">
                <ApplyCta program={program} hasForm={Boolean(form)} />
              </Card>
            </div>
          </aside>
        </div>
      </Container>

      <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-3 shadow-[0_-4px_16px_rgb(0_0_0/0.06)] backdrop-blur lg:hidden">
        <ApplyCta program={program} hasForm={Boolean(form)} compact />
      </div>
    </div>
  );
}

function Fact({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-[15px] font-medium text-foreground">{children}</dd>
      </div>
    </div>
  );
}

function KeyFacts({ program, currency }: { program: Program; currency: string }) {
  const award = awardLabel(program.awardMin, program.awardMax, currency, 'range');
  return (
    <Card as="section" aria-label="Key facts" className="p-5">
      <dl className="divide-y">
        {program.phase === 'scheduled' && program.opensAt ? (
          <Fact icon={CalendarClock} label="Opens">
            {fullDateTime(program.opensAt)}
          </Fact>
        ) : null}
        <Fact icon={program.deadline ? CalendarCheck : Timer} label="Deadline">
          {program.deadline ? (
            <>
              <span className="block">{fullDateTime(program.deadline)}</span>
              {program.phase !== 'scheduled' && <DeadlineText program={program} className="mt-1 text-sm" iconless />}
            </>
          ) : (
            <>
              <span className="block">No deadline</span>
              <span className="mt-0.5 block text-sm font-normal text-muted-foreground">Reviewed on a rolling basis</span>
            </>
          )}
        </Fact>
        {program.phase !== 'scheduled' && program.opensAt && (
          <Fact icon={Clock} label="Opened">
            {longDate(program.opensAt)}
          </Fact>
        )}
        {award && (
          <Fact icon={CircleDollarSign} label={program.type === 'Grant' ? 'Grant size' : 'Award'}>
            {award}
          </Fact>
        )}
        <Fact icon={Tag} label="Program type">
          {program.type}
        </Fact>
        {program.contactEmail && (
          <Fact icon={Mail} label="Questions?">
            <a href={`mailto:${program.contactEmail}`} className="break-all text-primary underline-offset-2 hover:underline">
              {program.contactEmail}
            </a>
          </Fact>
        )}
      </dl>
    </Card>
  );
}

function kindsText(accept: string[] | undefined) {
  if (!accept?.length) return 'Any file type';
  return accept.map(k => FILE_KINDS[k]?.label ?? k).join(', ');
}

function WhatYoullNeed({ fields, description }: { fields: FormField[]; description: string }) {
  const steps = formSteps(fields, {}, { includeHidden: true }).filter(s => s.title);
  const eligibility = eligibilityFields(fields);
  const uploads = fields.filter(f => f.type === 'file');
  const required = uploads.filter(f => f.required);
  const optional = uploads.filter(f => !f.required);
  const questionCount = fields.filter(isInputField).length;

  return (
    <section aria-labelledby="need-heading">
      <h2 id="need-heading" className="font-serif text-2xl font-semibold">What you'll need</h2>
      <p className="mt-2 text-[15px] text-muted-foreground">
        {description ? `${description} ` : ''}The application has {plural(questionCount, 'question')}
        {steps.length > 1 ? ` in ${steps.length} sections` : ''}. You can save and come back at any time.
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {steps.length > 0 && (
          <Card className="p-5">
            <h3 className="flex items-center gap-2 font-semibold">
              <ListChecks className="h-[18px] w-[18px] text-muted-foreground" aria-hidden /> Sections
            </h3>
            <ol className="mt-3 space-y-2">
              {steps.map((s, i) => (
                <li key={s.id} className="flex items-baseline gap-3 text-[15px]">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0">
                    {s.title}
                    <span className="ml-1.5 text-sm text-muted-foreground">· {plural(s.fields.filter(isInputField).length, 'question')}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        )}
        <Card className="p-5">
          <h3 className="flex items-center gap-2 font-semibold">
            <FileUp className="h-[18px] w-[18px] text-muted-foreground" aria-hidden /> Documents to upload
          </h3>
          {uploads.length === 0 ? (
            <p className="mt-3 text-[15px] text-muted-foreground">No uploads needed — just your answers.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {[...required, ...optional].map(f => (
                <li key={f.id} className="text-[15px]">
                  <span className="flex items-baseline gap-2">
                    <CheckCircle2 className={cn('h-4 w-4 shrink-0 translate-y-0.5', f.required ? 'text-tone-success' : 'text-muted-foreground')} aria-hidden />
                    <span>
                      <span className="font-medium">{f.label}</span>
                      <span className="ml-1.5 text-sm text-muted-foreground">{f.required ? 'Required' : 'Optional'}</span>
                    </span>
                  </span>
                  <span className="ml-6 block text-sm text-muted-foreground">
                    {kindsText(f.accept)}
                    {f.maxSizeMb ? ` · up to ${f.maxSizeMb} MB` : ''}
                    {f.maxFiles && f.maxFiles > 1 ? ` · up to ${f.maxFiles} files` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {eligibility.length > 0 && (
        <p className="mt-4 flex items-start gap-2 text-[15px] text-muted-foreground">
          <ShieldQuestion className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <span>Before you start, {eligibility.length === 1 ? 'one quick question checks' : `${eligibility.length} quick questions check`} that the program is a fit — so you don't spend time on an application that can't be funded.</span>
        </p>
      )}
    </section>
  );
}

/** Start, continue or view — whatever this person can actually do right now. */
function ApplyCta({ program, hasForm, compact }: { program: Program; hasForm: boolean; compact?: boolean }) {
  const { user, signIn } = useSession();
  const navigate = useNavigate();
  const mine = useMyApplications();
  const apps = (mine.data?.applications ?? []).filter(a => a.programId === program.id && a.status !== 'Withdrawn');
  const draft = apps.find(a => a.status === 'Draft');
  const submitted = apps.filter(a => a.status !== 'Draft');
  const max = program.maxPerApplicant;
  const applyPath = `/programs/${program.slug}/apply`;
  const lateNote = program.phase === 'closed' && program.allowLate;

  let button: ReactNode;
  let note: ReactNode = null;

  if (user && mine.isPending) {
    button = <div className="skeleton h-12 w-full rounded-lg" aria-hidden />;
  } else if (draft) {
    button = (
      <LinkButton to={`/applications/${draft.id}`} size="lg" className="w-full">
        {program.accepting ? 'Continue your draft' : 'View your draft'} <ArrowRight aria-hidden />
      </LinkButton>
    );
    note = draft.progress ? `${Math.round(draft.progress.ratio * 100)}% complete · saved automatically` : null;
    if (!program.accepting) note = 'This program is closed, so your draft can no longer be submitted.';
  } else if (submitted.length >= max) {
    button = (
      <LinkButton to={`/applications/${submitted[0].id}`} size="lg" variant={compact ? 'primary' : 'secondary'} className="w-full">
        View your application
      </LinkButton>
    );
    note = `You applied${submitted[0].reference ? ` (${submitted[0].reference})` : ''}. ${max === 1 ? 'Each applicant can submit one application.' : `You've submitted the most allowed (${max}).`}`;
  } else if (!hasForm) {
    button = <Button size="lg" className="w-full" disabled>Not open for applications yet</Button>;
    note = 'The application form isn’t ready yet.';
  } else if (program.phase === 'scheduled') {
    button = <Button size="lg" className="w-full" disabled>Opens {program.opensAt ? longDate(program.opensAt) : 'soon'}</Button>;
    note = program.opensAt ? `Applications open ${fullDateTime(program.opensAt)}.` : null;
  } else if (!program.accepting) {
    button = <Button size="lg" className="w-full" disabled>Applications closed</Button>;
    note = program.deadline ? `This program closed ${fullDateTime(program.deadline)}.` : 'This program isn’t accepting applications.';
  } else {
    button = (
      <Button size="lg" className="w-full" onClick={() => (user ? navigate(applyPath) : signIn(applyPath))}>
        {submitted.length > 0 ? 'Start another application' : 'Start application'} <ArrowRight aria-hidden />
      </Button>
    );
    note = user ? 'Your answers save automatically as you go.' : 'You’ll sign in with your email first, so you can save and come back.';
    if (submitted.length > 0) note = `You've submitted ${submitted.length} of ${max} allowed applications.`;
  }

  if (compact) {
    return (
      <div className="mx-auto flex max-w-page items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{program.name}</p>
          <DeadlineText program={program} className="text-xs" iconless />
        </div>
        <div className="w-auto shrink-0 [&>*]:w-auto">{button}</div>
      </div>
    );
  }
  return (
    <div>
      {lateNote && (
        <Alert tone="warning" className="mb-4 px-3 py-3" title="The deadline has passed">
          Late applications are still being accepted, but apply as soon as you can.
        </Alert>
      )}
      {button}
      {note && <p className="mt-3 text-center text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}
