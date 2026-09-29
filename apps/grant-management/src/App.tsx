import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from '@project/components/ui/sonner';
import { TooltipProvider } from '@project/components/ui/tooltip';
import { AppShell } from './components/shell/AppShell';
import { errorMessage } from './lib/errors';
import { useBootstrap } from './lib/queries';
import { useTheme } from './lib/theme';
import { useWorkspace, WorkspaceProvider } from './lib/workspace';
import { InboxPage } from './pages/InboxPage';
import { MyReviewsPage } from './pages/MyReviewsPage';
import { ReviewPage } from './pages/ReviewPage';
import { SubmissionPage } from './pages/SubmissionPage';
import { SubmissionsPage } from './pages/SubmissionsPage';
import { ViewPage } from './pages/ViewPage';
import { ViewsPage } from './pages/ViewsPage';

/**
 * HashRouter, not BrowserRouter: the app is served under a path the runtime
 * doesn't rewrite, so a refreshed path-based deep link would 404.
 */

// The daily loop (inbox, submissions, reviewing) ships in the first bundle. Pages that carry
// charts, the form builder or settings load on demand, and are prefetched once the browser is idle.
const loaders = {
  programs: () => import('./pages/ProgramsPage').then(m => ({ default: m.ProgramsPage })),
  program: () => import('./pages/ProgramPage').then(m => ({ default: m.ProgramPage })),
  applicants: () => import('./pages/ApplicantsPage').then(m => ({ default: m.ApplicantsPage })),
  applicant: () => import('./pages/ApplicantPage').then(m => ({ default: m.ApplicantPage })),
  awards: () => import('./pages/AwardsPage').then(m => ({ default: m.AwardsPage })),
  reports: () => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })),
  settings: () => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })),
};
const ProgramsPage = lazy(loaders.programs);
const ProgramPage = lazy(loaders.program);
const ApplicantsPage = lazy(loaders.applicants);
const ApplicantPage = lazy(loaders.applicant);
const AwardsPage = lazy(loaders.awards);
const ReportsPage = lazy(loaders.reports);
const SettingsPage = lazy(loaders.settings);

function usePrefetchPages() {
  useEffect(() => {
    const run = () => Object.values(loaders).forEach(load => void load().catch(() => undefined));
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (idle) idle(run);
    else window.setTimeout(run, 1500);
  }, []);
}

const Page = ({ children }: { children: ReactNode }) => <Suspense fallback={<div className="min-h-0 flex-1" />}>{children}</Suspense>;

function BootScreen({ state, onRetry, message }: { state: 'loading' | 'error'; onRetry: () => void; message?: string }) {
  return (
    <div className="grid h-[100dvh] place-items-center bg-canvas px-6">
      <div className="flex max-w-sm flex-col items-center text-center animate-fade-up">
        <img src="/favicon.svg" alt="" className="mb-5 h-11 w-11 rounded-xl shadow-md" />
        {state === 'error' ? (
          <>
            <h1 className="text-[15px] font-semibold">Grant Management couldn't load</h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground">{message ?? "The workspace didn't respond. If you opened this in a new browser, make sure you're signed in to your organization."}</p>
            <button type="button" onClick={onRetry} className="mt-4 h-8 rounded-md border bg-background px-3 text-[13px] shadow-xs hover:bg-accent">Try again</button>
          </>
        ) : (
          <>
            <h1 className="text-[14px] font-medium">Loading Grant Management</h1>
            <div className="mt-4 h-1 w-40 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-1/3 rounded-full bg-primary/70" style={{ animation: 'boot-slide 1.2s ease-in-out infinite' }} />
            </div>
            <style>{'@keyframes boot-slide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'}</style>
          </>
        )}
      </div>
    </div>
  );
}

function ManagerOnly({ children }: { children: ReactNode }) {
  const ws = useWorkspace();
  return ws.isManager ? <>{children}</> : <Navigate to="/reviews" replace />;
}

function Boot() {
  const { data, isError, error, refetch } = useBootstrap();
  usePrefetchPages();

  if (isError) {
    const refusal = errorMessage(error, '');
    return <BootScreen state="error" message={/deactivated/i.test(refusal) ? refusal : undefined} onRetry={() => void refetch()} />;
  }
  if (!data) return <BootScreen state="loading" onRetry={refetch} />;

  return (
    <WorkspaceProvider data={data}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to={data.me.role === 'Reviewer' ? '/reviews' : '/inbox'} replace />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/reviews" element={<MyReviewsPage />} />
          <Route path="/reviews/:reviewId" element={<ReviewPage />} />
          <Route path="/submissions" element={<ManagerOnly><SubmissionsPage /></ManagerOnly>} />
          <Route path="/submission/:reference" element={<ManagerOnly><SubmissionPage /></ManagerOnly>} />
          <Route path="/programs" element={<ManagerOnly><Page><ProgramsPage /></Page></ManagerOnly>} />
          <Route path="/programs/:programId" element={<ManagerOnly><Page><ProgramPage /></Page></ManagerOnly>} />
          <Route path="/programs/:programId/:tab" element={<ManagerOnly><Page><ProgramPage /></Page></ManagerOnly>} />
          <Route path="/programs/:programId/:tab/:section" element={<ManagerOnly><Page><ProgramPage /></Page></ManagerOnly>} />
          <Route path="/applicants" element={<ManagerOnly><Page><ApplicantsPage /></Page></ManagerOnly>} />
          <Route path="/applicants/:applicantId" element={<ManagerOnly><Page><ApplicantPage /></Page></ManagerOnly>} />
          <Route path="/awards" element={<ManagerOnly><Page><AwardsPage /></Page></ManagerOnly>} />
          <Route path="/reports" element={<ManagerOnly><Page><ReportsPage /></Page></ManagerOnly>} />
          <Route path="/views" element={<ManagerOnly><ViewsPage /></ManagerOnly>} />
          <Route path="/view/:viewId" element={<ManagerOnly><ViewPage /></ManagerOnly>} />
          <Route path="/settings" element={<Navigate to={data.me.role === 'Reviewer' ? '/settings/profile' : '/settings/general'} replace />} />
          <Route path="/settings/:section" element={<Page><SettingsPage /></Page>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </WorkspaceProvider>
  );
}

export default function App() {
  const { resolved } = useTheme();
  return (
    <HashRouter>
      <TooltipProvider delayDuration={350} skipDelayDuration={200}>
        <Boot />
        <Toaster position="bottom-right" theme={resolved} closeButton richColors={false} toastOptions={{ className: 'text-[13px]' }} />
      </TooltipProvider>
    </HashRouter>
  );
}
