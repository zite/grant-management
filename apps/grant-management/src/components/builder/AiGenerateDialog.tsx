import { useMutation } from '@tanstack/react-query';
import { Banknote, CornerDownRight, EyeOff, Flag, Heading, RotateCcw, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { aiGenerateForm } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Checkbox } from '@project/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { cn } from '@project/components/lib/utils';
import type { FormField } from '@project/shared/forms/types';
import { FieldIcon } from '@project/shared/ui/FieldIcon';
import { errorMessage } from '../../lib/errors';
import { MOD } from '../../lib/hotkeys';
import { Kbd } from '../primitives/bits';
import { repairReferences } from '@project/shared/forms/builder';
import { typeLabel } from './summaries';
import { textareaClass } from './ui';

export type GeneratedForm = { fields: FormField[]; titleFieldId: string | null; amountFieldId: string | null };

const EXAMPLES: Record<string, string[]> = {
  Application: [
    'Project grants for community arts organizations, $5k–$25k, with a budget upload',
    'Scholarship for first-generation college students with essays and a transcript',
    'Emergency relief micro-grants for small nonprofits — keep it short',
  ],
  'Follow-up': [
    'Six-month progress report with spending to date and photos',
    'Final report with outcomes, stories and a budget-to-actuals upload',
    'Grant agreement with signature and bank details',
  ],
};

/**
 * Describe the form, review what comes back, then replace the form or add the
 * questions to the end. Unticked questions are left out.
 */
export function AiGenerateDialog({ open, onOpenChange, programId, kind, existingLabels, hasFields, onReplace, onAppend, onUseStarter }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programId: string;
  kind: 'Application' | 'Follow-up';
  existingLabels: string[];
  hasFields: boolean;
  onReplace: (result: GeneratedForm) => void;
  onAppend: (result: GeneratedForm) => void;
  onUseStarter: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<(GeneratedForm & { available: boolean }) | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const generate = useMutation({
    mutationFn: () => aiGenerateForm({ programId, prompt, kind, existingLabels: existingLabels.slice(0, 300) }),
    onSuccess: res => {
      setResult({ available: res.available, fields: res.fields as FormField[], titleFieldId: res.titleFieldId, amountFieldId: res.amountFieldId });
      setExcluded(new Set());
    },
  });

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setExcluded(new Set());
    generate.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = useMemo((): GeneratedForm | null => {
    if (!result) return null;
    const { fields } = repairReferences(result.fields.filter(f => !excluded.has(f.id)));
    const ids = new Set(fields.map(f => f.id));
    return { fields, titleFieldId: result.titleFieldId && ids.has(result.titleFieldId) ? result.titleFieldId : null, amountFieldId: result.amountFieldId && ids.has(result.amountFieldId) ? result.amountFieldId : null };
  }, [result, excluded]);
  const questionCount = chosen?.fields.filter(f => f.type !== 'section' && f.type !== 'content').length ?? 0;

  const submit = () => {
    if (prompt.trim() && !generate.isPending) generate.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={o => !generate.isPending && onOpenChange(o)}>
      <DialogContent className="flex max-h-[min(760px,92vh)] max-w-[620px] flex-col gap-0 p-0">
        <DialogHeader className="border-b px-5 pb-4 pt-5">
          <DialogTitle className="flex items-center gap-2 text-[15px]"><Sparkles className="h-4 w-4 text-tone-accent" /> Generate with AI</DialogTitle>
          <DialogDescription className="text-[13px]">
            Describe who applies and what you need to decide. The draft uses this program’s details, and nothing changes until you choose what to keep.
          </DialogDescription>
        </DialogHeader>

        {!result || !result.available ? (
          <div className="space-y-3 overflow-y-auto px-5 py-4">
            {result && !result.available ? (
              <div className="rounded-lg border bg-subtle px-4 py-4">
                <p className="text-[13px] font-medium">AI isn’t connected in this workspace</p>
                <p className="mt-1 text-[13px] text-muted-foreground">Start from the recommended {kind === 'Application' ? 'application' : 'follow-up'} form instead — it follows the same best practices and you can edit everything.</p>
                <Button size="sm" className="mt-3 h-8" onClick={() => { onUseStarter(); onOpenChange(false); }}>Use the recommended form</Button>
              </div>
            ) : (
              <>
                <textarea
                  autoFocus
                  value={prompt}
                  disabled={generate.isPending}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  maxLength={4000}
                  rows={4}
                  placeholder={kind === 'Application' ? 'e.g. Grants of up to $10,000 for neighborhood groups improving public spaces. Screen out for-profit businesses.' : 'e.g. A final report asking what changed, how funds were spent, and for photos.'}
                  className={cn(textareaClass, 'min-h-[104px] resize-y text-[13.5px]')}
                  aria-label="Describe the form"
                />
                {!generate.isPending && (
                  <div className="flex flex-wrap gap-1.5">
                    {EXAMPLES[kind].map(ex => (
                      <button key={ex} type="button" onClick={() => setPrompt(ex)} className="rounded-full border bg-background px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground">
                        {ex}
                      </button>
                    ))}
                  </div>
                )}
                {generate.isPending && (
                  <div className="space-y-2 pt-1" aria-live="polite">
                    <p className="text-[13px] text-muted-foreground">Drafting sections and questions… this can take up to a minute.</p>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2.5 rounded-md border px-3 py-2.5">
                        <div className="skeleton h-4 w-4 rounded" />
                        <div className="skeleton h-3" style={{ width: `${40 + ((i * 29) % 45)}%` }} />
                      </div>
                    ))}
                  </div>
                )}
                {generate.isError && <p role="alert" className="text-[13px] text-tone-danger">{errorMessage(generate.error, "The AI couldn't draft a form just now. Try again in a moment.")}</p>}
              </>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <div className="flex items-center justify-between px-2 pb-2 text-xs text-muted-foreground">
              <span>{questionCount} question{questionCount === 1 ? '' : 's'} selected</span>
              <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setResult(null)}>
                <RotateCcw className="h-3 w-3" /> Change description
              </button>
            </div>
            <ul className="space-y-px">
              {result.fields.map(f => {
                const off = excluded.has(f.id);
                const section = f.type === 'section';
                return (
                  <li key={f.id} className={cn(section && 'mt-3 first:mt-0')}>
                    <label className={cn('flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent', off && 'opacity-50')}>
                      <Checkbox
                        className="mt-0.5"
                        checked={!off}
                        onCheckedChange={v =>
                          setExcluded(s => {
                            const next = new Set(s);
                            if (v) next.delete(f.id);
                            else next.add(f.id);
                            return next;
                          })
                        }
                        aria-label={`Include ${f.label || typeLabel(f)}`}
                      />
                      <FieldIcon type={f.type} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-[13px] leading-5', section ? 'font-semibold' : '')}>
                          {f.type === 'content' ? <span className="text-muted-foreground">{(f.help ?? '').slice(0, 140)}</span> : f.label}
                          {f.required && <span className="text-tone-danger"> *</span>}
                        </span>
                        {!section && f.type !== 'content' && (
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted-foreground">
                            <span>{typeLabel(f)}</span>
                            {f.options?.length ? <span className="max-w-[320px] truncate">{f.options.map(o => o.label).join(' · ')}</span> : null}
                            {f.maxWords ? <span>{f.maxWords} words</span> : null}
                            {f.showIf && <span className="inline-flex items-center gap-0.5 text-tone-info"><CornerDownRight className="h-2.5 w-2.5" /> conditional</span>}
                            {f.eligibility && <span className="inline-flex items-center gap-0.5 text-tone-warning"><Flag className="h-2.5 w-2.5" /> screens eligibility</span>}
                            {f.hideFromReviewers && <span className="inline-flex items-center gap-0.5"><EyeOff className="h-2.5 w-2.5" /> hidden from reviewers</span>}
                            {result.titleFieldId === f.id && <span className="inline-flex items-center gap-0.5 text-tone-accent"><Heading className="h-2.5 w-2.5" /> title</span>}
                            {result.amountFieldId === f.id && <span className="inline-flex items-center gap-0.5 text-tone-success"><Banknote className="h-2.5 w-2.5" /> requested amount</span>}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <DialogFooter className="flex-row items-center gap-2 border-t px-5 py-3 sm:justify-between">
          {!result?.available ? (
            <>
              <span className="hidden text-xs text-muted-foreground sm:inline"><Kbd>{MOD}</Kbd> <Kbd>↵</Kbd> to generate</span>
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" size="sm" className="h-8" disabled={generate.isPending} onClick={() => onOpenChange(false)}>Cancel</Button>
                {!result && (
                  <Button size="sm" className="h-8 gap-1.5" disabled={!prompt.trim() || generate.isPending} onClick={submit}>
                    <Sparkles className="!h-3.5 !w-3.5" /> {generate.isPending ? 'Generating…' : 'Generate'}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="h-8" onClick={() => generate.mutate()} disabled={generate.isPending}>{generate.isPending ? 'Generating…' : 'Try again'}</Button>
              <div className="ml-auto flex gap-2">
                {hasFields && (
                  <Button variant="outline" size="sm" className="h-8" disabled={!questionCount} onClick={() => chosen && onAppend(chosen)}>Add to the end</Button>
                )}
                <Button size="sm" className="h-8" disabled={!questionCount} onClick={() => chosen && onReplace(chosen)}>{hasFields ? 'Replace form' : 'Use these questions'}</Button>
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
