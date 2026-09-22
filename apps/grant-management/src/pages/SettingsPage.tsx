import { ChevronRight, Globe, Mail, Settings, SlidersHorizontal, Tag, UserRound, Users, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Navigate, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { cn } from '@project/components/lib/utils';
import { GeneralSettings } from '../components/settings/GeneralSettings';
import { LabelsSettings } from '../components/settings/LabelsSettings';
import { MembersSettings } from '../components/settings/MembersSettings';
import { PortalSettings } from '../components/settings/PortalSettings';
import { ProfileSettings } from '../components/settings/ProfileSettings';
import { TemplatesSettings } from '../components/settings/TemplatesSettings';
import { LockBanner, SettingsLockContext } from '../components/settings/ui';
import { PageHeader, useDocumentTitle } from '../components/shell/PageHeader';
import type { Workspace } from '../lib/workspace';
import { useWorkspace } from '../lib/workspace';

type Section = 'general' | 'portal' | 'members' | 'labels' | 'templates' | 'profile';

const SECTIONS: Record<Section, { label: string; icon: LucideIcon; group: 'Organization' | 'Account' }> = {
  general: { label: 'General', icon: SlidersHorizontal, group: 'Organization' },
  portal: { label: 'Applicant portal', icon: Globe, group: 'Organization' },
  members: { label: 'Members', icon: Users, group: 'Organization' },
  labels: { label: 'Labels', icon: Tag, group: 'Organization' },
  templates: { label: 'Email templates', icon: Mail, group: 'Organization' },
  profile: { label: 'Profile', icon: UserRound, group: 'Account' },
};

const ORG: Section[] = ['general', 'portal', 'members', 'labels', 'templates'];

/** Mirrors the endpoints' rules, so a control that would be refused says so before anyone tries. */
function lockFor(section: Section, ws: Workspace): string | null {
  if (ws.isAdmin || section === 'profile') return null;
  if (section === 'general' || section === 'portal') return 'Only admins can change organization settings. You can see them here, but not edit them.';
  if (section === 'members') return 'Only admins can invite people, change roles or deactivate anyone.';
  return null;
}

function NavItem({ section }: { section: Section }) {
  const s = SECTIONS[section];
  return (
    <NavLink
      to={`/settings/${section}`}
      className={({ isActive }) =>
        cn('flex h-7 items-center gap-2 rounded-md px-2 text-[13px] transition-colors duration-75', isActive ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground')
      }
    >
      <s.icon className="h-[15px] w-[15px] shrink-0" />
      <span className="truncate">{s.label}</span>
    </NavLink>
  );
}

function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-1 px-2 text-xs font-medium text-muted-foreground">{label}</div>
      <div className="space-y-px">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const { section: raw = '' } = useParams();
  const ws = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const scroller = useRef<HTMLDivElement>(null);
  const available: Section[] = ws.isManager ? [...ORG, 'profile'] : ['profile'];
  const known = Object.prototype.hasOwnProperty.call(SECTIONS, raw) && available.includes(raw as Section);
  const section = (known ? raw : null) as Section | null;
  useDocumentTitle(section ? `${SECTIONS[section].label} · Settings` : 'Settings');

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  if (!section) return <Navigate to={ws.isManager ? '/settings/general' : '/settings/profile'} replace />;

  const lock = lockFor(section, ws);
  const content =
    section === 'general' ? <GeneralSettings />
    : section === 'portal' ? <PortalSettings />
    : section === 'members' ? <MembersSettings />
    : section === 'labels' ? <LabelsSettings />
    : section === 'templates' ? <TemplatesSettings />
    : <ProfileSettings />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={<Settings />}
        title={
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="text-muted-foreground">Settings</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{SECTIONS[section].label}</span>
          </span>
        }
      />
      <div className="flex min-h-0 flex-1">
        {available.length > 1 && (
          <nav aria-label="Settings" className="hidden w-[220px] shrink-0 overflow-y-auto border-r bg-subtle px-2 py-5 lg:block">
            <NavGroup label="Organization">{ORG.map(s => <NavItem key={s} section={s} />)}</NavGroup>
            <NavGroup label="Account"><NavItem section="profile" /></NavGroup>
          </nav>
        )}
        <div ref={scroller} className="min-w-0 flex-1 overflow-y-auto">
          {available.length > 1 && (
            <div className="border-b bg-subtle px-4 py-2 lg:hidden">
              <Select value={section} onValueChange={v => navigate(`/settings/${v}`)}>
                <SelectTrigger aria-label="Settings section" className="h-8 bg-background text-[13px] [&>span]:flex [&>span]:items-center [&>span]:gap-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel className="px-2 pb-1 pt-1.5 text-2xs font-medium text-muted-foreground">Organization</SelectLabel>
                    {ORG.map(s => {
                      const Icon = SECTIONS[s].icon;
                      return (
                        <SelectItem key={s} value={s} className="text-[13px]">
                          <span className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-muted-foreground" /> {SECTIONS[s].label}</span>
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel className="px-2 pb-1 pt-1.5 text-2xs font-medium text-muted-foreground">Account</SelectLabel>
                    <SelectItem value="profile" className="text-[13px]">
                      <span className="flex items-center gap-2"><UserRound className="h-3.5 w-3.5 text-muted-foreground" /> Profile</span>
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}
          <div key={section} className={cn('mx-auto w-full px-4 pb-16 pt-6 animate-fade-in sm:px-8 lg:pt-10', section === 'members' ? 'max-w-[1040px]' : 'max-w-[780px]')}>
            {lock && <LockBanner message={lock} />}
            <SettingsLockContext.Provider value={lock}>{content}</SettingsLockContext.Provider>
          </div>
        </div>
      </div>
    </div>
  );
}
