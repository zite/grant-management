import { ChevronDown, Compass, Copy, FilePlus2, GraduationCap, HandCoins, Landmark, Megaphone, Shapes, Sparkles, Trophy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveProgram } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Input } from '@project/components/ui/input';
import { cn } from '@project/components/lib/utils';
import { starterApplicationForm } from '@project/shared/forms/catalog';
import { isInputField } from '@project/shared/forms/types';
import { PROGRAM_KEY_PATTERN, PROGRAM_TYPE_ABOUT, deriveProgramKey } from '@project/shared/programSetup';
import { PROGRAM_TYPES } from '@project/shared/status';
import { plural } from '../../lib/format';
import { useWorkspace } from '../../lib/workspace';
import { ProgramPicker } from '../pickers/pickers';
import { Glyph } from '../primitives/bits';
import { DateTimeInput, Field, TimeZoneNote, inputClass } from './fields';
import { useProgramMutation } from './programData';

const TYPE_ICON: Record<string, ReactNode> = {
  Grant: <HandCoins />,
  Scholarship: <GraduationCap />,
  Fellowship: <Compass />,
  Award: <Trophy />,
  Residency: <Landmark />,
  'Open call': <Megaphone />,
  Other: <Shapes />,
};

type StartFrom = 'recommended' | 'copy' | 'blank';

function Choice({ selected, onSelect, icon, title, description, children }: { selected: boolean; onSelect: () => void; icon: ReactNode; title: string; description: ReactNode; children?: ReactNode }) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={e => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'cursor-pointer rounded-lg border px-3 py-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-primary/60 bg-primary/[0.04] ring-1 ring-primary/40' : 'hover:border-foreground/20 hover:bg-accent/40',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', selected ? 'border-primary' : 'border-input')} aria-hidden>
          {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
        </span>
        <span className={cn('mt-px shrink-0 [&_svg]:h-4 [&_svg]:w-4', selected ? 'text-primary' : 'text-muted-foreground')}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">{title}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * A new program in one step: what it is, what references look like, and what
 * it starts from. It lands on the application page settings, because the
 * portal description is the next thing anyone writes.
 */
export function CreateProgramDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const run = useProgramMutation();
  const [name, setName] = useState('');
  const [type, setType] = useState('Grant');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [startFrom, setStartFrom] = useState<StartFrom>('recommended');
  const [copyOf, setCopyOf] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setType('Grant');
    setKey('');
    setKeyTouched(false);
    setDeadline(null);
    setStartFrom('recommended');
    setCopyOf(null);
    setSubmitted(false);
  }, [open]);

  const effectiveKey = keyTouched ? key : name.trim() ? deriveProgramKey(name) : '';
  const keyTaken = effectiveKey ? ws.programByKey.get(effectiveKey) : undefined;
  const keyError = !effectiveKey ? (submitted ? 'Choose a key' : null) : !PROGRAM_KEY_PATTERN.test(effectiveKey) ? 'Use 2–8 letters or digits' : keyTaken ? `${keyTaken.name} already uses ${effectiveKey}` : null;
  const nameError = submitted && !name.trim() ? 'Name the program' : null;
  const copyError = submitted && startFrom === 'copy' && !copyOf ? 'Choose a program to copy' : null;
  const deadlineError = deadline && Date.parse(deadline) <= Date.now() ? 'That’s in the past — applicants would see the program as closed' : null;

  const starter = useMemo(() => {
    const s = starterApplicationForm(type);
    const inputs = s.fields.filter(isInputField);
    const sections = s.fields.filter(f => f.type === 'section').map(f => f.label.toLowerCase());
    return { count: inputs.length, sections };
  }, [type]);
  const source = copyOf ? ws.programById.get(copyOf) : undefined;

  const submit = async () => {
    setSubmitted(true);
    if (!name.trim() || keyError || (startFrom === 'copy' && !copyOf) || saving) {
      if (!name.trim()) nameRef.current?.focus();
      return;
    }
    setSaving(true);
    const res = await run(
      () =>
        saveProgram({
          action: 'create',
          name: name.trim(),
          type,
          key: effectiveKey,
          deadline,
          startFrom: startFrom === 'copy' && copyOf ? { copyOf } : startFrom === 'blank' ? 'blank' : 'recommended',
        }),
      { success: `Created ${name.trim()} as a draft`, error: "Couldn't create the program" },
    );
    setSaving(false);
    if (res?.id) {
      onOpenChange(false);
      navigate(`/programs/${res.id}/settings/application`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-[580px] gap-0 overflow-y-auto p-0">
        <form
          onSubmit={e => {
            e.preventDefault();
            submit();
          }}
        >
          <DialogHeader className="px-5 pb-3 pt-5">
            <DialogTitle className="text-[15px]">New program</DialogTitle>
            <DialogDescription className="text-[13px]">It starts as a draft. Nothing is visible to applicants until you publish.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 pb-5">
            <Field label="Name" htmlFor="np-name" error={nameError}>
              <Input id="np-name" ref={nameRef} autoFocus value={name} maxLength={120} onChange={e => setName(e.target.value)} placeholder="e.g. Spring Arts Grants 2027" className={inputClass} />
            </Field>

            <Field label="Type">
              <div role="radiogroup" aria-label="Program type" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {PROGRAM_TYPES.map(t => {
                  const on = t === type;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      title={PROGRAM_TYPE_ABOUT[t]}
                      onClick={() => setType(t)}
                      className={cn(
                        'flex h-[58px] flex-col items-start justify-between rounded-lg border px-2.5 py-2 text-left text-[12.5px] transition-colors [&_svg]:h-4 [&_svg]:w-4',
                        on ? 'border-primary/60 bg-primary/[0.05] font-medium text-foreground ring-1 ring-primary/40' : 'text-muted-foreground hover:border-foreground/20 hover:bg-accent/40 hover:text-foreground',
                      )}
                    >
                      <span className={cn(on ? 'text-primary' : 'text-muted-foreground')}>{TYPE_ICON[t]}</span>
                      {t}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{PROGRAM_TYPE_ABOUT[type]}.</p>
            </Field>

            <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
              <Field label="Key" htmlFor="np-key" error={keyError} hint={effectiveKey && !keyError ? `References look like ${effectiveKey}-12` : undefined}>
                <Input
                  id="np-key"
                  value={effectiveKey}
                  maxLength={8}
                  onChange={e => {
                    setKeyTouched(true);
                    setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
                  }}
                  placeholder="ARTS"
                  className={cn(inputClass, 'font-mono uppercase tracking-wide')}
                />
              </Field>
              <Field label="Deadline" htmlFor="np-deadline" error={deadlineError} hint={deadline ? <TimeZoneNote /> : 'Optional — leave empty for rolling applications.'}>
                <DateTimeInput id="np-deadline" value={deadline} onChange={setDeadline} defaultTime="23:59" aria-label="Deadline" />
              </Field>
            </div>

            <Field label="Start from">
              <div role="radiogroup" aria-label="Start from" className="space-y-1.5">
                <Choice
                  selected={startFrom === 'recommended'}
                  onSelect={() => setStartFrom('recommended')}
                  icon={<Sparkles />}
                  title={`Recommended form for a ${type === 'Other' || type === 'Open call' ? 'program' : type.toLowerCase()}`}
                  description={`${plural(starter.count, 'question')} covering ${starter.sections.join(', ')} — edit anything afterwards.`}
                />
                <Choice
                  selected={startFrom === 'copy'}
                  onSelect={() => setStartFrom('copy')}
                  icon={<Copy />}
                  title="Copy an existing program"
                  description="Its forms, pipeline, rubrics and program emails. Submissions and people aren’t copied."
                >
                  {startFrom === 'copy' && (
                    <div className="mt-2" onClick={e => e.stopPropagation()}>
                      <ProgramPicker
                        value={copyOf}
                        onChange={v => setCopyOf(v)}
                        open={pickerOpen}
                        onOpenChange={setPickerOpen}
                        trigger={
                          <button type="button" className={cn('flex h-8 w-full items-center gap-2 rounded-md border border-input bg-background px-2.5 text-left text-[13px] shadow-xs hover:bg-accent/50', copyError && 'border-tone-danger')}>
                            {source ? (
                              <>
                                <Glyph icon={source.icon} color={source.color} size={16} />
                                <span className="min-w-0 flex-1 truncate">{source.name}</span>
                              </>
                            ) : (
                              <span className="flex-1 text-muted-foreground">Choose a program…</span>
                            )}
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        }
                      />
                      {copyError && <p className="mt-1 text-xs text-tone-danger">{copyError}</p>}
                    </div>
                  )}
                </Choice>
                <Choice selected={startFrom === 'blank'} onSelect={() => setStartFrom('blank')} icon={<FilePlus2 />} title="Blank" description="An empty application form and the standard Received → Review → Decision pipeline." />
              </div>
            </Field>
          </div>

          <DialogFooter className="gap-2 border-t bg-subtle px-5 py-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Creating…' : 'Create program'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
