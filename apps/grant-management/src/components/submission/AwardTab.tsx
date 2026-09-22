import { AlertTriangle, Banknote, CalendarDays, Check, Loader2, MoreHorizontal, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { savePayment } from 'zitejs/api';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { cn } from '@project/components/lib/utils';
import { AWARD_STATUSES } from '@project/shared/status';
import { errorMessage } from '../../lib/errors';
import { dueLabel, percent, shortDate } from '../../lib/format';
import { useSubmissionActions } from '../../lib/mutations';
import type { Payment, SubmissionDetail } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { ProgressBar } from '../primitives/bits';
import { DatePicker } from '../pickers/pickers';
import { PaymentDialog } from '../awards/PaymentDialog';
import { InlineMoney, ToneChip, useDetailCache, type Tone } from './detailBits';

const PAYMENT_TONE: Record<string, Tone> = { Scheduled: 'neutral', Paid: 'success', 'On hold': 'warning', Cancelled: 'neutral' };
const AWARD_TONE: Record<string, string> = { Pending: 'text-muted-foreground', Active: 'text-tone-info', Completed: 'text-tone-success', Cancelled: 'text-tone-danger' };

export function AwardTab({ detail }: { detail: SubmissionDetail }) {
  const ws = useWorkspace();
  const actions = useSubmissionActions();
  const { patch, refresh } = useDetailCache(detail.submission.id);
  const { submission, payments } = detail;
  const [dialog, setDialog] = useState<{ open: boolean; payment: Payment | null }>({ open: false, payment: null });
  const [paying, setPaying] = useState<string | null>(null);

  const award = submission.awardAmount ?? 0;
  const live = payments.filter(p => p.status !== 'Cancelled');
  const paid = live.filter(p => p.status === 'Paid').reduce((a, p) => a + p.amount, 0);
  const scheduled = live.filter(p => p.status !== 'Paid').reduce((a, p) => a + p.amount, 0);
  const unscheduled = Math.max(0, award - paid - scheduled);
  const over = paid + scheduled - award;

  const update = (patchValue: Parameters<typeof actions.update>[1], success?: string) => actions.update(submission, patchValue, { success }).catch(() => undefined);

  const markPaid = async (p: Payment) => {
    setPaying(p.id);
    const today = new Date().toISOString().slice(0, 10);
    patch(d => ({ ...d, payments: d.payments.map(x => (x.id === p.id ? { ...x, status: 'Paid', paidDate: today } : x)) }));
    try {
      await savePayment({ action: 'update', id: p.id, status: 'Paid', paidDate: today });
      toast.success(`Recorded ${ws.money(p.amount)} as paid`);
      refresh({ delay: 300 });
    } catch (e) {
      patch(d => ({ ...d, payments: d.payments.map(x => (x.id === p.id ? p : x)) }));
      toast.error(errorMessage(e, "Couldn't record the payment"));
    } finally {
      setPaying(null);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border shadow-2xs sm:grid-cols-4">
        <div className="bg-card px-3.5 py-3">
          <div className="text-xs text-muted-foreground">Award</div>
          <InlineMoney label="Award amount" value={submission.awardAmount} allowEmpty={false} placeholder="Set amount" onSave={v => update({ awardAmount: v }, v != null ? `Award set to ${ws.money(v)}` : undefined)} className="mt-0.5 text-[15px] font-semibold" />
          {submission.requestedAmount != null && <div className="text-2xs text-muted-foreground">Requested {ws.money(submission.requestedAmount)}</div>}
        </div>
        <div className="bg-card px-3.5 py-3">
          <div className="text-xs text-muted-foreground">Status</div>
          <Select value={submission.awardStatus ?? 'Pending'} onValueChange={v => update({ awardStatus: v as 'Pending' }, `Award marked ${v.toLowerCase()}`)}>
            <SelectTrigger aria-label="Award status" className={cn('-ml-2 mt-0.5 h-7 w-auto gap-1.5 border-transparent bg-transparent px-2 text-[13px] font-medium shadow-none hover:bg-accent', AWARD_TONE[submission.awardStatus ?? 'Pending'])}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AWARD_STATUSES.map(s => (
                <SelectItem key={s} value={s} className="text-[13px]">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {(['awardStartDate', 'awardEndDate'] as const).map(key => (
          <div key={key} className="bg-card px-3.5 py-3">
            <div className="text-xs text-muted-foreground">{key === 'awardStartDate' ? 'Starts' : 'Ends'}</div>
            <DatePicker
              value={submission[key]}
              presets={false}
              onChange={v => update({ [key]: v } as { awardStartDate: string | null })}
              trigger={
                <button type="button" className={cn('ghost-chip -ml-2 mt-0.5', !submission[key] && 'text-muted-foreground')}>
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  {submission[key] ? shortDate(submission[key]) : 'Set date'}
                </button>
              }
            />
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-2xs">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-[13px]">
            <span className="text-[15px] font-semibold tabular-nums">{ws.money(paid)}</span>
            <span className="text-muted-foreground"> paid of {ws.money(award)}</span>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">{percent(paid, award)}%</span>
        </div>
        <ProgressBar value={award ? paid / award : 0} tone={paid >= award && award > 0 ? 'success' : 'primary'} className="mt-2 h-2" />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" /> Paid {ws.money(paid)}</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-foreground/20" /> Scheduled {ws.money(scheduled)}</span>
          {unscheduled > 0 && <span>Not yet scheduled {ws.money(unscheduled)}</span>}
        </div>
        {over > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-tone-warning/30 bg-tone-warning/[0.06] px-3 py-2 text-[13px]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tone-warning" />
            Payments add up to {ws.money(over)} more than the award. Adjust a payment or raise the award.
          </div>
        )}
      </div>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-[13px] font-medium">Payments</h3>
          <span className="text-xs text-muted-foreground">{payments.length ? `${payments.length} installment${payments.length === 1 ? '' : 's'}` : ''}</span>
          <button type="button" onClick={() => setDialog({ open: true, payment: null })} className="ml-auto flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium shadow-2xs hover:bg-accent">
            <Plus className="h-3.5 w-3.5" /> Add payment
          </button>
        </div>
        {payments.length === 0 ? (
          <div className="rounded-lg border border-dashed px-6 py-8 text-center">
            <Banknote className="mx-auto h-5 w-5 text-muted-foreground" />
            <p className="mt-2 text-[13.5px] font-medium">No payments scheduled</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">Schedule the award as one payment or in installments, then mark each one paid as it goes out.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card shadow-2xs">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b bg-subtle text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Payment</th>
                  <th className="px-3 py-2 font-medium">Due</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Method</th>
                  <th className="px-3 py-2 font-medium">Reference</th>
                  <th className="px-3 py-2 font-medium">Paid</th>
                  <th className="w-24 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {payments.map(p => {
                  const due = p.status !== 'Paid' && p.status !== 'Cancelled' ? dueLabel(p.dueDate) : null;
                  return (
                    <tr key={p.id} className="group border-b last:border-b-0 hover:bg-accent/40">
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => setDialog({ open: true, payment: p })} className="max-w-[180px] truncate text-left font-medium hover:underline" title={p.notes || p.name}>{p.name || 'Payment'}</button>
                      </td>
                      <td className={cn('whitespace-nowrap px-3 py-2 text-muted-foreground', due?.tone === 'overdue' && 'font-medium text-tone-danger')}>{p.dueDate ? shortDate(p.dueDate) : '—'}</td>
                      <td className={cn('whitespace-nowrap px-3 py-2 text-right tabular-nums', p.status === 'Cancelled' && 'text-muted-foreground line-through')}>{ws.money(p.amount)}</td>
                      <td className="px-3 py-2"><ToneChip tone={PAYMENT_TONE[p.status] ?? 'neutral'}>{p.status}</ToneChip></td>
                      <td className="px-3 py-2 text-muted-foreground">{p.method ?? '—'}</td>
                      <td className="max-w-[120px] truncate px-3 py-2 text-muted-foreground" title={p.reference}>{p.reference || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{p.paidDate ? shortDate(p.paidDate) : '—'}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center justify-end gap-1">
                          {(p.status === 'Scheduled' || p.status === 'On hold') && (
                            <button type="button" disabled={paying === p.id} onClick={() => markPaid(p)} className="flex h-6 items-center gap-1 whitespace-nowrap rounded-md border bg-background px-2 text-xs hover:bg-accent disabled:opacity-60">
                              {paying === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Mark paid
                            </button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button type="button" aria-label={`Actions for ${p.name || 'payment'}`} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem className="text-[13px]" onSelect={() => setDialog({ open: true, payment: p })}><Pencil className="h-3.5 w-3.5" /> Edit…</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-subtle text-xs">
                  <td className="px-3 py-2 font-medium text-muted-foreground" colSpan={2}>Total scheduled and paid</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{ws.money(paid + scheduled)}</td>
                  <td colSpan={5} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <PaymentDialog
        open={dialog.open}
        onOpenChange={o => setDialog(d => ({ ...d, open: o }))}
        submissionId={submission.id}
        payment={dialog.payment}
        defaultAmount={unscheduled || null}
        onSaved={() => refresh({ delay: 300 })}
      />
    </div>
  );
}
