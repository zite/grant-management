import { AlertCircle, Check, CloudUpload, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@project/components/lib/utils';
import { timeAgo } from '../../lib/format';
import { MOD } from '../../lib/hotkeys';
import { Tip } from '../primitives/bits';
import type { SaveStatus } from './useReviewDraft';

/** "Saving…", "Saved · just now", "Couldn't save · Retry" — the one line that tells a reviewer their work is safe. */
export function SaveIndicator({ status, lastSavedAt, error, onRetry, className }: { status: SaveStatus; lastSavedAt: number | null; error: string | null; onRetry: () => void; className?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!lastSavedAt) return;
    const t = window.setInterval(() => tick(n => n + 1), 15_000);
    return () => window.clearInterval(t);
  }, [lastSavedAt]);

  const base = cn('inline-flex min-w-0 items-center gap-1.5 text-xs', className);
  if (status === 'error') {
    return (
      <span className={cn(base, 'text-tone-danger')} role="status">
        <Tip label={error ?? "Your changes are kept on this device and we'll keep trying."}>
          <span className="inline-flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 shrink-0" /> Couldn't save</span>
        </Tip>
        <span aria-hidden>·</span>
        <button type="button" onClick={onRetry} className="font-medium underline-offset-2 hover:underline">Retry</button>
      </span>
    );
  }
  if (status === 'pending' || status === 'saving') {
    return (
      <span className={cn(base, 'text-muted-foreground')} role="status">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> Saving…
      </span>
    );
  }
  if (status === 'saved' && lastSavedAt) {
    return (
      <Tip label="Your scores and notes save automatically" keys={[MOD, 'S']}>
        <span className={cn(base, 'text-muted-foreground')} role="status">
          <Check className="h-3.5 w-3.5 shrink-0 text-tone-success" /> Saved · {timeAgo(new Date(lastSavedAt).toISOString())}
        </span>
      </Tip>
    );
  }
  return (
    <span className={cn(base, 'text-muted-foreground')}>
      <CloudUpload className="h-3.5 w-3.5 shrink-0" /> Saves as you go
    </span>
  );
}
