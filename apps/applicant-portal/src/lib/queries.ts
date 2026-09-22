import { useQuery } from '@tanstack/react-query';
import {
  getApplication, getMe, getPortal, getPortalReview, getPublicProgram, getTask, listMyApplications, listPortalReviews,
  type GetApplicationOutputType, type GetMeOutputType, type GetPortalOutputType, type GetPortalReviewOutputType,
  type GetPublicProgramOutputType, type GetTaskOutputType, type ListMyApplicationsOutputType, type ListPortalReviewsOutputType,
} from 'zitejs/api';
import { errorStatus } from './errors';
import { useSession } from './auth';

export type Portal = GetPortalOutputType;
export type PortalProgram = Portal['programs'][number];
export type PublicProgramDetail = GetPublicProgramOutputType;
export type Me = GetMeOutputType;
export type MyApplications = ListMyApplicationsOutputType;
export type MyApplication = MyApplications['applications'][number];
export type MyTask = MyApplications['tasks'][number];
export type ApplicationDetail = GetApplicationOutputType;
export type TaskDetail = GetTaskOutputType;
export type ReviewQueue = ListPortalReviewsOutputType;
export type ReviewDetail = GetPortalReviewOutputType;

/** Every portal query key starts with 'portal' so a sign-out can clear them together. */
export const qk = {
  portal: ['portal', 'site'] as const,
  me: ['portal', 'me'] as const,
  program: (slug: string) => ['portal', 'program', slug] as const,
  myApplications: ['portal', 'my-applications'] as const,
  application: (id: string) => ['portal', 'application', id] as const,
  task: (id: string) => ['portal', 'task', id] as const,
  reviewsRoot: ['portal', 'reviews'] as const,
  reviews: (filter: string) => ['portal', 'reviews', 'list', filter] as const,
  review: (id: string) => ['portal', 'reviews', 'detail', id] as const,
};

// Don't hammer an endpoint that said "not yours" or "not found".
const retry = (count: number, e: unknown) => {
  const s = errorStatus(e);
  if (s && s >= 400 && s < 500) return false;
  return count < 2;
};

export function usePortal() {
  return useQuery({ queryKey: qk.portal, queryFn: () => getPortal({}), staleTime: 60_000, retry });
}

export function useProgram(slug: string | undefined) {
  return useQuery({ queryKey: qk.program(slug ?? ''), queryFn: () => getPublicProgram({ slug: slug! }), enabled: Boolean(slug), staleTime: 30_000, retry });
}

export function useMe() {
  const { user } = useSession();
  return useQuery({ queryKey: qk.me, queryFn: () => getMe({}), enabled: Boolean(user), staleTime: 20_000, retry });
}

export function useMyApplications(enabled = true) {
  const { user } = useSession();
  return useQuery({ queryKey: qk.myApplications, queryFn: () => listMyApplications({}), enabled: Boolean(user) && enabled, staleTime: 10_000, retry });
}

export function useApplication(id: string | undefined) {
  const { user } = useSession();
  return useQuery({ queryKey: qk.application(id ?? ''), queryFn: () => getApplication({ id: id! }), enabled: Boolean(user && id), retry });
}

export function useTask(id: string | undefined) {
  const { user } = useSession();
  return useQuery({ queryKey: qk.task(id ?? ''), queryFn: () => getTask({ id: id! }), enabled: Boolean(user && id), retry });
}

export function useReviewQueue(filter: 'todo' | 'done' | 'all') {
  const { user } = useSession();
  return useQuery({ queryKey: qk.reviews(filter), queryFn: () => listPortalReviews({ filter }), enabled: Boolean(user), retry, placeholderData: prev => prev });
}

export function useReviewDetail(id: string | undefined) {
  const { user } = useSession();
  return useQuery({ queryKey: qk.review(id ?? ''), queryFn: () => getPortalReview({ id: id! }), enabled: Boolean(user && id), retry, refetchOnWindowFocus: false });
}
