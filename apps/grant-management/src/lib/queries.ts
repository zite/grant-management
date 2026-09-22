import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { bootstrap, getForm, getReview, getSubmission, listMyReviews, listSubmissions, search } from 'zitejs/api';
import type { Ordering, SubmissionFilters } from './types';

/**
 * Query keys in one place, so invalidation and optimistic writes can't drift
 * from reads. Feature areas add their own keys under a distinct first segment
 * (see `qk` users across components) and invalidate by that segment.
 */
export const qk = {
  bootstrap: ['bootstrap'] as const,
  submissionsRoot: ['submissions'] as const,
  submissions: (filters: SubmissionFilters, ordering: string, includeAnswers = false) => ['submissions', { filters, ordering, includeAnswers }] as const,
  submissionRoot: ['submission'] as const,
  submission: (idOrRef: string) => ['submission', idOrRef] as const,
  myReviewsRoot: ['my-reviews'] as const,
  myReviews: (filter: string, programId?: string) => ['my-reviews', filter, programId ?? 'all'] as const,
  reviewRoot: ['review'] as const,
  review: (id: string) => ['review', id] as const,
  notificationsRoot: ['notifications'] as const,
  programRoot: ['program'] as const,
  applicantsRoot: ['applicants'] as const,
  awardsRoot: ['awards'] as const,
  reportsRoot: ['reports'] as const,
  formRoot: ['form'] as const,
  searchRoot: ['search'] as const,
};

export function useBootstrap() {
  return useQuery({ queryKey: qk.bootstrap, queryFn: () => bootstrap({}), staleTime: 60_000, refetchOnWindowFocus: true });
}

export function useSubmissions(filters: SubmissionFilters, ordering: Ordering = 'submitted_desc', opts: { enabled?: boolean; includeAnswers?: boolean } = {}) {
  return useQuery({
    queryKey: qk.submissions(filters, ordering, Boolean(opts.includeAnswers)),
    queryFn: () => listSubmissions({ filters, ordering, limit: 1000, includeAnswers: opts.includeAnswers }),
    enabled: opts.enabled ?? true,
    placeholderData: keepPreviousData,
    staleTime: 20_000,
  });
}

/** A missing record won't appear on retry; everything else (network, 5xx) gets a couple more tries. */
export const retryUnlessNotFound = (count: number, error: unknown) => !/not found|\(404\)/i.test(String((error as Error)?.message ?? '')) && count < 2;

export const isReference = (s: string) => /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(s);

export function useSubmission(idOrRef: string | null | undefined) {
  const key = idOrRef ?? '';
  return useQuery({
    queryKey: qk.submission(isReference(key) ? key.toUpperCase() : key),
    queryFn: () => getSubmission(isReference(key) ? { reference: key } : { id: key }),
    enabled: Boolean(key),
    staleTime: 10_000,
    retry: retryUnlessNotFound,
  });
}

export function useMyReviews(filter: 'todo' | 'done' | 'all', programId?: string) {
  return useQuery({
    queryKey: qk.myReviews(filter, programId),
    queryFn: () => listMyReviews({ filter, programId }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useReview(id: string | null | undefined) {
  return useQuery({ queryKey: qk.review(id ?? ''), queryFn: () => getReview({ id: id! }), enabled: Boolean(id), retry: retryUnlessNotFound, staleTime: 5_000 });
}

export function useForm(id: string | null | undefined) {
  return useQuery({ queryKey: ['form', id ?? ''], queryFn: () => getForm({ id: id! }), enabled: Boolean(id), staleTime: 30_000, retry: retryUnlessNotFound });
}

export function useSearch(q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: [...qk.searchRoot, query],
    queryFn: () => search({ query, limit: 10 }),
    enabled: query.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}
