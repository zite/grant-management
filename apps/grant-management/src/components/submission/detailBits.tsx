import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@project/components/lib/utils';
import { currencySymbol } from '@project/shared/ui/FormRenderer';
import { STATUS_META } from '../../lib/constants';
import { dateTime, timeAgo } from '../../lib/format';
import { qk } from '../../lib/queries';
import { refreshEverythingSoon } from '../../lib/mutations';
import type { SubmissionDetail } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Tip } from '../primitives/bits';

export type Tone = 'neutral' | 'info' | 'accent' | 'success' | 'warning' | 'danger';

export const TONE_CHIP: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-tone-info/[0.1] text-tone-info',
  accent: 'bg-tone-accent/[0.1] text-tone-accent',
  success: 'bg-tone-success/[0.1] text-tone-success',
  warning: 'bg-tone-warning/[0.12] text-tone-warning',
  danger: 'bg-tone-danger/[0.1] text-tone-danger',
};

/** A small rounded status label. */
export function ToneChip({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded px-1.5 text-2xs font-medium', TONE_CHIP[tone], className)}>{children}</span>;
}

export function StatusChip({ status, className }: { status: string; className?: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.Draft;
  return (
    <ToneChip tone={meta.tone === 'info' ? 'accent' : meta.tone} className={className}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} aria-hidden />
      {meta.label}
    </ToneChip>
  );
}

/** "3d ago", with the exact time on hover. */
export function RelTime({ iso, prefix, className }: { iso: string | null | undefined; prefix?: string; className?: string }) {
  if (!iso) return null;
  return (
    <Tip label={dateTime(iso)}>
      <span className={cn('whitespace-nowrap', className)}>
        {prefix ? `${prefix} ` : ''}
        {timeAgo(iso)}
      </span>
    </Tip>
  );
}

/**
 * Cache helpers for the open submission. Every detail cache holding this
 * submission (the page by reference, the peek by id) is patched together, and
 * anything that changes list counts refreshes on the shared debounce.
 */
export function useDetailCache(submissionId: string) {
  const qc = useQueryClient();
  const patch = useCallback(
    (fn: (d: SubmissionDetail) => SubmissionDetail) => {
      qc.setQueriesData<SubmissionDetail>({ queryKey: qk.submissionRoot }, old => (old?.submission?.id === submissionId ? fn(old) : old));
    },
    [qc, submissionId],
  );
  const refresh = useCallback(
    (opts: { everything?: boolean; delay?: number } = {}) => {
      qc.invalidateQueries({ queryKey: qk.submissionRoot });
      if (opts.everything !== false) refreshEverythingSoon(qc, opts.delay ?? 800);
    },
    [qc],
  );
  return { qc, patch, refresh };
}

/**
 * A number you click to edit in place. Enter or blur saves, Escape cancels;
 * an empty value clears it when `allowEmpty`.
 */
export function InlineMoney({ value, onSave, placeholder = 'Add amount', allowEmpty = true, className, label }: {
  value: number | null | undefined;
  onSave: (next: number | null) => void | Promise<unknown>;
  placeholder?: string;
  allowEmpty?: boolean;
  className?: string;
  label: string;
}) {
  const ws = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) requestAnimationFrame(() => inputRef.current?.select());
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const cleaned = text.replace(/[^0-9.]/g, '');
    if (!cleaned) {
      if (allowEmpty && value != null) onSave(null);
      return;
    }
    const n = Math.round(Number(cleaned) * 100) / 100;
    if (Number.isFinite(n) && n !== value) onSave(n);
  };

  if (editing) {
    return (
      <span className={cn('relative flex h-7 w-full items-center', className)}>
        <span className="pointer-events-none absolute left-2 text-[13px] text-muted-foreground">{currencySymbol(ws.settings.currency)}</span>
        <input
          ref={inputRef}
          aria-label={label}
          inputMode="decimal"
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setText(value == null ? '' : String(value));
              setEditing(false);
            }
          }}
          className="h-7 w-full rounded-md border border-primary/60 bg-background pl-6 pr-2 text-[13px] tabular-nums outline-none ring-2 ring-primary/15"
        />
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        setText(value == null ? '' : String(value));
        setEditing(true);
      }}
      className={cn('ghost-chip -ml-2 w-full justify-start tabular-nums', value == null && 'text-muted-foreground', className)}
    >
      {value == null ? placeholder : ws.money(value)}
    </button>
  );
}

export function PropRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid min-h-8 grid-cols-[92px_minmax(0,1fr)] items-center gap-2', className)}>
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function RailSection({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('py-4 first:pt-0', className)}>
      <div className="mb-2 flex h-6 items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Mentions are stored as `@[Name](memberId)`; these are shown as a person's name. */
export const MENTION_RE = /@\[([^\]]+)\]\(([^)\s]+)\)/g;

export function MentionText({ body, className }: { body: string; className?: string }) {
  const ws = useWorkspace();
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    const at = m.index ?? 0;
    if (at > last) parts.push(body.slice(last, at));
    const member = ws.memberById.get(m[2]);
    parts.push(
      <span key={`${at}-${m[2]}`} className={cn('rounded px-0.5 font-medium', m[2] === ws.me.id ? 'bg-tone-warning/[0.14] text-foreground' : 'bg-primary/[0.1] text-primary')}>
        @{member?.name ?? m[1]}
      </span>,
    );
    last = at + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return <div className={cn('whitespace-pre-wrap break-words', className)}>{parts}</div>;
}

export function firstNameOf(name: string | null | undefined) {
  return (name ?? '').trim().split(/\s+/)[0] || 'Someone';
}
