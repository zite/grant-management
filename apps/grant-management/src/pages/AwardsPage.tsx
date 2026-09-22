import { AlarmClock, BadgeCheck, CalendarPlus, CalendarRange, CircleDollarSign, Download, HandCoins, PauseCircle, Rows3, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '@project/components/lib/utils';
import { useAwardActions } from '../components/awards/actions';
import { AwardsKpis, AwardsKpisSkeleton } from '../components/awards/AwardsKpis';
import { AwardStatusDot } from '../components/awards/AwardStatusPicker';
import { AwardsList, AwardsTable, groupAwards } from '../components/awards/AwardsTable';
import { HeaderTabs, MultiFilterChip, ProgramSelect, SearchBox, SingleFilterChip, ToggleChip } from '../components/awards/controls';
import { csvFilename, downloadCsv } from '../components/awards/csv';
import {
  AWARD_STATUSES,
  AWARD_STATUS_META,
  DATE_PRESETS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_META,
  presetFilters,
  useAwards,
  usePayments,
  type AwardRow,
  type AwardStatus,
  type DatePreset,
  type PaymentFilters,
  type PaymentRow,
  type PaymentStatus,
} from '../components/awards/data';
import { PaymentDialog } from '../components/awards/PaymentDialog';
import { PaymentsList, PaymentsTable } from '../components/awards/PaymentsTable';
import { OptionPicker, type Option } from '../components/pickers/OptionPicker';
import { EmptyState, Glyph, IconButton, SkeletonRows, Tip } from '../components/primitives/bits';
import { PageHeader, useDocumentTitle } from '../components/shell/PageHeader';
import { useAppActions } from '../lib/app-actions';
import { shortDate } from '../lib/format';
import { useHotkeys } from '../lib/hotkeys';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useWorkspace } from '../lib/workspace';

type Tab = 'awards' | 'payments';

const matches = (q: string, ...fields: Array<string | null | undefined>) => {
  const needle = q.trim().toLowerCase();
  return !needle || fields.some(f => f?.toLowerCase().includes(needle));
};

function useListParam(params: URLSearchParams, key: string) {
  return useMemo(() => (params.get(key) ?? '').split(',').filter(Boolean), [params, key]);
}

/**
 * Awards and payments, for grant managers and finance. One portfolio strip
 * over both tabs; the Awards tab is the list of grants and where each stands,
 * the Payments tab is the ledger of installments. Filters live in the URL, so
 * a filtered view can be shared or bookmarked.
 */
export function AwardsPage() {
  useDocumentTitle('Awards');
  const ws = useWorkspace();
  const app = useAppActions();
  const navigate = useNavigate();
  const actions = useAwardActions();
  const wide = useMediaQuery('(min-width: 900px)');
  const roomy = useMediaQuery('(min-width: 640px)');
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'payments' ? 'payments' : 'awards';
  const programKey = params.get('program');
  const program = programKey ? ws.programByKey.get(programKey.toUpperCase()) ?? ws.programById.get(programKey) : undefined;
  const programId = program?.id ?? null;

  const awardStatuses = useListParam(params, 'status') as AwardStatus[];
  const overdueReportsOnly = params.get('reports') === 'overdue';
  const onHoldOnly = params.get('hold') === '1';
  const grouped = params.get('group') !== 'none';
  const paymentStatuses = useListParam(params, 'pstatus') as PaymentStatus[];
  const datePreset = (DATE_PRESETS.some(d => d.value === params.get('when')) ? params.get('when') : 'all') as DatePreset;

  const [search, setSearch] = useState('');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; submissionId: string; payment: PaymentRow | null; defaultAmount?: number | null }>({ open: false, submissionId: '', payment: null });
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => app.setContextProgram(programId), [programId]);
  useEffect(() => {
    setFocusedId(null);
    setSearch('');
  }, [tab]);

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        prev => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // The strip describes the portfolio for the chosen program; the table's own filters narrow the list below it.
  const portfolio = useAwards({ programId: programId ?? undefined });
  const awardsQuery = useAwards({
    programId: programId ?? undefined,
    awardStatuses: awardStatuses.length ? awardStatuses : undefined,
    overdueReportsOnly: overdueReportsOnly || undefined,
    onHoldOnly: onHoldOnly || undefined,
  });

  const preset = presetFilters(datePreset);
  const statusSet = preset.statuses && paymentStatuses.length ? preset.statuses.filter(s => paymentStatuses.includes(s)) : preset.statuses ?? (paymentStatuses.length ? paymentStatuses : undefined);
  const paymentFilters: PaymentFilters = { programId: programId ?? undefined, statuses: statusSet, from: preset.from, to: preset.to, overdueOnly: preset.overdueOnly };
  const impossible = Boolean(statusSet && statusSet.length === 0);
  const paymentsQuery = usePayments(paymentFilters, { enabled: tab === 'payments' && !impossible });

  const awardRows = useMemo(() => (awardsQuery.data?.awards ?? []).filter(a => matches(search, a.title, a.reference, a.applicantName, a.organization, a.applicantEmail)), [awardsQuery.data, search]);
  const awardGroups = useMemo(() => groupAwards(awardRows, grouped && !programId), [awardRows, grouped, programId]);
  const visibleAwards = useMemo(() => awardGroups.flatMap(g => g.rows), [awardGroups]);
  const paymentRows = useMemo(() => (paymentsQuery.data?.payments ?? []).filter(p => matches(search, p.name, p.submissionReference, p.submissionTitle, p.applicantName, p.organization, p.reference)), [paymentsQuery.data, search]);

  const awardFiltersOn = awardStatuses.length > 0 || overdueReportsOnly || onHoldOnly;
  const paymentFiltersOn = paymentStatuses.length > 0 || datePreset !== 'all';

  const openKpi = (target: 'paid' | 'next30' | 'onHold' | 'active' | 'overdueReports' | 'all') => {
    const clearAwards = { status: null, reports: null, hold: null };
    const clearPayments = { pstatus: null, when: null };
    if (target === 'all') update({ tab: null, ...clearAwards });
    if (target === 'active') update({ tab: null, ...clearAwards, status: 'Active' });
    if (target === 'overdueReports') update({ tab: null, ...clearAwards, reports: 'overdue' });
    if (target === 'onHold') update({ tab: 'payments', ...clearPayments, pstatus: 'On hold' });
    if (target === 'paid') update({ tab: 'payments', ...clearPayments, pstatus: 'Paid' });
    if (target === 'next30') update({ tab: 'payments', ...clearPayments, when: 'next_30', pstatus: 'Scheduled' });
  };

  const schedule = (row: Pick<AwardRow, 'id' | 'awardAmount' | 'paid' | 'scheduled' | 'onHold'>) => {
    const remaining = Math.max(0, row.awardAmount - row.paid - row.scheduled - row.onHold);
    setDialog({ open: true, submissionId: row.id, payment: null, defaultAmount: remaining || null });
  };

  const paymentHandlers = useMemo(
    () => ({
      onEdit: (p: PaymentRow) => setDialog({ open: true, submissionId: p.submissionId, payment: p }),
      onPeek: (p: PaymentRow) => p.submissionReference && app.openPeek(p.submissionReference),
      onMarkPaid: (p: PaymentRow) => actions.markPaid(p, n => ws.money(n)),
      onStatus: (p: PaymentRow, s: 'Scheduled' | 'On hold' | 'Cancelled') => actions.setPaymentStatus(p, s),
      onDelete: async (p: PaymentRow) => {
        const ok = await app.confirm({
          title: `Delete ${p.name}?`,
          description: `${ws.money(p.amount)} comes off ${p.submissionReference}'s payment schedule. To keep a record that it won't be paid, cancel it instead.`,
          confirmLabel: 'Delete payment',
          destructive: true,
        });
        if (ok) actions.deletePayment(p);
      },
      onFocus: setFocusedId,
    }),
    [actions, app, ws],
  );
  const awardHandlers = useMemo(
    () => ({
      onOpen: (row: AwardRow) => app.openPeek(row.reference),
      onFocus: setFocusedId,
      onStatus: (row: AwardRow, s: AwardStatus) => actions.setAwardStatus(row, s),
      onSchedule: schedule,
    }),
    [actions, app],
  );

  // Keyboard: J/K move, Space previews, Enter opens the submission (or edits the payment), / searches.
  const list: Array<{ id: string }> = tab === 'awards' ? visibleAwards : paymentRows;
  const focusIndex = list.findIndex(r => r.id === focusedId);
  const focusAt = (i: number) => {
    const r = list[Math.max(0, Math.min(list.length - 1, i))];
    if (!r) return;
    setFocusedId(r.id);
    requestAnimationFrame(() => scrollRef.current?.querySelector(`[data-award-id="${r.id}"], [data-payment-id="${r.id}"]`)?.scrollIntoView({ block: 'nearest' }));
  };
  useHotkeys({
    j: () => focusAt(focusIndex + 1),
    down: () => focusAt(focusIndex + 1),
    k: () => focusAt(focusIndex < 0 ? 0 : focusIndex - 1),
    up: () => focusAt(focusIndex < 0 ? 0 : focusIndex - 1),
    enter: () => {
      if (focusIndex < 0) return;
      if (tab === 'awards') navigate(`/submission/${visibleAwards[focusIndex].reference}`);
      else paymentHandlers.onEdit(paymentRows[focusIndex]);
    },
    space: () => {
      if (focusIndex < 0) return;
      if (tab === 'awards') app.openPeek(visibleAwards[focusIndex].reference);
      else paymentHandlers.onPeek(paymentRows[focusIndex]);
    },
    esc: () => setFocusedId(null),
    '/': () => searchRef.current?.focus(),
  });

  const exportAwards = () => {
    const rows = awardRows;
    if (!rows.length) return toast.message('Nothing to export — no awards match these filters');
    downloadCsv(
      csvFilename('awards', program?.key),
      ['Reference', 'Title', 'Program', 'Applicant', 'Organization', 'Email', 'Award status', 'Award amount', 'Paid', 'Scheduled', 'On hold', 'Left to pay', 'Next payment due', 'Next payment amount', 'Next payment status', 'Award start', 'Award end', 'Open follow-ups', 'Overdue follow-ups', 'Owner'],
      rows.map(a => [
        a.reference, a.title, ws.programById.get(a.programId)?.name ?? '', a.applicantName, a.organization, a.applicantEmail, a.awardStatus, a.awardAmount, a.paid, a.scheduled, a.onHold,
        Math.max(0, a.awardAmount - a.paid), a.nextPayment?.dueDate ?? '', a.nextPayment?.amount ?? '', a.nextPayment?.status ?? '', a.awardStartDate ?? '', a.awardEndDate ?? '', a.openTasks, a.overdueTasks,
        a.ownerId ? ws.memberById.get(a.ownerId)?.name ?? '' : '',
      ]),
    );
    toast.success(`Exported ${rows.length} award${rows.length === 1 ? '' : 's'}`);
  };
  const exportPayments = () => {
    const rows = paymentRows;
    if (!rows.length) return toast.message('Nothing to export — no payments match these filters');
    downloadCsv(
      csvFilename('payments', program?.key, datePreset !== 'all' ? datePreset : null),
      ['Due date', 'Payee', 'Applicant', 'Award reference', 'Award title', 'Program', 'Payment', 'Amount', 'Status', 'Overdue', 'Method', 'Reference number', 'Paid date', 'Notes'],
      rows.map(p => [p.dueDate ?? '', p.organization || p.applicantName, p.applicantName, p.submissionReference, p.submissionTitle, ws.programById.get(p.programId)?.name ?? '', p.name, p.amount, p.status, p.overdue ? 'Yes' : 'No', p.method ?? '', p.reference, p.paidDate ?? '', p.notes]),
    );
    toast.success(`Exported ${rows.length} payment${rows.length === 1 ? '' : 's'}`);
  };

  // Scheduling from the ledger starts with choosing the award.
  const scheduleOptions: Option<string>[] = (portfolio.data?.awards ?? [])
    .filter(a => a.awardStatus !== 'Cancelled')
    .map(a => {
      const p = ws.programById.get(a.programId);
      const left = Math.max(0, a.awardAmount - a.paid - a.scheduled - a.onHold);
      return { value: a.id, label: a.title || a.reference, icon: p ? <Glyph icon={p.icon} color={p.color} size={16} /> : undefined, keywords: [a.reference, a.organization, a.applicantName], hint: left ? `${ws.money(left, { compact: true })} left` : a.reference, group: p?.name };
    });

  const programSelect = <ProgramSelect programId={programId} align={roomy ? 'end' : 'start'} onChange={id => update({ program: id ? ws.programById.get(id)?.key ?? id : null })} />;

  const header = (
    <PageHeader
      icon={<HandCoins />}
      title="Awards"
      actions={
        <>
          {roomy && programSelect}
          {tab === 'payments' && scheduleOptions.length > 0 && (
            <OptionPicker
              value={null}
              onChange={id => {
                const a = portfolio.data?.awards.find(x => x.id === id);
                if (a) schedule(a);
              }}
              options={scheduleOptions}
              placeholder="Schedule a payment for…"
              width={320}
              align="end"
              trigger={
                <button type="button" className="hidden h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12.5px] font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 sm:flex">
                  <CalendarPlus className="h-3.5 w-3.5" /> Schedule payment
                </button>
              }
            />
          )}
          <Tip label={tab === 'awards' ? 'Export these awards to CSV' : 'Export these payments to CSV'}>
            <IconButton aria-label="Export to CSV" onClick={tab === 'awards' ? exportAwards : exportPayments}>
              <Download />
            </IconButton>
          </Tip>
        </>
      }
    >
      <HeaderTabs
        label="Awards sections"
        value={tab}
        onChange={id => update({ tab: id === 'awards' ? null : id })}
        tabs={[
          { id: 'awards', label: 'Awards', count: portfolio.data?.totals.awards },
          { id: 'payments', label: 'Payments' },
        ]}
      />
    </PageHeader>
  );

  const toolbar =
    tab === 'awards' ? (
      <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-1.5">
        {!roomy && programSelect}
        <MultiFilterChip
          label="Status"
          icon={<BadgeCheck />}
          value={awardStatuses}
          onChange={v => update({ status: v.join(',') || null })}
          options={AWARD_STATUSES.map(s => ({ value: s, label: AWARD_STATUS_META[s].label, icon: <AwardStatusDot status={s} /> }))}
        />
        <ToggleChip pressed={overdueReportsOnly} onChange={v => update({ reports: v ? 'overdue' : null })} icon={<AlarmClock />} tip="Awards with a follow-up request past its due date">
          Overdue report
        </ToggleChip>
        <ToggleChip pressed={onHoldOnly} onChange={v => update({ hold: v ? '1' : null })} icon={<PauseCircle />} tip="Awards with a payment on hold">
          Payment on hold
        </ToggleChip>
        {awardFiltersOn && (
          <button type="button" onClick={() => update({ status: null, reports: null, hold: null })} className="h-7 rounded-md px-2 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground">
            Clear
          </button>
        )}
        <div className="ml-auto flex w-full items-center gap-1.5 sm:w-auto">
          {!programId && (
            <Tip label={grouped ? 'Show one flat list' : 'Group by program, with subtotals'}>
              <IconButton aria-label={grouped ? 'Ungroup' : 'Group by program'} active={grouped} onClick={() => update({ group: grouped ? 'none' : null })} className="hidden md:inline-flex">
                <Rows3 />
              </IconButton>
            </Tip>
          )}
          <SearchBox value={search} onChange={setSearch} placeholder="Search awards…" inputRef={searchRef} />
        </div>
      </div>
    ) : (
      <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-1.5">
        {!roomy && programSelect}
        <MultiFilterChip
          label="Status"
          icon={<CircleDollarSign />}
          value={paymentStatuses}
          onChange={v => update({ pstatus: v.join(',') || null })}
          options={PAYMENT_STATUSES.map(s => ({ value: s, label: PAYMENT_STATUS_META[s].label, icon: <span className={cn('h-2 w-2 rounded-full', PAYMENT_STATUS_META[s].dot)} /> }))}
        />
        <SingleFilterChip
          label="Date"
          icon={<CalendarRange />}
          value={datePreset}
          defaultValue="all"
          onChange={v => update({ when: v === 'all' ? null : v })}
          options={DATE_PRESETS.map(d => ({ value: d.value, label: d.label, hint: d.hint ? <span className="hidden sm:inline">{d.hint}</span> : undefined }))}
        />
        {paymentFiltersOn && (
          <button type="button" onClick={() => update({ pstatus: null, when: null })} className="h-7 rounded-md px-2 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground">
            Clear
          </button>
        )}
        {preset.from || preset.to ? (
          <span className="hidden text-xs text-muted-foreground lg:inline">
            {preset.from ? shortDate(preset.from) : 'Any time'} – {preset.to ? shortDate(preset.to) : 'today'}
          </span>
        ) : null}
        <div className="ml-auto flex w-full items-center gap-1.5 sm:w-auto">
          <SearchBox value={search} onChange={setSearch} placeholder="Search payments…" inputRef={searchRef} />
        </div>
      </div>
    );

  const activeQuery = tab === 'awards' ? awardsQuery : paymentsQuery;
  const loading = tab === 'awards' ? awardsQuery.isPending : paymentsQuery.isPending && !impossible;

  let body: React.ReactNode;
  if (activeQuery.isError && !activeQuery.data) {
    body = (
      <EmptyState
        icon={<HandCoins />}
        title={tab === 'awards' ? "Awards couldn't load" : "Payments couldn't load"}
        description="Check your connection and try again."
        action={<button type="button" onClick={() => activeQuery.refetch()} className="text-[13px] text-primary hover:underline">Retry</button>}
      />
    );
  } else if (loading) {
    body = <SkeletonRows rows={9} className="pt-2" />;
  } else if (tab === 'awards') {
    if (!portfolio.data?.totals.awards) {
      body = (
        <EmptyState
          icon={<HandCoins />}
          title={program ? `No awards in ${program.name} yet` : 'No awards yet'}
          description="An award appears here as soon as a submission is accepted — with its amount, payment schedule and follow-ups — so you can track every grant from decision to final report."
          action={program ? <button type="button" onClick={() => update({ program: null })} className="text-[13px] text-primary hover:underline">Show all programs</button> : undefined}
        />
      );
    } else if (!awardRows.length) {
      body = (
        <EmptyState
          icon={<Search />}
          title="No awards match"
          description={search ? `Nothing matches “${search}” with these filters.` : 'Try removing a filter.'}
          action={<button type="button" onClick={() => { setSearch(''); update({ status: null, reports: null, hold: null }); }} className="text-[13px] text-primary hover:underline">Clear filters</button>}
        />
      );
    } else {
      body = wide ? (
        <AwardsTable groups={awardGroups} grouped={grouped && !programId} focusedId={focusedId} handlers={awardHandlers} />
      ) : (
        <AwardsList groups={awardGroups} grouped={grouped && !programId} handlers={awardHandlers} />
      );
    }
  } else if (impossible || !paymentRows.length) {
    const anyPayments = (portfolio.data?.awards ?? []).some(a => a.paymentCount > 0);
    body =
      !anyPayments && !paymentFiltersOn && !search ? (
        <EmptyState
          icon={<CircleDollarSign />}
          title={program ? `No payments scheduled in ${program.name}` : 'No payments scheduled yet'}
          description={scheduleOptions.length ? 'Schedule installments for an award and they show up here, due dates first, until they’re paid.' : 'Payments are scheduled against awards. Once a submission is accepted, you can plan its installments here.'}
        />
      ) : (
        <EmptyState
          icon={<Search />}
          title="No payments match"
          description={search ? `Nothing matches “${search}” with these filters.` : 'Try a different status or date range.'}
          action={<button type="button" onClick={() => { setSearch(''); update({ pstatus: null, when: null }); }} className="text-[13px] text-primary hover:underline">Clear filters</button>}
        />
      );
  } else {
    body = wide ? (
      <PaymentsTable rows={paymentRows} totals={paymentsQuery.data!.totals} focusedId={focusedId} handlers={paymentHandlers} multiProgram={!programId} />
    ) : (
      <PaymentsList rows={paymentRows} totals={paymentsQuery.data!.totals} handlers={paymentHandlers} />
    );
  }

  const kpis = portfolio.data ? <AwardsKpis totals={portfolio.data.totals} onOpen={openKpi} /> : <AwardsKpisSkeleton />;
  const dim = activeQuery.isPlaceholderData && activeQuery.isFetching && 'opacity-70 transition-opacity';

  return (
    <>
      {header}
      {wide ? (
        <>
          {kpis}
          {toolbar}
          <div ref={scrollRef} className={cn('relative min-h-0 flex-1 overflow-hidden', dim)}>
            {body}
          </div>
        </>
      ) : (
        // On a phone the strip and filters scroll away with the list instead of pinning half the screen.
        <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
          {kpis}
          {toolbar}
          <div className={cn(dim || undefined)}>{body}</div>
        </div>
      )}
      <PaymentDialog
        open={dialog.open}
        onOpenChange={o => setDialog(d => ({ ...d, open: o }))}
        submissionId={dialog.submissionId}
        payment={dialog.payment}
        defaultAmount={dialog.defaultAmount}
      />
    </>
  );
}
