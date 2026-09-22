import { AlertCircle, CalendarPlus, ChevronRight, ExternalLink, Link2, MoreHorizontal, PauseCircle } from 'lucide-react';
import { memo, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { cn } from '@project/components/lib/utils';
import { copyText } from '../../lib/clipboard';
import { appUrl, dueLabel, plural, shortDate } from '../../lib/format';
import { useWorkspace } from '../../lib/workspace';
import { MemberAvatar } from '../primitives/Avatar';
import { Glyph, IconButton, ProgressBar, Tip } from '../primitives/bits';
import { AwardStatusPicker } from './AwardStatusPicker';
import type { AwardRow, AwardStatus } from './data';

export type AwardGroup = { programId: string; rows: AwardRow[] };

export function groupAwards(rows: AwardRow[], grouped: boolean): AwardGroup[] {
  if (!grouped) return [{ programId: '', rows }];
  const map = new Map<string, AwardRow[]>();
  for (const r of rows) {
    if (!map.has(r.programId)) map.set(r.programId, []);
    map.get(r.programId)!.push(r);
  }
  return [...map.entries()].map(([programId, list]) => ({ programId, rows: list }));
}

export const sumAwards = (rows: AwardRow[]) =>
  rows.reduce(
    (t, r) => ({
      awarded: t.awarded + (r.awardStatus === 'Cancelled' ? 0 : r.awardAmount),
      paid: t.paid + r.paid,
      scheduled: t.scheduled + r.scheduled,
      onHold: t.onHold + r.onHold,
    }),
    { awarded: 0, paid: 0, scheduled: 0, onHold: 0 },
  );

type Handlers = {
  onOpen: (row: AwardRow) => void;
  onFocus: (id: string) => void;
  onStatus: (row: AwardRow, status: AwardStatus) => void;
  onSchedule: (row: AwardRow) => void;
};

function Money({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <span className={cn('tabular-nums', muted && 'text-muted-foreground')}>{children}</span>;
}

function PaidCell({ row }: { row: AwardRow }) {
  const ws = useWorkspace();
  const full = row.awardAmount > 0 && row.paid >= row.awardAmount;
  const value = row.awardAmount > 0 ? row.paid / row.awardAmount : 0;
  return (
    <Tip label={`${ws.money(row.paid)} paid · ${ws.money(row.scheduled)} scheduled${row.onHold ? ` · ${ws.money(row.onHold)} on hold` : ''} · ${ws.money(Math.max(0, row.awardAmount - row.paid))} left to pay`}>
      <div className="flex w-full min-w-0 flex-col gap-1">
        <ProgressBar value={value} tone={full ? 'success' : 'primary'} className="h-1" />
        <span className="truncate text-xs tabular-nums text-muted-foreground">
          <span className={cn('text-foreground', full && 'text-tone-success')}>{ws.money(row.paid, { compact: true })}</span> of {ws.money(row.awardAmount, { compact: true })}
        </span>
      </div>
    </Tip>
  );
}

function NextPaymentCell({ row, onSchedule }: { row: AwardRow; onSchedule: () => void }) {
  const ws = useWorkspace();
  const next = row.nextPayment;
  if (!next) {
    if (row.awardStatus === 'Cancelled') return <span className="text-muted-foreground/60">—</span>;
    if (row.awardAmount > 0 && row.paid >= row.awardAmount) return <span className="text-xs text-tone-success">Paid in full</span>;
    return (
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          onSchedule();
        }}
        className="flex h-6 items-center gap-1 rounded-md px-1.5 -ml-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <CalendarPlus className="h-3.5 w-3.5" />
        Schedule
      </button>
    );
  }
  const due = dueLabel(next.dueDate);
  const held = next.status === 'On hold';
  const overdue = due?.tone === 'overdue';
  return (
    <Tip label={`${next.name}: ${ws.money(next.amount)}${next.dueDate ? `, due ${shortDate(next.dueDate)}` : ', no due date'}${held ? ' — on hold' : ''}`}>
      <div className="flex min-w-0 flex-col leading-4">
        <span className={cn('flex items-center gap-1 truncate text-[12.5px]', overdue && 'font-medium text-tone-danger')}>
          {held && <PauseCircle className="h-3 w-3 shrink-0 text-tone-warning" aria-label="On hold" />}
          {due ? (overdue ? `Overdue · ${due.label}` : due.label) : 'No due date'}
        </span>
        <span className="truncate text-xs tabular-nums text-muted-foreground">
          {ws.money(next.amount)}
          {held && <span className="text-tone-warning"> · on hold</span>}
        </span>
      </div>
    </Tip>
  );
}

function FollowUpsCell({ row }: { row: AwardRow }) {
  if (!row.openTasks) return <span className="text-muted-foreground/60">—</span>;
  // Open tasks are waiting on the recipient; submitted ones are waiting on staff.
  const waiting = Math.max(0, row.openTasks - row.tasksToReview - row.overdueTasks);
  const parts = [
    row.overdueTasks ? `${row.overdueTasks} overdue` : null,
    waiting ? `${waiting} waiting on the recipient` : null,
    row.tasksToReview ? `${row.tasksToReview} ready for your review` : null,
  ].filter(Boolean);
  return (
    <Tip label={`Follow-ups: ${parts.join(', ')}`}>
      <span className="flex min-w-0 items-center gap-1.5 truncate text-xs tabular-nums">
        {row.overdueTasks > 0 && (
          <span className="flex shrink-0 items-center gap-1 font-medium text-tone-danger">
            <AlertCircle className="h-3.5 w-3.5" />
            {row.overdueTasks} overdue
          </span>
        )}
        {waiting > 0 && <span className="shrink-0 text-foreground">{row.overdueTasks ? '· ' : ''}{waiting} open</span>}
        {row.tasksToReview > 0 && <span className="truncate text-tone-info">{row.overdueTasks || waiting ? '· ' : ''}{row.tasksToReview} to review</span>}
      </span>
    </Tip>
  );
}

function RowMenu({ row, onSchedule }: { row: AwardRow; onSchedule: () => void }) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton size="sm" aria-label={`Actions for ${row.reference}`} onClick={e => e.stopPropagation()} className="opacity-0 group-hover/tr:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100">
          <MoreHorizontal />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={e => e.stopPropagation()}>
        <DropdownMenuItem className="text-[13px]" onSelect={onSchedule}>
          <CalendarPlus className="h-3.5 w-3.5" /> Schedule a payment
        </DropdownMenuItem>
        <DropdownMenuItem className="text-[13px]" onSelect={() => navigate(`/submission/${row.reference}`)}>
          <ExternalLink className="h-3.5 w-3.5" /> Open submission
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-[13px]" onSelect={() => copyText(appUrl(`/submission/${row.reference}`), 'Link copied')}>
          <Link2 className="h-3.5 w-3.5" /> Copy link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GroupHeader({ programId, rows, colSpan, collapsed, onToggle }: { programId: string; rows: AwardRow[]; colSpan: number; collapsed: boolean; onToggle: () => void }) {
  const ws = useWorkspace();
  const program = ws.programById.get(programId);
  const t = sumAwards(rows);
  return (
    <tr className="h-9">
      <td colSpan={colSpan} className="sticky top-9 z-[5] border-b bg-subtle p-0">
        <div className="flex h-9 items-center gap-2 px-3">
          <button type="button" onClick={onToggle} aria-expanded={!collapsed} aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${program?.name ?? 'program'}`} className="flex min-w-0 items-center gap-2 rounded-md py-1 pr-1.5 hover:bg-accent">
            <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', !collapsed && 'rotate-90')} />
            {program && <Glyph icon={program.icon} color={program.color} size={16} className="text-[10px]" />}
            <span className="truncate text-[13px] font-medium">{program?.name ?? 'Unknown program'}</span>
            <span className="text-[12.5px] tabular-nums text-muted-foreground">{rows.length}</span>
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-3 text-xs tabular-nums text-muted-foreground">
            <span className="hidden sm:inline">
              <span className="text-foreground">{ws.money(t.awarded)}</span> awarded
            </span>
            <span className="flex items-center gap-2">
              <span>
                <span className="text-foreground">{ws.money(t.paid)}</span> paid
              </span>
              <ProgressBar value={t.awarded ? t.paid / t.awarded : 0} className="hidden h-1 w-16 sm:block" tone={t.awarded && t.paid >= t.awarded ? 'success' : 'primary'} />
            </span>
            {program?.budget ? (
              <Tip label={`${ws.money(program.awarded)} of the ${ws.money(program.budget)} program budget is committed to awards`}>
                <span className="hidden lg:inline">{Math.round((program.awarded / program.budget) * 100)}% of budget</span>
              </Tip>
            ) : null}
          </div>
        </div>
      </td>
    </tr>
  );
}

const COLS = [
  { key: 'recipient', label: 'Recipient', className: 'min-w-[260px]' },
  { key: 'ref', label: 'Ref', className: 'w-[96px]' },
  { key: 'award', label: 'Award', className: 'w-[96px] text-right' },
  { key: 'paid', label: 'Paid', className: 'w-[140px]' },
  { key: 'next', label: 'Next payment', className: 'w-[150px]' },
  { key: 'status', label: 'Status', className: 'w-[120px]' },
  { key: 'period', label: 'Award period', className: 'w-[150px]' },
  { key: 'followups', label: 'Follow-ups', className: 'w-[140px]' },
  { key: 'owner', label: 'Owner', className: 'w-[56px]' },
  { key: 'menu', label: '', className: 'w-[40px]' },
];

function AwardsTableInner({ groups, grouped, focusedId, handlers }: { groups: AwardGroup[]; grouped: boolean; focusedId: string | null; handlers: Handlers }) {
  const ws = useWorkspace();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const all = useMemo(() => groups.flatMap(g => g.rows), [groups]);
  const totals = useMemo(() => sumAwards(all), [all]);

  return (
    <div className="h-full overflow-auto">
      <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-[13px]" aria-label="Awards">
        <thead className="sticky top-0 z-10">
          <tr className="h-9 bg-background text-left text-xs text-muted-foreground">
            {COLS.map(c => (
              <th key={c.key} scope="col" className={cn('border-b px-3 font-medium first:pl-5', c.className)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        {groups.map(g => {
          const isCollapsed = grouped && collapsed.has(g.programId);
          return (
            <tbody key={g.programId || 'all'}>
              {grouped && (
                <GroupHeader
                  programId={g.programId}
                  rows={g.rows}
                  colSpan={COLS.length}
                  collapsed={isCollapsed}
                  onToggle={() => setCollapsed(prev => {
                    const next = new Set(prev);
                    if (next.has(g.programId)) next.delete(g.programId);
                    else next.add(g.programId);
                    return next;
                  })}
                />
              )}
              {!isCollapsed &&
                g.rows.map(row => {
                  const owner = row.ownerId ? ws.memberById.get(row.ownerId) : undefined;
                  const program = ws.programById.get(row.programId);
                  const focused = focusedId === row.id;
                  const cancelled = row.awardStatus === 'Cancelled';
                  return (
                    <tr
                      key={row.id}
                      data-award-id={row.id}
                      aria-selected={focused}
                      onClick={() => handlers.onOpen(row)}
                      onMouseMove={() => !focused && handlers.onFocus(row.id)}
                      className={cn('group/tr h-11 cursor-default [&>td]:border-b [&>td]:px-3 [&>td]:transition-colors hover:[&>td]:bg-accent/40', focused && '[&>td]:bg-accent/60')}
                    >
                      <td className="max-w-0 pl-5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          {!grouped && program && (
                            <Tip label={program.name}>
                              <span className="flex shrink-0"><Glyph icon={program.icon} color={program.color} size={18} className="text-[11px]" /></span>
                            </Tip>
                          )}
                          <div className="min-w-0 leading-4">
                            <div className={cn('truncate text-[13px] font-medium leading-5', cancelled && 'text-muted-foreground line-through decoration-muted-foreground/50')}>{row.title || 'Untitled application'}</div>
                            <div className="truncate text-xs text-muted-foreground">{row.organization ? `${row.organization} · ${row.applicantName}` : row.applicantName || '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap text-[12.5px] tabular-nums text-muted-foreground">{row.reference}</td>
                      <td className="text-right font-medium">
                        <Money muted={cancelled}>{ws.money(row.awardAmount)}</Money>
                      </td>
                      <td>
                        <PaidCell row={row} />
                      </td>
                      <td>
                        <NextPaymentCell row={row} onSchedule={() => handlers.onSchedule(row)} />
                      </td>
                      <td className="px-2" onClick={e => e.stopPropagation()}>
                        <AwardStatusPicker status={row.awardStatus} onChange={s => handlers.onStatus(row, s)} />
                      </td>
                      <td className="text-xs tabular-nums text-muted-foreground">
                        {row.awardStartDate || row.awardEndDate ? (
                          <span className="whitespace-nowrap">
                            {row.awardStartDate ? shortDate(row.awardStartDate) : '…'} – {row.awardEndDate ? shortDate(row.awardEndDate) : '…'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">Not set</span>
                        )}
                      </td>
                      <td>
                        <FollowUpsCell row={row} />
                      </td>
                      <td>
                        {owner ? (
                          <Tip label={`Owner: ${owner.name}`}>
                            <span className="flex">
                              <MemberAvatar member={owner} size={20} />
                            </span>
                          </Tip>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>
                      <td className="px-1">
                        <RowMenu row={row} onSchedule={() => handlers.onSchedule(row)} />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          );
        })}
        <tfoot className="sticky bottom-0 z-10">
          <tr className="h-10 bg-subtle text-xs text-muted-foreground">
            <td className="border-t pl-5 pr-3">{plural(all.length, 'award')}</td>
            <td className="border-t px-3" />
            <td className="border-t px-3 text-right font-medium tabular-nums text-foreground">{ws.money(totals.awarded)}</td>
            <td className="border-t px-3 tabular-nums">
              <span className="text-foreground">{ws.money(totals.paid)}</span> paid
            </td>
            <td className="border-t px-3 tabular-nums" colSpan={2}>
              <span className="text-foreground">{ws.money(totals.scheduled)}</span> scheduled
              {totals.onHold > 0 && (
                <>
                  {' '}· <span className="text-tone-warning">{ws.money(totals.onHold)}</span> on hold
                </>
              )}
            </td>
            <td className="border-t px-3" colSpan={4} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export const AwardsTable = memo(AwardsTableInner);

/** The phone layout: one card-like row per award with what finance scans for first. */
export function AwardsList({ groups, grouped, handlers }: { groups: AwardGroup[]; grouped: boolean; handlers: Handlers }) {
  const ws = useWorkspace();
  return (
    <div className="pb-16">
      {groups.map(g => {
        const program = ws.programById.get(g.programId);
        const t = sumAwards(g.rows);
        return (
          <section key={g.programId || 'all'} aria-label={program?.name ?? 'Awards'}>
            {grouped && (
              <div className="sticky top-0 z-10 flex h-9 items-center gap-2 border-b bg-subtle px-4">
                {program && <Glyph icon={program.icon} color={program.color} size={16} className="text-[10px]" />}
                <span className="truncate text-[13px] font-medium">{program?.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{g.rows.length}</span>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {ws.money(t.paid, { compact: true })} of {ws.money(t.awarded, { compact: true })}
                </span>
              </div>
            )}
            {g.rows.map(row => {
              const next = row.nextPayment;
              const due = next ? dueLabel(next.dueDate) : null;
              return (
                <div
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handlers.onOpen(row)}
                  onKeyDown={e => e.key === 'Enter' && handlers.onOpen(row)}
                  className="block border-b px-4 py-3 active:bg-accent/60"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{row.title || 'Untitled application'}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {row.reference} · {row.organization || row.applicantName}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[13px] font-medium tabular-nums">{ws.money(row.awardAmount)}</div>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <ProgressBar value={row.awardAmount ? row.paid / row.awardAmount : 0} tone={row.awardAmount && row.paid >= row.awardAmount ? 'success' : 'primary'} className="h-1 flex-1" />
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{ws.money(row.paid, { compact: true })} paid</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2" onClick={e => e.stopPropagation()}>
                    <AwardStatusPicker status={row.awardStatus} onChange={s => handlers.onStatus(row, s)} compact />
                    <span className={cn('flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground', due?.tone === 'overdue' && 'text-tone-danger')}>
                      {row.overdueTasks > 0 && (
                        <span className="flex items-center gap-1 text-tone-danger">
                          <AlertCircle className="h-3 w-3" /> {row.overdueTasks} overdue ·
                        </span>
                      )}
                      {next ? (
                        <>
                          {next.status === 'On hold' && <PauseCircle className="h-3 w-3 shrink-0 text-tone-warning" aria-label="On hold" />}
                          Next {ws.money(next.amount, { compact: true })}{due ? ` · ${due.label}` : ''}
                        </>
                      ) : row.awardAmount > 0 && row.paid >= row.awardAmount ? (
                        <span className="text-tone-success">Paid in full</span>
                      ) : (
                        <button type="button" onClick={() => handlers.onSchedule(row)} className="flex items-center gap-1 rounded px-1 text-muted-foreground hover:text-foreground">
                          <CalendarPlus className="h-3 w-3" /> Schedule
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
