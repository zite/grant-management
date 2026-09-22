import { differenceInCalendarDays, parseISO } from 'date-fns';
import { answerToText, visibleFieldIds } from '@project/shared/forms/logic';
import { isInputField, type Answers, type FormField } from '@project/shared/forms/types';
import type { Recommendation, Scores } from '@project/shared/scoring';
import { parseDay } from '../../lib/format';
import type { ReviewDetail, ReviewQueueItem } from '../../lib/types';

/**
 * The reviewer's queue, derived on the client from one "all" fetch so the
 * tabs, counts, program chips and summary strip always agree with each other
 * and switching tabs is instant.
 */

export type ReviewTab = 'todo' | 'done' | 'all';

/** Where "Back to My reviews" returns to, so a reviewer lands on the same tab and filter they left. */
export const LAST_REVIEW_LIST_KEY = 'grants:reviews:last-list';

export const isOpenStatus = (status: string) => status === 'Assigned' || status === 'In progress';
export const isTodo = (r: Pick<ReviewQueueItem, 'status' | 'closed'>) => isOpenStatus(r.status) && !r.closed;
export const isDone = (r: Pick<ReviewQueueItem, 'status'>) => r.status === 'Submitted' || r.status === 'Recused';

export function inTab(r: ReviewQueueItem, tab: ReviewTab) {
  if (tab === 'todo') return isTodo(r);
  if (tab === 'done') return isDone(r);
  return true;
}

export function parseTab(v: string | null): ReviewTab {
  return v === 'done' || v === 'all' ? v : 'todo';
}

const daysUntil = (day: string) => differenceInCalendarDays(parseDay(day), new Date());

export function queueStats(reviews: ReviewQueueItem[]) {
  const todo = reviews.filter(isTodo);
  const monthAgo = Date.now() - 30 * 86_400_000;
  return {
    open: todo.length,
    overdue: todo.filter(r => r.dueDate && daysUntil(r.dueDate) < 0).length,
    dueThisWeek: todo.filter(r => r.dueDate && daysUntil(r.dueDate) >= 0 && daysUntil(r.dueDate) < 7).length,
    submitted30: reviews.filter(r => r.status === 'Submitted' && r.submittedAt && parseISO(r.submittedAt).getTime() >= monthAgo).length,
    done: reviews.filter(isDone).length,
    recused: reviews.filter(r => r.status === 'Recused').length,
  };
}

export type ReviewGroup = {
  programId: string;
  name: string;
  icon: string;
  color: string;
  rows: ReviewQueueItem[];
  /** Finished reviews in this program, and everything still needed (closed ones no longer count). */
  done: number;
  total: number;
  earliestDue: string | null;
};

/** Groups keep the server's order (open first, soonest due first) for rows, and order programs by their first row. */
export function groupByProgram(rows: ReviewQueueItem[], all: ReviewQueueItem[]): ReviewGroup[] {
  const groups = new Map<string, ReviewGroup>();
  for (const r of rows) {
    let g = groups.get(r.programId);
    if (!g) {
      const inProgram = all.filter(x => x.programId === r.programId);
      const due = inProgram.filter(isTodo).map(x => x.dueDate).filter((d): d is string => Boolean(d)).sort();
      g = {
        programId: r.programId,
        name: r.programName || 'Program',
        icon: r.programIcon,
        color: r.programColor,
        rows: [],
        done: inProgram.filter(isDone).length,
        total: inProgram.filter(x => isDone(x) || isTodo(x)).length,
        earliestDue: due[0] ?? null,
      };
      groups.set(r.programId, g);
    }
    g.rows.push(r);
  }
  return [...groups.values()];
}

export function matchesText(r: ReviewQueueItem, q: string) {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return [r.reference, r.title, r.applicantLabel ?? '', r.stageName, r.programName, r.status].join(' ').toLowerCase().includes(t);
}

// ── The scorecard draft ────────────────────────────────────────────────────

export type Draft = { scores: Scores; comment: string; applicantFeedback: string; recommendation: Recommendation | null };

export function draftFrom(detail: ReviewDetail): Draft {
  const rec = detail.review.recommendation;
  return {
    scores: { ...detail.review.scores },
    comment: detail.review.comment ?? '',
    applicantFeedback: detail.review.applicantFeedback ?? '',
    recommendation: rec === 'Yes' || rec === 'Maybe' || rec === 'No' ? rec : null,
  };
}

function normScores(s: Scores) {
  return Object.entries(s)
    .filter(([, v]) => v != null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join('|');
}

export function sameDraft(a: Draft, b: Draft) {
  return normScores(a.scores) === normScores(b.scores) && a.comment === b.comment && a.applicantFeedback === b.applicantFeedback && (a.recommendation ?? null) === (b.recommendation ?? null);
}

// ── Reading aids ───────────────────────────────────────────────────────────

/** Rough reading time for the answers, so a reviewer can plan an evening. */
export function readingMinutes(fields: FormField[], answers: Answers) {
  const visible = visibleFieldIds(fields, answers);
  let words = 0;
  for (const f of fields) {
    if (!visible.has(f.id) || !isInputField(f) || f.type === 'file') continue;
    const text = answerToText(f, answers);
    if (text) words += text.split(/\s+/).length;
  }
  return Math.max(1, Math.round(words / 230));
}

/** AnswersView highlights free text only; choices, dates, links and money render as-is. */
const NOT_HIGHLIGHTED = new Set(['single_choice', 'dropdown', 'multiple_choice', 'yes_no', 'currency', 'number', 'date', 'url', 'email', 'address', 'file']);

/** How many highlightable matches a term has across the visible answers — including inside collapsed long answers. */
export function countMatches(fields: FormField[], answers: Answers, term: string) {
  const q = term.trim().toLowerCase();
  if (q.length < 2) return 0;
  const visible = visibleFieldIds(fields, answers);
  let n = 0;
  for (const f of fields) {
    if (!visible.has(f.id) || !isInputField(f) || NOT_HIGHLIGHTED.has(f.type)) continue;
    const text = answerToText(f, answers).toLowerCase();
    let i = text.indexOf(q);
    while (i >= 0) {
      n += 1;
      i = text.indexOf(q, i + q.length);
    }
  }
  return n;
}
