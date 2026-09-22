import { ArrowDownWideNarrow, ChevronDown, Download, Plus, Search, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { cn } from '@project/components/lib/utils';
import { AddApplicantDialog } from '../components/applicants/AddApplicantDialog';
import { ApplicantAvatar } from '../components/applicants/ApplicantAvatar';
import { SORTS, toCsv, useApplicants, type ApplicantRow, type ApplicantSort } from '../components/applicants/applicantData';
import { OptionPicker } from '../components/pickers/OptionPicker';
import { ProgramPicker } from '../components/pickers/pickers';
import { EmptyState, Glyph, Kbd, SkeletonRows, Tip } from '../components/primitives/bits';
import { PageHeader, useDocumentTitle } from '../components/shell/PageHeader';
import { downloadText } from '../lib/download';
import { shortDate, timeAgo, toDayString } from '../lib/format';
import { useHotkeys } from '../lib/hotkeys';
import { useWorkspace } from '../lib/workspace';

const GRID =
  'grid items-center gap-x-4 grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.25fr)_84px_76px_100px_92px] lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.25fr)_112px_76px_100px_92px] xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1.25fr)_minmax(0,0.9fr)_112px_76px_100px_92px]';

const SORT_VALUES = SORTS.map(s => s.value);

export function ApplicantsPage() {
  useDocumentTitle('Applicants');
  const ws = useWorkspace();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const programId = params.get('program');
  const sortParam = params.get('sort') as ApplicantSort | null;
  const sort: ApplicantSort = sortParam && SORT_VALUES.includes(sortParam) ? sortParam : 'name';
  const [text, setText] = useState(q);
  const [adding, setAdding] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const update = (patch: Record<string, string | null>) => {
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
  };

  // Typing filters after a short pause; the URL keeps the list as you left it when you come back.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (text.trim() !== q) update({ q: text.trim() || null });
    }, 220);
    return () => window.clearTimeout(t);
  }, [text]);

  const { data, isPending, isError, isFetching, refetch } = useApplicants({ search: q, programId, sort });
  const rows = data?.applicants ?? [];
  const program = programId ? ws.programById.get(programId) : undefined;

  const move = (delta: number) => {
    if (!rows.length) return;
    const i = rows.findIndex(r => r.id === focused);
    const next = rows[i < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, i + delta))];
    setFocused(next.id);
    requestAnimationFrame(() => scrollRef.current?.querySelector(`[data-applicant-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' }));
  };

  useHotkeys({
    j: () => move(1),
    down: () => move(1),
    k: () => move(-1),
    up: () => move(-1),
    enter: () => focused && navigate(`/applicants/${focused}`),
    '/': () => searchRef.current?.focus(),
  });

  const exportCsv = () => {
    if (!rows.length) return;
    const csv = toCsv(
      ['Name', 'Email', 'Organization', 'Phone', 'Location', 'Website', 'Applications', 'Accepted', 'Requested', 'Awarded', 'Last active', 'First seen'],
      rows.map(r => [r.name, r.email, r.organization, r.phone, r.location, r.website, r.applications, r.accepted, r.requested, r.awarded, r.lastActiveAt ? r.lastActiveAt.slice(0, 10) : '', r.joinedAt ? r.joinedAt.slice(0, 10) : '']),
    );
    downloadText(`applicants${program ? `-${program.key.toLowerCase()}` : ''}-${toDayString(new Date())}.csv`, csv);
    toast.success(`Exported ${rows.length} applicant${rows.length === 1 ? '' : 's'}`);
  };

  const filtered = Boolean(q || programId);
  const totals = useMemo(() => ({ awarded: rows.reduce((s, r) => s + r.awarded, 0), applications: rows.reduce((s, r) => s + r.applications, 0) }), [rows]);

  const SortHeader = ({ value, children, className }: { value?: ApplicantSort; children: React.ReactNode; className?: string }) =>
    value ? (
      <button type="button" onClick={() => update({ sort: value === 'name' ? null : value })} className={cn('flex items-center gap-1 hover:text-foreground', sort === value && 'text-foreground', className)}>
        {children}
        {sort === value && <ArrowDownWideNarrow className="h-3 w-3" />}
      </button>
    ) : (
      <span className={className}>{children}</span>
    );

  return (
    <>
      <PageHeader
        icon={<Users />}
        title="Applicants"
        actions={
          <>
            <Tip label="Download this list as a spreadsheet">
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-[12.5px] text-muted-foreground hover:text-foreground" disabled={!rows.length} onClick={exportCsv}>
                <Download className="!size-3.5" /> <span className="hidden sm:inline">Export CSV</span>
              </Button>
            </Tip>
            <Button size="sm" className="h-7 gap-1.5 px-2.5 text-[12.5px]" onClick={() => setAdding(true)}>
              <Plus className="!size-3.5" /> Add applicant
            </Button>
          </>
        }
      />
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 border-b px-3 py-1.5">
        <div className="flex h-7 w-full items-center gap-1.5 rounded-md border bg-background px-2 focus-within:border-foreground/30 sm:w-64">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={searchRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                setText('');
                e.currentTarget.blur();
              }
              if (e.key === 'ArrowDown' || e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
                if (rows[0]) setFocused(rows[0].id);
              }
            }}
            placeholder="Search applicants"
            aria-label="Search applicants"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
          {text ? (
            <button type="button" aria-label="Clear search" onClick={() => setText('')} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <Kbd className="hidden sm:inline-flex">/</Kbd>
          )}
        </div>
        <ProgramPicker
          allowNone
          value={programId}
          onChange={v => update({ program: v })}
          trigger={
            <button type="button" className={cn('ghost-chip', !program && 'text-muted-foreground')}>
              {program ? <Glyph icon={program.icon} color={program.color} size={16} className="text-[10px]" /> : null}
              <span className="max-w-[180px] truncate">{program ? program.name : 'All programs'}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          }
        />
        <OptionPicker
          value={sort}
          onChange={v => update({ sort: v === 'name' ? null : v })}
          options={SORTS.map(s => ({ value: s.value, label: s.label }))}
          placeholder="Sort by…"
          width={200}
          trigger={
            <button type="button" className="ghost-chip text-muted-foreground">
              <ArrowDownWideNarrow className="h-3.5 w-3.5" />
              <span>{SORTS.find(s => s.value === sort)?.label}</span>
            </button>
          }
        />
        <div className="ml-auto flex items-center gap-2 px-1 text-xs tabular-nums text-muted-foreground">
          {isFetching && !isPending && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/70" aria-label="Refreshing" />}
          {data && (
            <span>
              {rows.length.toLocaleString()} {rows.length === 1 ? 'applicant' : 'applicants'}
              <span className="hidden sm:inline"> · {totals.applications.toLocaleString()} applications · {ws.money(totals.awarded, { compact: true })} awarded</span>
            </span>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        {isPending ? (
          <SkeletonRows rows={12} className="pt-2" />
        ) : isError ? (
          <EmptyState icon={<Users />} title="Applicants didn’t load" description="Check your connection and try again." action={<Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>} />
        ) : rows.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={<Search />}
              title="No one matches"
              description={program && !q ? `Nobody has applied to ${program.name} yet.` : 'Try part of a name, an email address or an organization.'}
              action={<Button size="sm" variant="outline" onClick={() => { setText(''); update({ q: null, program: null }); }}>Clear filters</Button>}
            />
          ) : (
            <EmptyState
              icon={<Users />}
              title="No applicants yet"
              description="People appear here when they sign in to the portal, or when you add them."
              action={<Button size="sm" onClick={() => setAdding(true)}><Plus /> Add applicant</Button>}
            />
          )
        ) : (
          <div role="table" aria-label="Applicants" className="min-w-0">
            <div role="row" className={cn(GRID, 'sticky top-0 z-10 h-8 border-b bg-subtle/95 px-5 text-xs font-medium text-muted-foreground backdrop-blur-sm')}>
              <SortHeader value="name">Name</SortHeader>
              <span className="hidden md:block">Email</span>
              <span className="hidden xl:block">Location</span>
              <SortHeader value="applications" className="hidden justify-end md:flex">Applied</SortHeader>
              <span className="hidden text-right md:block">Accepted</span>
              <SortHeader value="awarded" className="hidden justify-end md:flex">Awarded</SortHeader>
              <SortHeader value="last_active" className="justify-end">Last active</SortHeader>
            </div>
            {rows.map(r => (
              <ApplicantListRow key={r.id} row={r} focused={r.id === focused} onOpen={() => navigate(`/applicants/${r.id}`)} onHover={() => setFocused(r.id)} />
            ))}
          </div>
        )}
      </div>
      <AddApplicantDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}

function ApplicantListRow({ row: r, focused, onOpen, onHover }: { row: ApplicantRow; focused: boolean; onOpen: () => void; onHover: () => void }) {
  const ws = useWorkspace();
  return (
    <div
      role="row"
      data-applicant-id={r.id}
      onClick={onOpen}
      onMouseMove={focused ? undefined : onHover}
      className={cn(GRID, 'h-11 cursor-default border-b border-border/50 px-5 text-[13px] transition-colors duration-75', focused ? 'bg-accent' : 'hover:bg-accent/50')}
    >
      <div role="cell" className="flex min-w-0 items-center gap-2.5">
        <ApplicantAvatar name={r.name} size={24} />
        <div className="min-w-0">
          <div className="truncate font-medium">{r.name || r.email}</div>
          {(r.organization || r.location) && <div className="truncate text-xs text-muted-foreground">{r.organization || <span className="xl:hidden">{r.location}</span>}</div>}
        </div>
      </div>
      <div role="cell" className="hidden truncate text-muted-foreground md:block">{r.email}</div>
      <div role="cell" className="hidden truncate text-muted-foreground xl:block">{r.location || '—'}</div>
      <div role="cell" className="hidden items-center justify-end gap-1.5 text-right tabular-nums md:flex">
        {r.programIds.length > 0 && (
          <Tip label={r.programIds.map(id => ws.programById.get(id)?.name).filter(Boolean).join(', ') || 'Programs'}>
            <span className="hidden gap-0.5 lg:flex">
              {r.programIds.slice(0, 3).map(id => {
                const p = ws.programById.get(id);
                return p ? <Glyph key={id} icon={p.icon} color={p.color} size={16} className="text-[9px]" /> : null;
              })}
            </span>
          </Tip>
        )}
        {r.applications ? r.applications : r.drafts ? null : <span className="text-muted-foreground/70">—</span>}
        {r.drafts > 0 && (
          <Tip label={`${r.drafts} unsubmitted draft${r.drafts === 1 ? '' : 's'}`}>
            <span className="ml-1 text-xs text-muted-foreground">{r.applications ? `+${r.drafts}` : `${r.drafts} draft${r.drafts === 1 ? '' : 's'}`}</span>
          </Tip>
        )}
      </div>
      <div role="cell" className={cn('hidden text-right tabular-nums md:block', r.accepted ? 'text-tone-success' : 'text-muted-foreground/70')}>{r.accepted || '—'}</div>
      <div role="cell" className="hidden text-right tabular-nums md:block">{r.awarded ? ws.money(r.awarded) : <span className="text-muted-foreground/70">—</span>}</div>
      <div role="cell" className="text-right text-xs tabular-nums text-muted-foreground">
        <span className="md:hidden">{r.applications ? `${r.applications} applied · ` : ''}</span>
        {r.lastActiveAt ? <Tip label={shortDate(r.lastActiveAt)}><span>{timeAgo(r.lastActiveAt)}</span></Tip> : 'Never'}
      </div>
    </div>
  );
}
