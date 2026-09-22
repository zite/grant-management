import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { savePayment } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Textarea } from '@project/components/ui/textarea';
import { cn } from '@project/components/lib/utils';
import { currencySymbol } from '@project/shared/ui/FormRenderer';
import { errorMessage } from '../../lib/errors';
import { longDate, todayString } from '../../lib/format';
import { MOD } from '../../lib/hotkeys';
import { qk } from '../../lib/queries';
import type { Payment, SubmissionDetail } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { DatePicker } from '../pickers/pickers';
import { Kbd } from '../primitives/bits';
import { PAYMENT_METHODS, PAYMENT_STATUSES, PAYMENT_STATUS_META, awardKeys, type AwardList, type PaymentStatus } from './data';

type AwardContext = { reference: string; title: string; awardAmount: number | null; paid: number; committed: number };

/** What the dialog can say about the award without fetching: read from whichever list or detail already holds it. */
function useAwardContext(submissionId: string, open: boolean): AwardContext | null {
  const qc = useQueryClient();
  return useMemo(() => {
    if (!open || !submissionId) return null;
    for (const [, data] of qc.getQueriesData<SubmissionDetail>({ queryKey: qk.submissionRoot })) {
      const s = data?.submission;
      if (s?.id === submissionId) {
        const live = data!.payments.filter(p => p.status !== 'Cancelled');
        return {
          reference: s.reference,
          title: s.title,
          awardAmount: s.awardAmount,
          paid: live.filter(p => p.status === 'Paid').reduce((sum, p) => sum + p.amount, 0),
          committed: live.reduce((sum, p) => sum + p.amount, 0),
        };
      }
    }
    for (const [, data] of qc.getQueriesData<AwardList>({ queryKey: awardKeys.listsRoot })) {
      const a = data?.awards.find(x => x.id === submissionId);
      if (a) return { reference: a.reference, title: a.title, awardAmount: a.awardAmount, paid: a.paid, committed: a.paid + a.scheduled + a.onHold };
    }
    return null;
  }, [qc, submissionId, open]);
}

const parseAmount = (s: string) => {
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return s.trim() && Number.isFinite(n) ? n : null;
};

/**
 * Schedule, record, edit or remove one payment on an accepted submission.
 * `payment` null or absent = create. Saves through `savePayment`, refreshes
 * every submission and award surface, and toasts.
 */
export function PaymentDialog({ open, onOpenChange, submissionId, payment, defaultAmount, onSaved }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  submissionId: string;
  payment?: Payment | null;
  defaultAmount?: number | null;
  onSaved?: () => void;
}) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const context = useAwardContext(submissionId, open);
  const editing = Boolean(payment);
  const symbol = currencySymbol(ws.settings.currency);

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [status, setStatus] = useState<PaymentStatus>('Scheduled');
  const [paidDate, setPaidDate] = useState<string | null>(null);
  const [method, setMethod] = useState<string>('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [touched, setTouched] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  // Reset from the payment (or sensible defaults) each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const remaining = context?.awardAmount != null ? Math.max(0, context.awardAmount - context.committed) : null;
    const initialAmount = payment ? payment.amount : defaultAmount ?? (remaining && remaining > 0 ? remaining : null);
    setName(payment?.name ?? '');
    setAmount(initialAmount != null ? String(initialAmount) : '');
    setDueDate(payment?.dueDate ?? null);
    setStatus(((PAYMENT_STATUSES as readonly string[]).includes(payment?.status ?? '') ? payment!.status : 'Scheduled') as PaymentStatus);
    setPaidDate(payment?.paidDate ?? null);
    setMethod(payment?.method ?? '');
    setReference(payment?.reference ?? '');
    setNotes(payment?.notes ?? '');
    setConfirmDelete(false);
    setTouched(false);
    setBusy(null);
  }, [open, payment?.id]);

  const amountValue = parseAmount(amount);
  const amountError = touched && (amountValue == null || amountValue <= 0) ? 'Enter an amount greater than zero' : null;
  const effectivePaidDate = status === 'Paid' ? paidDate ?? todayString() : null;
  const after = context?.awardAmount != null && amountValue != null ? context.committed - (payment && payment.status !== 'Cancelled' ? payment.amount : 0) + (status === 'Cancelled' ? 0 : amountValue) : null;
  const overCommitted = context?.awardAmount != null && after != null && after > context.awardAmount + 0.005;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.submissionRoot });
    qc.invalidateQueries({ queryKey: qk.awardsRoot });
    qc.invalidateQueries({ queryKey: qk.reportsRoot });
  };

  const save = async () => {
    setTouched(true);
    if (amountValue == null || amountValue <= 0) {
      amountRef.current?.focus();
      return;
    }
    setBusy('save');
    try {
      const fields = {
        name: name.trim() || (editing ? 'Payment' : undefined),
        amount: amountValue,
        dueDate,
        status,
        paidDate: effectivePaidDate,
        method: (method || null) as (typeof PAYMENT_METHODS)[number] | null,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      };
      if (payment) await savePayment({ action: 'update', id: payment.id, ...fields });
      else await savePayment({ action: 'create', submissionId, ...fields });
      refresh();
      const label = fields.name || 'Payment';
      toast.success(
        !payment
          ? status === 'Paid'
            ? `Recorded ${ws.money(amountValue)} paid`
            : `Scheduled ${ws.money(amountValue)}${dueDate ? ` for ${longDate(dueDate)}` : ''}`
          : payment.status !== 'Paid' && status === 'Paid'
            ? `${label} marked paid`
            : `${label} updated`,
      );
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error(errorMessage(e, payment ? "Couldn't update the payment" : "Couldn't save the payment"));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!payment) return;
    setBusy('delete');
    try {
      await savePayment({ action: 'delete', id: payment.id });
      refresh();
      toast.success(`Deleted ${payment.name || 'payment'}`);
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't delete the payment"));
    } finally {
      setBusy(null);
    }
  };

  const label = 'text-xs font-medium text-muted-foreground';
  const field = 'h-9 w-full rounded-md border border-input bg-background px-3 text-[13px] outline-none transition-colors placeholder:text-muted-foreground focus:border-primary';
  const idp = `payment-${payment?.id ?? 'new'}`;

  return (
    <Dialog open={open} onOpenChange={o => !busy && onOpenChange(o)}>
      <DialogContent
        className="max-w-lg gap-0 p-0"
        onOpenAutoFocus={e => {
          e.preventDefault();
          window.setTimeout(() => (editing ? document.getElementById(`${idp}-name`) : amountRef.current)?.focus(), 0);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (!busy && !confirmDelete) save();
          }
        }}
      >
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle className="text-[15px]">{editing ? 'Edit payment' : 'Schedule a payment'}</DialogTitle>
          <DialogDescription className="text-[13px]">
            {context ? (
              <>
                <span className="font-medium text-foreground">{context.reference}</span>
                {context.title && <> · {context.title}</>}
                {context.awardAmount != null && (
                  <span className="mt-1 block text-xs">
                    Award {ws.money(context.awardAmount)} · {ws.money(context.paid)} paid · {ws.money(Math.max(0, context.awardAmount - context.committed))} not yet scheduled
                  </span>
                )}
              </>
            ) : editing ? (
              'Change the amount, dates or how it was paid.'
            ) : (
              'Add an installment to this award’s payment schedule.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 pb-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_150px]">
            <div className="space-y-1.5">
              <label htmlFor={`${idp}-name`} className={label}>Name</label>
              <input id={`${idp}-name`} value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="e.g. Installment 1 of 2" className={field} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${idp}-amount`} className={label}>Amount</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">{symbol}</span>
                <input
                  id={`${idp}-amount`}
                  ref={amountRef}
                  inputMode="decimal"
                  value={amount}
                  onChange={e => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                  onBlur={() => setTouched(true)}
                  aria-invalid={Boolean(amountError)}
                  aria-describedby={amountError ? `${idp}-amount-error` : undefined}
                  placeholder="0"
                  className={cn(field, 'pl-7 text-right tabular-nums', amountError && 'border-destructive focus:border-destructive')}
                />
              </div>
            </div>
          </div>
          {(amountError || overCommitted) && (
            <p id={`${idp}-amount-error`} className={cn('-mt-2 text-xs', amountError ? 'text-tone-danger' : 'text-tone-warning')}>
              {amountError ?? `This brings the schedule to ${ws.money(after)}, more than the ${ws.money(context!.awardAmount)} award.`}
            </p>
          )}

          <div className="space-y-1.5">
            <span className={label} id={`${idp}-status`}>Status</span>
            <div role="radiogroup" aria-labelledby={`${idp}-status`} className="grid grid-cols-2 gap-1 rounded-lg border bg-subtle p-1 sm:grid-cols-4">
              {PAYMENT_STATUSES.map(s => {
                const on = status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setStatus(s);
                      if (s === 'Paid' && !paidDate) setPaidDate(todayString());
                    }}
                    className={cn(
                      'flex h-7 items-center justify-center gap-1.5 rounded-md text-[12.5px] transition-colors',
                      on ? 'bg-background font-medium text-foreground shadow-xs ring-1 ring-border' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', PAYMENT_STATUS_META[s].dot)} aria-hidden />
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className={label}>Due date</span>
              <DatePicker
                value={dueDate}
                onChange={setDueDate}
                clearLabel="No due date"
                trigger={
                  <button type="button" className={cn(field, 'flex items-center gap-2 text-left', !dueDate && 'text-muted-foreground')} aria-label={dueDate ? `Due ${longDate(dueDate)}` : 'Set a due date'}>
                    <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{dueDate ? longDate(dueDate) : 'No due date'}</span>
                  </button>
                }
              />
            </div>
            {status === 'Paid' ? (
              <div className="space-y-1.5 animate-fade-in">
                <span className={label}>Paid on</span>
                <DatePicker
                  value={effectivePaidDate}
                  onChange={d => setPaidDate(d ?? todayString())}
                  presets={false}
                  clearLabel="Reset to today"
                  trigger={
                    <button type="button" className={cn(field, 'flex items-center gap-2 text-left')} aria-label={`Paid ${longDate(effectivePaidDate)}`}>
                      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{longDate(effectivePaidDate)}</span>
                    </button>
                  }
                />
              </div>
            ) : (
              <div className="hidden sm:block" />
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className={label} id={`${idp}-method`}>Method</span>
              <Select value={method || '__none__'} onValueChange={v => setMethod(v === '__none__' ? '' : v)}>
                <SelectTrigger aria-labelledby={`${idp}-method`} className="h-9 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-[13px] text-muted-foreground">Not set</SelectItem>
                  {PAYMENT_METHODS.map(m => (
                    <SelectItem key={m} value={m} className="text-[13px]">{m === 'ACH' ? 'ACH transfer' : m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${idp}-reference`} className={label}>Reference number</label>
              <input id={`${idp}-reference`} value={reference} onChange={e => setReference(e.target.value)} maxLength={120} placeholder="Check or transfer number" className={field} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`${idp}-notes`} className={label}>Notes</label>
            <Textarea id={`${idp}-notes`} value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} placeholder="Anything finance should know — held for a signed agreement, split across two checks…" className="min-h-[64px] text-[13px]" />
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t px-5 py-3 sm:justify-between sm:space-x-0">
          {confirmDelete ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2 animate-fade-in">
              <span className="text-[13px]">Delete this payment? It comes off the award’s schedule.</span>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => setConfirmDelete(false)} disabled={busy === 'delete'}>Keep it</Button>
                <Button size="sm" autoFocus className="h-8 bg-destructive text-[13px] text-destructive-foreground hover:bg-destructive/90" onClick={remove} disabled={busy === 'delete'}>
                  {busy === 'delete' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Delete payment
                </Button>
              </div>
            </div>
          ) : (
            <>
              {payment && payment.status !== 'Paid' ? (
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-[13px] text-muted-foreground hover:text-tone-danger" onClick={() => setConfirmDelete(true)} disabled={Boolean(busy)}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              ) : payment ? (
                <span className="hidden text-xs text-muted-foreground sm:block">Paid payments stay on record — cancel instead of deleting.</span>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => onOpenChange(false)} disabled={Boolean(busy)}>Cancel</Button>
                <Button size="sm" className="h-8 gap-2 text-[13px]" onClick={save} disabled={Boolean(busy)}>
                  {busy === 'save' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {editing ? 'Save' : status === 'Paid' ? 'Record payment' : 'Schedule payment'}
                  <Kbd className="hidden border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground/80 shadow-none sm:inline-flex">{MOD}↵</Kbd>
                </Button>
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
