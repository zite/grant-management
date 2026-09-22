import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DisplayProperty, Grouping } from './constants';
import type { Ordering, Stage, Submission, SubmissionFilters } from './types';
import type { Workspace } from './workspace';

export type Layout = 'list' | 'board' | 'table';

export type ViewOptions = {
  layout: Layout;
  grouping: Grouping;
  ordering: Ordering;
  emptyGroups: boolean;
  properties: DisplayProperty[];
  /** Answer columns shown in the table layout (field ids), when one program is in view. */
  answerColumns: string[];
};

export const DEFAULT_PROPERTIES: DisplayProperty[] = ['reference', 'applicant', 'stage', 'score', 'reviews', 'amount', 'labels', 'owner', 'submitted', 'signals'];

export const DEFAULT_OPTIONS: ViewOptions = {
  layout: 'list',
  grouping: 'stage',
  ordering: 'submitted_desc',
  emptyGroups: false,
  properties: DEFAULT_PROPERTIES,
  answerColumns: [],
};

function read<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Per-surface display options and ad-hoc filters, remembered in localStorage.
 * A saved view seeds the defaults; edits on top of it stay local until saved.
 */
export function useViewState(storageKey: string, defaults: Partial<ViewOptions> = {}, defaultFilters: SubmissionFilters = {}) {
  const base = useMemo(() => ({ ...DEFAULT_OPTIONS, ...defaults }), [JSON.stringify(defaults)]);
  const baseFilters = useMemo(() => defaultFilters, [JSON.stringify(defaultFilters)]);
  const [options, setOptionsState] = useState<ViewOptions>(() => read(`grants:view:${storageKey}`, base));
  const [filters, setFiltersState] = useState<SubmissionFilters>(() => read(`grants:filters:${storageKey}`, baseFilters));

  useEffect(() => {
    setOptionsState(read(`grants:view:${storageKey}`, base));
    setFiltersState(read(`grants:filters:${storageKey}`, baseFilters));
  }, [storageKey]);

  const setOptions = useCallback(
    (patch: Partial<ViewOptions>) => {
      setOptionsState(prev => {
        const next = { ...prev, ...patch };
        try {
          localStorage.setItem(`grants:view:${storageKey}`, JSON.stringify(next));
        } catch {
          /* storage may be unavailable */
        }
        return next;
      });
    },
    [storageKey],
  );

  const setFilters = useCallback(
    (next: SubmissionFilters | ((prev: SubmissionFilters) => SubmissionFilters)) => {
      setFiltersState(prev => {
        const value = typeof next === 'function' ? next(prev) : next;
        const clean = Object.fromEntries(
          Object.entries(value).filter(([, v]) => v !== undefined && v !== '' && v !== null && !(Array.isArray(v) && v.length === 0)),
        ) as SubmissionFilters;
        try {
          localStorage.setItem(`grants:filters:${storageKey}`, JSON.stringify(clean));
        } catch {
          /* storage may be unavailable */
        }
        return clean;
      });
    },
    [storageKey],
  );

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(`grants:view:${storageKey}`);
      localStorage.removeItem(`grants:filters:${storageKey}`);
    } catch {
      /* ignore */
    }
    setOptionsState(base);
    setFiltersState(baseFilters);
  }, [storageKey, base, baseFilters]);

  const isDirty = useMemo(
    () => JSON.stringify(options) !== JSON.stringify(base) || JSON.stringify(filters) !== JSON.stringify(baseFilters),
    [options, filters, base, baseFilters],
  );

  return { options, setOptions, filters, setFilters, reset, isDirty };
}

const LIST_KEYS = ['programIds', 'stageIds', 'stageKinds', 'statuses', 'ownerIds', 'labelIds', 'reviewerIds', 'awardStatuses'] as const;

/** What's sent: the surface's own scope plus the user's filters. Where both constrain a list, both apply. */
export function effectiveFilters(base: SubmissionFilters, user: SubmissionFilters): SubmissionFilters {
  const merged: SubmissionFilters = { ...user, ...base };
  for (const key of LIST_KEYS) {
    const b = base[key] as string[] | undefined;
    const u = user[key] as string[] | undefined;
    if (b?.length && u?.length) {
      const both = b.filter(v => u.includes(v));
      (merged as Record<string, unknown>)[key] = both.length ? both : ['__none__'];
    }
  }
  return merged;
}

export type DropTarget =
  | { field: 'stageId'; value: string; stageName?: string }
  | { field: 'decision'; value: 'Accepted' | 'Waitlisted' | 'Declined' }
  | { field: 'ownerId'; value: string | null };

export type SubmissionGroup = {
  key: string;
  label: string;
  submissions: Submission[];
  drop?: DropTarget;
  color?: string;
  stage?: Stage;
  status?: string;
  programId?: string;
  memberId?: string | null;
  labelId?: string | null;
  /** Shown under the header on boards: total requested in this column. */
  hint?: string;
};

const TERMINAL = ['Accepted', 'Waitlisted', 'Declined', 'Withdrawn'] as const;
const STATUS_COLOR: Record<string, string> = { Accepted: '#16a34a', Waitlisted: '#d97706', Declined: '#dc2626', Withdrawn: '#8b8d98', Draft: '#8b8d98', Submitted: '#6943d0' };

/**
 * Split an ordered list into groups, keeping the server's order within each.
 * With one program in scope, its stages are the columns even when empty —
 * which is what makes a board a pipeline — followed by one column per decision.
 */
export function groupSubmissions(rows: Submission[], grouping: Grouping, ws: Workspace, opts: { programId?: string | null; emptyGroups?: boolean; board?: boolean }): SubmissionGroup[] {
  const buckets = new Map<string, SubmissionGroup>();
  const ensure = (key: string, make: () => Omit<SubmissionGroup, 'key' | 'submissions'>) => {
    if (!buckets.has(key)) buckets.set(key, { key, submissions: [], ...make() });
    return buckets.get(key)!;
  };
  const showEmpty = opts.emptyGroups || opts.board;

  switch (grouping) {
    case 'stage': {
      if (opts.programId) {
        for (const s of ws.stagesFor(opts.programId)) ensure(s.id, () => ({ label: s.name, stage: s, color: s.color, drop: { field: 'stageId', value: s.id } }));
      } else {
        // Across programs, stages with the same name are one column, in pipeline order.
        const order = ['Intake', 'Review', 'Decision'];
        const present = new Set(rows.map(r => ws.stageById.get(r.stageId ?? '')?.name.toLowerCase()).filter(Boolean));
        const stages = [...ws.stages].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.position - b.position);
        for (const s of stages) {
          if (!present.has(s.name.toLowerCase()) && !(opts.emptyGroups && !opts.board)) continue;
          ensure(`name:${s.name.toLowerCase()}`, () => ({ label: s.name, stage: s, color: s.color, drop: { field: 'stageId', value: s.id, stageName: s.name } }));
        }
      }
      for (const status of TERMINAL) {
        ensure(`status:${status}`, () => ({ label: status, status, color: STATUS_COLOR[status], drop: status === 'Withdrawn' ? undefined : { field: 'decision', value: status as 'Accepted' | 'Waitlisted' | 'Declined' } }));
      }
      ensure('status:Draft', () => ({ label: 'Drafts', status: 'Draft', color: STATUS_COLOR.Draft }));
      for (const r of rows) {
        if (r.status !== 'Submitted') {
          buckets.get(`status:${r.status}`)?.submissions.push(r);
          continue;
        }
        const s = ws.stageById.get(r.stageId ?? '');
        const key = opts.programId ? s?.id : s ? `name:${s.name.toLowerCase()}` : undefined;
        (key && buckets.get(key) ? buckets.get(key)! : ensure('none', () => ({ label: 'No stage' }))).submissions.push(r);
      }
      // Draft and Withdrawn columns only earn their space when they hold something.
      for (const k of ['status:Draft', 'status:Withdrawn']) if (!buckets.get(k)?.submissions.length) buckets.delete(k);
      break;
    }
    case 'status': {
      for (const status of ['Submitted', ...TERMINAL, 'Draft']) {
        ensure(status, () => ({ label: status === 'Submitted' ? 'In review' : status, status, color: STATUS_COLOR[status], drop: DECISION(status) }));
      }
      for (const r of rows) buckets.get(r.status)?.submissions.push(r);
      break;
    }
    case 'program': {
      const ids = new Set(rows.map(r => r.programId));
      for (const p of ws.orderedPrograms) if (ids.has(p.id) || (showEmpty && p.phase !== 'archived')) ensure(p.id, () => ({ label: p.name, programId: p.id, color: p.color }));
      for (const r of rows) buckets.get(r.programId)?.submissions.push(r);
      break;
    }
    case 'owner': {
      const ids = new Set(rows.map(r => r.ownerId).filter(Boolean) as string[]);
      const people = ws.managers.filter(m => ids.has(m.id) || showEmpty).sort((a, b) => (a.id === ws.me.id ? -1 : b.id === ws.me.id ? 1 : a.name.localeCompare(b.name)));
      for (const m of people) ensure(m.id, () => ({ label: m.id === ws.me.id ? `${m.name} (you)` : m.name, memberId: m.id, drop: { field: 'ownerId', value: m.id } }));
      ensure('none', () => ({ label: 'No owner', memberId: null, drop: { field: 'ownerId', value: null } }));
      for (const r of rows) (r.ownerId && buckets.has(r.ownerId) ? buckets.get(r.ownerId)! : buckets.get('none')!).submissions.push(r);
      break;
    }
    case 'review': {
      const groups = [
        ['unassigned', 'Needs reviewers', '#dc2626'],
        ['in_review', 'Being reviewed', '#6943d0'],
        ['reviewed', 'Reviews complete', '#16a34a'],
        ['not_in_review', 'Not in a review stage', '#8b8d98'],
      ] as const;
      for (const [key, label, color] of groups) ensure(key, () => ({ label, color }));
      for (const r of rows) {
        const kind = ws.stageById.get(r.stageId ?? '')?.kind;
        const key = r.status !== 'Submitted' || kind !== 'Review' ? 'not_in_review' : r.reviewsActive === 0 ? 'unassigned' : r.reviewsDoneInStage >= r.reviewsActive ? 'reviewed' : 'in_review';
        buckets.get(key)!.submissions.push(r);
      }
      break;
    }
    case 'label': {
      const ids = new Set(rows.flatMap(r => r.labelIds));
      for (const l of ws.labels.filter(l => ids.has(l.id) || (showEmpty && (!l.programId || l.programId === opts.programId)))) ensure(l.id, () => ({ label: l.name, labelId: l.id, color: l.color }));
      ensure('none', () => ({ label: 'No labels', labelId: null }));
      for (const r of rows) {
        if (r.labelIds.length === 0) buckets.get('none')!.submissions.push(r);
        for (const l of r.labelIds) buckets.get(l)?.submissions.push(r);
      }
      break;
    }
    default:
      ensure('all', () => ({ label: 'All submissions' })).submissions.push(...rows);
  }

  const groups = [...buckets.values()];
  for (const g of groups) {
    const requested = g.submissions.reduce((a, s) => a + (s.requestedAmount ?? 0), 0);
    if (requested > 0) g.hint = ws.money(requested, { compact: true });
  }
  if (grouping === 'none') return groups;
  if (opts.board && grouping === 'stage') return groups.filter(g => g.submissions.length > 0 || g.stage || g.drop);
  return showEmpty ? groups : groups.filter(g => g.submissions.length > 0);
}

function DECISION(status: string): DropTarget | undefined {
  return status === 'Accepted' || status === 'Waitlisted' || status === 'Declined' ? { field: 'decision', value: status } : undefined;
}

export function countFilters(filters: SubmissionFilters) {
  return Object.entries(filters).filter(([k, v]) => k !== 'search' && v !== undefined && !(Array.isArray(v) && v.length === 0)).length;
}

export function parseViewConfig(raw: string | null | undefined): { filters: SubmissionFilters; options: Partial<ViewOptions> } {
  try {
    const v = JSON.parse(raw ?? '{}');
    return { filters: v.filters ?? {}, options: v.options ?? {} };
  } catch {
    return { filters: {}, options: {} };
  }
}
