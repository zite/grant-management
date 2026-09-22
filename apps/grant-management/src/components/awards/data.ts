import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query';
import { listAwards, listPayments, type ListAwardsInputType, type ListAwardsOutputType, type ListPaymentsInputType, type ListPaymentsOutputType } from 'zitejs/api';
import { qk } from '../../lib/queries';
import { todayString } from '../../lib/format';

/**
 * Awards and payments data. Everything lives under the reserved `['awards']`
 * key, so a payment saved anywhere (the award panel, this page, a dialog)
 * refreshes every award surface with one invalidation.
 */

export type AwardList = ListAwardsOutputType;
export type AwardRow = AwardList['awards'][number];
export type AwardTotals = AwardList['totals'];
export type PaymentList = ListPaymentsOutputType;
export type PaymentRow = PaymentList['payments'][number];

export type AwardFilters = Omit<ListAwardsInputType, 'today'>;
export type PaymentFilters = Omit<ListPaymentsInputType, 'today'>;

export const awardKeys = {
  root: qk.awardsRoot,
  list: (filters: AwardFilters) => [...qk.awardsRoot, 'list', filters] as const,
  listsRoot: [...qk.awardsRoot, 'list'] as const,
  payments: (filters: PaymentFilters) => [...qk.awardsRoot, 'payments', filters] as const,
  paymentsRoot: [...qk.awardsRoot, 'payments'] as const,
};

export const AWARD_STATUSES = ['Pending', 'Active', 'Completed', 'Cancelled'] as const;
export type AwardStatus = (typeof AWARD_STATUSES)[number];
export const PAYMENT_STATUSES = ['Scheduled', 'Paid', 'On hold', 'Cancelled'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_METHODS = ['ACH', 'Check', 'Wire', 'Card', 'Other'] as const;

export const AWARD_STATUS_META: Record<string, { label: string; description: string; dot: string; text: string }> = {
  Pending: { label: 'Pending', description: 'Nothing paid yet', dot: 'bg-tone-warning', text: 'text-tone-warning' },
  Active: { label: 'Active', description: 'Payments underway', dot: 'bg-tone-info', text: 'text-tone-info' },
  Completed: { label: 'Completed', description: 'Paid out, closed', dot: 'bg-tone-success', text: 'text-tone-success' },
  Cancelled: { label: 'Cancelled', description: 'Won’t be paid', dot: 'bg-tone-neutral', text: 'text-muted-foreground' },
};

export const PAYMENT_STATUS_META: Record<string, { label: string; chip: string; dot: string }> = {
  Scheduled: { label: 'Scheduled', chip: 'bg-tone-info/[0.1] text-tone-info', dot: 'bg-tone-info' },
  Paid: { label: 'Paid', chip: 'bg-tone-success/[0.1] text-tone-success', dot: 'bg-tone-success' },
  'On hold': { label: 'On hold', chip: 'bg-tone-warning/[0.12] text-tone-warning', dot: 'bg-tone-warning' },
  Cancelled: { label: 'Cancelled', chip: 'bg-muted text-muted-foreground', dot: 'bg-tone-neutral' },
};

export function useAwards(filters: AwardFilters) {
  return useQuery({
    queryKey: awardKeys.list(filters),
    queryFn: () => listAwards({ ...filters, today: todayString() }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function usePayments(filters: PaymentFilters, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: awardKeys.payments(filters),
    queryFn: () => listPayments({ ...filters, today: todayString() }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    enabled: opts.enabled ?? true,
  });
}

type Snapshot = Array<[readonly unknown[], unknown]>;

export function snapshotAwards(qc: QueryClient): Snapshot {
  return qc.getQueriesData({ queryKey: qk.awardsRoot });
}

export function restoreAwards(qc: QueryClient, snap: Snapshot) {
  for (const [key, data] of snap) qc.setQueryData(key, data);
}

/** Write a change into every cached awards list that holds the award. */
export function patchAwardCaches(qc: QueryClient, id: string, fn: (a: AwardRow) => AwardRow) {
  qc.setQueriesData<AwardList>({ queryKey: awardKeys.listsRoot }, old => (old ? { ...old, awards: old.awards.map(a => (a.id === id ? fn(a) : a)) } : old));
}

export function patchPaymentCaches(qc: QueryClient, id: string, fn: (p: PaymentRow) => PaymentRow) {
  qc.setQueriesData<PaymentList>({ queryKey: awardKeys.paymentsRoot }, old => (old ? { ...old, payments: old.payments.map(p => (p.id === id ? fn(p) : p)) } : old));
}

/** Filter presets for payment dates. Paid payments are dated by when they were paid, the rest by when they're due. */
export type DatePreset = 'all' | 'this_month' | 'next_30' | 'overdue' | 'paid_this_year';

export const DATE_PRESETS: Array<{ value: DatePreset; label: string; hint?: string }> = [
  { value: 'all', label: 'Any date' },
  { value: 'this_month', label: 'This month', hint: 'Due or paid this month' },
  { value: 'next_30', label: 'Next 30 days', hint: 'Unpaid, due by then' },
  { value: 'overdue', label: 'Overdue', hint: 'Unpaid and past due' },
  { value: 'paid_this_year', label: 'Paid this year' },
];

export function presetFilters(preset: DatePreset, today = new Date()): Pick<PaymentFilters, 'from' | 'to' | 'overdueOnly' | 'statuses'> {
  const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  switch (preset) {
    case 'this_month':
      return { from: day(new Date(today.getFullYear(), today.getMonth(), 1)), to: day(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
    case 'next_30':
      // Everything still to pay by 30 days from now — including anything already late.
      return { to: day(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30)), statuses: ['Scheduled', 'On hold'] };
    case 'overdue':
      return { overdueOnly: true };
    case 'paid_this_year':
      return { from: day(new Date(today.getFullYear(), 0, 1)), statuses: ['Paid'] };
    default:
      return {};
  }
}

