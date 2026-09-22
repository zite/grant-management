import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Clock, Lock } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { saveDraft } from 'zitejs/api';
import { cn } from '@project/components/lib/utils';
import { checkEligibility, completion, formSteps, validateAnswers, type Step } from '@project/shared/forms/logic';
import type { Answers } from '@project/shared/forms/types';
import { FormRenderer } from '@project/shared/ui/FormRenderer';
import { Markdown } from '@project/shared/ui/Markdown';
import { SaveIndicator } from '../components/SaveIndicator';
import { Alert, BackLink, Button, Card, Container, ProgramGlyph, ProgressBar } from '../components/ui';
import { mergeFieldChange } from '../lib/answers';
import { errorMessage } from '../lib/errors';
import { focusField } from '../lib/focus';
import { deadlineInfo, fullDateTime } from '../lib/format';
import { qk, type ApplicationDetail } from '../lib/queries';
import { uploadAnswerFile } from '../lib/upload';
import { readBackup, useAutosave } from '../lib/useAutosave';

/**
 * A draft, one section at a time. Answers autosave a second after typing
 * stops; Continue checks only the current step, and every problem says what
 * to do about it. The step lives in the URL, so reload and back both work.
 */
export function DraftStepper({ data }: { data: ApplicationDetail }) {
  const { application: app, program, form } = data;
  const fields = form.fields;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const storageKey = `grants:draft:${app.id}`;
  const currency = data.currency;
  const editable = app.canEdit;

  const [restored] = useState(() => readBackup<Answers>(storageKey, app.lastSavedAt));
  const [answers, setAnswers] = useState<Answers>(() => restored ?? app.answers);
  const [attempted, setAttempted] = useState<Set<string>>(new Set());
  const [blocked, setBlocked] = useState<string | null>(null);
  const [stepsOpen, setStepsOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const autosave = useAutosave<Answers>({
    save: value => saveDraft({ id: app.id, answers: value }).then(res => {
      qc.setQueryData<ApplicationDetail>(qk.application(app.id), prev => (prev ? { ...prev, application: { ...prev.application, lastSavedAt: res.savedAt, title: res.title } } : prev));
      return res;
    }),
    storageKey: editable ? storageKey : null,
    onFatal: () => qc.invalidateQueries({ queryKey: qk.application(app.id) }),
  });

  // A copy newer than the server's (the tab closed mid-save) is put back and saved.
  const restoredOnce = useRef(false);
  useEffect(() => {
    if (restored && editable && !restoredOnce.current) {
      restoredOnce.current = true;
      autosave.change(restored);
      toast.success('We restored changes you made that hadn’t finished saving.');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = useMemo(() => formSteps(fields, answers), [fields, answers]);
  // Opening a draft with no step in the URL resumes at the first step that still needs answers.
  const [resumeId] = useState(() => {
    const initialSteps = formSteps(fields, restored ?? app.answers);
    const firstIncomplete = initialSteps.find(s => Object.keys(validateAnswers(fields, restored ?? app.answers, new Set(s.fields.map(f => f.id)))).length > 0);
    return (firstIncomplete ?? initialSteps[0])?.id ?? null;
  });
  const requested = params.get('step') ?? resumeId;
  const index = Math.max(0, steps.findIndex(s => s.id === requested));
  const step: Step | undefined = steps[index];
  const isLast = index === steps.length - 1;
  // formSteps has already applied every condition against the whole form; a step's own renderer can't see
  // questions on other steps, so it gets the resolved list without conditions.
  const stepFields = useMemo(() => (step ? step.fields.map(f => (f.showIf ? { ...f, showIf: null } : f)) : []), [step]);
  const progress = useMemo(() => completion(fields, answers), [fields, answers]);

  const [visited, setVisited] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const s of formSteps(fields, app.answers)) {
      if (s.fields.some(f => app.answers[f.id] !== undefined && app.answers[f.id] !== '')) initial.add(s.id);
    }
    return initial;
  });
  useEffect(() => {
    if (step) setVisited(v => (v.has(step.id) ? v : new Set(v).add(step.id)));
  }, [step?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const stepErrors = useCallback(
    (s: Step) => validateAnswers(fields, answers, new Set(s.fields.map(f => f.id))),
    [fields, answers],
  );
  const errors = step && attempted.has(step.id) ? stepErrors(step) : {};
  const completeSteps = new Set(steps.filter(s => visited.has(s.id) && Object.keys(stepErrors(s)).length === 0).map(s => s.id));

  const goTo = (id: string, opts: { replace?: boolean } = {}) => {
    setBlocked(null);
    setParams({ step: id }, { replace: opts.replace });
    setStepsOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => headingRef.current?.focus({ preventScroll: true }), 50);
  };

  // Arriving from the review page with "fix this": open the step, show its problems, and put the cursor there.
  const focusParam = params.get('focus');
  useEffect(() => {
    if (!focusParam || !step) return;
    setAttempted(a => new Set(a).add(step.id));
    // Not cancelled on cleanup: removing the param below re-runs this effect, and the focus must still happen.
    window.setTimeout(() => focusField(focusParam), 250);
    const next = new URLSearchParams(params);
    next.delete('focus');
    setParams(next, { replace: true });
  }, [focusParam, step?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const onChange = (next: Answers, fieldId: string) => {
    const merged = mergeFieldChange(answersRef.current, next, fieldId);
    answersRef.current = merged;
    setAnswers(merged);
    if (blocked) setBlocked(null);
    autosave.change(merged);
  };

  const [leaving, setLeaving] = useState(false);
  const next = async () => {
    if (!step) return;
    setAttempted(a => new Set(a).add(step.id));
    const problems = stepErrors(step);
    const firstError = step.fields.find(f => problems[f.id]);
    if (firstError) {
      const n = Object.keys(problems).length;
      setBlocked(n === 1 ? 'One question on this page needs your attention.' : `${n} questions on this page need your attention.`);
      focusField(firstError.id);
      return;
    }
    const ineligible = checkEligibility(fields, answers).reasons.find(r => step.fields.some(f => f.id === r.fieldId));
    if (ineligible) {
      setBlocked(`${ineligible.message} Change that answer to continue, or contact the program team if you have questions.`);
      focusField(ineligible.fieldId);
      return;
    }
    if (!isLast) {
      goTo(steps[index + 1].id);
      return;
    }
    setLeaving(true);
    try {
      await autosave.flush();
      navigate(`/applications/${app.id}/review`);
    } catch (e) {
      toast.error(errorMessage(e, "Your latest changes haven't saved yet. Check your connection and try again."));
    } finally {
      setLeaving(false);
    }
  };

  const saveAndExit = async () => {
    setLeaving(true);
    try {
      await autosave.flush();
      toast.success('Saved. Pick up where you left off any time.');
      navigate('/applications');
    } catch (e) {
      toast.error(errorMessage(e, "Your latest changes haven't saved yet. Check your connection and try again."));
    } finally {
      setLeaving(false);
    }
  };

  const deadline = program ? deadlineInfo(program) : null;

  const stepList = (
    <ol className="space-y-1">
      {steps.map((s, i) => {
        const current = i === index;
        const reachable = visited.has(s.id) || i <= index;
        const done = completeSteps.has(s.id) && !current;
        return (
          <li key={s.id}>
            <button
              type="button"
              disabled={!reachable}
              aria-current={current ? 'step' : undefined}
              onClick={() => goTo(s.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:cursor-default',
                current ? 'bg-primary/[0.08] font-semibold text-foreground' : reachable ? 'text-foreground hover:bg-accent' : 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                  done ? 'bg-tone-success text-white dark:text-[hsl(240_10%_6%)]' : current ? 'bg-primary text-primary-foreground' : 'border border-border bg-background text-muted-foreground',
                )}
                aria-hidden
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{s.title || 'Getting started'}</span>
              <span className="sr-only">{done ? ' (complete)' : current ? ' (current step)' : !reachable ? ' (not started)' : ''}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  return (
    <div className="pb-28 sm:pb-12">
      <div className="border-b bg-background">
        <Container size="form" className="py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <BackLink to="/applications">My applications</BackLink>
            {editable && <SaveIndicator state={autosave.state} savedAt={autosave.savedAt} serverSavedAt={app.lastSavedAt} onRetry={autosave.retryNow} />}
          </div>
          <div className="mt-4 flex items-center gap-3">
            {program && <ProgramGlyph icon={program.icon} color={program.color} name={program.name} />}
            <div className="min-w-0">
              <p className="truncate text-sm text-muted-foreground">{program?.name}</p>
              <h1 className="truncate text-xl font-semibold sm:text-2xl">{app.title || 'Your application'}</h1>
            </div>
          </div>
        </Container>
      </div>

      <Container size="form" className="pt-6">
        {program && !editable && (
          <Alert tone="danger" icon={Lock} title="This program is no longer accepting applications" className="mb-6">
            {program.deadline ? `The deadline was ${fullDateTime(program.deadline)}. ` : ''}You can still read your draft, but it can't be changed or submitted.
          </Alert>
        )}
        {program && editable && program.phase === 'closed' && program.allowLate && (
          <Alert tone="warning" title="The deadline has passed" className="mb-6">
            {program.name} is still accepting late applications, so submit as soon as you can.
          </Alert>
        )}
        {program && editable && program.phase === 'closing' && deadline && (
          <Alert tone={deadline.tone === 'danger' ? 'danger' : 'warning'} icon={Clock} title={deadline.label} className="mb-6">
            Submit by {fullDateTime(program.deadline)}. Your answers are saved as you go.
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-5">
              <div>
                <div className="mb-2 flex items-baseline justify-between text-sm">
                  <span className="font-medium">{Math.round(progress.ratio * 100)}% complete</span>
                  <span className="text-muted-foreground">
                    {progress.done} of {progress.total}
                  </span>
                </div>
                <ProgressBar value={progress.ratio} label="Application progress" />
                <p className="mt-1.5 text-xs text-muted-foreground">Required questions answered</p>
              </div>
              <nav aria-label="Application steps">{stepList}</nav>
              {editable && (
                <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={saveAndExit} disabled={leaving}>
                  Save and finish later
                </Button>
              )}
            </div>
          </aside>

          <div className="min-w-0">
            {/* Phones get a compact progress header with the step list folded away. */}
            <div className="mb-4 lg:hidden">
              <button
                type="button"
                onClick={() => setStepsOpen(o => !o)}
                aria-expanded={stepsOpen}
                aria-controls="mobile-steps"
                className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground">
                    Step {index + 1} of {steps.length} · {Math.round(progress.ratio * 100)}% complete
                  </p>
                  <ProgressBar value={(index + 1) / Math.max(1, steps.length)} className="mt-2 h-1.5" label="Step progress" />
                </div>
                <ChevronDown className={cn('h-5 w-5 shrink-0 text-muted-foreground transition-transform', stepsOpen && 'rotate-180')} aria-hidden />
              </button>
              {stepsOpen && (
                <nav id="mobile-steps" aria-label="Application steps" className="mt-2 rounded-xl border bg-card p-2 animate-fade-in">
                  {stepList}
                </nav>
              )}
            </div>

            {step ? (
              <Card className="p-5 sm:p-8">
                <p className="text-sm font-medium text-primary">
                  Step {index + 1} of {steps.length}
                </p>
                <h2 ref={headingRef} tabIndex={-1} className="mt-1 font-serif text-2xl font-semibold outline-none">
                  {step.title || 'Getting started'}
                </h2>
                {step.help && <Markdown compact className="mt-2 text-[15px] text-muted-foreground">{step.help}</Markdown>}
                {index === 0 && form.description && !step.help && <p className="mt-2 text-[15px] text-muted-foreground">{form.description}</p>}

                <form
                  className="mt-7"
                  noValidate
                  onSubmit={e => {
                    e.preventDefault();
                    void next();
                  }}
                >
                  <FormRenderer
                    key={step.id}
                    fields={stepFields}
                    answers={answers}
                    onChange={onChange}
                    errors={errors}
                    currency={currency}
                    upload={uploadAnswerFile}
                    disabled={!editable}
                    idPrefix="app"
                    showSections={false}
                    eagerErrors
                    size="lg"
                  />
                  {blocked && (
                    <Alert tone="danger" className="mt-7">
                      {blocked}
                    </Alert>
                  )}

                  <div className="no-print fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t bg-background/95 px-4 py-3 shadow-[0_-4px_16px_rgb(0_0_0/0.06)] backdrop-blur sm:static sm:mt-10 sm:border-t sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-6 sm:shadow-none sm:backdrop-blur-none">
                    {index > 0 ? (
                      <Button variant="secondary" size="lg" onClick={() => goTo(steps[index - 1].id)} className="px-4">
                        <ArrowLeft aria-hidden /> Back
                      </Button>
                    ) : (
                      <span />
                    )}
                    <div className="ml-auto flex items-center gap-3">
                      {editable && (
                        <Button variant="ghost" size="lg" className="hidden text-muted-foreground sm:inline-flex lg:hidden" onClick={saveAndExit} disabled={leaving}>
                          Save and exit
                        </Button>
                      )}
                      <Button type="submit" size="lg" loading={leaving && isLast} className="min-w-[9rem]">
                        {isLast ? 'Review application' : 'Continue'} <ArrowRight aria-hidden />
                      </Button>
                    </div>
                  </div>
                </form>
              </Card>
            ) : (
              <Card className="p-8 text-center text-muted-foreground">This application form has no questions yet. Please check back soon.</Card>
            )}
          </div>
        </div>
      </Container>
    </div>
  );
}
