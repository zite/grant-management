import {
  BarChart3, ChevronRight, ClipboardCheck, ExternalLink, FolderKanban, HandCoins, Inbox, Keyboard, Layers, Moon, Plus, Search, Settings, Sun, UserPlus, Users, Laptop, FilePlus2, Mail,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { cn } from '@project/components/lib/utils';
import { useAppActions } from '../../lib/app-actions';
import { MOD } from '../../lib/hotkeys';
import { useTheme } from '../../lib/theme';
import { useWorkspace } from '../../lib/workspace';
import { MemberAvatar } from '../primitives/Avatar';
import { PhaseDot } from '../primitives/icons';
import { Glyph, Kbd, Tip } from '../primitives/bits';

function useStoredToggle(key: string, initial = true) {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(`grants:sidebar:${key}`);
      return v === null ? initial : v === '1';
    } catch {
      return initial;
    }
  });
  const toggle = () =>
    setValue(v => {
      try {
        localStorage.setItem(`grants:sidebar:${key}`, v ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !v;
    });
  return [value, toggle] as const;
}

function Item({ to, icon, label, count, onNavigate, end, indent, accent }: { to: string; icon: ReactNode; label: string; count?: number | null; onNavigate?: () => void; end?: boolean; indent?: boolean; accent?: boolean }) {
  const location = useLocation();
  // NavLink ignores the query string, so `/reviews?program=x` links need their own match.
  const query = to.includes('?') ? to.slice(to.indexOf('?')) : null;
  const queryMatches = query === null ? null : location.search === query || new URLSearchParams(location.search).get('program') === new URLSearchParams(query).get('program');
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive: pathActive }) => {
        const isActive = pathActive && (queryMatches ?? true);
        return cn(
          'group flex h-7 items-center gap-2 rounded-md px-2 text-[13px] text-sidebar-foreground transition-colors duration-75 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
          indent && 'pl-[30px]',
          isActive && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
        );
      }}
    >
      <span className="flex w-4 shrink-0 items-center justify-center [&_svg]:h-[15px] [&_svg]:w-[15px]">{icon}</span>
      <span className="truncate">{label}</span>
      {count ? <span className={cn('ml-auto text-xs tabular-nums', accent ? 'rounded-full bg-primary px-1.5 text-[11px] font-medium leading-[18px] text-primary-foreground' : 'text-muted-foreground')}>{count}</span> : null}
    </NavLink>
  );
}

function SectionHeader({ label, open, onToggle, action }: { label: string; open: boolean; onToggle: () => void; action?: ReactNode }) {
  return (
    <div className="group/sh flex h-7 items-center pl-2 pr-1">
      <button type="button" onClick={onToggle} className="flex flex-1 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        {label}
        <ChevronRight className={cn('h-3 w-3 transition-transform', open && 'rotate-90')} />
      </button>
      <span className="opacity-0 transition-opacity group-hover/sh:opacity-100">{action}</span>
    </div>
  );
}

function ProgramBlock({ programId, onNavigate }: { programId: string; onNavigate?: () => void }) {
  const ws = useWorkspace();
  const p = ws.programById.get(programId)!;
  const location = useLocation();
  const inProgram = location.pathname.startsWith(`/programs/${p.id}`);
  const [open, toggle] = useStoredToggle(`program:${p.id}`, false);
  return (
    <div>
      <div className={cn('group flex h-7 items-center rounded-md pr-1 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground', inProgram && !open && 'bg-sidebar-accent/60')}>
        <NavLink to={`/programs/${p.id}`} end onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2 pl-2">
          <Glyph icon={p.icon} color={p.color} size={16} className="text-[10px]" />
          <span className={cn('truncate', inProgram && 'font-medium text-sidebar-accent-foreground')}>{p.name}</span>
        </NavLink>
        <Tip label={p.phase === 'draft' ? 'Draft — not published' : p.phase === 'scheduled' ? 'Opens soon' : p.phase === 'closing' ? 'Closing soon' : p.phase === 'open' ? 'Accepting applications' : 'Closed'} side="right">
          <span className="ml-1 flex h-5 w-4 items-center justify-center"><PhaseDot phase={p.phase} /></span>
        </Tip>
        <button type="button" onClick={toggle} aria-label={open ? `Collapse ${p.name}` : `Expand ${p.name}`} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
          <ChevronRight className={cn('h-3 w-3 transition-transform', open && 'rotate-90')} />
        </button>
      </div>
      {open && (
        <div className="mt-px space-y-px">
          <Item indent to={`/programs/${p.id}/submissions`} icon={<Layers />} label="Submissions" count={p.counts.inPipeline} onNavigate={onNavigate} />
          <Item indent to={`/programs/${p.id}/reviews`} icon={<ClipboardCheck />} label="Reviews" onNavigate={onNavigate} />
          <Item indent to={`/programs/${p.id}/form`} icon={<FilePlus2 />} label="Forms" onNavigate={onNavigate} />
          <Item indent to={`/programs/${p.id}/settings`} icon={<Settings />} label="Settings" onNavigate={onNavigate} />
        </div>
      )}
    </div>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const { resolved, toggle, setPref } = useTheme();
  const [programsOpen, toggleProgramsOpen] = useStoredToggle('programs');
  const [viewsOpen, toggleViews] = useStoredToggle('views');
  const [showArchived, setShowArchived] = useState(false);
  const me = ws.memberById.get(ws.me.id);
  const programs = ws.orderedPrograms.filter(p => showArchived || p.phase !== 'archived');
  const archivedCount = ws.programs.filter(p => p.phase === 'archived').length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 px-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 hover:bg-sidebar-accent/70">
              {ws.settings.logoUrl ? <img src={ws.settings.logoUrl} alt="" className="h-5 w-5 rounded-[5px] object-cover" /> : <img src="/favicon.svg" alt="" className="h-5 w-5 rounded-[5px]" />}
              <span className="truncate text-[13.5px] font-semibold tracking-tight">{ws.settings.organizationName}</span>
              <ChevronRight className="h-3 w-3 shrink-0 rotate-90 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="flex items-center gap-2 py-2 font-normal">
              <MemberAvatar member={me} size={24} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{ws.me.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{ws.me.email} · {ws.me.role}</span>
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ws.isManager && (
              <DropdownMenuItem asChild className="text-[13px]">
                <NavLink to="/settings" onClick={onNavigate}><Settings className="h-3.5 w-3.5" /> Settings</NavLink>
              </DropdownMenuItem>
            )}
            {ws.isAdmin && (
              <DropdownMenuItem asChild className="text-[13px]">
                <NavLink to="/settings/members" onClick={onNavigate}><UserPlus className="h-3.5 w-3.5" /> Invite people</NavLink>
              </DropdownMenuItem>
            )}
            {!ws.isManager && (
              <DropdownMenuItem asChild className="text-[13px]">
                <NavLink to="/settings/profile" onClick={onNavigate}><Settings className="h-3.5 w-3.5" /> Profile</NavLink>
              </DropdownMenuItem>
            )}
            {ws.settings.portalUrl && (
              <DropdownMenuItem asChild className="text-[13px]">
                <a href={ws.settings.portalUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Open applicant portal</a>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-[13px]" onSelect={toggle}>
              {resolved === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />} {resolved === 'dark' ? 'Light theme' : 'Dark theme'}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-[13px]" onSelect={() => setPref('system')}>
              <Laptop className="h-3.5 w-3.5" /> Match system theme
            </DropdownMenuItem>
            <DropdownMenuItem className="text-[13px]" onSelect={() => app.openShortcuts()}>
              <Keyboard className="h-3.5 w-3.5" /> Keyboard shortcuts <span className="ml-auto"><Kbd>?</Kbd></span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tip label="Search" keys={[MOD, 'K']}>
          <button type="button" onClick={() => app.openPalette()} aria-label="Search" className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
            <Search className="h-4 w-4" />
          </button>
        </Tip>
        {ws.isManager && (
          <DropdownMenu>
            <Tip label="Create" keys={['C']}>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Create" className="flex h-7 w-7 items-center justify-center rounded-md border bg-background text-foreground shadow-2xs hover:bg-accent">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent align="end" className="w-56" data-create-menu>
              <DropdownMenuItem className="text-[13px]" onSelect={() => app.openCreateProgram()}>
                <FolderKanban className="h-3.5 w-3.5" /> New program
              </DropdownMenuItem>
              <DropdownMenuItem className="text-[13px]" onSelect={() => app.openAddSubmission(app.contextProgramId ?? undefined)}>
                <FilePlus2 className="h-3.5 w-3.5" /> Add a submission
              </DropdownMenuItem>
              {ws.isAdmin && (
                <DropdownMenuItem asChild className="text-[13px]">
                  <NavLink to="/settings/members" onClick={onNavigate}><UserPlus className="h-3.5 w-3.5" /> Invite a teammate</NavLink>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild className="text-[13px]">
                <NavLink to="/settings/templates" onClick={onNavigate}><Mail className="h-3.5 w-3.5" /> New email template</NavLink>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <nav className="min-h-0 flex-1 space-y-px overflow-y-auto px-2 pb-4">
        <Item to="/inbox" icon={<Inbox />} label="Inbox" count={ws.counts.inboxUnread} onNavigate={onNavigate} />
        <Item to="/reviews" icon={<ClipboardCheck />} label="My reviews" count={ws.counts.myReviewsOpen} accent={ws.counts.myReviewsOpen > 0} onNavigate={onNavigate} />
        {ws.isManager && (
          <>
            <Item to="/submissions" icon={<Layers />} label="Submissions" onNavigate={onNavigate} />
            <Item to="/awards" icon={<HandCoins />} label="Awards" onNavigate={onNavigate} />
            <Item to="/applicants" icon={<Users />} label="Applicants" onNavigate={onNavigate} />
            <Item to="/reports" icon={<BarChart3 />} label="Reports" onNavigate={onNavigate} />
          </>
        )}

        {ws.isManager && (
          <div className="pt-4">
            <SectionHeader
              label="Views"
              open={viewsOpen}
              onToggle={toggleViews}
              action={
                <NavLink to="/views" onClick={onNavigate} aria-label="All views" className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
                  <Layers className="h-3 w-3" />
                </NavLink>
              }
            />
            {viewsOpen && (
              <div className="space-y-px">
                {ws.views.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Save a filtered list to pin it here.</p>}
                {ws.views.map(v => (
                  <Item key={v.id} to={`/view/${v.id}`} icon={<span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />} label={v.name} onNavigate={onNavigate} />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="pt-4">
          <SectionHeader
            label="Programs"
            open={programsOpen}
            onToggle={toggleProgramsOpen}
            action={
              ws.isManager ? (
                <button type="button" onClick={() => app.openCreateProgram()} aria-label="New program" className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              ) : undefined
            }
          />
          {programsOpen && (
            <div className="space-y-px">
              {ws.isManager ? (
                <>
                  {programs.map(p => (
                    <ProgramBlock key={p.id} programId={p.id} onNavigate={onNavigate} />
                  ))}
                  <Item to="/programs" end icon={<FolderKanban />} label="All programs" onNavigate={onNavigate} />
                  {archivedCount > 0 && (
                    <button type="button" onClick={() => setShowArchived(s => !s)} className="flex h-7 w-full items-center px-2 text-xs text-muted-foreground hover:text-foreground">
                      {showArchived ? 'Hide archived' : `Show ${archivedCount} archived`}
                    </button>
                  )}
                </>
              ) : (
                ws.programs.map(p => (
                  <Item key={p.id} to={`/reviews?program=${p.id}`} icon={<Glyph icon={p.icon} color={p.color} size={16} className="text-[10px]" />} label={p.name} onNavigate={onNavigate} />
                ))
              )}
            </div>
          )}
        </div>
      </nav>

      <div className="shrink-0 space-y-px border-t border-sidebar-border px-2 py-2">
        {ws.settings.portalUrl && ws.isManager && (
          <a href={ws.settings.portalUrl} target="_blank" rel="noreferrer" className="flex h-7 items-center gap-2 rounded-md px-2 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground">
            <ExternalLink className="h-[15px] w-[15px]" /> Applicant portal
          </a>
        )}
        <NavLink to="/settings/profile" onClick={onNavigate} className="flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground">
          <MemberAvatar member={me} size={20} />
          <span className="truncate">{ws.me.name}</span>
          <span className="ml-auto text-xs text-muted-foreground">{ws.me.role}</span>
        </NavLink>
      </div>
    </div>
  );
}
