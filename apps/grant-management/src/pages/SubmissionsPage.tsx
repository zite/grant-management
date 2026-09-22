import { Layers } from 'lucide-react';
import { useEffect } from 'react';
import { SubmissionsView } from '../components/submissions/SubmissionsView';
import { PageHeader, useDocumentTitle } from '../components/shell/PageHeader';
import { useAppActions } from '../lib/app-actions';

export function SubmissionsPage() {
  useDocumentTitle('Submissions');
  const app = useAppActions();
  useEffect(() => app.setContextProgram(null), []);
  return (
    <>
      <PageHeader icon={<Layers />} title="Submissions" />
      <SubmissionsView surfaceKey="all-submissions" defaults={{ grouping: 'program', ordering: 'submitted_desc' }} defaultFilters={{ statuses: ['Submitted'] }} />
    </>
  );
}
