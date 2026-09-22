import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@project/components/ui/tooltip';
import { Layout } from './components/Layout';
import { useBrand } from './lib/brand';
import { usePortal } from './lib/queries';
import { initSystemTheme, useIsDark } from './lib/theme';
import { ApplicationPage } from './pages/ApplicationPage';
import { ApplyPage } from './pages/ApplyPage';
import { HomePage } from './pages/HomePage';
import { MyApplicationsPage } from './pages/MyApplicationsPage';
import { ProfilePage } from './pages/ProfilePage';
import { ProgramPage } from './pages/ProgramPage';
import { ReviewSubmitPage } from './pages/ReviewSubmitPage';
import { ReviewWorkspacePage } from './pages/ReviewWorkspacePage';
import { ReviewsPage } from './pages/ReviewsPage';
import { TaskPage } from './pages/TaskPage';

// Before the first render, so a dark-mode visitor never sees a white flash.
initSystemTheme();

/**
 * The applicant portal. HashRouter, not BrowserRouter: the app is served from
 * a path the runtime doesn't rewrite, so a refreshed path-based link — the
 * kind we email to applicants — would 404.
 */
export default function App() {
  const portal = usePortal();
  useBrand(portal.data?.settings.brandColor);
  const dark = useIsDark();

  return (
    <TooltipProvider delayDuration={250}>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/programs/:slug" element={<ProgramPage />} />
            <Route path="/programs/:slug/apply" element={<ApplyPage />} />
            <Route path="/applications" element={<MyApplicationsPage />} />
            <Route path="/applications/:id" element={<ApplicationPage />} />
            <Route path="/applications/:id/review" element={<ReviewSubmitPage />} />
            <Route path="/tasks/:taskId" element={<TaskPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/reviews" element={<ReviewsPage />} />
            <Route path="/reviews/:reviewId" element={<ReviewWorkspacePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </HashRouter>
      <Toaster position="bottom-center" theme={dark ? 'dark' : 'light'} closeButton toastOptions={{ className: 'text-[15px] rounded-xl' }} />
    </TooltipProvider>
  );
}
