import { AlertCircle, Ban, Check, MoreHorizontal, PanelRightOpen, PauseCircle, Pencil, PlayCircle, Trash2 } from 'lucide-react';
import { memo } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { cn } from '@project/components/lib/utils';
import { dueLabel, plural, shortDate } from '../../lib/format';
import { useWorkspace } from '../../lib/workspace';
import { Glyph, IconButton, Tip } from '../primitives/bits';
import { PAYMENT_STATUS_META, type PaymentList, type PaymentRow } from './data';

export type PaymentHandlers = {
  onEdit: (p: PaymentRow) => void;
  onPeek: (p: PaymentRow) => void;
  onMarkPaid: (p: PaymentRow) => void;
  onStatus: (p: PaymentRow, status: 'Scheduled' | 'On hold' | 'Cancelled') => void;
  onDelete: (p: PaymentRow) => void;
  onFocus: (id: string) => void;
};

export function PaymentStatusChip({ status, overdue }: { status: string; overdue?: boolean }) {
  const meta = PAYMENT_STATUS_META[status] ?? PAYMENT_STATUS_META.Scheduled;
  return (
    <span className={cn('inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium', overdue && status === 'Scheduled' ? 'bg-tone-danger/[0.1] text-tone-danger' : meta.chip)}>
      {status === 'Paid' ? <Check className="h-3 w-3" strokeWidth={2.5} /> : status === 'On hold' ? <PauseCircle className="h-3 w-3" /> : status === 'Cancelled' ? <Ban className="h-3 w-3" /> : overdue ? <AlertCircle className="h-3 w-3" /> : <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} aria-hidden />}
      {overdue && status === 'Scheduled' ? 'Overdue' : meta.label}
    </span>
  );
}

function RowMenu({ p, h }: { p: PaymentRow; h: PaymentHandlers }) {
  const unpaid = p.status === 'Scheduled' || p.status === 'On hold';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton size="sm" aria-label={`Actions for ${p.name}`} onClick={e => e.stopPropagation()} className="data-[state=open]:opacity-100">
          <MoreHorizontal />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={e => e.stopPropagation()}>
        <DropdownMenuItem className="text-[13px]" onSelect={() => h.onEdit(p)}>
          <Pencil className="h-3.5 w-3.5" /> Edit payment…
        </DropdownMenuItem>
        {p.status !== 'Paid' && (
          <DropdownMenuItem className="text-[13px]" onSelect={() => h.onMarkPaid(p)}>
            <Check className="h-3.5 w-3.5" /> Mark paid today
          </DropdownMenuItem>
        )}
        {p.status === 'Scheduled' && (
          <DropdownMenuItem className="text-[13px]" onSelect={() => h.onStatus(p, 'On hold')}>
            <PauseCircle className="h-3.5 w-3.5" /> Put on hold
          </DropdownMenuItem>
        )}
        {(p.status === 'On hold' || p.status === 'Cancelled') && (
          <DropdownMenuItem className="text-[13px]" onSelect={() => h.onStatus(p, 'Scheduled')}>
            <PlayCircle className="h-3.5 w-3.5" /> {p.status === 'On hold' ? 'Release hold' : 'Schedule again'}
          </DropdownMenuItem>
        )}
        {unpaid && (
          <DropdownMenuItem className="text-[13px]" onSelect={() => h.onStatus(p, 'Cancelled')}>
            <Ban className="h-3.5 w-3.5" /> Cancel payment
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="text-[13px]" onSelect={() => h.onPeek(p)}>
          <PanelRightOpen className="h-3.5 w-3.5" /> Open {p.submissionReference || 'submission'}
        </DropdownMenuItem>
        {p.status !== 'Paid' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-[13px] text-tone-danger focus:text-tone-danger" onSelect={() => h.onDelete(p)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete…
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DueCell({ p }: { p: PaymentRow }) {
  if (!p.dueDate) return <span className="text-muted-foreground/60">No date</span>;
  if (p.status === 'Paid' || p.status === 'Cancelled') return <span className="tabular-nums text-muted-foreground">{shortDate(p.dueDate)}</span>;
  const due = dueLabel(p.dueDate);
  return (
    <Tip label={`Due ${shortDate(p.dueDate)}`}>
      <span className={cn('whitespace-nowrap tabular-nums', p.overdue ? 'font-medium text-tone-danger' : due?.tone === 'soon' ? 'text-tone-warning' : 'text-foreground')}>{due?.label}</span>
    </Tip>
  );
}

function PaymentsTableInner({ rows, totals, focusedId, handlers, multiProgram }: { rows: PaymentRow[]; totals: PaymentList['totals']; focusedId: string | null; handlers: PaymentHandlers; multiProgram: boolean }) {
  const ws = useWorkspace();
  const firstPaid = rows.findIndex(r => r.status !== 'Scheduled' && r.status !== 'On hold');
  return (
    <div className="h-full overflow-auto">
      <table className="w-full min-w-[1120px] border-separate border-spacing-0 text-[13px]" aria-label="Payments">
        <thead className="sticky top-0 z-10">
          <tr className="h-9 bg-background text-left text-xs text-muted-foreground [&>th]:border-b [&>th]:px-3 [&>th]:font-medium">
            <th scope="col" className="w-[104px] !pl-5">Due</th>
            <th scope="col" className="w-[240px]">Payee</th>
            <th scope="col" className="w-[96px]">Award</th>
            <th scope="col" className="min-w-[160px]">Payment</th>
            <th scope="col" className="w-[104px] text-right">Amount</th>
            <th scope="col" className="w-[110px]">Status</th>
            <th scope="col" className="w-[72px]">Method</th>
            <th scope="col" className="w-[120px]">Reference</th>
            <th scope="col" className="w-[92px]">Paid</th>
            <th scope="col" className="w-[132px]"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const program = ws.programById.get(p.programId);
            const focused = focusedId === p.id;
            const unpaid = p.status === 'Scheduled' || p.status === 'On hold';
            return [
              i === firstPaid && i > 0 ? (
                <tr key={`sep-${p.id}`} aria-hidden>
                  <td colSpan={10} className="h-7 border-b bg-subtle pl-5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">Paid and cancelled</td>
                </tr>
              ) : null,
              <tr
                key={p.id}
                data-payment-id={p.id}
                aria-selected={focused}
                onClick={() => handlers.onEdit(p)}
                onMouseMove={() => !focused && handlers.onFocus(p.id)}
                className={cn(
                  'group/tr h-10 cursor-default [&>td]:border-b [&>td]:px-3 [&>td]:transition-colors hover:[&>td]:bg-accent/40',
                  focused && '[&>td]:bg-accent/60',
                  p.overdue && '[&>td:first-child]:shadow-[inset_2px_0_0_rgb(var(--tone-danger))]',
                  p.status === 'Cancelled' && 'text-muted-foreground',
                )}
              >
                <td className="!pl-5">
                  <DueCell p={p} />
                </td>
                <td className="max-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    {multiProgram && program && (
                      <Tip label={program.name}>
                        <span className="flex shrink-0"><Glyph icon={program.icon} color={program.color} size={16} className="text-[10px]" /></span>
                      </Tip>
                    )}
                    <span className="truncate" title={p.organization ? `${p.organization} (${p.applicantName})` : p.applicantName}>{p.organization || p.applicantName || '—'}</span>
                  </div>
                </td>
                <td>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      handlers.onPeek(p);
                    }}
                    title={p.submissionTitle}
                    className="whitespace-nowrap rounded px-1 -mx-1 text-[12.5px] tabular-nums text-muted-foreground underline-offset-2 hover:bg-accent hover:text-foreground hover:underline"
                  >
                    {p.submissionReference || '—'}
                  </button>
                </td>
                <td className="max-w-0">
                  <div className="truncate" title={p.notes || undefined}>{p.name}</div>
                </td>
                <td className={cn('text-right font-medium tabular-nums', p.status === 'Cancelled' && 'font-normal line-through decoration-muted-foreground/50')}>{ws.money(p.amount)}</td>
                <td>
                  <PaymentStatusChip status={p.status} overdue={p.overdue} />
                </td>
                <td className="text-muted-foreground">{p.method ?? <span className="text-muted-foreground/60">—</span>}</td>
                <td className="max-w-0">
                  <span className="block truncate font-mono text-xs text-muted-foreground" title={p.reference}>{p.reference || <span className="font-sans text-muted-foreground/60">—</span>}</span>
                </td>
                <td className="tabular-nums text-muted-foreground">{p.paidDate ? shortDate(p.paidDate) : <span className="text-muted-foreground/60">—</span>}</td>
                <td className="px-2">
                  <div className="flex items-center justify-end gap-1">
                    {unpaid && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handlers.onMarkPaid(p);
                        }}
                        className={cn(
                          'flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border bg-background px-2 text-xs font-medium shadow-2xs transition-[opacity,colors] hover:bg-accent',
                          focused || p.overdue ? 'opacity-100' : 'opacity-0 focus-visible:opacity-100 group-hover/tr:opacity-100',
                        )}
                      >
                        <Check className="h-3 w-3 text-tone-success" strokeWidth={2.5} /> Mark paid
                      </button>
                    )}
                    <RowMenu p={p} h={handlers} />
                  </div>
                </td>
              </tr>,
            ];
          })}
        </tbody>
        <tfoot className="sticky bottom-0 z-10">
          <tr className="h-10 bg-subtle text-xs text-muted-foreground [&>td]:border-t [&>td]:px-3">
            <td colSpan={4} className="!pl-5">
              {plural(totals.count, 'payment')}
              {totals.overdueCount > 0 && <span className="text-tone-danger"> · {totals.overdueCount} overdue ({ws.money(totals.overdue)})</span>}
            </td>
            <td className="text-right font-medium tabular-nums text-foreground">{ws.money(totals.amount)}</td>
            <td colSpan={5} className="tabular-nums">
              <span className="text-tone-success">{ws.money(totals.paid)}</span> paid · <span className="text-foreground">{ws.money(totals.scheduled)}</span> scheduled
              {totals.onHold > 0 && <> · <span className="text-tone-warning">{ws.money(totals.onHold)}</span> on hold</>}
              {totals.cancelled > 0 && <> · {ws.money(totals.cancelled)} cancelled</>}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export const PaymentsTable = memo(PaymentsTableInner);

export function PaymentsList({ rows, totals, handlers }: { rows: PaymentRow[]; totals: PaymentList['totals']; handlers: PaymentHandlers }) {
  const ws = useWorkspace();
  return (
    <div className="pb-16">
      {rows.map(p => {
        const unpaid = p.status === 'Scheduled' || p.status === 'On hold';
        const due = p.dueDate ? dueLabel(p.dueDate) : null;
        return (
          <div key={p.id} role="button" tabIndex={0} onClick={() => handlers.onEdit(p)} onKeyDown={e => e.key === 'Enter' && handlers.onEdit(p)} className={cn('border-b px-4 py-3 active:bg-accent/60', p.overdue && 'shadow-[inset_2px_0_0_rgb(var(--tone-danger))]')}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{p.organization || p.applicantName}</div>
                <div className="truncate text-xs text-muted-foreground">{p.submissionReference} · {p.name}</div>
              </div>
              <div className={cn('shrink-0 text-right text-[13px] font-medium tabular-nums', p.status === 'Cancelled' && 'text-muted-foreground line-through')}>{ws.money(p.amount)}</div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <PaymentStatusChip status={p.status} overdue={p.overdue} />
              <span className={cn('truncate text-xs text-muted-foreground', p.overdue && 'text-tone-danger')}>
                {p.status === 'Paid' ? `Paid ${shortDate(p.paidDate)}` : due ? `Due ${due.label}` : 'No due date'}
                {p.method ? ` · ${p.method}` : ''}
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-1" onClick={e => e.stopPropagation()}>
                {unpaid && (
                  <button type="button" onClick={() => handlers.onMarkPaid(p)} className="flex h-7 items-center gap-1 rounded-md border bg-background px-2 text-xs font-medium shadow-2xs hover:bg-accent">
                    <Check className="h-3 w-3 text-tone-success" strokeWidth={2.5} /> Paid
                  </button>
                )}
                <RowMenu p={p} h={handlers} />
              </div>
            </div>
          </div>
        );
      })}
      <div className="px-4 py-3 text-xs text-muted-foreground">
        {plural(totals.count, 'payment')} · {ws.money(totals.amount)} · <span className="text-tone-success">{ws.money(totals.paid)} paid</span>
      </div>
    </div>
  );
}
