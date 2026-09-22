/**
 * Rubrics and scores.
 *
 * A rubric is a list of weighted criteria, each scored on 0..max (or 1..max).
 * A review's total is the weighted share of available points, as 0–100, so
 * rubrics with different scales and weights still rank on one axis.
 */

export type RubricLevel = { score: number; label: string };

export type RubricCriterion = {
  id: string;
  name: string;
  description?: string;
  weight: number;
  min: number;
  max: number;
  levels?: RubricLevel[];
};

export type Scores = Record<string, number | null>;

export type Recommendation = 'Yes' | 'Maybe' | 'No';
export const RECOMMENDATIONS: Recommendation[] = ['Yes', 'Maybe', 'No'];
export const RECOMMENDATION_LABEL: Record<Recommendation, string> = { Yes: 'Recommend', Maybe: 'Unsure', No: "Don't recommend" };

export function parseCriteria(raw: unknown): RubricCriterion[] {
  let v: unknown = raw;
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  return v
    .filter(c => c && typeof c === 'object' && typeof (c as RubricCriterion).id === 'string')
    .map(c => {
      const r = c as RubricCriterion;
      const max = Number.isFinite(Number(r.max)) && Number(r.max) > 0 ? Math.round(Number(r.max)) : 5;
      const min = Number(r.min) === 0 ? 0 : 1;
      return {
        id: r.id,
        name: String(r.name ?? 'Criterion'),
        description: r.description ? String(r.description) : '',
        weight: Number.isFinite(Number(r.weight)) && Number(r.weight) > 0 ? Number(r.weight) : 1,
        min: Math.min(min, max),
        max,
        levels: Array.isArray(r.levels) ? r.levels.filter(l => l && Number.isFinite(Number(l.score))).map(l => ({ score: Number(l.score), label: String(l.label ?? '') })) : [],
      };
    });
}

export function parseScores(raw: unknown): Scores {
  let v: unknown = raw;
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Scores = {};
  for (const [k, s] of Object.entries(v as Record<string, unknown>)) {
    const n = s === null || s === '' ? null : Number(s);
    out[k] = n === null || Number.isFinite(n) ? n : null;
  }
  return out;
}

/** Keep only scores for this rubric's criteria, clamped to each scale. */
export function sanitizeScores(criteria: RubricCriterion[], raw: unknown): Scores {
  const input = parseScores(raw);
  const out: Scores = {};
  for (const c of criteria) {
    const v = input[c.id];
    if (v == null) continue;
    out[c.id] = Math.max(c.min, Math.min(c.max, Math.round(v * 2) / 2));
  }
  return out;
}

export function missingCriteria(criteria: RubricCriterion[], scores: Scores) {
  return criteria.filter(c => scores[c.id] == null);
}

/** Weighted 0–100, or null until every criterion is scored. */
export function totalScore(criteria: RubricCriterion[], scores: Scores): number | null {
  if (criteria.length === 0) return null;
  let weighted = 0;
  let weights = 0;
  for (const c of criteria) {
    const s = scores[c.id];
    if (s == null) return null;
    weighted += c.weight * (s / c.max);
    weights += c.weight;
  }
  return weights > 0 ? Math.round((weighted / weights) * 1000) / 10 : null;
}

/** Same as totalScore, but over whatever has been scored so far — for a live preview while scoring. */
export function partialScore(criteria: RubricCriterion[], scores: Scores): number | null {
  const scored = criteria.filter(c => scores[c.id] != null);
  return scored.length ? totalScore(scored, scores) : null;
}

export type ScoreStats = { count: number; mean: number | null; min: number | null; max: number | null; spread: number | null; stdev: number | null };

export function scoreStats(values: Array<number | null | undefined>): ScoreStats {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (xs.length === 0) return { count: 0, mean: null, min: null, max: null, spread: null, stdev: null };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  return { count: xs.length, mean: Math.round(mean * 10) / 10, min, max, spread: Math.round((max - min) * 10) / 10, stdev: Math.round(Math.sqrt(variance) * 10) / 10 };
}

/** Reviewers disagree enough that someone should look: a 25-point gap on a 0–100 scale. */
export const DISAGREEMENT_SPREAD = 25;

export function scoreTone(score: number | null | undefined): 'success' | 'accent' | 'warning' | 'danger' | 'neutral' {
  if (score == null) return 'neutral';
  if (score >= 80) return 'success';
  if (score >= 65) return 'accent';
  if (score >= 50) return 'warning';
  return 'danger';
}

export function defaultCriteria(): RubricCriterion[] {
  const id = () => `c_${Math.random().toString(36).slice(2, 10)}`;
  const levels: RubricLevel[] = [
    { score: 1, label: 'Weak' },
    { score: 2, label: 'Fair' },
    { score: 3, label: 'Good' },
    { score: 4, label: 'Strong' },
    { score: 5, label: 'Exceptional' },
  ];
  return [
    { id: id(), name: 'Alignment with mission', description: 'How closely the proposal serves the goals of this program.', weight: 2, min: 1, max: 5, levels },
    { id: id(), name: 'Community impact', description: 'The scale and depth of benefit to the people served.', weight: 2, min: 1, max: 5, levels },
    { id: id(), name: 'Feasibility', description: 'A realistic plan, timeline and team to deliver it.', weight: 1, min: 1, max: 5, levels },
    { id: id(), name: 'Budget', description: 'Costs are reasonable, clear and tied to the work.', weight: 1, min: 1, max: 5, levels },
  ];
}
