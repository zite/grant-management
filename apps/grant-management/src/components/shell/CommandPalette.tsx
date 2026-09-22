import {
  BarChart3, Check, ClipboardCheck, Command as CommandIcon, Copy, ExternalLink, FilePlus2, FolderKanban, HandCoins, Inbox, Keyboard, Laptop, Layers, Link2, Mail, Moon, Settings, Sun, UserRound, Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@project/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@project/components/ui/dialog';
import { useAppActions } from '../../lib/app-actions';
import { copyText } from '../../lib/clipboard';
import { appUrl } from '../../lib/format';
import { useSubmissionActions } from '../../lib/mutations';
import { useSearch, useSubmission } from '../../lib/queries';
import { useTheme } from '../../lib/theme';
import { useWorkspace } from '../../lib/workspace';
import { MemberAvatar } from '../primitives/Avatar';
import { OutcomeGlyph, StageGlyph, SubmissionGlyph } from '../primitives/icons';
import { Glyph, Kbd } from '../primitives/bits';

const itemCls = 'h-9 gap-2.5 rounded-md px-2.5 text-[13px] [&_svg]:text-muted-foreground';

/**
 * ⌘K. Find any submission by reference, title, applicant or answer text; jump
 * anywhere; and, with a submission open, move it, decide it or message the
 * applicant without touching the mouse.
 */
export function CommandPalette({ open, onOpenChange, initialQuery = '' }: { open: boolean; onOpenChange: (o: boolean) => void; initialQuery?: string }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const actions = useSubmissionActions();
  const navigate = useNavigate();
  const location = useLocation();
  const { setPref, pref } = useTheme();
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState<null | 'stage' | 'owner'>(null);
  const { data, isFetching } = useSearch(open ? query : '');

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setPage(null);
    }
  }, [open, initialQuery]);

  const ref = /^\/submission\/([^/]+)/.exec(location.pathname)?.[1] ?? app.peekId ?? null;
  const { data: current } = useSubmission(open && ws.isManager ? ref : null);
  const sub = current?.submission;

  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };
  const run = (fn: () => void) => {
    onOpenChange(false);
    setTimeout(fn, 0);
  };

  const q = query.trim().toLowerCase();
  const programs = useMemo(() => ws.orderedPrograms.filter(p => !q || `${p.name} ${p.key}`.toLowerCase().includes(q)).slice(0, q ? 6 : 0), [ws.orderedPrograms, q]);
  const views = useMemo(() => ws.views.filter(v => q && v.name.toLowerCase().includes(q)).slice(0, 5), [ws.views, q]);
  const people = useMemo(() => (ws.isManager ? ws.activeMembers.filter(m => q && m.name.toLowerCase().includes(q)).slice(0, 4) : []), [ws, q]);

  const nav = ws.isManager
    ? [
        { label: 'Go to Inbox', to: '/inbox', icon: Inbox, keys: ['G', 'I'] },
        { label: 'Go to My reviews', to: '/reviews', icon: ClipboardCheck, keys: ['G', 'R'] },
        { label: 'Go to Submissions', to: '/submissions', icon: Layers, keys: ['G', 'S'] },
        { label: 'Go to Programs', to: '/programs', icon: FolderKanban, keys: ['G', 'P'] },
        { label: 'Go to Awards', to: '/awards', icon: HandCoins, keys: ['G', 'W'] },
        { label: 'Go to Applicants', to: '/applicants', icon: Users, keys: ['G', 'A'] },
        { label: 'Go to Reports', to: '/reports', icon: BarChart3, keys: ['G', 'T'] },
        { label: 'Go to Settings', to: '/settings', icon: Settings, keys: ['G', ','] },
      ]
    : [
        { label: 'Go to Inbox', to: '/inbox', icon: Inbox, keys: ['G', 'I'] },
        { label: 'Go to My reviews', to: '/reviews', icon: ClipboardCheck, keys: ['G', 'R'] },
      ];

  const stage = sub?.stageId ? ws.stageById.get(sub.stageId) : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[14vh] max-w-[640px] translate-y-0 gap-0 overflow-hidden p-0 shadow-2xl data-[state=closed]:slide-out-to-top-[2%] data-[state=open]:slide-in-from-top-[2%] sm:rounded-xl [&>button:last-child]:hidden">
        <DialogTitle className="sr-only">Command menu</DialogTitle>
        <Command
          loop
          className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium"
          onKeyDown={e => {
            if (e.key === 'Backspace' && !query && page) {
              e.preventDefault();
              setPage(null);
            }
          }}
        >
          {sub && (
            <div className="flex items-center gap-2 border-b px-4 pb-0 pt-3 text-xs text-muted-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground/80">{sub.reference}</span>
              <span className="truncate">{sub.title || sub.applicantName}</span>
            </div>
          )}
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={page === 'stage' ? 'Move to stage…' : page === 'owner' ? 'Set owner…' : ws.isManager ? 'Search submissions, applicants, programs — or type a command…' : 'Search your reviews or type a command…'}
            className="h-12 text-[14px]"
          />
          <CommandList className="max-h-[min(440px,60vh)] p-1.5">
            <CommandEmpty className="py-8 text-center text-[13px] text-muted-foreground">{isFetching ? 'Searching…' : 'No results'}</CommandEmpty>

            {page === 'stage' && sub && (
              <CommandGroup>
                {ws.stagesFor(sub.programId).map(s => (
                  <CommandItem key={s.id} value={s.name} className={itemCls} onSelect={() => run(() => actions.update(sub, { stageId: s.id }).catch(() => undefined))}>
                    <StageGlyph kind={s.kind} color={s.color} /> {s.name}
                    {s.id === sub.stageId && <Check className="ml-auto h-3.5 w-3.5" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {page === 'owner' && sub && (
              <CommandGroup>
                <CommandItem value="No owner" className={itemCls} onSelect={() => run(() => actions.update(sub, { ownerId: null }).catch(() => undefined))}>
                  <MemberAvatar member={undefined} size={18} /> No owner
                </CommandItem>
                {ws.managers.map(m => (
                  <CommandItem key={m.id} value={`${m.name} ${m.email}`} className={itemCls} onSelect={() => run(() => actions.update(sub, { ownerId: m.id }).catch(() => undefined))}>
                    <MemberAvatar member={m} size={18} /> {m.name}
                    {m.id === sub.ownerId && <Check className="ml-auto h-3.5 w-3.5" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {page === null && (
              <>
                {data && query.trim() && data.submissions.length > 0 && (
                  <CommandGroup heading="Submissions">
                    {data.submissions.map(s => (
                      <CommandItem key={s.id} value={`submission ${s.reference} ${s.title} ${s.applicantName} ${query}`} className={itemCls} onSelect={() => (s.status === 'Draft' ? run(() => app.openPeek(s.id)) : go(`/submission/${s.reference}`))}>
                        <SubmissionGlyph submission={{ status: s.status, reviewsActive: 0, reviewsDoneInStage: 0 }} stage={s.stageId ? ws.stageById.get(s.stageId) : undefined} />
                        <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">{s.reference}</span>
                        <span className="truncate">{s.title || 'Untitled application'}</span>
                        <span className="ml-auto max-w-[160px] truncate text-xs text-muted-foreground">{s.applicantName}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {data && query.trim() && data.reviews.length > 0 && (
                  <CommandGroup heading="Your reviews">
                    {data.reviews.map(r => (
                      <CommandItem key={r.id} value={`review ${r.reference} ${r.title} ${query}`} className={itemCls} onSelect={() => go(`/reviews/${r.id}`)}>
                        <ClipboardCheck /> <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">{r.reference}</span>
                        <span className="truncate">{r.title}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{r.status}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {data && query.trim() && data.applicants.length > 0 && (
                  <CommandGroup heading="Applicants">
                    {data.applicants.map(a => (
                      <CommandItem key={a.id} value={`applicant ${a.name} ${a.email} ${a.organization} ${query}`} className={itemCls} onSelect={() => go(`/applicants/${a.id}`)}>
                        <UserRound /> <span className="truncate">{a.name}</span>
                        <span className="truncate text-xs text-muted-foreground">{a.organization || a.email}</span>
                        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{a.submissions} applied</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {sub && (
                  <CommandGroup heading={`Submission · ${sub.reference}`}>
                    {sub.status === 'Submitted' && (
                      <CommandItem value="Move to stage" className={itemCls} onSelect={() => { setPage('stage'); setQuery(''); }}>
                        <StageGlyph kind={stage?.kind} color={stage?.color} /> Move to stage… <Kbd className="ml-auto">S</Kbd>
                      </CommandItem>
                    )}
                    {(['Accepted', 'Waitlisted', 'Declined'] as const).map(d => (
                      <CommandItem key={d} value={`Decide ${d}`} className={itemCls} onSelect={() => run(() => app.openDecision([sub], d))}>
                        <OutcomeGlyph status={d} /> {d === 'Accepted' ? 'Accept…' : d === 'Waitlisted' ? 'Waitlist…' : 'Decline…'}
                      </CommandItem>
                    ))}
                    {sub.status === 'Submitted' && (
                      <CommandItem value="Assign reviewers" className={itemCls} onSelect={() => run(() => app.openAssignReviewers([sub]))}>
                        <Users /> Assign reviewers… <Kbd className="ml-auto">R</Kbd>
                      </CommandItem>
                    )}
                    <CommandItem value="Set owner" className={itemCls} onSelect={() => { setPage('owner'); setQuery(''); }}>
                      <UserRound /> Set owner… <Kbd className="ml-auto">O</Kbd>
                    </CommandItem>
                    <CommandItem value="Message applicant email" className={itemCls} onSelect={() => run(() => app.openCompose([sub]))}>
                      <Mail /> Message the applicant… <Kbd className="ml-auto">M</Kbd>
                    </CommandItem>
                    <CommandItem value="Copy reference" className={itemCls} onSelect={() => run(() => copyText(sub.reference, `Copied ${sub.reference}`))}>
                      <Copy /> Copy reference
                    </CommandItem>
                    <CommandItem value="Copy link url" className={itemCls} onSelect={() => run(() => copyText(appUrl(`/submission/${sub.reference}`), 'Copied link'))}>
                      <Link2 /> Copy link
                    </CommandItem>
                  </CommandGroup>
                )}

                {ws.isManager && (
                  <CommandGroup heading="Create">
                    <CommandItem value="Create new program" className={itemCls} onSelect={() => run(() => app.openCreateProgram())}>
                      <FolderKanban /> New program
                    </CommandItem>
                    <CommandItem value="Add a submission on behalf of an applicant" className={itemCls} onSelect={() => run(() => app.openAddSubmission(app.contextProgramId ?? undefined))}>
                      <FilePlus2 /> Add a submission
                    </CommandItem>
                  </CommandGroup>
                )}

                {programs.length > 0 && (
                  <CommandGroup heading="Programs">
                    {programs.map(p => (
                      <CommandItem key={p.id} value={`program ${p.name} ${p.key}`} className={itemCls} onSelect={() => go(ws.isManager ? `/programs/${p.id}` : `/reviews?program=${p.id}`)}>
                        <Glyph icon={p.icon} color={p.color} size={16} /> {p.name}
                        <span className="ml-auto text-xs text-muted-foreground">{p.key}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {views.length > 0 && (
                  <CommandGroup heading="Views">
                    {views.map(v => (
                      <CommandItem key={v.id} value={`view ${v.name}`} className={itemCls} onSelect={() => go(`/view/${v.id}`)}>
                        <Layers /> {v.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {people.length > 0 && (
                  <CommandGroup heading="Team">
                    {people.map(m => (
                      <CommandItem key={m.id} value={`person ${m.name}`} className={itemCls} onSelect={() => go('/settings/members')}>
                        <MemberAvatar member={m} size={18} /> {m.name}
                        <span className="ml-auto text-xs text-muted-foreground">{m.role}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                <CommandSeparator className="my-1" />
                <CommandGroup heading="Navigation">
                  {nav.map(n => (
                    <CommandItem key={n.to} value={n.label} className={itemCls} onSelect={() => go(n.to)}>
                      <n.icon /> {n.label}
                      <span className="ml-auto flex items-center gap-1">{n.keys.map(k => <Kbd key={k}>{k}</Kbd>)}</span>
                    </CommandItem>
                  ))}
                  {ws.settings.portalUrl && (
                    <CommandItem value="Open applicant portal" className={itemCls} onSelect={() => run(() => window.open(ws.settings.portalUrl!, '_blank', 'noopener'))}>
                      <ExternalLink /> Open the applicant portal
                    </CommandItem>
                  )}
                </CommandGroup>

                <CommandGroup heading="Preferences">
                  {([['light', 'Switch to light theme', Sun], ['dark', 'Switch to dark theme', Moon], ['system', 'Use system theme', Laptop]] as const).map(([value, label, Icon]) => (
                    <CommandItem key={value} value={label} className={itemCls} onSelect={() => run(() => setPref(value))}>
                      <Icon /> {label}
                      {pref === value && <Check className="ml-auto h-3.5 w-3.5" />}
                    </CommandItem>
                  ))}
                  <CommandItem value="Keyboard shortcuts help" className={itemCls} onSelect={() => run(() => app.openShortcuts())}>
                    <Keyboard /> Keyboard shortcuts <Kbd className="ml-auto">?</Kbd>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
          <div className="flex items-center gap-3 border-t px-3 py-2 text-2xs text-muted-foreground">
            <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
            <span className="flex items-center gap-1"><Kbd>↵</Kbd> select</span>
            {page && <span className="flex items-center gap-1"><Kbd>⌫</Kbd> back</span>}
            <span className="ml-auto flex min-w-0 items-center gap-1"><CommandIcon className="h-3 w-3 shrink-0" /> <span className="truncate">{ws.settings.organizationName}</span></span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
