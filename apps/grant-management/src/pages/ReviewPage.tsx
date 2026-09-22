import { FileQuestion } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '../components/primitives/bits';
import { ReviewComplete } from '../components/review/ReviewComplete';
import { ReviewWorkspace, reviewListPath } from '../components/review/ReviewWorkspace';
import { useDocumentTitle } from '../components/shell/PageHeader';
import { useAppActions } from '../lib/app-actions';
import { useReview } from '../lib/queries';

function ReviewSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <div className="skeleton h-5 w-5 rounded" />
        <div className="skeleton h-3.5 w-48" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="mx-auto w-full max-w-[760px] space-y-4 px-8 pt-16">
          <div className="skeleton h-3 w-40" />
          <div className="skeleton h-7 w-2/3" />
          <div className="skeleton h-16 w-full rounded-lg" />
          <div className="skeleton mt-6 h-40 w-full rounded-lg" />
          <div className="skeleton h-40 w-full rounded-lg" />
        </div>
        <div className="hidden w-[400px] shrink-0 space-y-3 border-l p-5 lg:block">
          <div className="skeleton h-4 w-32" />
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-[104px] w-full rounded-lg" />)}
        </div>
      </div>
    </div>
  );
}

export function ReviewPage() {
  const { reviewId = '' } = useParams();
  const app = useAppActions();
  const { data, isPending, isError } = useReview(reviewId);
  const [completedFor, setCompletedFor] = useState<string | null>(null);
  useDocumentTitle(completedFor === reviewId ? 'All done' : data ? `Review ${data.submission.reference}` : 'Review');
  useEffect(() => {
    if (data) app.setContextProgram(data.program.id);
    return () => app.setContextProgram(null);
  }, [data?.program.id]);

  if (completedFor === reviewId) return <ReviewComplete />;
  if (isPending) return <ReviewSkeleton />;
  if (isError || !data) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title="This review isn't available"
        description="It may have been removed by a program manager, or it's assigned to someone else."
        action={<Link to={reviewListPath()} className="text-[13px] text-primary hover:underline">Back to My reviews</Link>}
        className="h-full"
      />
    );
  }
  return <ReviewWorkspace key={data.review.id} detail={data} onComplete={() => setCompletedFor(reviewId)} />;
}
