import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useHotkeys } from '../../lib/hotkeys';
import { plural } from '../../lib/format';
import { useMyReviews } from '../../lib/queries';
import { useWorkspace } from '../../lib/workspace';
import { Glyph, Kbd, ProgressBar } from '../primitives/bits';
import { groupByProgram, queueStats } from './reviewModel';
import { reviewListPath, reviewSession } from './ReviewWorkspace';

/** The end of the queue: a quiet moment of done, with what was finished and a way back. */
export function ReviewComplete() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const { data } = useMyReviews('all');
  const all = data?.reviews ?? [];
  const stats = useMemo(() => queueStats(all), [all]);
  const groups = useMemo(() => groupByProgram(all, all).filter(g => g.total > 0), [all]);
  const session = reviewSession.submitted;

  useHotkeys({ esc: () => navigate(reviewListPath()), enter: () => navigate(reviewListPath()) });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <Link to={reviewListPath()} className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> My reviews
        </Link>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center animate-fade-up sm:py-24">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-tone-success/[0.12] text-tone-success">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="text-[18px] font-semibold tracking-tight">That's everything assigned to you</h1>
          <p className="mt-1.5 text-[13.5px] text-muted-foreground">
            {session > 0 ? `You submitted ${plural(session, 'review')} this session. ` : ''}
            Thank you{ws.me.name ? `, ${ws.me.name.split(' ')[0]}` : ''} — new assignments will appear in My reviews.
          </p>

          {data && (
            <div className="mt-8 w-full rounded-lg border text-left">
              <div className="grid grid-cols-2 divide-x border-b">
                <div className="px-4 py-3">
                  <div className="text-[18px] font-semibold tabular-nums">{stats.submitted30}</div>
                  <div className="text-xs text-muted-foreground">Submitted in the last 30 days</div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-[18px] font-semibold tabular-nums">{stats.done}</div>
                  <div className="text-xs text-muted-foreground">Finished in total{stats.recused ? ` · ${stats.recused} recused` : ''}</div>
                </div>
              </div>
              {groups.length > 0 && (
                <div className="divide-y">
                  {groups.map(g => (
                    <div key={g.programId} className="flex items-center gap-2.5 px-4 py-2.5">
                      <Glyph icon={g.icon} color={g.color} size={18} className="text-[11px]" />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{g.name}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{g.done} of {g.total}</span>
                      <ProgressBar value={g.total ? g.done / g.total : 0} tone={g.done >= g.total ? 'success' : 'primary'} className="w-16" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <Link to={reviewListPath()} className="inline-flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-xs hover:bg-primary/90">
              Back to My reviews <Kbd className="border-primary-foreground/20 bg-primary-foreground/15 text-primary-foreground">↵</Kbd>
            </Link>
            <Link to="/reviews?tab=done" className="inline-flex h-8 items-center rounded-md border bg-background px-3 text-[13px] font-medium shadow-2xs hover:bg-accent">
              See what you've reviewed
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
