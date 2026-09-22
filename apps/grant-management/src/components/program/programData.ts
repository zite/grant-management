import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { getProgramOverview, getReviewProgress, listProgramStats, type GetProgramOverviewOutputType, type GetReviewProgressOutputType } from 'zitejs/api';
import { errorMessage } from '../../lib/errors';
import { qk } from '../../lib/queries';
import type { Bootstrap } from '../../lib/types';

/**
 * Program area data. Keys live under `qk.programRoot`, which the shared
 * refresh helpers already invalidate after submission changes.
 */

export type ProgramOverview = GetProgramOverviewOutputType;
export type ProgramDetails = ProgramOverview['program'];
export type ProgramStats = NonNullable<ProgramOverview['stats']>;
export type ReviewProgressData = GetReviewProgressOutputType;
export type ReviewerRow = ReviewProgressData['reviewers'][number];

export const viewerTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export const programKeys = {
  overview: (id: string) => [...qk.programRoot, id, 'overview'] as const,
  details: (id: string) => [...qk.programRoot, id, 'details'] as const,
  reviews: (id: string, stageId: string | null) => [...qk.programRoot, id, 'reviews', stageId ?? 'all'] as const,
  stats: (days: number) => [...qk.programRoot, 'stats', days] as const,
};

export function useProgramOverview(programId: string) {
  return useQuery({
    queryKey: programKeys.overview(programId),
    queryFn: () => getProgramOverview({ programId, timeZone: viewerTimeZone() }),
    staleTime: 20_000,
    enabled: Boolean(programId),
  });
}

/** The full program record without the statistics — what settings forms edit. */
export function useProgramDetails(programId: string) {
  return useQuery({
    queryKey: programKeys.details(programId),
    queryFn: async () => (await getProgramOverview({ programId, detailsOnly: true })).program,
    staleTime: 10_000,
    enabled: Boolean(programId),
  });
}

export function useReviewProgress(programId: string, stageId: string | null) {
  return useQuery({
    queryKey: programKeys.reviews(programId, stageId),
    queryFn: () => getReviewProgress({ programId, stageId }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    enabled: Boolean(programId),
  });
}

export function useProgramStats(days = 30) {
  return useQuery({
    queryKey: programKeys.stats(days),
    queryFn: () => listProgramStats({ days, timeZone: viewerTimeZone() }),
    staleTime: 60_000,
  });
}

type RunOptions<T> = {
  success?: string | ((res: T) => string | null);
  error: string;
  /** Written into the bootstrap cache before the request leaves, rolled back on failure. */
  optimistic?: (data: Bootstrap) => Bootstrap;
  /** Also refetch submission lists (a stage deleted, a key changed). */
  submissions?: boolean;
  quiet?: boolean;
};

/**
 * Every program write goes through here: optional optimistic bootstrap
 * patch, the call, a toast either way, then a refetch of bootstrap and the
 * program's own queries so every surface agrees with the server.
 */
export function useProgramMutation() {
  const qc = useQueryClient();
  return useCallback(
    async <T,>(request: () => Promise<T>, opts: RunOptions<T>): Promise<T | undefined> => {
      let previous: Bootstrap | undefined;
      if (opts.optimistic) {
        await qc.cancelQueries({ queryKey: qk.bootstrap });
        previous = qc.getQueryData<Bootstrap>(qk.bootstrap);
        if (previous) qc.setQueryData<Bootstrap>(qk.bootstrap, opts.optimistic(previous));
      }
      try {
        const res = await request();
        const message = typeof opts.success === 'function' ? opts.success(res) : opts.success;
        if (message) toast.success(message);
        return res;
      } catch (e) {
        if (previous) qc.setQueryData(qk.bootstrap, previous);
        if (!opts.quiet) toast.error(errorMessage(e, opts.error));
        if (opts.quiet) throw e;
        return undefined;
      } finally {
        qc.invalidateQueries({ queryKey: qk.programRoot });
        if (opts.submissions) {
          qc.invalidateQueries({ queryKey: qk.submissionsRoot });
          qc.invalidateQueries({ queryKey: qk.submissionRoot });
        }
        await qc.invalidateQueries({ queryKey: qk.bootstrap });
      }
    },
    [qc],
  );
}
