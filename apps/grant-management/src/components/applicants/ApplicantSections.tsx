import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft, ArrowUpRight, Banknote, Check, CircleDot, FilePlus2, Gavel, ListChecks, Loader2, Mail, Send, Undo2, type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { saveApplicant } from 'zitejs/api';
import { cn } from '@project/components/lib/utils';
import { useAppActions } from '../../lib/app-actions';
import { STATUS_META } from '../../lib/constants';
import { errorMessage } from '../../lib/errors';
import { qk } from '../../lib/queries';
import { dateTime, shortDate, timeAgo } from '../../lib/format';
import type { Workspace } from '../../lib/workspace';
import { useWorkspace } from '../../lib/workspace';
import { Glyph, Tip } from '../primitives/bits';
import { OutcomeGlyph, ScorePill, StageGlyph } from '../primitives/icons';
import { applicantKeys, ensureHttps, EMAIL_RE, type ApplicantDetail } from './applicantData';

type Submission = ApplicantDetail['submissions'][number];
type Message = ApplicantDetail['messages'][number];
type Activity = ApplicantDetail['activity'][number];

export function Section({ title, count, action, children }: { title: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {count != null && <span className="text-xs tabular-nums text-muted-foreground">{count}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

function StatusCell({ s, ws }: { s: Submission; ws: Workspace }) {
  if (s.status === 'Submitted') {
    const stage = s.stageId ? ws.stageById.get(s.stageId) : undefined;
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <StageGlyph kind={stage?.kind} color={stage?.color} />
        <span className="truncate">{stage?.name ?? 'In review'}</span>
      </span>
    );
  }
  const decided = s.status === 'Accepted' || s.status === 'Declined' || s.status === 'Waitlisted';
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <OutcomeGlyph status={s.status} />
      <span className="truncate">{STATUS_META[s.status]?.label ?? s.status}</span>
      {decided && !s.notifiedAt && (
        <Tip label="Decided, but not yet released to the applicant">
          <span className="shrink-0 rounded bg-tone-warning/[0.12] px-1 text-2xs font-medium text-tone-warning">Unreleased</span>
        </Tip>
      )}
    </span>
  );
}

const APP_GRID = 'grid items-center gap-x-3 grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[58px_minmax(0,1fr)_minmax(0,150px)_72px_44px_88px]';

export function ApplicationsList({ submissions }: { submissions: Submission[] }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const navigate = useNavigate();
  if (!submissions.length) {
    return <div className="rounded-lg border border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">No applications yet.</div>;
  }
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className={cn(APP_GRID, 'hidden h-8 border-b bg-subtle px-3 text-xs font-medium text-muted-foreground sm:grid')}>
        <span>Ref</span>
        <span>Application</span>
        <span>Status</span>
        <span>Submitted</span>
        <span className="text-right">Score</span>
        <span className="text-right">Award</span>
      </div>
      {submissions.map(s => {
        const program = ws.programById.get(s.programId);
        const draft = s.status === 'Draft';
        const open = () => (draft ? app.openPeek(s.id) : navigate(`/submission/${s.reference}`));
        return (
          <button
            key={s.id}
            type="button"
            onClick={open}
            className={cn(APP_GRID, 'w-full border-b px-3 py-2 text-left text-[13px] transition-colors last:border-b-0 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none sm:h-11 sm:py-0')}
          >
            <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">{draft ? 'Draft' : s.reference}</span>
            <span className="flex min-w-0 items-center gap-2">
              {program && <Glyph icon={program.icon} color={program.color} size={18} className="text-[11px]" />}
              <span className="min-w-0">
                <span className="block truncate font-medium">{s.title || 'Untitled application'}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  <span className="sm:hidden">{draft ? 'Draft' : s.reference} · </span>
                  {program?.name ?? 'A deleted program'}
                </span>
              </span>
            </span>
            <span className="hidden min-w-0 text-[12.5px] sm:block">
              <StatusCell s={s} ws={ws} />
            </span>
            <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">
              {s.submittedAt ? shortDate(s.submittedAt) : draft && s.startedAt ? <Tip label={`Started ${shortDate(s.startedAt)}`}><span>—</span></Tip> : '—'}
            </span>
            <span className="hidden justify-end sm:flex">
              <ScorePill score={s.avgScore} count={s.reviewsSubmitted} />
            </span>
            <span className="text-right tabular-nums">
              {s.status === 'Accepted' && s.awardAmount != null ? (
                <span className={cn(s.awardStatus === 'Cancelled' && 'text-muted-foreground line-through')}>{ws.money(s.awardAmount)}</span>
              ) : s.requestedAmount != null ? (
                <Tip label="Requested">
                  <span className="text-xs text-muted-foreground">{ws.money(s.requestedAmount)} req.</span>
                </Tip>
              ) : (
                <span className="text-muted-foreground/70">—</span>
              )}
              <span className="mt-0.5 block text-xs sm:hidden">
                <StatusCell s={s} ws={ws} />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export function MessagesList({ messages, applicantName }: { messages: Message[]; applicantName: string }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const [all, setAll] = useState(false);
  if (!messages.length) {
    return <div className="rounded-lg border border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">No messages with {applicantName.split(' ')[0] || 'this applicant'} yet.</div>;
  }
  const shown = all ? messages : messages.slice(0, 6);
  return (
    <div className="overflow-hidden rounded-lg border">
      {shown.map(m => {
        const inbound = m.direction === 'Inbound';
        const sender = inbound ? applicantName : m.senderId ? ws.memberById.get(m.senderId)?.name ?? 'A former teammate' : 'System';
        const canOpen = Boolean(m.reference && m.reference !== 'Draft');
        return (
          <button
            key={m.id}
            type="button"
            disabled={!canOpen}
            onClick={() => canOpen && navigate(`/submission/${m.reference}`)}
            className="flex w-full items-start gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 enabled:hover:bg-accent/50 disabled:cursor-default"
          >
            <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-subtle', inbound ? 'text-tone-info' : 'text-muted-foreground')}>
              {inbound ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn('truncate text-[13px]', inbound && !m.readAt ? 'font-semibold' : 'font-medium')}>{m.subject || '(No subject)'}</span>
                {m.kind !== 'Message' && <span className="shrink-0 rounded bg-muted px-1 text-2xs text-muted-foreground">{m.kind}</span>}
                <Tip label={dateTime(m.sentAt)}>
                  <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{timeAgo(m.sentAt)}</span>
                </Tip>
              </span>
              <span className="mt-0.5 line-clamp-1 text-[12.5px] text-muted-foreground">
                <span className="text-foreground/80">{sender}</span> · {m.preview}
              </span>
              <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                {m.reference && <span className="tabular-nums">{m.reference}</span>}
                {m.delivery === 'Failed' && <span className="text-tone-danger">Email not delivered</span>}
                {m.delivery === 'Portal only' && !inbound && <span>Portal only</span>}
              </span>
            </span>
          </button>
        );
      })}
      {messages.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} className="flex h-9 w-full items-center justify-center text-[12.5px] text-muted-foreground hover:bg-accent/50 hover:text-foreground">
          Show all {messages.length} messages
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

function describe(a: Activity, ws: Workspace, firstName: string): { icon: LucideIcon; text: ReactNode } {
  const d = a.data ?? {};
  const staff = a.actorId ? ws.memberById.get(a.actorId)?.name ?? 'A teammate' : 'System';
  const q = (v: unknown) => <span className="font-medium text-foreground">“{String(v ?? '')}”</span>;
  switch (a.type) {
    case 'started':
      return { icon: CircleDot, text: `${firstName} started an application` };
    case 'submitted':
      return { icon: Send, text: d.by === 'staff' ? `${staff} entered an application for ${firstName}` : `${firstName} submitted` };
    case 'created_by_staff':
      return { icon: FilePlus2, text: `${staff} added an application for ${firstName}` };
    case 'withdrawn':
      return { icon: Undo2, text: d.by === 'staff' ? `${staff} withdrew the application` : `${firstName} withdrew${d.reason ? ` — ${String(d.reason)}` : ''}` };
    case 'decision_released':
      return { icon: Gavel, text: <>Decision released: <span className="font-medium text-foreground">{STATUS_META[String(d.decision)]?.label ?? String(d.decision ?? '')}</span></> };
    case 'message_sent':
      return { icon: Mail, text: <>{staff} sent {q(d.subject)}</> };
    case 'message_received':
      return { icon: ArrowDownLeft, text: <>{firstName} wrote {d.subject ? q(d.subject) : 'a message'}</> };
    case 'task_requested':
      return { icon: ListChecks, text: <>{staff} asked for {q(d.title)}</> };
    case 'task_submitted':
      return { icon: ListChecks, text: <>{firstName} completed {q(d.title)}</> };
    case 'task_approved':
      return { icon: Check, text: <>{staff} approved {q(d.title)}</> };
    case 'task_returned':
      return { icon: Undo2, text: <>{staff} sent {q(d.title)} back for changes</> };
    case 'payment_recorded':
      return { icon: Banknote, text: <>Payment of <span className="font-medium text-foreground">{ws.money(Number(d.amount ?? 0))}</span> recorded</> };
    default:
      return { icon: CircleDot, text: a.type.replace(/_/g, ' ') };
  }
}

export function ActivitySummary({ detail }: { detail: ApplicantDetail }) {
  const ws = useWorkspace();
  const first = detail.applicant.name.split(' ')[0] || 'They';
  const firstSubmitted = detail.submissions.map(s => s.submittedAt).filter(Boolean).sort()[0];
  const facts = [
    { label: 'First seen', value: detail.applicant.joinedAt ? shortDate(detail.applicant.joinedAt) : '—' },
    { label: 'First applied', value: firstSubmitted ? shortDate(firstSubmitted) : 'Not yet' },
    { label: 'Last active', value: detail.applicant.lastActiveAt ? timeAgo(detail.applicant.lastActiveAt) : 'Never' },
    { label: 'Programs', value: String(new Set(detail.submissions.map(s => s.programId)).size) },
  ];

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
        {facts.map(f => (
          <div key={f.label} className="bg-background px-3 py-2.5">
            <dt className="text-xs text-muted-foreground">{f.label}</dt>
            <dd className="mt-0.5 text-[13px] font-medium tabular-nums">{f.value}</dd>
          </div>
        ))}
      </dl>
      {detail.activity.length === 0 ? (
        <p className="px-1 text-[13px] text-muted-foreground">Nothing has happened yet.</p>
      ) : (
        <ol className="relative space-y-0.5 pl-1">
          {detail.activity.slice(0, 12).map((a, i, list) => {
            const { icon: Icon, text } = describe(a, ws, first);
            return (
              <li key={a.id} className="relative flex gap-3 py-1.5">
                {i < list.length - 1 && <span aria-hidden className="absolute left-[11px] top-7 h-[calc(100%-18px)] w-px bg-border" />}
                <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
                  <Icon className="h-3 w-3" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5 text-[13px] text-muted-foreground">
                  <span>{text}</span>
                  {a.reference && <span className="ml-1.5 text-xs tabular-nums">{a.reference}</span>}
                  <Tip label={dateTime(a.occurredAt)}>
                    <span className="ml-1.5 text-xs text-faint">{timeAgo(a.occurredAt)}</span>
                  </Tip>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile and notes
// ---------------------------------------------------------------------------

function usePatchApplicant(id: string) {
  const qc = useQueryClient();
  return (patch: Partial<ApplicantDetail['applicant']>) =>
    qc.setQueryData<ApplicantDetail>(applicantKeys.detail(id), old => (old ? { ...old, applicant: { ...old.applicant, ...patch } } : old));
}

type Editable = 'name' | 'email' | 'organization' | 'phone' | 'location' | 'website';

function ProfileField({ label, field, value, placeholder, type = 'text', onCommit }: {
  label: string;
  field: Editable;
  value: string;
  placeholder: string;
  type?: string;
  onCommit: (field: Editable, next: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);
  const commit = async () => {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(value);
      return;
    }
    const next = draft.trim();
    if (next === value.trim()) return;
    if (!(await onCommit(field, next))) setDraft(value);
  };
  return (
    <label className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2 px-3 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        type={type}
        value={draft}
        placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          void commit();
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            e.stopPropagation();
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
        className="h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-[13px] outline-none transition-colors placeholder:text-faint hover:border-border focus:border-input focus:bg-background"
      />
    </label>
  );
}

export function ProfileCard({ detail }: { detail: ApplicantDetail }) {
  const a = detail.applicant;
  const app = useAppActions();
  const qc = useQueryClient();
  const patch = usePatchApplicant(a.id);

  const commit = async (field: Editable, raw: string) => {
    let next = raw;
    if (field === 'name' && !next) {
      toast.error('An applicant needs a name');
      return false;
    }
    if (field === 'email') {
      if (!EMAIL_RE.test(next)) {
        toast.error('Enter a valid email address');
        return false;
      }
      const ok = await app.confirm({
        title: `Change the email ${a.name.split(' ')[0] || 'they'} signs in with?`,
        description: `Applicants sign in to the portal with their email. After this, ${a.name || 'they'} will need to use ${next} instead of ${a.email}. Their applications and messages stay with this profile.`,
        confirmLabel: 'Change email',
      });
      if (!ok) return false;
    }
    if (field === 'website' && next) next = ensureHttps(next);
    const previous = a[field];
    patch({ [field]: next });
    try {
      await saveApplicant({ action: 'update', id: a.id, [field]: next || null });
      qc.invalidateQueries({ queryKey: [...qk.applicantsRoot, 'list'] });
      toast.success('Saved');
      return true;
    } catch (e) {
      patch({ [field]: previous });
      toast.error(errorMessage(e, "Couldn't save that change"));
      return false;
    }
  };

  return (
    <div className="rounded-lg border bg-background py-1.5">
      <ProfileField label="Name" field="name" value={a.name} placeholder="Full name" onCommit={commit} />
      <ProfileField label="Email" field="email" type="email" value={a.email} placeholder="name@example.org" onCommit={commit} />
      <ProfileField label="Organization" field="organization" value={a.organization} placeholder="Add organization" onCommit={commit} />
      <ProfileField label="Phone" field="phone" type="tel" value={a.phone} placeholder="Add phone" onCommit={commit} />
      <ProfileField label="Location" field="location" value={a.location} placeholder="Add location" onCommit={commit} />
      <ProfileField label="Website" field="website" value={a.website} placeholder="Add website" onCommit={commit} />
    </div>
  );
}

/** Internal notes save themselves a moment after you stop typing, and again on the way out. */
export function NotesCard({ detail }: { detail: ApplicantDetail }) {
  const id = detail.applicant.id;
  const patch = usePatchApplicant(id);
  const [draft, setDraft] = useState(detail.applicant.notes);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saved = useRef(detail.applicant.notes);
  const inflight = useRef<Promise<void> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Adopt a change made elsewhere, unless there are unsaved edits here.
  useEffect(() => {
    if (draftRef.current === saved.current && detail.applicant.notes !== saved.current) {
      setDraft(detail.applicant.notes);
      saved.current = detail.applicant.notes;
    }
  }, [detail.applicant.notes]);

  const save = async () => {
    if (inflight.current) await inflight.current;
    const value = draftRef.current;
    if (value === saved.current) return;
    setStatus('saving');
    const run = (async () => {
      try {
        await saveApplicant({ action: 'update', id, notes: value });
        saved.current = value;
        patch({ notes: value });
        setStatus(draftRef.current === value ? 'saved' : 'idle');
      } catch (e) {
        setStatus('error');
        toast.error(errorMessage(e, "Couldn't save your notes"));
      }
    })();
    inflight.current = run;
    await run;
    inflight.current = null;
  };

  useEffect(() => {
    if (draft === saved.current) return;
    setStatus('idle');
    const t = window.setTimeout(() => void save(), 800);
    return () => window.clearTimeout(t);
  }, [draft]);

  // Leaving the page mid-sentence still saves.
  useEffect(
    () => () => {
      if (draftRef.current !== saved.current) void saveApplicant({ action: 'update', id, notes: draftRef.current }).catch(() => undefined);
    },
    [id],
  );

  return (
    <div className="rounded-lg border bg-background focus-within:border-foreground/25">
      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => void save()}
        placeholder="Context the team should know — history with this person, how to reach them, anything to keep in mind. Only staff can see this."
        rows={6}
        maxLength={20000}
        aria-label="Internal notes"
        className="block min-h-[132px] w-full resize-y rounded-t-lg bg-transparent px-3 py-2.5 text-[13px] leading-relaxed outline-none placeholder:text-faint"
      />
      <div className="flex h-8 items-center gap-1.5 border-t px-3 text-xs text-muted-foreground">
        <span>Visible to staff only</span>
        <span className="ml-auto flex items-center gap-1">
          {status === 'saving' && <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>}
          {status === 'saved' && <><Check className="h-3 w-3 text-tone-success" /> Saved</>}
          {status === 'error' && <button type="button" onClick={() => void save()} className="text-tone-danger hover:underline">Not saved — retry</button>}
        </span>
      </div>
    </div>
  );
}
