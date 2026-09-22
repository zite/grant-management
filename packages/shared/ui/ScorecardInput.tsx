import { Check, Minus, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@project/components/lib/utils';
import { RECOMMENDATIONS, RECOMMENDATION_LABEL, partialScore, scoreTone, totalScore, type Recommendation, type RubricCriterion, type Scores } from '../scoring';

/**
 * Scoring against a rubric. Each criterion is a row of score buttons; number
 * keys score the focused criterion and move to the next, so a reviewer can
 * score a whole rubric without touching the mouse.
 */

export function ScorecardInput({
  criteria, scores, onChange, recommendation, onRecommendation, askRecommendation = true, disabled, compact, errors,
}: {
  criteria: RubricCriterion[];
  scores: Scores;
  onChange: (next: Scores, criterionId: string) => void;
  recommendation: string | null;
  onRecommendation: (r: Recommendation | null) => void;
  askRecommendation?: boolean;
  disabled?: boolean;
  compact?: boolean;
  /** Messages keyed by criterion id, or 'recommendation', shown on the row they belong to. */
  errors?: Record<string, string | undefined>;
}) {
  const rows = useRef<Array<HTMLDivElement | null>>([]);
  const totalWeight = criteria.reduce((a, c) => a + c.weight, 0) || 1;

  const onKey = (e: KeyboardEvent<HTMLDivElement>, index: number, c: RubricCriterion) => {
    if (disabled || e.metaKey || e.ctrlKey || e.altKey) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && e.key.length === 1 && n >= c.min && n <= c.max) {
      e.preventDefault();
      onChange({ ...scores, [c.id]: n }, c.id);
      rows.current[index + 1]?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      rows.current[index + 1]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      rows.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const cur = scores[c.id] ?? (e.key === 'ArrowRight' ? c.min - 1 : c.max + 1);
      const next = Math.max(c.min, Math.min(c.max, cur + (e.key === 'ArrowRight' ? 1 : -1)));
      onChange({ ...scores, [c.id]: next }, c.id);
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      onChange({ ...scores, [c.id]: null }, c.id);
    }
  };

  return (
    <div className="space-y-3">
      {criteria.map((c, i) => {
        const value = scores[c.id];
        const scale = Array.from({ length: c.max - c.min + 1 }, (_, k) => c.min + k);
        const level = c.levels?.find(l => l.score === value);
        return (
          <div
            key={c.id}
            ref={el => (rows.current[i] = el)}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={e => onKeys(e, i, c)}
            data-criterion-id={c.id}
            aria-invalid={errors?.[c.id] ? true : undefined}
            aria-label={`${c.name}: ${value == null ? 'not scored' : `${value} of ${c.max}`}. Press ${c.min} to ${c.max} to score.`}
            className={cn(
              'group rounded-lg border bg-background p-3 outline-none transition-shadow focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15',
              compact && 'p-2.5',
              errors?.[c.id] && 'border-tone-danger ring-[3px] ring-tone-danger/[0.12]',
            )}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-medium">{c.name}</span>
                  {criteria.some(x => x.weight !== c.weight) && (
                    <span className="rounded bg-muted px-1.5 py-px text-[11px] font-medium tabular-nums text-muted-foreground" title={`${Math.round((c.weight / totalWeight) * 100)}% of the total`}>
                      {Math.round((c.weight / totalWeight) * 100)}%
                    </span>
                  )}
                </div>
                {c.description && !compact && <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{c.description}</p>}
              </div>
              <span className={cn('shrink-0 text-[12px] tabular-nums', value == null ? 'text-muted-foreground' : 'font-medium text-foreground')}>
                {value == null ? `—/${c.max}` : `${value}/${c.max}`}
              </span>
            </div>
            <div className="mt-2.5 flex gap-1" role="radiogroup" aria-label={c.name}>
              {scale.map(n => {
                const on = value === n;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabIndex={-1}
                    disabled={disabled}
                    title={c.levels?.find(l => l.score === n)?.label}
                    onClick={() => onChange({ ...scores, [c.id]: on ? null : n }, c.id)}
                    className={cn(
                      'h-8 min-w-0 flex-1 rounded-md border text-[13px] font-medium tabular-nums transition-colors disabled:cursor-not-allowed',
                      on ? 'border-primary bg-primary text-primary-foreground shadow-xs' : value != null && n < value ? 'border-primary/25 bg-primary/10 text-foreground' : 'border-input bg-background hover:bg-accent disabled:hover:bg-background',
                    )}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            {c.levels && c.levels.length > 0 && (
              <div className="mt-1.5 flex h-4 justify-between text-[11.5px] text-muted-foreground">
                {level ? <span className="font-medium text-foreground">{level.label}</span> : <span>{c.levels[0]?.label}</span>}
                {!level && <span>{c.levels[c.levels.length - 1]?.label}</span>}
              </div>
            )}
            {errors?.[c.id] && <p className="mt-2 text-[12px] text-tone-danger" role="alert">{errors[c.id]}</p>}
          </div>
        );
      })}

      {askRecommendation && (
        <div data-recommendation className={cn('rounded-lg border bg-background p-3', errors?.recommendation && 'border-tone-danger ring-[3px] ring-tone-danger/[0.12]')}>
          <p className="text-[13.5px] font-medium">Recommendation</p>
          <div className="mt-2 grid grid-cols-[repeat(3,auto)] gap-1.5" role="radiogroup" aria-label="Recommendation">
            {RECOMMENDATIONS.map(r => {
              const on = recommendation === r;
              const Icon = r === 'Yes' ? ThumbsUp : r === 'No' ? ThumbsDown : Minus;
              const tone = r === 'Yes' ? 'success' : r === 'No' ? 'danger' : 'warning';
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={disabled}
                  onClick={() => onRecommendation(on ? null : r)}
                  className={cn(
                    'flex min-h-9 items-center justify-center gap-1.5 rounded-md border px-1.5 py-1 text-center text-[12.5px] font-medium leading-tight transition-colors disabled:cursor-not-allowed',
                    on
                      ? tone === 'success'
                        ? 'border-tone-success bg-tone-success/10 text-tone-success'
                        : tone === 'danger'
                          ? 'border-tone-danger bg-tone-danger/10 text-tone-danger'
                          : 'border-tone-warning bg-tone-warning/10 text-tone-warning'
                      : 'border-input bg-background text-foreground hover:bg-accent',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{RECOMMENDATION_LABEL[r]}</span>
                </button>
              );
            })}
          </div>
          {errors?.recommendation && <p className="mt-2 text-[12px] text-tone-danger" role="alert">{errors.recommendation}</p>}
        </div>
      )}
    </div>
  );

  function onKeys(e: KeyboardEvent<HTMLDivElement>, i: number, c: RubricCriterion) {
    onKey(e, i, c);
  }
}

/** The running or final total, as a large number with its tone. */
export function ScoreTotal({ criteria, scores, className }: { criteria: RubricCriterion[]; scores: Scores; className?: string }) {
  const complete = totalScore(criteria, scores);
  const partial = partialScore(criteria, scores);
  const shown = complete ?? partial;
  const scored = criteria.filter(c => scores[c.id] != null).length;
  const toneClass = { success: 'text-tone-success', accent: 'text-tone-accent', warning: 'text-tone-warning', danger: 'text-tone-danger', neutral: 'text-muted-foreground' }[scoreTone(complete)];
  return (
    <div className={cn('flex items-baseline gap-2', className)}>
      <span className={cn('text-2xl font-semibold tabular-nums tracking-tight', complete == null ? 'text-muted-foreground' : toneClass)}>
        {shown == null ? '—' : Math.round(shown)}
      </span>
      <span className="text-[12.5px] text-muted-foreground">
        {complete != null ? (
          <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5 text-tone-success" /> of 100</span>
        ) : (
          `${scored} of ${criteria.length} scored`
        )}
      </span>
    </div>
  );
}
