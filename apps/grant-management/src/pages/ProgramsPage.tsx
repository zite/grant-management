import { Archive, ArchiveRestore, Copy, ExternalLink, FolderKanban, LayoutGrid, List, MoreHorizontal, Plus, Settings, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { cn } from '@project/components/lib/utils';
import { MemberAvatar } from '../components/primitives/Avatar';
import { EmptyState, Glyph, IconButton, ProgressBar, Tip } from '../components/primitives/bits';
import { DeadlineText, PhaseBadge, Sparkline, portalProgramUrl } from '../components/program/ProgramBits';
import { PublishDialog, totalSubmissions, useProgramLifecycle } from '../components/program/ProgramActions';
import { useProgramStats } from '../components/program/programData';
import { PageHeader, useDocumentTitle } from '../components/shell/PageHeader';
import { useAppActions } from '../lib/app-actions';
import { copyText } from '../lib/clipboard';
import { plural } from '../lib/format';
import { useHotkeys } from '../lib/hotkeys';
import type { Program } from '../lib/types';
import { useWorkspace } from '../lib/workspace';

type TabKey = 'active' | 'closed' | 'archived';
type Layout = 'grid' | 'list';

const TABS: Array<{ key: TabKey; label: string; phases: string[] }> = [
  { key: 'active', label: 'Active', phases: ['open', 'closing', 'scheduled', 'draft'] },
  { key: 'closed', label: 'Closed', phases: ['closed'] },
  { key: 'archived', label: 'Archived', phases: ['archived'] },
];

const EMPTY_TAB: Record<TabKey, { title: string; description: string }> = {
  active: { title: 'No active programs', description: 'Programs that are open, opening soon or still being drafted show up here.' },
  closed: { title: 'No closed programs', description: 'Once a program’s deadline passes, it moves here while you finish reviewing and deciding.' },
  archived: { title: 'Nothing archived', description: 'Archive a program when its cycle is over to keep lists tidy. Everything in it is kept.' },
};

function useStoredLayout() {
  const [layout, setLayout] = useState<Layout>(() => {
    try {
      return localStorage.getItem('grants:programs:layout') === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const set = useCallback((l: Layout) => {
    setLayout(l);
    try {
      localStorage.setItem('grants:programs:layout', l);
    } catch {
      /* storage may be unavailable */
    }
  }, []);
  return [layout, set] as const;
}

function ProgramMenu({ program, onPublish }: { program: Program; onPublish: () => void }) {
  const ws = useWorkspace();
  const life = useProgramLifecycle();
  const navigate = useNavigate();
  const portal = portalProgramUrl(ws.settings.portalUrl, program.slug);
  const total = totalSubmissions(program);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton size="sm" aria-label={`Actions for ${program.name}`} className="opacity-70 group-hover:opacity-100 data-[state=open]:opacity-100">
          <MoreHorizontal />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" >
        <DropdownMenuItem className="text-[13px]" onSelect={() => navigate(`/programs/${program.id}/settings`)}>
          <Settings className="h-3.5 w-3.5" /> Settings
        </DropdownMenuItem>
        {program.status === 'Draft' && (
          <DropdownMenuItem className="text-[13px]" onSelect={onPublish}>
            <Sparkles className="h-3.5 w-3.5" /> Publish…
          </DropdownMenuItem>
        )}
        {portal && program.status === 'Published' && (
          <>
            <DropdownMenuItem className="text-[13px]" onSelect={() => window.open(portal, '_blank', 'noopener')}>
              <ExternalLink className="h-3.5 w-3.5" /> View in portal
            </DropdownMenuItem>
            <DropdownMenuItem className="text-[13px]" onSelect={() => copyText(portal, 'Portal link copied')}>
              <Copy className="h-3.5 w-3.5" /> Copy portal link
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem className="text-[13px]" onSelect={() => life.duplicate(program)}>
          <Copy className="h-3.5 w-3.5" /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {program.status === 'Archived' ? (
          <DropdownMenuItem className="text-[13px]" onSelect={() => life.unarchive(program)}>
            <ArchiveRestore className="h-3.5 w-3.5" /> Unarchive
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem className="text-[13px]" onSelect={() => life.archive(program)}>
            <Archive className="h-3.5 w-3.5" /> Archive…
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={total > 0} className="flex-wrap text-[13px] text-tone-danger focus:text-tone-danger" onSelect={() => life.remove(program)}>
          <Trash2 className="h-3.5 w-3.5" /> Delete…
          {total > 0 && <span className="w-full pl-6 text-2xs text-muted-foreground">Has {plural(total, 'submission')} — archive instead</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BudgetLine({ program }: { program: Program }) {
  const ws = useWorkspace();
  if (!program.budget) {
    return (
      <div className="text-xs text-muted-foreground">
        {program.awarded > 0 ? <><span className="font-medium tabular-nums text-foreground">{ws.money(program.awarded, { compact: true })}</span> awarded · no budget set</> : 'No budget set'}
      </div>
    );
  }
  const share = program.awarded / program.budget;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          <span className="font-medium tabular-nums text-foreground">{ws.money(program.awarded, { compact: true })}</span> awarded of {ws.money(program.budget, { compact: true })}
        </span>
        <span className="tabular-nums text-muted-foreground">{Math.round(share * 100)}%</span>
      </div>
      <ProgressBar value={share} tone={share > 1 ? 'danger' : share > 0.9 ? 'warning' : 'primary'} />
    </div>
  );
}

function ProgramCard({ program, series, onPublish }: { program: Program; series?: { total: number; series: number[] }; onPublish: () => void }) {
  const ws = useWorkspace();
  const owner = program.ownerId ? ws.memberById.get(program.ownerId) : undefined;
  return (
    <div
      data-program-id={program.id}
      className="group relative flex min-w-0 flex-col rounded-lg border bg-background p-4 shadow-xs transition-[border-color,box-shadow] focus-within:ring-2 focus-within:ring-ring hover:border-foreground/20 hover:shadow-sm"
    >
      <div className="flex items-start gap-3">
        <Glyph icon={program.icon} color={program.color} size={32} className="rounded-lg" />
        <div className="min-w-0 flex-1">
          {/* The title link stretches over the whole card; the menu sits above it. */}
          <Link to={`/programs/${program.id}`} className="block truncate text-[14px] font-medium leading-5 outline-none after:absolute after:inset-0 after:rounded-lg after:content-['']">
            {program.name}
          </Link>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{program.type}</span>
            <span aria-hidden>·</span>
            <span className="font-mono text-[11px]">{program.key}</span>
          </div>
        </div>
        <div className="relative z-[1]">
          <ProgramMenu program={program} onPublish={onPublish} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <PhaseBadge phase={program.phase} />
        <DeadlineText program={program} />
      </div>

      <p className="mt-2.5 line-clamp-2 min-h-[36px] text-[12.5px] leading-[18px] text-muted-foreground">{program.summary || 'No summary yet.'}</p>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="grid flex-1 grid-cols-3 gap-2">
          <Metric label="In review" value={program.counts.inPipeline} />
          <Metric label="Drafts" value={program.counts.drafts} />
          <Metric label="Accepted" value={program.counts.accepted} />
        </div>
        <div className="flex flex-col items-end">
          <Sparkline values={series?.series ?? []} color={program.color} width={84} height={26} label={series ? `${plural(series.total, 'submission')} in the last 30 days` : undefined} />
          <span className="mt-0.5 text-2xs tabular-nums text-muted-foreground">{series ? `${series.total} in 30 days` : ' '}</span>
        </div>
      </div>

      <div className="mt-3 flex items-end gap-3 border-t pt-3">
        <div className="min-w-0 flex-1">
          <BudgetLine program={program} />
        </div>
        {owner && (
          <Tip label={`Owner: ${owner.name}`}>
            <span className="relative z-[1] shrink-0">
              <MemberAvatar member={owner} size={20} />
            </span>
          </Tip>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <div className="text-[15px] font-medium leading-5">{value.toLocaleString()}</div>
      <div className="truncate text-2xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ProgramRow({ program, series, onPublish }: { program: Program; series?: { total: number; series: number[] }; onPublish: () => void }) {
  const ws = useWorkspace();
  const owner = program.ownerId ? ws.memberById.get(program.ownerId) : undefined;
  return (
    <div
      data-program-id={program.id}
      className="group relative grid h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-4 text-[13px] transition-colors focus-within:bg-accent/60 hover:bg-accent/50 md:grid-cols-[minmax(0,1.6fr)_150px_70px_70px_70px_minmax(120px,0.8fr)_92px_28px] lg:px-5"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Glyph icon={program.icon} color={program.color} size={22} />
        <Link to={`/programs/${program.id}`} className="truncate font-medium outline-none after:absolute after:inset-0 after:content-['']">
          {program.name}
        </Link>
        <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground sm:inline">{program.key}</span>
      </div>
      <div className="hidden min-w-0 flex-col md:flex">
        <PhaseBadge phase={program.phase} className="self-start" />
      </div>
      <div className="hidden text-right tabular-nums md:block">
        {program.counts.inPipeline}
        <div className="text-2xs text-muted-foreground">in review</div>
      </div>
      <div className="hidden text-right tabular-nums md:block">
        {program.counts.drafts}
        <div className="text-2xs text-muted-foreground">drafts</div>
      </div>
      <div className="hidden text-right tabular-nums md:block">
        {program.counts.accepted}
        <div className="text-2xs text-muted-foreground">accepted</div>
      </div>
      <div className="hidden min-w-0 md:block">
        {program.budget ? (
          <>
            <div className="truncate text-xs tabular-nums text-muted-foreground">
              <span className="text-foreground">{ws.money(program.awarded, { compact: true })}</span> / {ws.money(program.budget, { compact: true })}
            </div>
            <ProgressBar value={program.awarded / program.budget} className="mt-1 h-1" />
          </>
        ) : (
          <span className="text-xs text-muted-foreground">No budget</span>
        )}
      </div>
      <div className="hidden md:block">
        <Sparkline values={series?.series ?? []} color={program.color} width={84} height={22} label={series ? `${plural(series.total, 'submission')} in the last 30 days` : undefined} />
      </div>
      <div className="flex items-center justify-end gap-1">
        <span className="text-xs md:hidden">
          <DeadlineText program={program} />
        </span>
        {owner && <MemberAvatar member={owner} size={18} className="hidden md:inline-flex" />}
        <span className="relative z-[1]">
          <ProgramMenu program={program} onPublish={onPublish} />
        </span>
      </div>
    </div>
  );
}

export function ProgramsPage() {
  useDocumentTitle('Programs');
  const ws = useWorkspace();
  const app = useAppActions();
  const [params, setParams] = useSearchParams();
  const [layout, setLayout] = useStoredLayout();
  const { data: stats } = useProgramStats(30);
  const [publishing, setPublishing] = useState<Program | null>(null);
  useEffect(() => app.setContextProgram(null), []);

  const tab = TABS.find(t => t.key === params.get('tab')) ?? TABS[0];
  const counts = useMemo(() => Object.fromEntries(TABS.map(t => [t.key, ws.programs.filter(p => t.phases.includes(p.phase)).length])) as Record<TabKey, number>, [ws.programs]);
  const visible = useMemo(() => ws.orderedPrograms.filter(p => tab.phases.includes(p.phase)), [ws.orderedPrograms, tab]);
  const seriesBy = useMemo(() => new Map((stats?.programs ?? []).map(s => [s.programId, s])), [stats]);

  const setTab = (key: TabKey) => {
    const next = new URLSearchParams(params);
    if (key === 'active') next.delete('tab');
    else next.set('tab', key);
    setParams(next, { replace: true });
  };

  useHotkeys({
    '1': () => setTab('active'),
    '2': () => setTab('closed'),
    '3': () => setTab('archived'),
  });

  const onPublish = (p: Program) => setPublishing(p);
  const fresh = ws.programs.length === 0;

  const tabs = (
    <nav className="ml-2 flex min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-none" aria-label="Filter programs">
      {TABS.map((t, i) => {
        const on = t.key === tab.key;
        return (
          <Tip key={t.key} label={`${t.label} programs`} keys={[String(i + 1)]}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] transition-colors',
                on ? 'border-border bg-accent font-medium text-foreground shadow-2xs' : 'border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              {t.label}
              {counts[t.key] > 0 && <span className="tabular-nums text-muted-foreground">{counts[t.key]}</span>}
            </button>
          </Tip>
        );
      })}
    </nav>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={<FolderKanban />}
        title="Programs"
        actions={
          <>
            {!fresh && (
              <div className="hidden h-7 items-center rounded-md border bg-background p-0.5 sm:flex" role="radiogroup" aria-label="Layout">
                {([['grid', <LayoutGrid key="g" />, 'Cards'], ['list', <List key="l" />, 'List']] as const).map(([value, icon, label]) => (
                  <Tip key={value} label={`${label} layout`}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={layout === value}
                      aria-label={`${label} layout`}
                      onClick={() => setLayout(value)}
                      className={cn('flex h-full w-7 items-center justify-center rounded-[4px] text-muted-foreground transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5', layout === value ? 'bg-accent text-foreground shadow-2xs' : 'hover:text-foreground')}
                    >
                      {icon}
                    </button>
                  </Tip>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={app.openCreateProgram}
              className="ml-1 flex h-7 items-center gap-1.5 rounded-md bg-primary px-2 text-[12.5px] font-medium text-primary-foreground shadow-xs hover:bg-primary/90 sm:px-2.5"
            >
              <Plus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">New program</span>
            </button>
          </>
        }
      >
        {!fresh && tabs}
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {fresh ? (
          <EmptyState
            className="py-24"
            icon={<FolderKanban />}
            title="Create your first program"
            description="A program is one thing you fund or award — a grant round, a scholarship, a residency. It has its own application form, pipeline, reviewers and budget."
            action={
              <button type="button" onClick={app.openCreateProgram} className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-xs hover:bg-primary/90">
                <Plus className="h-3.5 w-3.5" /> Create a program
              </button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState icon={tab.key === 'archived' ? <Archive /> : <FolderKanban />} title={EMPTY_TAB[tab.key].title} description={EMPTY_TAB[tab.key].description} />
        ) : layout === 'grid' ? (
          <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3 2xl:grid-cols-4">
            {visible.map(p => (
              <ProgramCard key={p.id} program={p} series={seriesBy.get(p.id)} onPublish={() => onPublish(p)} />
            ))}
          </div>
        ) : (
          <div>
            <div className="sticky top-0 z-[1] hidden h-8 grid-cols-[minmax(0,1.6fr)_150px_70px_70px_70px_minmax(120px,0.8fr)_92px_28px] items-center gap-3 border-b bg-subtle px-5 text-2xs font-medium text-muted-foreground md:grid">
              <span>Program</span>
              <span>Phase</span>
              <span className="text-right">Pipeline</span>
              <span className="text-right">Drafts</span>
              <span className="text-right">Accepted</span>
              <span>Awarded</span>
              <span>Last 30 days</span>
              <span />
            </div>
            {visible.map(p => (
              <ProgramRow key={p.id} program={p} series={seriesBy.get(p.id)} onPublish={() => onPublish(p)} />
            ))}
          </div>
        )}
      </div>
      <PublishDialog program={publishing} open={Boolean(publishing)} onOpenChange={o => !o && setPublishing(null)} />
    </div>
  );
}
