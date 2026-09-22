import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getApplicant, listApplicants, type GetApplicantOutputType, type ListApplicantsInputType, type ListApplicantsOutputType } from 'zitejs/api';
import { qk, retryUnlessNotFound } from '../../lib/queries';

export type ApplicantRow = ListApplicantsOutputType['applicants'][number];
export type ApplicantDetail = GetApplicantOutputType;
export type ApplicantSort = NonNullable<ListApplicantsInputType['sort']>;

/** Under the shared `applicants` root, so anything that refreshes applicants after a write refreshes these too. */
export const applicantKeys = {
  list: (params: { search: string; programId: string | null; sort: ApplicantSort }) => [...qk.applicantsRoot, 'list', params] as const,
  detail: (id: string) => [...qk.applicantsRoot, 'detail', id] as const,
};

export function useApplicants(params: { search: string; programId: string | null; sort: ApplicantSort }) {
  return useQuery({
    queryKey: applicantKeys.list(params),
    queryFn: () => listApplicants({ search: params.search || undefined, programId: params.programId, sort: params.sort }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useApplicant(id: string | null | undefined) {
  return useQuery({
    queryKey: applicantKeys.detail(id ?? ''),
    queryFn: () => getApplicant({ id: id! }),
    enabled: Boolean(id),
    staleTime: 15_000,
    retry: retryUnlessNotFound,
  });
}

export const SORTS: Array<{ value: ApplicantSort; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'last_active', label: 'Last active' },
  { value: 'applications', label: 'Most applications' },
  { value: 'awarded', label: 'Most awarded' },
];

/**
 * A spreadsheet cell that can't run as a formula. Excel and Sheets evaluate a
 * cell starting with = + - @ (or a tab/return), so those get a leading quote.
 */
export function csvCell(value: unknown) {
  let s = value == null ? '' : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]) {
  return [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
}

export const ensureHttps = (v: string) => {
  const t = v.trim();
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
