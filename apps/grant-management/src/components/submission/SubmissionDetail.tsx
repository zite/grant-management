import {
  AlertTriangle, Check, ChevronDown, ClipboardList, FileDown, Gavel, Hash, Link2, Mail, Maximize2, Megaphone, MoreHorizontal, PanelLeft, PanelRightOpen,
  RotateCcw, Trash2, Undo2, Users, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { exportSubmissionPdf } from 'zitejs/api';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger,
} from '@project/components/ui/dropdown-menu';
import { cn } from '@project/components/lib/utils';
import { completion } from '@project/shared/forms/logic';
import type { Answers } from '@project/shared/forms/types';
import { useAppActions } from '../../lib/app-actions';
import { copyText } from '../../lib/clipboard';
import { STATUS_META } from '../../lib/constants';
import { errorMessage } from '../../lib/errors';
import { appUrl, dateTime, longDate, shortDate, timeAgo } from '../../lib/format';
import { hasOpenOverlay, MOD, shouldIgnore, useHotkeys } from '../../lib/hotkeys';
import { useSubmissionActions } from '../../lib/mutations';
import type { SubmissionDetail } from '../../lib/types';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { useWorkspace } from '../../lib/workspace';
import { Glyph, IconButton, Tip } from '../primitives/bits';
import { OutcomeGlyph } from '../primitives/icons';
import type { PickerKind } from '../submissions/SubmissionPropertyPicker';
import { ActivityTab } from './ActivityTab';
import { ApplicationTab, type ApplicationTabHandle } from './ApplicationTab';
import { AwardTab } from './AwardTab';
import { AiSummarySection, ApplicantSection, InlineProperties, PropertiesSection, ReviewersSection, type DetailTab } from './DetailRail';
import { ToneChip } from './detailBits';
import { MessagesTab } from './MessagesTab';
import { RequestInfoDialog } from './RequestInfoDialog';
import { ReviewsTab } from './ReviewsTab';
import { TasksTab } from './TasksTab';

type ShellContext = { toggleSidebar: () => void; sidebarCollapsed: boolean } | undefined;

const TAB_KEYS: DetailTab[] = ['application', 'reviews', 'messages', 'tasks', 'award', 'activity'];

function storedTab(mode: string): DetailTab {
  try {
    const v = localStorage.getItem(`grants:detail:tab:${mode}`) as DetailTab | null;
    return v && TAB_KEYS.includes(v) ? v : 'application';
  } catch {
    return 'application';
  }
}

function TitleEditor({ detail }: { detail: SubmissionDetail }) {
  const actions = useSubmissionActions();
  const s = detail.submission;
  const [value, setValue] = useState(s.title);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setValue(s.title), [s.title]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  const commit = () => {
    const t = value.trim();
    if (!t) return setValue(s.title);
    if (t !== s.title) actions.update(s, { title: t }).catch(() => setValue(s.title));
  };
  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      maxLength={200}
      aria-label="Submission title"
      placeholder="Untitled application"
      onChange={e => setValue(e.target.value.replace(/\n/g, ' '))}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setValue(s.title);
          requestAnimationFrame(() => ref.current?.blur());
        }
      }}
      className="-mx-1 w-[calc(100%+8px)] resize-none overflow-hidden rounded-md bg-transparent px-1 text-[22px] font-semibold leading-snug tracking-[-0.015em] outline-none transition-colors placeholder:text-muted-foreground hover:bg-accent/40 focus:bg-transparent"
    />
  );
}

/** What state the submission is in, when that needs saying — and the one action that moves it on. */
function StatusBanner({ detail }: { detail: SubmissionDetail }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const actions = useSubmissionActions();
  const s = detail.submission;
  const decided = s.status === 'Accepted' || s.status === 'Declined' || s.status === 'Waitlisted';
  const decider = s.decidedById ? ws.memberById.get(s.decidedById) : undefined;
  const tone = STATUS_META[s.status]?.tone ?? 'neutral';
  const box = (toneClass: string, icon: ReactNode, title: ReactNode, sub: ReactNode, action?: ReactNode) => (
    <div className={cn('mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3.5 py-2.5 animate-fade-in', toneClass)}>
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{title}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      {action}
    </div>
  );
  const btn = (label: ReactNode, onClick: () => void, primary?: boolean) => (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium', primary ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border bg-background shadow-2xs hover:bg-accent')}
    >
      {label}
    </button>
  );
  const toneBox = { success: 'border-tone-success/25 bg-tone-success/[0.05]', warning: 'border-tone-warning/30 bg-tone-warning/[0.05]', danger: 'border-tone-danger/25 bg-tone-danger/[0.04]', neutral: 'bg-subtle', info: 'bg-subtle' }[tone];

  if (decided && !s.notifiedAt) {
    return box(
      toneBox,
      <OutcomeGlyph status={s.status} size={18} />,
      <>{STATUS_META[s.status].label} · not yet released to the applicant</>,
      <>
        {decider ? `Decided by ${decider.name}` : 'Decided'} {s.decidedAt ? shortDate(s.decidedAt) : ''}
        {s.status === 'Accepted' && s.awardAmount != null ? ` · award ${ws.money(s.awardAmount)}` : ''}
        {s.decisionReason ? ` · ${s.decisionReason}` : ''}
        {s.decisionNote ? <span className="mt-0.5 block italic">“{s.decisionNote}”</span> : null}
      </>,
      <div className="flex items-center gap-1.5">
        {btn('Reopen', () => app.openDecision([s], 'reopen'))}
        {btn(<><Megaphone className="h-3.5 w-3.5" /> Release</>, () => app.openDecision([s], 'release'), true)}
      </div>,
    );
  }
  if (decided && s.notifiedAt) {
    return box(
      toneBox,
      <OutcomeGlyph status={s.status} size={18} />,
      <>{STATUS_META[s.status].label} · applicant notified {shortDate(s.notifiedAt)}</>,
      <>
        {decider ? `Decided by ${decider.name}` : ''}
        {s.status === 'Accepted' && s.awardAmount != null ? `${decider ? ' · ' : ''}award ${ws.money(s.awardAmount)}` : ''}
        {s.decisionReason ? `${decider ? ' · ' : ''}${s.decisionReason}` : ''}
        {s.decisionNote ? <span className="mt-0.5 block italic">“{s.decisionNote}”</span> : null}
      </>,
    );
  }
  if (s.status === 'Withdrawn') {
    const byStaff = detail.activity.some(a => a.type === 'withdrawn' && a.data?.by === 'staff');
    return box(
      'bg-subtle',
      <OutcomeGlyph status="Withdrawn" size={18} />,
      <>Withdrawn{s.withdrawnAt ? ` ${shortDate(s.withdrawnAt)}` : ''}{byStaff ? ' by staff' : ' by the applicant'}</>,
      'It’s out of the pipeline and hidden from reviewers.',
      btn(<><RotateCcw className="h-3.5 w-3.5" /> Put back in review</>, () => actions.update(s, { status: 'Submitted' }, { success: `${s.reference} is back in review` }).catch(() => undefined)),
    );
  }
  if (s.status === 'Draft') {
    const done = detail.form ? completion(detail.form.fields, s.answers as Answers) : null;
    return box(
      'border-dashed bg-subtle',
      <OutcomeGlyph status="Draft" size={18} />,
      'The applicant hasn’t submitted yet',
      <>
        {s.lastSavedAt ? `Last saved ${timeAgo(s.lastSavedAt)}` : s.startedAt ? `Started ${timeAgo(s.startedAt)}` : 'Not started'}
        {done && done.total ? ` · ${Math.round(done.ratio * 100)}% of required questions answered` : ''}
      </>,
      detail.applicant ? btn(<><Mail className="h-3.5 w-3.5" /> Nudge them</>, () => app.openCompose([s], { subject: `Finishing your application to ${ws.programById.get(s.programId)?.name ?? 'our program'}` })) : undefined,
    );
  }
  return null;
}

export function SubmissionDetailView({ detail, mode, onClose }: { detail: SubmissionDetail; mode: 'page' | 'peek'; onClose?: () => void }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const actions = useSubmissionActions();
  const navigate = useNavigate();
  const shell = useOutletContext<ShellContext>();
  const [searchParams] = useSearchParams();
  const s = detail.submission;
  const peek = mode === 'peek';
  const program = ws.programById.get(s.programId);
  const wide = useMediaQuery('(min-width: 1024px)');
  const [openKind, setOpenKind] = useState<PickerKind | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(() => {
    try {
      return localStorage.getItem('grants:detail:peek-details') === '1';
    } catch {
      return false;
    }
  });
  const appTab = useRef<ApplicationTabHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const decided = s.status === 'Accepted' || s.status === 'Declined' || s.status === 'Waitlisted';
  const listPath = `/programs/${s.programId}/submissions`;
  const linkPath = `/submission/${s.reference === 'Draft' ? s.id : s.reference}`;

  const tabs = useMemo(() => {
    const submittedTasks = detail.tasks.filter(t => t.status === 'Submitted').length;
    return [
      { key: 'application' as const, label: 'Application' },
      { key: 'reviews' as const, label: 'Reviews', count: detail.reviews.length },
      { key: 'messages' as const, label: 'Messages', count: detail.messages.length, dot: s.unreadMessages > 0 ? `${s.unreadMessages} unread` : null },
      { key: 'tasks' as const, label: 'Tasks', count: detail.tasks.length, dot: submittedTasks ? `${submittedTasks} to review` : null },
      ...(s.status === 'Accepted' ? [{ key: 'award' as const, label: 'Award' }] : []),
      { key: 'activity' as const, label: 'Activity', count: detail.notes.length || undefined },
    ] as Array<{ key: DetailTab; label: string; count?: number; dot?: string | null }>;
  }, [detail.reviews.length, detail.messages.length, detail.tasks, detail.notes.length, s.unreadMessages, s.status]);

  const [tab, setTabState] = useState<DetailTab>(() => {
    const fromUrl = !peek ? (searchParams.get('tab') as DetailTab | null) : null;
    return fromUrl && TAB_KEYS.includes(fromUrl) ? fromUrl : storedTab(mode);
  });
  const activeTab: DetailTab = tabs.some(t => t.key === tab) ? tab : 'application';

  const setTab = useCallback(
    (next: DetailTab) => {
      setTabState(next);
      try {
        localStorage.setItem(`grants:detail:tab:${mode}`, next);
      } catch {
        /* ignore */
      }
      // Keep the tab bar in view when switching from far down a long application.
      const bar = tabsRef.current;
      const scroller = scrollRef.current;
      if (bar && scroller && bar.getBoundingClientRect().top < scroller.getBoundingClientRect().top) bar.scrollIntoView({ block: 'start' });
    },
    [mode],
  );

  const tabsList = useRef(tabs);
  tabsList.current = tabs;
  const activeRef = useRef(activeTab);
  activeRef.current = activeTab;

  const decide = (intent: 'Accepted' | 'Waitlisted' | 'Declined') => {
    if (s.status === 'Draft') return toast.message('Drafts can’t be decided until the applicant submits');
    if (s.status === 'Withdrawn') return toast.message('Put this back in review before deciding');
    if (s.notifiedAt && s.status !== intent) return toast.message('This decision was already released — reopen it first', { action: { label: 'Reopen…', onClick: () => app.openDecision([s], 'reopen') } });
    app.openDecision([s], intent);
  };

  const downloadPdf = async () => {
    // Open the tab inside the click, so the browser doesn't treat it as a popup.
    const win = window.open('', '_blank');
    const id = toast.loading('Preparing the PDF…');
    try {
      const res = await exportSubmissionPdf({ ids: [s.id] });
      if (win) {
        win.location.href = res.url;
        toast.success('PDF ready', { id });
      } else {
        toast.success('PDF ready', { id, action: { label: 'Open', onClick: () => window.open(res.url, '_blank', 'noopener') } });
      }
    } catch (e) {
      win?.close();
      toast.error(errorMessage(e, "Couldn't create the PDF"), { id });
    }
  };

  const withdraw = async () => {
    const ok = await app.confirm({
      title: `Withdraw ${s.reference} on the applicant’s behalf?`,
      description: 'It leaves the pipeline and disappears from reviewers’ queues. Their answers, reviews and messages are kept, and you can put it back in review later. Nothing is sent to the applicant.',
      confirmLabel: 'Withdraw',
    });
    if (ok) actions.update(s, { status: 'Withdrawn' }, { success: `Withdrew ${s.reference}` }).catch(() => undefined);
  };

  const remove = async () => {
    const ok = await app.confirm({
      title: `Delete ${s.reference === 'Draft' ? 'this draft' : s.reference}?`,
      description: 'This permanently deletes the application with its reviews, messages, tasks, payments and history. The applicant loses it from their portal too. Withdraw or decline instead if you need a record.',
      confirmLabel: 'Delete permanently',
      destructive: true,
    });
    if (ok && (await actions.remove([s]))) {
      onClose?.();
      if (!peek) navigate(listPath);
    }
  };

  useHotkeys(
    {
      s: () => s.status !== 'Draft' && setOpenKind('stage'),
      o: () => setOpenKind('owner'),
      l: () => setOpenKind('labels'),
      i: () => s.ownerId !== ws.me.id && actions.update(s, { ownerId: ws.me.id }, { success: 'You own this now' }).catch(() => undefined),
      r: () => (s.status === 'Submitted' ? app.openAssignReviewers([s]) : toast.message('Only submissions in review can get reviewers')),
      m: () => s.applicantId && app.openCompose([s]),
      'shift+a': () => decide('Accepted'),
      'shift+w': () => decide('Waitlisted'),
      'shift+d': () => decide('Declined'),
      'mod+.': () => copyText(s.reference, `Copied ${s.reference}`),
      '/': () => {
        setTab('application');
        requestAnimationFrame(() => appTab.current?.focusSearch());
      },
      esc: () => navigate(listPath),
    },
    { enabled: !peek },
  );

  // "[" and "]" step through tabs. Claimed in the capture phase so the shell's sidebar toggle doesn't also fire.
  useEffect(() => {
    if (peek) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== '[' && e.key !== ']') || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (shouldIgnore(e) || hasOpenOverlay()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const list = tabsList.current;
      const i = list.findIndex(t => t.key === activeRef.current);
      setTab(list[(i + (e.key === ']' ? 1 : -1) + list.length) % list.length].key);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [peek, setTab]);

  const decideMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-[13px] font-medium shadow-2xs transition-colors hover:bg-accent data-[state=open]:bg-accent sm:px-2.5">
          {decided ? <OutcomeGlyph status={s.status} /> : <Gavel className="h-3.5 w-3.5 text-muted-foreground" />}
          <span className={cn(!decided && 'hidden sm:inline')}>{decided ? STATUS_META[s.status].label : 'Decide'}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {s.status === 'Draft' ? (
          <div className="px-2 py-2 text-[12.5px] text-muted-foreground">Drafts can be decided once the applicant submits.</div>
        ) : s.status === 'Withdrawn' ? (
          <>
            <div className="px-2 py-2 text-[12.5px] text-muted-foreground">Withdrawn applications need to be back in review before a decision.</div>
            <DropdownMenuItem className="text-[13px]" onSelect={() => actions.update(s, { status: 'Submitted' }, { success: `${s.reference} is back in review` }).catch(() => undefined)}>
              <RotateCcw className="h-3.5 w-3.5" /> Put back in review
            </DropdownMenuItem>
          </>
        ) : decided && s.notifiedAt ? (
          <>
            <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">{STATUS_META[s.status].label} · released {shortDate(s.notifiedAt)}</DropdownMenuLabel>
            <DropdownMenuItem className="text-[13px]" onSelect={() => app.openDecision([s], 'reopen')}>
              <RotateCcw className="h-3.5 w-3.5" /> Reopen decision…
            </DropdownMenuItem>
          </>
        ) : (
          <>
            {decided && <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">Change the decision</DropdownMenuLabel>}
            {([['Accepted', 'Accept…', 'A'], ['Waitlisted', 'Waitlist…', 'W'], ['Declined', 'Decline…', 'D']] as const).map(([status, label, key]) => (
              <DropdownMenuItem key={status} className="text-[13px]" disabled={s.status === status} onSelect={() => app.openDecision([s], status)}>
                <OutcomeGlyph status={status} /> {label}
                {s.status === status ? <Check className="ml-auto h-3.5 w-3.5 text-muted-foreground" /> : <DropdownMenuShortcut>⇧{key}</DropdownMenuShortcut>}
              </DropdownMenuItem>
            ))}
            {decided && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-[13px]" onSelect={() => app.openDecision([s], 'release')}>
                  <Megaphone className="h-3.5 w-3.5" /> Release to the applicant…
                </DropdownMenuItem>
                <DropdownMenuItem className="text-[13px]" onSelect={() => app.openDecision([s], 'reopen')}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reopen decision…
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const overflow = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton aria-label="More actions">
          <MoreHorizontal />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {s.status !== 'Withdrawn' && s.applicantId && (
          <DropdownMenuItem className="text-[13px]" onSelect={() => setRequestOpen(true)}>
            <ClipboardList className="h-3.5 w-3.5" /> Request information…
          </DropdownMenuItem>
        )}
        {s.status === 'Submitted' && (
          <DropdownMenuItem className="text-[13px] sm:hidden" onSelect={() => app.openAssignReviewers([s])}>
            <Users className="h-3.5 w-3.5" /> Assign reviewers… <DropdownMenuShortcut>R</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="text-[13px]" onSelect={downloadPdf}>
          <FileDown className="h-3.5 w-3.5" /> Download PDF
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-[13px]" onSelect={() => copyText(appUrl(linkPath), 'Copied link')}>
          <Link2 className="h-3.5 w-3.5" /> Copy link
        </DropdownMenuItem>
        {s.reference !== 'Draft' && (
          <DropdownMenuItem className="text-[13px]" onSelect={() => copyText(s.reference, `Copied ${s.reference}`)}>
            <Hash className="h-3.5 w-3.5" /> Copy reference <DropdownMenuShortcut>{MOD}.</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {s.status === 'Withdrawn' ? (
          <DropdownMenuItem className="text-[13px]" onSelect={() => actions.update(s, { status: 'Submitted' }, { success: `${s.reference} is back in review` }).catch(() => undefined)}>
            <RotateCcw className="h-3.5 w-3.5" /> Put back in review
          </DropdownMenuItem>
        ) : s.status !== 'Draft' ? (
          <DropdownMenuItem className="text-[13px]" onSelect={withdraw}>
            <Undo2 className="h-3.5 w-3.5" /> Withdraw on the applicant’s behalf…
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem className="text-[13px] text-destructive focus:text-destructive" onSelect={remove}>
          <Trash2 className="h-3.5 w-3.5" /> Delete…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const header = (
    <header className={cn('flex h-11 shrink-0 items-center gap-1 border-b', peek ? 'px-3' : 'px-2 sm:px-3')}>
      {!peek && shell?.sidebarCollapsed && (
        <Tip label="Show sidebar">
          <IconButton onClick={shell.toggleSidebar} aria-label="Show sidebar" className="hidden md:inline-flex">
            <PanelLeft />
          </IconButton>
        </Tip>
      )}
      <div className="flex min-w-0 items-center gap-1">
        {program && (
          <Link to={listPath} onClick={() => onClose?.()} className="flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <Glyph icon={program.icon} color={program.color} size={16} />
            <span className={cn('truncate', peek ? 'hidden sm:inline' : 'hidden max-w-[220px] sm:inline')}>{program.name}</span>
          </Link>
        )}
        <span className="text-muted-foreground/50">›</span>
        <Tip label={s.reference === 'Draft' ? 'Drafts get a reference when submitted' : 'Copy reference'} keys={s.reference === 'Draft' || peek ? undefined : [MOD, '.']}>
          <button type="button" onClick={() => s.reference !== 'Draft' && copyText(s.reference, `Copied ${s.reference}`)} className="shrink-0 rounded px-1 py-0.5 text-[13px] font-medium tabular-nums hover:bg-accent">
            {s.reference}
          </button>
        </Tip>
      </div>
      <div className="ml-auto flex items-center gap-1">
        {s.status !== 'Draft' && decideMenu}
        {s.status === 'Submitted' && (
          <Tip label="Assign reviewers" keys={peek ? undefined : ['R']}>
            <button type="button" onClick={() => app.openAssignReviewers([s])} className="hidden h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex">
              <Users className="h-3.5 w-3.5" /> <span className="hidden xl:inline">Assign</span>
            </button>
          </Tip>
        )}
        {s.applicantId && (
          <Tip label="Message applicant" keys={peek ? undefined : ['M']}>
            <button type="button" onClick={() => app.openCompose([s])} aria-label="Message applicant" className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Mail className="h-3.5 w-3.5" /> <span className="hidden xl:inline">Message</span>
            </button>
          </Tip>
        )}
        {overflow}
        {peek && (
          <>
            <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
            <Tip label="Open full page">
              <button type="button" onClick={() => { onClose?.(); navigate(linkPath); }} className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <Maximize2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Open</span>
              </button>
            </Tip>
            {onClose && (
              <Tip label="Close" keys={['Esc']}>
                <IconButton onClick={onClose} aria-label="Close">
                  <X />
                </IconButton>
              </Tip>
            )}
          </>
        )}
      </div>
    </header>
  );

  const late = s.late ? <ToneChip tone="warning"><AlertTriangle className="h-2.5 w-2.5" /> Late</ToneChip> : null;
  const titleBlock = (
    <>
      <TitleEditor detail={detail} />
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground">
        {detail.applicant ? (
          <Link to={`/applicants/${detail.applicant.id}`} onClick={() => onClose?.()} className="font-medium text-foreground/80 hover:text-foreground hover:underline">{detail.applicant.name || detail.applicant.email}</Link>
        ) : (
          <span>{s.applicantName || 'No applicant'}</span>
        )}
        {s.applicantOrganization && (
          <>
            <span aria-hidden>·</span>
            <span className="truncate">{s.applicantOrganization}</span>
          </>
        )}
        <span aria-hidden>·</span>
        {s.submittedAt ? (
          <Tip label={dateTime(s.submittedAt)}>
            <span>Submitted {longDate(s.submittedAt)}</span>
          </Tip>
        ) : (
          <span>{s.startedAt ? `Started ${shortDate(s.startedAt)}` : 'Not submitted'}</span>
        )}
        {late}
      </div>
      <StatusBanner detail={detail} />
    </>
  );

  const tabBar = (
    <div ref={tabsRef} className={cn('sticky top-0 z-10 -mx-1 mt-5 border-b bg-background/95 px-1 backdrop-blur supports-[backdrop-filter]:bg-background/80', peek && 'mt-4')}>
      <div role="tablist" aria-label="Submission sections" className="-mb-px flex items-center gap-0.5 overflow-x-auto scrollbar-none">
        {tabs.map(t => {
          const on = t.key === activeTab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.key)}
              className={cn(
                'relative flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-[13px] transition-colors',
                on ? 'border-foreground font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              {t.count != null && t.count > 0 && <span className={cn('rounded px-1 text-2xs tabular-nums', on ? 'bg-muted text-foreground' : 'text-muted-foreground')}>{t.count}</span>}
              {t.dot && (
                <span className="h-1.5 w-1.5 rounded-full bg-tone-info" aria-label={t.dot} title={t.dot} />
              )}
            </button>
          );
        })}
        {!peek && (
          <span className="ml-auto hidden shrink-0 items-center gap-1 pl-3 text-2xs text-muted-foreground xl:flex">
            <kbd className="kbd">[</kbd><kbd className="kbd">]</kbd> to switch
          </span>
        )}
      </div>
    </div>
  );

  const content = (
    <div className="pt-5" role="tabpanel">
      {activeTab === 'application' && <ApplicationTab ref={appTab} detail={detail} />}
      {activeTab === 'reviews' && <ReviewsTab detail={detail} />}
      {activeTab === 'messages' && <MessagesTab key={s.id} detail={detail} />}
      {activeTab === 'tasks' && <TasksTab detail={detail} onRequest={() => setRequestOpen(true)} />}
      {activeTab === 'award' && <AwardTab detail={detail} />}
      {activeTab === 'activity' && <ActivityTab detail={detail} />}
    </div>
  );

  const railSections = (keyboard: boolean) => (
    <>
      <PropertiesSection detail={detail} {...(keyboard ? { openKind, onOpenKind: setOpenKind } : {})} />
      <ReviewersSection detail={detail} onOpenTab={setTab} />
      <ApplicantSection detail={detail} onNavigate={onClose} />
      {ws.features.ai && <AiSummarySection detail={detail} />}
    </>
  );

  const dialogs = <RequestInfoDialog open={requestOpen} onOpenChange={setRequestOpen} detail={detail} onCreated={() => setTab('tasks')} />;

  if (peek) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        {header}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-4 pb-16 pt-5 sm:px-6">
            {titleBlock}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <InlineProperties detail={detail} />
              <button
                type="button"
                onClick={() =>
                  setDetailsOpen(o => {
                    try {
                      localStorage.setItem('grants:detail:peek-details', o ? '0' : '1');
                    } catch {
                      /* ignore */
                    }
                    return !o;
                  })
                }
                aria-expanded={detailsOpen}
                className="ml-auto flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <PanelRightOpen className="h-3.5 w-3.5" /> {detailsOpen ? 'Hide details' : 'Details'}
              </button>
            </div>
            {detailsOpen && (
              <div className="mt-3 gap-x-8 rounded-lg border bg-subtle/60 px-4 py-1 animate-fade-in sm:columns-2 [&>section]:break-inside-avoid [&>section]:!py-3">
                {railSections(false)}
              </div>
            )}
            {tabBar}
            {content}
          </div>
        </div>
        {dialogs}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      <div className="flex min-h-0 flex-1">
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[880px] px-4 pb-24 pt-6 sm:px-8 lg:pt-8">
            {titleBlock}
            <div className="mt-4 lg:hidden">
              <InlineProperties detail={detail} {...(!wide ? { openKind, onOpenKind: setOpenKind } : {})} />
            </div>
            {tabBar}
            {content}
            <div className="mt-12 divide-y border-t pt-6 lg:hidden">{railSections(false)}</div>
          </div>
        </div>
        <aside className="hidden w-[280px] shrink-0 divide-y overflow-y-auto border-l bg-subtle/40 px-4 py-5 lg:block" aria-label="Submission details">
          {railSections(wide)}
        </aside>
      </div>
      {dialogs}
    </div>
  );
}
