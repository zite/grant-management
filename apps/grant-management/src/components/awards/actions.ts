import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { savePayment, updateSubmission } from 'zitejs/api';
import { errorMessage } from '../../lib/errors';
import { patchSubmissionCaches, refreshSoon } from '../../lib/mutations';
import { qk } from '../../lib/queries';
import { todayString } from '../../lib/format';
import { awardKeys, patchAwardCaches, patchPaymentCaches, restoreAwards, snapshotAwards, type AwardRow, type AwardStatus, type PaymentRow, type PaymentStatus } from './data';

/**
 * Award and payment writes, optimistic on this page and mirrored into any
 * open submission so the award panel agrees without a reload. Money totals
 * (paid, scheduled, KPIs) catch up from the server a moment later.
 */
export function useAwardActions() {
  const qc = useQueryClient();

  const settle = useCallback(
    (delay = 500) => {
      refreshSoon(qc, [qk.awardsRoot], delay);
      refreshSoon(qc, [qk.submissionRoot, qk.submissionsRoot, qk.reportsRoot], delay + 400);
    },
    [qc],
  );

  const setAwardStatus = useCallback(
    async (award: Pick<AwardRow, 'id' | 'reference' | 'awardStatus'>, next: AwardStatus) => {
      if (award.awardStatus === next) return;
      await qc.cancelQueries({ queryKey: awardKeys.listsRoot });
      const snap = snapshotAwards(qc);
      const subSnap = [...qc.getQueriesData({ queryKey: qk.submissionsRoot }), ...qc.getQueriesData({ queryKey: qk.submissionRoot })];
      patchAwardCaches(qc, award.id, a => ({ ...a, awardStatus: next }));
      patchSubmissionCaches(qc, new Set([award.id]), s => ({ ...s, awardStatus: next }));
      try {
        await updateSubmission({ id: award.id, awardStatus: next });
        settle(900);
        toast.success(`${award.reference} is now ${next.toLowerCase()}`);
      } catch (e) {
        restoreAwards(qc, snap);
        for (const [key, data] of subSnap) qc.setQueryData(key, data);
        toast.error(errorMessage(e, `Couldn't update ${award.reference}`));
      }
    },
    [qc, settle],
  );

  /** Mark a payment paid today, with an undo that puts back its status — and the award's, if paying moved it from Pending to Active. */
  const markPaid = useCallback(
    async (payment: Pick<PaymentRow, 'id' | 'name' | 'amount' | 'status' | 'paidDate' | 'submissionId' | 'submissionReference' | 'awardStatus'>, money: (n: number) => string) => {
      if (payment.status === 'Paid') return;
      const today = todayString();
      const before = { status: payment.status as PaymentStatus, paidDate: payment.paidDate };
      await qc.cancelQueries({ queryKey: awardKeys.paymentsRoot });
      const snap = snapshotAwards(qc);
      patchPaymentCaches(qc, payment.id, p => ({ ...p, status: 'Paid', paidDate: today, overdue: false }));
      try {
        await savePayment({ action: 'update', id: payment.id, status: 'Paid', paidDate: today });
        settle();
        toast.success(`${payment.name || 'Payment'} marked paid · ${money(payment.amount)}`, {
          description: payment.submissionReference || undefined,
          duration: 7000,
          action: {
            label: 'Undo',
            onClick: async () => {
              patchPaymentCaches(qc, payment.id, p => ({ ...p, status: before.status, paidDate: before.paidDate }));
              try {
                await savePayment({ action: 'update', id: payment.id, status: before.status });
                if (payment.awardStatus === 'Pending') await updateSubmission({ id: payment.submissionId, awardStatus: 'Pending' });
                settle(200);
                toast.message(`${payment.name || 'Payment'} is ${before.status.toLowerCase()} again`);
              } catch (e) {
                settle(0);
                toast.error(errorMessage(e, "Couldn't undo that"));
              }
            },
          },
        });
      } catch (e) {
        restoreAwards(qc, snap);
        toast.error(errorMessage(e, "Couldn't mark the payment paid"));
      }
    },
    [qc, settle],
  );

  /** Put on hold, resume, or cancel — one field, optimistic. */
  const setPaymentStatus = useCallback(
    async (payment: Pick<PaymentRow, 'id' | 'name' | 'status'>, next: Exclude<PaymentStatus, 'Paid'>) => {
      if (payment.status === next) return;
      await qc.cancelQueries({ queryKey: awardKeys.paymentsRoot });
      const snap = snapshotAwards(qc);
      patchPaymentCaches(qc, payment.id, p => ({ ...p, status: next, paidDate: null }));
      try {
        await savePayment({ action: 'update', id: payment.id, status: next });
        settle();
        toast.success(next === 'On hold' ? `${payment.name} is on hold` : next === 'Cancelled' ? `${payment.name} cancelled` : `${payment.name} is scheduled again`);
      } catch (e) {
        restoreAwards(qc, snap);
        toast.error(errorMessage(e, "Couldn't update the payment"));
      }
    },
    [qc, settle],
  );

  const deletePayment = useCallback(
    async (payment: Pick<PaymentRow, 'id' | 'name'>) => {
      const snap = snapshotAwards(qc);
      qc.setQueriesData<{ payments: PaymentRow[] }>({ queryKey: awardKeys.paymentsRoot }, old => (old ? { ...old, payments: old.payments.filter(p => p.id !== payment.id) } : old));
      try {
        await savePayment({ action: 'delete', id: payment.id });
        settle(200);
        toast.success(`Deleted ${payment.name || 'payment'}`);
      } catch (e) {
        restoreAwards(qc, snap);
        toast.error(errorMessage(e, "Couldn't delete the payment"));
      }
    },
    [qc, settle],
  );

  return useMemo(() => ({ setAwardStatus, markPaid, setPaymentStatus, deletePayment }), [setAwardStatus, markPaid, setPaymentStatus, deletePayment]);
}
