import { ArrowDown, ArrowUp, ChevronRight, Minus, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { saveProgram, saveRubric } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Switch } from '@project/components/ui/switch';
import { Textarea } from '@project/components/ui/textarea';
import { cn } from '@project/components/lib/utils';
import { RUBRIC_SCALES } from '@project/shared/programSetup';
import type { RubricCriterion, Scores } from '@project/shared/scoring';
import { ScoreTotal, ScorecardInput } from '@project/shared/ui/ScorecardInput';
import { useAppActions } from '../../../lib/app-actions';
import { plural } from '../../../lib/format';
import type { Bootstrap, Program, Rubric } from '../../../lib/types';
import { useWorkspace } from '../../../lib/workspace';
import { IconButton, Tip } from '../../primitives/bits';
import { StageGlyph } from '../../primitives/icons';
import { Field, PageTitle, SettingsCard, SettingsRow, SettingsSection, inputClass, selectItemClass, selectTriggerClass, textareaClass, useUnloadGuard } from '../fields';
import { useProgramMutation } from '../programData';
import { useReportDirty } from './ProgramSettings';
import { useDraft } from './useDraft';

const patchProgram = (id: string, patch: Partial<Program>) => (data: Bootstrap): Bootstrap => ({ ...data, programs: data.programs.map(p => (p.id === id ? { ...p, ...patch } : p)) });

const newCriterionId = () => `c_${Math.random().toString(36).slice(2, 10)}`;
const scaleKey = (c: Pick<RubricCriterion, 'min' | 'max'>) => RUBRIC_SCALES.find(s => s.min === c.min && s.max === c.max)?.key ?? `${c.min}-${c.max}`;

type RubricDraft = { name: string; instructions: string; askRecommendation: boolean; criteria: RubricCriterion[] };

function ProgramSwitches({ program }: { program: Program }) {
  const run = useProgramMutation();
  const [perSubmission, setPerSubmission] = useState(program.reviewersPerSubmission);
  useEffect(() => setPerSubmission(program.reviewersPerSubmission), [program.reviewersPerSubmission]);

  const toggle = (patch: Partial<Pick<Program, 'blindReview' | 'showScoresToReviewers'>>, success: string) =>
    run(() => saveProgram({ action: 'update', id: program.id, ...patch }), { optimistic: patchProgram(program.id, patch), success, error: "Couldn't save that setting" });

  const setCount = (n: number) => {
    const next = Math.max(0, Math.min(10, n));
    if (next === program.reviewersPerSubmission) return;
    setPerSubmission(next);
    run(() => saveProgram({ action: 'update', id: program.id, reviewersPerSubmission: next }), {
      optimistic: patchProgram(program.id, { reviewersPerSubmission: next }),
      success: next ? `New review-stage submissions get ${plural(next, 'reviewer')}` : 'Automatic assignment is off',
      error: "Couldn't save that setting",
    });
  };

  return (
    <SettingsSection title="How reviewing works" description="These switches save as soon as you change them.">
      <SettingsCard>
        <SettingsRow label="Blind review" description="Reviewers don’t see the applicant’s name, contact details, or questions marked as hidden from reviewers." htmlFor="rv-blind">
          <Switch id="rv-blind" checked={program.blindReview} onCheckedChange={v => toggle({ blindReview: v }, v ? 'Blind review is on' : 'Blind review is off')} />
        </SettingsRow>
        <SettingsRow label="Show other scores after submitting" description="Once a reviewer submits, they can see how others scored the same application." htmlFor="rv-scores">
          <Switch id="rv-scores" checked={program.showScoresToReviewers} onCheckedChange={v => toggle({ showScoresToReviewers: v }, v ? 'Reviewers see other scores after submitting' : 'Other scores stay hidden from reviewers')} />
        </SettingsRow>
        <SettingsRow label="Reviewers per submission" description={perSubmission ? `Entering a review stage assigns ${plural(perSubmission, 'reviewer')} from the pool, balancing workload.` : 'Automatic assignment is off — assign reviewers by hand.'}>
          <div className="flex h-8 items-center rounded-md border border-input bg-background shadow-xs">
            <button type="button" aria-label="One fewer reviewer" disabled={perSubmission <= 0} onClick={() => setCount(perSubmission - 1)} className="flex h-full w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-8 text-center text-[13px] tabular-nums" aria-live="polite">{perSubmission}</span>
            <button type="button" aria-label="One more reviewer" disabled={perSubmission >= 10} onClick={() => setCount(perSubmission + 1)} className="flex h-full w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </SettingsRow>
      </SettingsCard>
    </SettingsSection>
  );
}

function CriterionEditor({ c, index, count, totalWeight, onChange, onMove, onRemove }: {
  c: RubricCriterion;
  index: number;
  count: number;
  totalWeight: number;
  onChange: (patch: Partial<RubricCriterion>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [showLevels, setShowLevels] = useState(Boolean(c.levels?.some(l => l.label)));
  const share = totalWeight > 0 ? Math.round((c.weight / totalWeight) * 100) : 0;
  const scores = Array.from({ length: c.max - c.min + 1 }, (_, i) => c.min + i);
  const levelFor = (score: number) => c.levels?.find(l => l.score === score)?.label ?? '';
  const setLevel = (score: number, label: string) => {
    const others = (c.levels ?? []).filter(l => l.score !== score);
    onChange({ levels: [...others, { score, label }].sort((a, b) => a.score - b.score) });
  };
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-start gap-2">
        <span className="mt-2 w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{index + 1}</span>
        <div className="min-w-0 flex-1 space-y-2">
          <Input value={c.name} maxLength={120} onChange={e => onChange({ name: e.target.value })} placeholder="Criterion, like Community impact" aria-label={`Criterion ${index + 1} name`} className={cn(inputClass, 'font-medium')} />
          <Textarea value={c.description ?? ''} rows={2} maxLength={1000} onChange={e => onChange({ description: e.target.value })} placeholder="What reviewers should look for" aria-label={`Criterion ${index + 1} description`} className="min-h-[52px] text-[12.5px] md:text-[12.5px]" />
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Weight" className="w-[92px]" hint={`${share}% of total`}>
              <Input
                type="number"
                min={0.5}
                max={100}
                step={0.5}
                value={Number.isFinite(c.weight) ? c.weight : ''}
                onChange={e => onChange({ weight: e.target.value === '' ? Number.NaN : Number(e.target.value) })}
                aria-label={`Criterion ${index + 1} weight`}
                className={cn(inputClass, 'tabular-nums')}
              />
            </Field>
            <Field label="Scale" className="w-[96px]" hint=" ">
              <Select
                value={scaleKey(c)}
                onValueChange={k => {
                  const s = RUBRIC_SCALES.find(x => x.key === k);
                  if (s) onChange({ min: s.min, max: s.max, levels: (c.levels ?? []).filter(l => l.score >= s.min && l.score <= s.max) });
                }}
              >
                <SelectTrigger aria-label={`Criterion ${index + 1} scale`} className={selectTriggerClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RUBRIC_SCALES.map(s => (
                    <SelectItem key={s.key} value={s.key} className={selectItemClass}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <button type="button" onClick={() => setShowLevels(v => !v)} className="mb-6 flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
              <ChevronRight className={cn('h-3 w-3 transition-transform', showLevels && 'rotate-90')} /> Level labels
              {Boolean(c.levels?.filter(l => l.label).length) && <span className="tabular-nums">({c.levels!.filter(l => l.label).length})</span>}
            </button>
          </div>
          {showLevels && (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {scores.map(score => (
                <label key={score} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">{score}</span>
                  <Input value={levelFor(score)} maxLength={80} onChange={e => setLevel(score, e.target.value)} placeholder={score === c.min ? 'Weak' : score === c.max ? 'Exceptional' : 'Optional'} className="h-7 text-[12.5px] md:text-[12.5px]" />
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-0.5">
          <IconButton size="sm" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp />
          </IconButton>
          <IconButton size="sm" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown />
          </IconButton>
          <Tip label={count <= 1 ? 'A rubric needs at least one criterion' : 'Remove criterion'}>
            <span>
              <IconButton size="sm" aria-label="Remove criterion" disabled={count <= 1} onClick={onRemove} className="hover:text-tone-danger">
                <Trash2 />
              </IconButton>
            </span>
          </Tip>
        </div>
      </div>
    </div>
  );
}

function RubricEditor({ rubric, program, open, onToggle }: { rubric: Rubric; program: Program; open: boolean; onToggle: () => void }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const run = useProgramMutation();
  const source = useMemo<RubricDraft>(() => ({ name: rubric.name, instructions: rubric.instructions, askRecommendation: rubric.askRecommendation, criteria: rubric.criteria }), [rubric]);
  const { draft, dirty, set, reset, commit } = useDraft(source);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Scores>({});
  const [recommendation, setRecommendation] = useState<string | null>(null);
  useReportDirty(`rubric:${rubric.id}`, dirty);
  useUnloadGuard(dirty);
  const usedBy = ws.stagesFor(program.id).filter(s => s.rubricId === rubric.id);

  if (!draft) return null;
  const criteria = draft.criteria;
  const totalWeight = criteria.reduce((a, c) => a + (Number.isFinite(c.weight) ? c.weight : 0), 0);
  const problems = [
    !draft.name.trim() && 'Name the rubric',
    criteria.some(c => !c.name.trim()) && 'Name every criterion',
    criteria.some(c => !Number.isFinite(c.weight) || c.weight <= 0) && 'Every weight must be above zero',
  ].filter(Boolean) as string[];
  const previewCriteria = criteria.filter(c => c.name.trim() && c.weight > 0);

  const setCriteria = (next: RubricCriterion[]) => set({ criteria: next });
  const patchAt = (i: number, patch: Partial<RubricCriterion>) => setCriteria(criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...criteria];
    const [c] = next.splice(i, 1);
    next.splice(i + dir, 0, c);
    setCriteria(next);
  };

  const save = async () => {
    if (problems.length) return;
    setSaving(true);
    const res = await run(
      () =>
        saveRubric({
          action: 'update',
          id: rubric.id,
          name: draft.name.trim(),
          instructions: draft.instructions.trim() || null,
          askRecommendation: draft.askRecommendation,
          criteria: criteria.map(c => ({ id: c.id, name: c.name.trim(), description: c.description?.trim() || '', weight: c.weight, min: c.min, max: c.max, levels: (c.levels ?? []).filter(l => l.label.trim()) })),
        }),
      { success: `Saved ${draft.name.trim()}`, error: "Couldn't save the rubric" },
    );
    setSaving(false);
    if (res) commit();
  };

  const remove = async () => {
    const ok = await app.confirm({
      title: `Delete ${rubric.name}?`,
      description: usedBy.length ? `It’s used by ${usedBy.map(s => s.name).join(' and ')}. Choose a different rubric for ${usedBy.length === 1 ? 'that stage' : 'those stages'} first.` : 'Reviewers will no longer be able to score with it. This can’t be undone.',
      confirmLabel: usedBy.length ? 'Try anyway' : 'Delete rubric',
      destructive: true,
    });
    if (!ok) return;
    await run(() => saveRubric({ action: 'delete', id: rubric.id }), { success: `Deleted ${rubric.name}`, error: "Couldn't delete the rubric" });
  };

  return (
    <div className={cn('overflow-hidden rounded-lg border bg-background', open && 'shadow-xs')} data-rubric-id={rubric.id}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-accent/40">
        <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{rubric.name}{dirty && <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-tone-warning align-middle" aria-label="Unsaved changes" />}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {plural(rubric.criteria.length, 'criterion', 'criteria')}
            {rubric.askRecommendation ? ' · asks for a recommendation' : ''}
          </span>
        </span>
        <span className="hidden shrink-0 flex-wrap justify-end gap-1 sm:flex">
          {usedBy.length ? (
            usedBy.map(s => (
              <span key={s.id} className="chip bg-background">
                <StageGlyph kind={s.kind} color={s.color} size={11} /> {s.name}
              </span>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">Not used by a stage</span>
          )}
        </span>
      </button>

      {open && (
        <div className="border-t">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <div className="space-y-4 p-4 lg:border-r">
              <Field label="Name" htmlFor={`rb-name-${rubric.id}`}>
                <Input id={`rb-name-${rubric.id}`} value={draft.name} maxLength={80} onChange={e => set({ name: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Instructions for reviewers" htmlFor={`rb-ins-${rubric.id}`} hint="Shown above the scorecard.">
                <Textarea id={`rb-ins-${rubric.id}`} value={draft.instructions} rows={3} maxLength={4000} onChange={e => set({ instructions: e.target.value })} className={textareaClass} placeholder="Read the whole application before scoring…" />
              </Field>
              <label className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
                <span>
                  <span className="block text-[13px] font-medium">Ask for a recommendation</span>
                  <span className="block text-xs text-muted-foreground">Recommend, unsure or don’t recommend, alongside the scores.</span>
                </span>
                <Switch checked={draft.askRecommendation} onCheckedChange={v => set({ askRecommendation: v })} />
              </label>

              <div>
                <div className="mb-2 flex items-end justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium">Criteria</div>
                    <div className="text-xs text-muted-foreground">The total is each score’s share of its scale, weighted, out of 100.</div>
                  </div>
                </div>
                <div className="space-y-2">
                  {criteria.map((c, i) => (
                    <CriterionEditor key={c.id} c={c} index={i} count={criteria.length} totalWeight={totalWeight} onChange={patch => patchAt(i, patch)} onMove={dir => move(i, dir)} onRemove={() => setCriteria(criteria.filter((_, j) => j !== i))} />
                  ))}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-muted-foreground hover:text-foreground"
                  disabled={criteria.length >= 25}
                  onClick={() => setCriteria([...criteria, { id: newCriterionId(), name: '', description: '', weight: 1, min: 1, max: 5, levels: [] }])}
                >
                  <Plus /> Add criterion
                </Button>
              </div>
            </div>

            <div className="bg-subtle/60 p-4">
              <div className="sticky top-14">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Reviewer preview</span>
                  {Object.keys(preview).length > 0 && (
                    <button type="button" onClick={() => { setPreview({}); setRecommendation(null); }} className="text-xs text-muted-foreground hover:text-foreground">
                      Clear
                    </button>
                  )}
                </div>
                <div className="rounded-lg border bg-background p-3">
                  {draft.instructions.trim() && <p className="mb-3 whitespace-pre-line rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{draft.instructions.trim()}</p>}
                  {previewCriteria.length ? (
                    <>
                      <ScorecardInput
                        criteria={previewCriteria}
                        scores={preview}
                        onChange={next => setPreview(next)}
                        recommendation={recommendation}
                        onRecommendation={r => setRecommendation(r)}
                        askRecommendation={draft.askRecommendation}
                        compact
                      />
                      <ScoreTotal criteria={previewCriteria} scores={preview} className="mt-3" />
                    </>
                  ) : (
                    <p className="py-6 text-center text-xs text-muted-foreground">Name a criterion to preview the scorecard.</p>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Try scoring — press a number key on a criterion to score it and move on. Nothing here is saved.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t bg-subtle/40 px-4 py-2.5">
            <Button variant="ghost" size="sm" onClick={remove} className="text-tone-danger hover:bg-tone-danger/[0.08] hover:text-tone-danger">
              <Trash2 /> Delete rubric
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">{problems[0] ?? (dirty ? 'Changes don’t rescore reviews already submitted.' : '')}</span>
            <Button variant="ghost" size="sm" disabled={!dirty || saving} onClick={() => { reset(); setPreview({}); }}>
              Discard
            </Button>
            <Button size="sm" disabled={!dirty || saving || problems.length > 0} onClick={save}>
              {saving ? 'Saving…' : 'Save rubric'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ReviewSettings({ program }: { program: Program }) {
  const ws = useWorkspace();
  const run = useProgramMutation();
  const rubrics = ws.rubrics.filter(r => r.programId === program.id);
  const [openId, setOpenId] = useState<string | null>(() => rubrics[0]?.id ?? null);
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    const res = await run(() => saveRubric({ action: 'create', programId: program.id, name: rubrics.length ? `Scorecard ${rubrics.length + 1}` : 'Scorecard' }), { success: 'Added a rubric with starter criteria', error: "Couldn't add the rubric" });
    setCreating(false);
    if (res?.id) setOpenId(res.id);
  };

  return (
    <div>
      <PageTitle title="Review" description="How reviewers score this program: the rules they review under and the rubrics they score with." />
      <ProgramSwitches program={program} />
      <SettingsSection
        title="Rubrics"
        description="Each review stage scores with one rubric. Edits here save when you press Save rubric."
        actions={
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" disabled={creating} onClick={create}>
            <Plus /> {creating ? 'Adding…' : 'New rubric'}
          </Button>
        }
      >
        {rubrics.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center">
            <p className="text-[13px] font-medium">No rubrics yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Add one, then choose it for a review stage in Pipeline.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rubrics.map(r => (
              <RubricEditor key={r.id} rubric={r} program={program} open={openId === r.id} onToggle={() => setOpenId(id => (id === r.id ? null : r.id))} />
            ))}
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
