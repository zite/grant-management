import { AlertTriangle, ArrowLeft, ArrowRight, Check, CircleCheck, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@project/components/ui/button';
import { cn } from '@project/components/lib/utils';
import { checkEligibility, completion, formSteps, validateAnswers } from '@project/shared/forms/logic';
import type { Answers } from '@project/shared/forms/types';
import { FormRenderer } from '@project/shared/ui/FormRenderer';
import { Markdown } from '@project/shared/ui/Markdown';
import { ProgressBar } from '../primitives/bits';
import type { Draft } from './draft';

const PHONE_LAYOUT = [
  '[data-device="phone"] [data-preview-frame] .sm\\:grid-cols-2 { grid-template-columns: minmax(0, 1fr) !important; }',
  '[data-device="phone"] [data-preview-frame] .sm\\:grid-cols-2 > .sm\\:col-span-2 { grid-column: auto !important; }',
  '[data-device="phone"] [data-preview-frame] .grid-cols-6 > .sm\\:col-span-3.col-span-6, [data-device="phone"] [data-preview-frame] .grid-cols-6 > .sm\\:col-span-4 { grid-column: span 6 / span 6 !important; }',
  '[data-device="phone"] [data-preview-frame] .grid-cols-6 > .sm\\:col-span-2 { grid-column: span 3 / span 3 !important; }',
].join('\n');

export type PreviewState = { answers: Answers; step: number; attempted: Set<number>; submitted: boolean };
export const emptyPreview = (): PreviewState => ({ answers: {}, step: 0, attempted: new Set(), submitted: false });

/**
 * The real applicant renderer, stepping through the draft exactly as the
 * portal will: conditions react as you answer, eligibility stops you, and
 * each step validates before moving on. Uploads are off and nothing is saved.
 */
export function Preview({ draft, device, currency, programName, submitLabel, state, setState }: {
  draft: Draft;
  device: 'desktop' | 'phone';
  currency: string;
  programName: string;
  submitLabel: string;
  state: PreviewState;
  setState: (updater: (s: PreviewState) => PreviewState) => void;
}) {
  const { answers, attempted, submitted } = state;
  const steps = useMemo(() => formSteps(draft.fields, answers), [draft.fields, answers]);
  const index = Math.min(state.step, Math.max(0, steps.length - 1));
  const step = steps[index];
  const topRef = useRef<HTMLDivElement>(null);
  const [touched, setTouched] = useState(false);

  // Every field in a step is visible by definition, so the renderer needn't re-resolve conditions that point at earlier steps.
  const stepFields = useMemo(() => (step ? step.fields.map(f => (f.showIf ? { ...f, showIf: null } : f)) : []), [step]);
  const stepIds = useMemo(() => new Set(step?.fields.map(f => f.id) ?? []), [step]);
  const errors = useMemo(() => (attempted.has(index) ? validateAnswers(draft.fields, answers, stepIds) : {}), [attempted, index, draft.fields, answers, stepIds]);
  const eligibility = useMemo(() => checkEligibility(draft.fields, answers), [draft.fields, answers]);
  const progress = useMemo(() => completion(draft.fields, answers), [draft.fields, answers]);
  const blockedHere = eligibility.reasons.filter(r => stepIds.has(r.fieldId));

  useEffect(() => {
    if (touched) topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [index, submitted]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (to: number) => {
    setTouched(true);
    setState(s => ({ ...s, step: to }));
  };
  const next = () => {
    const problems = validateAnswers(draft.fields, answers, stepIds);
    setState(s => ({ ...s, attempted: new Set(s.attempted).add(index) }));
    if (Object.keys(problems).length || blockedHere.length) {
      setTouched(true);
      window.setTimeout(() => document.querySelector('[data-preview-frame] [role="alert"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
      return;
    }
    if (index < steps.length - 1) go(index + 1);
    else {
      const all = validateAnswers(draft.fields, answers);
      if (Object.keys(all).length || !eligibility.eligible) {
        const firstBad = steps.findIndex(s => s.fields.some(f => all[f.id]));
        setState(s => ({ ...s, step: firstBad >= 0 ? firstBad : s.step, attempted: new Set(steps.map((_, i) => i)) }));
        return;
      }
      setTouched(true);
      setState(s => ({ ...s, submitted: true }));
    }
  };

  const phone = device === 'phone';
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-canvas" data-device={device}>
      {/* The renderer's columns follow the viewport, not its container; inside the phone frame, lay it out as a phone would. */}
      {phone && <style>{PHONE_LAYOUT}</style>}
      <div className={cn('mx-auto px-3 py-6 sm:py-8', phone ? 'w-full max-w-[430px]' : 'w-full max-w-[760px] sm:px-8')}>
        <div
          data-preview-frame
          className={cn(
            'overflow-hidden bg-background shadow-md transition-[max-width,border-radius] duration-300',
            phone ? 'mx-auto max-w-[390px] rounded-[28px] border-[8px] border-foreground/[0.08] ring-1 ring-border' : 'rounded-xl border',
          )}
        >
          <div ref={topRef} className={cn('scroll-mt-4', phone ? 'px-5 pb-6 pt-7' : 'px-6 pb-8 pt-7 sm:px-10')}>
            <p className="text-xs font-medium text-muted-foreground">{programName}</p>
            <h2 className={cn('mt-1 font-semibold tracking-[-0.01em]', phone ? 'text-[20px]' : 'text-[22px]')}>{draft.name || 'Untitled form'}</h2>
            {draft.description.trim() && <Markdown compact className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{draft.description}</Markdown>}

            {submitted ? (
              <div className="mt-8 flex flex-col items-center rounded-xl border bg-subtle px-6 py-10 text-center animate-fade-up">
                <CircleCheck className="h-9 w-9 text-tone-success" />
                <h3 className="mt-3 text-[16px] font-semibold">That would submit</h3>
                <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">Every required question is answered and nothing blocks eligibility. This is a preview — nothing was saved.</p>
                <Button variant="outline" size="sm" className="mt-5 h-8 gap-1.5" onClick={() => setState(() => emptyPreview())}>
                  <RotateCcw className="!h-3.5 !w-3.5" /> Start over
                </Button>
              </div>
            ) : !step ? (
              <p className="mt-8 rounded-lg border border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">
                {draft.fields.length ? 'No questions are visible with these answers.' : 'Add questions to preview the form.'}
              </p>
            ) : (
              <>
                <div className="mt-6">
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>Step {index + 1} of {steps.length}</span>
                    <span className="tabular-nums">{Math.round(progress.ratio * 100)}% complete</span>
                  </div>
                  <ProgressBar value={progress.ratio} className="mt-2" />
                  {steps.length > 1 && (
                    <ol className={cn('mt-3 flex gap-1.5 overflow-x-auto scrollbar-none', phone && 'hidden')}>
                      {steps.map((s, i) => {
                        const done = i < index;
                        return (
                          <li key={s.id} className="shrink-0">
                            <button
                              type="button"
                              onClick={() => i <= index && go(i)}
                              disabled={i > index}
                              className={cn(
                                'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors',
                                i === index ? 'border-primary bg-primary/[0.08] font-medium text-foreground' : done ? 'text-foreground hover:bg-accent' : 'text-muted-foreground',
                              )}
                            >
                              {done ? <Check className="h-3 w-3 text-tone-success" /> : <span className="tabular-nums">{i + 1}</span>}
                              <span className="max-w-[140px] truncate">{s.title || 'Start'}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>

                <div className="mt-6 border-t pt-6">
                  {step.title && <h3 className={cn('font-semibold tracking-tight', phone ? 'text-[16px]' : 'text-[17px]')}>{step.title}</h3>}
                  {step.help && <Markdown compact className="mt-1 text-[13.5px] text-muted-foreground">{step.help}</Markdown>}
                  <div className={cn(step.title || step.help ? 'mt-5' : '')}>
                    <FormRenderer
                      key={step.id}
                      idPrefix="preview"
                      fields={stepFields}
                      answers={answers}
                      errors={errors}
                      currency={currency}
                      showSections={false}
                      eagerErrors
                      onChange={nextAnswers => setState(s => ({ ...s, answers: nextAnswers, submitted: false }))}
                    />
                  </div>
                </div>

                {blockedHere.length > 0 && attempted.has(index) && (
                  <div role="alert" className="mt-6 flex gap-2.5 rounded-lg border border-tone-warning/30 bg-tone-warning/[0.07] px-3 py-2.5 text-[13px]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-tone-warning" />
                    <span>Applicants who answer this way can't continue. Change the answer above to keep previewing.</span>
                  </div>
                )}

                <div className="mt-8 flex items-center gap-2 border-t pt-5">
                  {index > 0 && (
                    <Button variant="outline" className="h-9 gap-1.5" onClick={() => go(index - 1)}>
                      <ArrowLeft className="!h-4 !w-4" /> Back
                    </Button>
                  )}
                  <Button className="ml-auto h-9 gap-1.5" onClick={next}>
                    {index < steps.length - 1 ? <>Continue <ArrowRight className="!h-4 !w-4" /></> : submitLabel}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">Preview · uploads are turned off and nothing is saved</p>
      </div>
    </div>
  );
}
