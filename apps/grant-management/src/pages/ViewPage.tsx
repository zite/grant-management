import { Layers } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { EmptyState } from '../components/primitives/bits';
import { PageHeader, useDocumentTitle } from '../components/shell/PageHeader';
import { SubmissionsView } from '../components/submissions/SubmissionsView';
import { parseViewConfig } from '../lib/view';
import { useWorkspace } from '../lib/workspace';

export function ViewPage() {
  const { viewId = '' } = useParams();
  const ws = useWorkspace();
  const view = ws.viewById.get(viewId);
  useDocumentTitle(view?.name ?? 'View');
  if (!view) return <><PageHeader title="View" /><EmptyState icon={<Layers />} title="View not found" description="It may have been deleted." /></>;
  const cfg = parseViewConfig(view.config);
  return (
    <>
      <PageHeader icon={<Layers />} title={view.name} breadcrumb={{ to: '/views', label: 'Views' }} />
      <SubmissionsView key={view.id} surfaceKey={`view:${view.id}:${view.config.length}`} defaults={cfg.options} defaultFilters={cfg.filters} programId={view.programId} savedView={{ id: view.id, name: view.name, scope: view.scope }} />
    </>
  );
}
