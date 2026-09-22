import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { bulkUpdateSubmissions, deleteSubmissions, setSubmissionLabels, updateSubmission } from 'zitejs/api';
import { errorMessage } from './errors';
import { qk } from './queries';
import type { Submission, SubmissionDetail, SubmissionList, SubmissionPatch } from './types';

/**
 * Submission writes, optimistic everywhere.
 *
 * An edit is written into every cached list and detail that holds the
 * submission before the request leaves, so moving a stage is instant on the
 * list, the board and the open submission at once. On failure every snapshot
 * is restored. List membership (a row that no longer matches its filters)
 * catches up on a short debounce, so a burst of keyboard edits is one refetch.
 */

type Snapshot = Array<[readonly unknown[], unknown]>;

export function snapshot(qc: QueryClient): Snapshot {
  return [...qc.getQueriesData({ queryKey: qk.submissionsRoot }), ...qc.getQueriesData({ queryKey: qk.submissionRoot })];
}

export function restore(qc: QueryClient, snap: Snapshot) {
  for (const [key, data] of snap) qc.setQueryData(key, data);
}

export function patchSubmissionCaches(qc: QueryClient, ids: Set<string>, fn: (s: Submission) => Submission) {
  qc.setQueriesData<SubmissionList>({ queryKey: qk.submissionsRoot }, old =>
    old ? { ...old, submissions: old.submissions.map(s => (ids.has(s.id) ? fn(s) : s)) } : old,
  );
  qc.setQueriesData<SubmissionDetail>({ queryKey: qk.submissionRoot }, old => {
    if (!old?.submission || !ids.has(old.submission.id)) return old;
    return { ...old, submission: { ...old.submission, ...fn(old.submission) } };
  });
}

function removeFromCaches(qc: QueryClient, ids: Set<string>) {
  qc.setQueriesData<SubmissionList>({ queryKey: qk.submissionsRoot }, old =>
    old ? { ...old, submissions: old.submissions.filter(s => !ids.has(s.id)), total: Math.max(0, old.total - ids.size) } : old,
  );
}

const timers = new Map<string, number>();
/** Refetch after a quiet period — many quick edits become one round trip. */
export function refreshSoon(qc: QueryClient, keys: Array<readonly unknown[]>, delay = 1200) {
  for (const key of keys) {
    const id = JSON.stringify(key);
    window.clearTimeout(timers.get(id));
    timers.set(
      id,
      window.setTimeout(() => {
        timers.delete(id);
        qc.invalidateQueries({ queryKey: key });
      }, delay),
    );
  }
}

/** After anything that changes counts shown in the sidebar, programs or queues. */
export function refreshEverythingSoon(qc: QueryClient, delay = 1500) {
  refreshSoon(qc, [qk.submissionsRoot, qk.submissionRoot], delay);
  refreshSoon(qc, [qk.bootstrap, qk.programRoot, qk.myReviewsRoot, qk.awardsRoot, qk.applicantsRoot], delay + 1000);
}

function applyPatch(s: Submission, patch: SubmissionPatch): Submission {
  const next = { ...s, ...patch, lastActivityAt: new Date().toISOString() } as Submission;
  if (patch.stageId && patch.stageId !== s.stageId) {
    next.stageEnteredAt = new Date().toISOString();
    // Reviewers belong to a stage; the new stage starts with none until the server assigns them.
    next.reviewerIds = [];
    next.reviewsActive = 0;
    next.reviewsDoneInStage = 0;
  }
  return next;
}

export function useSubmissionActions() {
  const qc = useQueryClient();

  const update = useCallback(
    async (target: Pick<Submission, 'id' | 'reference'>, patch: SubmissionPatch, opts: { quiet?: boolean; success?: string } = {}) => {
      await qc.cancelQueries({ queryKey: qk.submissionsRoot });
      const snap = snapshot(qc);
      patchSubmissionCaches(qc, new Set([target.id]), s => applyPatch(s, patch));
      try {
        const res = await updateSubmission({ id: target.id, ...patch });
        refreshEverythingSoon(qc, res.assigned ? 300 : 1400);
        if (res.assigned) toast.success(`Assigned ${res.assigned} reviewer${res.assigned === 1 ? '' : 's'} to ${target.reference}`);
        else if (opts.success) toast.success(opts.success);
        return res;
      } catch (e) {
        restore(qc, snap);
        if (!opts.quiet) toast.error(errorMessage(e, `Couldn't update ${target.reference}`));
        throw e;
      }
    },
    [qc],
  );

  const bulkUpdate = useCallback(
    async (targets: Submission[], patch: { stageId?: string; stageName?: string; ownerId?: string | null; addLabelIds?: string[]; removeLabelIds?: string[]; awardStatus?: 'Pending' | 'Active' | 'Completed' | 'Cancelled' }, opts: { success?: string } = {}) => {
      if (!targets.length) return;
      await qc.cancelQueries({ queryKey: qk.submissionsRoot });
      const snap = snapshot(qc);
      const ids = new Set(targets.map(t => t.id));
      patchSubmissionCaches(qc, ids, s => {
        let next = s;
        if (patch.ownerId !== undefined) next = { ...next, ownerId: patch.ownerId };
        if (patch.stageId && s.programId === targets.find(t => t.id === s.id)?.programId) next = applyPatch(next, { stageId: patch.stageId });
        if (patch.addLabelIds || patch.removeLabelIds) {
          const set = new Set(next.labelIds);
          patch.addLabelIds?.forEach(l => set.add(l));
          patch.removeLabelIds?.forEach(l => set.delete(l));
          next = { ...next, labelIds: [...set] };
        }
        if (patch.awardStatus && s.status === 'Accepted') next = { ...next, awardStatus: patch.awardStatus };
        return next;
      });
      try {
        const res = await bulkUpdateSubmissions({ ids: [...ids], ...patch });
        refreshEverythingSoon(qc, 600);
        const parts = [opts.success ?? `Updated ${res.updated} submission${res.updated === 1 ? '' : 's'}`];
        if (res.assigned) parts.push(`assigned ${res.assigned} reviews`);
        if (res.skipped) parts.push(`${res.skipped} skipped`);
        toast.success(parts.join(' · '));
      } catch (e) {
        restore(qc, snap);
        toast.error(errorMessage(e, `Couldn't update ${targets.length} submissions`));
      }
    },
    [qc],
  );

  const setLabels = useCallback(
    async (target: Pick<Submission, 'id' | 'reference'>, labelIds: string[]) => {
      const snap = snapshot(qc);
      patchSubmissionCaches(qc, new Set([target.id]), s => ({ ...s, labelIds }));
      try {
        await setSubmissionLabels({ submissionId: target.id, labelIds });
        refreshSoon(qc, [qk.submissionsRoot, qk.submissionRoot], 1500);
      } catch (e) {
        restore(qc, snap);
        toast.error(errorMessage(e, "Couldn't update labels"));
      }
    },
    [qc],
  );

  const remove = useCallback(
    async (targets: Array<Pick<Submission, 'id' | 'reference'>>) => {
      if (!targets.length) return false;
      const snap = snapshot(qc);
      const ids = new Set(targets.map(t => t.id));
      removeFromCaches(qc, ids);
      try {
        await deleteSubmissions({ ids: [...ids] });
        refreshEverythingSoon(qc, 300);
        toast.success(targets.length === 1 ? `Deleted ${targets[0].reference}` : `Deleted ${targets.length} submissions`);
        return true;
      } catch (e) {
        restore(qc, snap);
        toast.error(errorMessage(e, "Couldn't delete"));
        return false;
      }
    },
    [qc],
  );

  return useMemo(() => ({ update, bulkUpdate, setLabels, remove }), [update, bulkUpdate, setLabels, remove]);
}
