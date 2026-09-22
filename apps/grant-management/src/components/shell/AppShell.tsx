import { Menu, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetTitle } from '@project/components/ui/sheet';
import { cn } from '@project/components/lib/utils';
import { AppActionsContext, type AppActions, type ConfirmOptions, type DecisionIntent, type SubmissionTarget } from '../../lib/app-actions';
import { useHotkeys } from '../../lib/hotkeys';
import { useSubmission } from '../../lib/queries';
import { useTheme } from '../../lib/theme';
import { useWorkspace } from '../../lib/workspace';
import { AssignReviewersDialog } from '../dialogs/AssignReviewersDialog';
import { ComposeDialog } from '../dialogs/ComposeDialog';
import { DecisionDialog } from '../dialogs/DecisionDialog';
import { CreateProgramDialog } from '../program/CreateProgramDialog';
import { AddSubmissionDialog } from '../submission/AddSubmissionDialog';
import { SubmissionDetailView } from '../submission/SubmissionDetail';
import { IconButton } from '../primitives/bits';
import { CommandPalette } from './CommandPalette';
import { ShortcutsDialog } from './ShortcutsDialog';
import { Sidebar } from './Sidebar';

function PeekPanel({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isPending, isError } = useSubmission(id);
  return (
    <Sheet open={Boolean(id)} onOpenChange={o => !o && onClose()}>
      <SheetContent side="right" className="w-[min(820px,94vw)] gap-0 p-0 sm:max-w-none [&>button:first-child]:hidden">
        <SheetTitle className="sr-only">Submission preview</SheetTitle>
        {isPending && id ? (
          <div className="space-y-4 p-6">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-7 w-3/4" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-5/6" />
          </div>
        ) : isError ? (
          <div className="p-6 text-[13px] text-muted-foreground">That submission couldn't be loaded — it may have been deleted.</div>
        ) : data ? (
          <SubmissionDetailView detail={data} mode="peek" onClose={onClose} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ConfirmDialog({ state, onResolve }: { state: (ConfirmOptions & { open: boolean }) | null; onResolve: (ok: boolean) => void }) {
  return (
    <AlertDialog open={Boolean(state?.open)} onOpenChange={o => !o && onResolve(false)}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[15px]">{state?.title}</AlertDialogTitle>
          {state?.description && <AlertDialogDescription className="text-[13px]">{state.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-8 text-[13px]" onClick={() => onResolve(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction autoFocus className={cn('h-8 text-[13px]', state?.destructive && 'bg-destructive text-destructive-foreground hover:bg-destructive/90')} onClick={() => onResolve(true)}>
            {state?.confirmLabel ?? 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const GO_MANAGER: Record<string, string> = { i: '/inbox', r: '/reviews', s: '/submissions', p: '/programs', w: '/awards', a: '/applicants', t: '/reports', ',': '/settings' };
const GO_REVIEWER: Record<string, string> = { i: '/inbox', r: '/reviews' };

export function AppShell() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const { toggle: toggleTheme } = useTheme();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [peekId, setPeekId] = useState<string | null>(null);
  const [contextProgramId, setContextProgram] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { open: boolean }) | null>(null);
  const confirmResolver = useRef<((ok: boolean) => void) | null>(null);
  const [decision, setDecision] = useState<{ open: boolean; targets: SubmissionTarget[]; intent: DecisionIntent }>({ open: false, targets: [], intent: 'Accepted' });
  const [assign, setAssign] = useState<{ open: boolean; targets: SubmissionTarget[] }>({ open: false, targets: [] });
  const [compose, setCompose] = useState<{ open: boolean; targets: SubmissionTarget[]; initial?: { templateId?: string; subject?: string; body?: string } }>({ open: false, targets: [] });
  const [createProgramOpen, setCreateProgramOpen] = useState(false);
  const [addSubmission, setAddSubmission] = useState<{ open: boolean; programId?: string }>({ open: false });
  const [mobileNav, setMobileNav] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('grants:sidebar:collapsed') === '1';
    } catch {
      return false;
    }
  });
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    setMobileNav(false);
    setPeekId(null);
  }, [location.pathname]);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      confirmResolver.current = resolve;
      setConfirmState({ ...options, open: true });
    });
  }, []);

  const actions = useMemo<AppActions>(
    () => ({
      openPeek: id => setPeekId(id),
      closePeek: () => setPeekId(null),
      peekId,
      openPalette: q => {
        setPaletteQuery(q ?? '');
        setPaletteOpen(true);
      },
      openShortcuts: () => setShortcutsOpen(true),
      confirm,
      openDecision: (targets, intent) => setDecision({ open: true, targets, intent }),
      openAssignReviewers: targets => setAssign({ open: true, targets }),
      openCompose: (targets, initial) => setCompose({ open: true, targets, initial }),
      openCreateProgram: () => setCreateProgramOpen(true),
      openAddSubmission: programId => setAddSubmission({ open: true, programId }),
      setContextProgram,
      contextProgramId,
    }),
    [peekId, confirm, contextProgramId],
  );

  const toggleSidebar = () =>
    setCollapsed(c => {
      try {
        localStorage.setItem('grants:sidebar:collapsed', c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });

  useHotkeys({ 'mod+k': () => setPaletteOpen(o => !o) }, { allowInOverlay: true, allowInInputs: ['mod+k'] });
  useHotkeys({
    c: () => setPaletteOpen(true),
    '?': () => setShortcutsOpen(true),
    '[': toggleSidebar,
    'mod+shift+l': toggleTheme,
    g: () => {
      if (pendingG.current) window.clearTimeout(pendingG.current);
      pendingG.current = window.setTimeout(() => (pendingG.current = null), 1200);
    },
  });

  // "G then X" navigation, handled in the capture phase so list shortcuts don't claim the second key.
  useEffect(() => {
    const go = ws.isManager ? GO_MANAGER : GO_REVIEWER;
    const onKey = (e: KeyboardEvent) => {
      if (!pendingG.current || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      const key = e.key.toLowerCase();
      if (key === 'g') return;
      window.clearTimeout(pendingG.current);
      pendingG.current = null;
      const to = go[key];
      if (to) {
        e.preventDefault();
        e.stopImmediatePropagation();
        navigate(to);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [navigate, ws.isManager]);

  return (
    <AppActionsContext.Provider value={actions}>
      <div className="flex h-[100dvh] overflow-hidden bg-canvas">
        <aside className={cn('hidden shrink-0 overflow-hidden transition-[width] duration-200 md:block', collapsed ? 'w-0' : 'w-[248px]')}>
          <div className="h-full w-[248px]">
            <Sidebar />
          </div>
        </aside>

        <div className={cn('flex min-w-0 flex-1 flex-col md:py-2 md:pr-2', collapsed && 'md:pl-2')}>
          <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3 md:hidden">
            <Sheet open={mobileNav} onOpenChange={setMobileNav}>
              <IconButton onClick={() => setMobileNav(true)} aria-label="Open navigation">
                <Menu />
              </IconButton>
              <SheetContent side="left" className="w-[280px] bg-sidebar p-0 [&>button:first-child]:hidden">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <Sidebar onNavigate={() => setMobileNav(false)} />
              </SheetContent>
            </Sheet>
            <img src="/favicon.svg" alt="" className="h-5 w-5 rounded" />
            <span className="truncate text-[13.5px] font-semibold">{ws.settings.organizationName}</span>
            <IconButton className="ml-auto" onClick={() => setPaletteOpen(true)} aria-label="Search">
              <Search />
            </IconButton>
          </div>
          <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background md:rounded-lg md:border md:shadow-xs">
            <Outlet context={{ toggleSidebar, sidebarCollapsed: collapsed }} />
          </main>
        </div>

        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} initialQuery={paletteQuery} />
        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        {ws.isManager && (
          <>
            <PeekPanel id={peekId} onClose={() => setPeekId(null)} />
            <DecisionDialog open={decision.open} onOpenChange={o => setDecision(d => ({ ...d, open: o }))} targets={decision.targets} intent={decision.intent} />
            <AssignReviewersDialog open={assign.open} onOpenChange={o => setAssign(a => ({ ...a, open: o }))} targets={assign.targets} />
            <ComposeDialog open={compose.open} onOpenChange={o => setCompose(c => ({ ...c, open: o }))} targets={compose.targets} initial={compose.initial} />
            <CreateProgramDialog open={createProgramOpen} onOpenChange={setCreateProgramOpen} />
            <AddSubmissionDialog open={addSubmission.open} onOpenChange={o => setAddSubmission(a => ({ ...a, open: o }))} programId={addSubmission.programId} />
          </>
        )}
        <ConfirmDialog
          state={confirmState}
          onResolve={ok => {
            confirmResolver.current?.(ok);
            confirmResolver.current = null;
            setConfirmState(s => (s ? { ...s, open: false } : s));
          }}
        />
      </div>
    </AppActionsContext.Provider>
  );
}
