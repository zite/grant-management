import { FileQuestion, WifiOff } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '../components/primitives/bits';
import { PageHeader, useDocumentTitle } from '../components/shell/PageHeader';
import { SubmissionDetailView } from '../components/submission/SubmissionDetail';
import { useAppActions } from '../lib/app-actions';
import { useSubmission } from '../lib/queries';

function DetailSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col" aria-busy="true" aria-label="Loading submission">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-4">
        <div className="skeleton h-4 w-4 rounded" />
        <div className="skeleton h-3 w-32" />
        <div className="skeleton h-3 w-14" />
        <div className="ml-auto skeleton h-7 w-20 rounded-md" />
        <div className="skeleton h-7 w-7 rounded-md" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[880px] space-y-3 px-4 pt-8 sm:px-8">
            <div className="skeleton h-7 w-3/4" />
            <div className="skeleton h-3.5 w-1/2" />
            <div className="flex gap-4 pt-6">
              {[80, 64, 72, 48, 60].map((w, i) => <div key={i} className="skeleton h-3.5" style={{ width: w }} />)}
            </div>
            <div className="space-y-2 pt-6">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="grid grid-cols-[2fr_3fr] gap-6 rounded-md border px-4 py-3.5">
                  <div className="skeleton h-3" />
                  <div className="skeleton h-3" style={{ width: `${50 + ((i * 29) % 45)}%` }} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="hidden w-[280px] shrink-0 space-y-3 border-l bg-subtle/40 px-4 py-5 lg:block">
          <div className="skeleton h-3 w-20" />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton h-3 w-16" />
              <div className="skeleton h-3 flex-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SubmissionPage() {
  const { reference = '' } = useParams();
  const app = useAppActions();
  const { data, isPending, isError, error, refetch, isFetching } = useSubmission(reference);
  const programId = data?.submission.programId ?? null;
  const setContextProgram = app.setContextProgram;
  useDocumentTitle(data ? `${data.submission.reference === 'Draft' ? 'Draft' : data.submission.reference} · ${data.submission.title || 'Untitled'}` : reference);

  useEffect(() => {
    if (programId) setContextProgram(programId);
  }, [programId, setContextProgram]);
  useEffect(() => () => setContextProgram(null), [setContextProgram]);

  if (isPending) return <DetailSkeleton />;
  if (isError || !data) {
    const notFound = /not found|\(404\)/i.test(String((error as Error | null)?.message ?? ''));
    return (
      <>
        <PageHeader title={reference} breadcrumb={{ to: '/submissions', label: 'Submissions' }} />
        {notFound ? (
          <EmptyState
            icon={<FileQuestion />}
            title={`There’s no submission ${reference}`}
            description="It may have been deleted, or the link has a typo. References look like ARTS-12."
            action={<Link to="/submissions" className="text-[13px] font-medium text-primary hover:underline">Go to all submissions</Link>}
          />
        ) : (
          <EmptyState
            icon={<WifiOff />}
            title="This submission didn’t load"
            description="Check your connection and try again."
            action={<button type="button" disabled={isFetching} onClick={() => refetch()} className="text-[13px] font-medium text-primary hover:underline disabled:opacity-60">{isFetching ? 'Retrying…' : 'Try again'}</button>}
          />
        )}
      </>
    );
  }
  return <SubmissionDetailView key={data.submission.id} detail={data} mode="page" />;
}
