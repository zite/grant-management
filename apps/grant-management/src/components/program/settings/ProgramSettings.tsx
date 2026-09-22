import { AlertOctagon, CalendarRange, ClipboardCheck, Mail, Settings2, Users, Workflow } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { cn } from '@project/components/lib/utils';
import { useAppActions } from '../../../lib/app-actions';
import type { Program } from '../../../lib/types';
import { ApplicationSettings } from './ApplicationSettings';
import { DangerZone } from './DangerZone';
import { EmailSettings } from './EmailSettings';
import { GeneralSettings } from './GeneralSettings';
import { PipelineSettings } from './PipelineSettings';
import { ReviewSettings } from './ReviewSettings';
import { TeamSettings } from './TeamSettings';

export const SECTIONS: Array<{ key: string; label: string; icon: ReactNode; wide?: boolean }> = [
  { key: 'general', label: 'General', icon: <Settings2 /> },
  { key: 'application', label: 'Application page', icon: <CalendarRange />, wide: true },
  { key: 'pipeline', label: 'Pipeline', icon: <Workflow /> },
  { key: 'review', label: 'Review', icon: <ClipboardCheck />, wide: true },
  { key: 'team', label: 'Reviewers & team', icon: <Users /> },
  { key: 'emails', label: 'Emails', icon: <Mail /> },
  { key: 'danger', label: 'Danger zone', icon: <AlertOctagon /> },
];

/**
 * Sections with a form register whether they hold unsaved edits, so leaving
 * the section through this page's own navigation asks first.
 */
const DirtyContext = createContext<(key: string, dirty: boolean) => void>(() => undefined);

export function useReportDirty(key: string, dirty: boolean) {
  const report = useContext(DirtyContext);
  useEffect(() => {
    report(key, dirty);
    return () => report(key, false);
  }, [key, dirty, report]);
}

export function ProgramSettings({ program, section, onPublish }: { program: Program; section?: string; onPublish: () => void }) {
  const navigate = useNavigate();
  const app = useAppActions();
  const dirty = useRef(new Set<string>());
  const [, force] = useState(0);
  const report = useCallback((key: string, isDirty: boolean) => {
    const had = dirty.current.has(key);
    if (isDirty) dirty.current.add(key);
    else dirty.current.delete(key);
    if (had !== isDirty) force(n => n + 1);
  }, []);
  const current = SECTIONS.find(s => s.key === section);

  const go = async (key: string) => {
    if (key === section) return;
    if (dirty.current.size > 0) {
      const ok = await app.confirm({ title: 'Discard unsaved changes?', description: 'You have edits in this section that haven’t been saved.', confirmLabel: 'Discard changes', destructive: true });
      if (!ok) return;
      dirty.current.clear();
    }
    navigate(`/programs/${program.id}/settings/${key}`);
  };

  const content = useMemo(() => {
    switch (section) {
      case 'general':
        return <GeneralSettings program={program} />;
      case 'application':
        return <ApplicationSettings program={program} />;
      case 'pipeline':
        return <PipelineSettings program={program} />;
      case 'review':
        return <ReviewSettings program={program} />;
      case 'team':
        return <TeamSettings program={program} />;
      case 'emails':
        return <EmailSettings program={program} />;
      case 'danger':
        return <DangerZone program={program} onPublish={onPublish} />;
      default:
        return null;
    }
  }, [section, program, onPublish]);

  if (!current) return <Navigate to={`/programs/${program.id}/settings/general`} replace />;

  const isDirty = dirty.current.size > 0;

  return (
    <DirtyContext.Provider value={report}>
      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-[208px] shrink-0 border-r bg-subtle/50 p-2 md:block" aria-label="Program settings">
          <div className="px-2 pb-1.5 pt-2 text-2xs font-medium text-muted-foreground">Settings</div>
          <ul className="space-y-px">
            {SECTIONS.map(s => (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => go(s.key)}
                  aria-current={s.key === section ? 'page' : undefined}
                  className={cn(
                    'flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5',
                    s.key === section ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    s.key === 'danger' && s.key !== section && 'text-tone-danger/90 hover:text-tone-danger',
                  )}
                >
                  {s.icon}
                  <span className="truncate">{s.label}</span>
                  {s.key === section && isDirty && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-tone-warning" aria-label="Unsaved changes" />}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto" id="program-settings-scroll">
          <div className="sticky top-0 z-[5] flex gap-1 overflow-x-auto border-b bg-background px-3 py-1.5 scrollbar-none md:hidden">
            {SECTIONS.map(s => (
              <button
                key={s.key}
                ref={el => {
                  if (el && s.key === section) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                }}
                type="button"
                onClick={() => go(s.key)}
                className={cn(
                  'flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] [&_svg]:h-3.5 [&_svg]:w-3.5',
                  s.key === section ? 'border-border bg-accent font-medium' : 'border-transparent text-muted-foreground',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div key={section} className={cn('mx-auto px-4 py-6 animate-fade-in sm:px-8 sm:py-8', current.wide ? 'max-w-[1080px]' : 'max-w-[760px]')}>
            {content}
          </div>
        </div>
      </div>
    </DirtyContext.Provider>
  );
}
