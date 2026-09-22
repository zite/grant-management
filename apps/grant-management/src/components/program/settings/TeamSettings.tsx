import { Crown, Plus, UserMinus } from 'lucide-react';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { saveProgramMembers } from 'zitejs/api';
import { cn } from '@project/components/lib/utils';
import { plural } from '../../../lib/format';
import type { Bootstrap, Member, Program } from '../../../lib/types';
import { useWorkspace } from '../../../lib/workspace';
import { MemberMultiPicker } from '../../pickers/pickers';
import { OptionPicker } from '../../pickers/OptionPicker';
import { MemberAvatar } from '../../primitives/Avatar';
import { IconButton, Tip } from '../../primitives/bits';
import { PageTitle, SettingsSection } from '../fields';
import { useProgramMutation, useReviewProgress } from '../programData';

/**
 * Both sets are sent on every change, so two quick edits must not overlap —
 * a late response could otherwise undo the one after it. Writes queue up.
 */
function useSerial() {
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  return useCallback((task: () => Promise<unknown>) => {
    chain.current = chain.current.then(task).catch(() => undefined);
    return chain.current;
  }, []);
}

function PersonRow({ member, meta, badge, onRemove, removeLabel }: { member: Member | undefined; meta?: ReactNode; badge?: ReactNode; onRemove?: () => void; removeLabel?: string }) {
  const ws = useWorkspace();
  return (
    <li className="group flex min-h-12 items-center gap-3 px-4 py-2">
      <MemberAvatar member={member} size={26} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="truncate font-medium">{member ? (member.id === ws.me.id ? `${member.name} (you)` : member.name) : 'Former member'}</span>
          {badge}
          {member?.status === 'Invited' && <span className="chip-soft h-5 px-1.5 text-2xs">Invited</span>}
        </div>
        <div className="truncate text-xs text-muted-foreground">{[member?.title, member?.expertise].filter(Boolean).join(' · ') || member?.email || member?.role}</div>
      </div>
      {meta && <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">{meta}</div>}
      {onRemove && (
        <Tip label={removeLabel ?? 'Remove'}>
          <IconButton aria-label={removeLabel ?? 'Remove'} onClick={onRemove} className="opacity-60 hover:text-tone-danger group-hover:opacity-100">
            <UserMinus />
          </IconButton>
        </Tip>
      )}
    </li>
  );
}

export function TeamSettings({ program }: { program: Program }) {
  const ws = useWorkspace();
  const run = useProgramMutation();
  const serial = useSerial();
  const [poolOpen, setPoolOpen] = useState(false);
  const [managersOpen, setManagersOpen] = useState(false);
  const { data: progress } = useReviewProgress(program.id, null);
  const loadBy = new Map((progress?.reviewers ?? []).map(r => [r.memberId, r]));

  const rows = ws.programMembers.filter(pm => pm.programId === program.id);
  const reviewerIds = [...new Set(rows.filter(r => r.role === 'Reviewer').map(r => r.memberId))];
  const managerIds = [...new Set(rows.filter(r => r.role === 'Manager').map(r => r.memberId))];
  const owner = program.ownerId ? ws.memberById.get(program.ownerId) : undefined;

  const write = (next: { reviewerIds: string[]; managerIds: string[] }, success: string) =>
    serial(() =>
      run(() => saveProgramMembers({ programId: program.id, ...next }), {
        optimistic: (data: Bootstrap): Bootstrap => ({
          ...data,
          programMembers: [
            ...data.programMembers.filter(pm => pm.programId !== program.id),
            ...next.reviewerIds.map(memberId => ({ id: `tmp-r-${memberId}`, programId: program.id, memberId, role: 'Reviewer' })),
            ...next.managerIds.map(memberId => ({ id: `tmp-m-${memberId}`, programId: program.id, memberId, role: 'Manager' })),
          ],
        }),
        success,
        error: "Couldn't update the team",
      }),
    );

  const setReviewers = (ids: string[]) => {
    const added = ids.filter(id => !reviewerIds.includes(id));
    const removed = reviewerIds.filter(id => !ids.includes(id));
    const name = (id: string) => ws.memberById.get(id)?.name ?? 'Someone';
    const msg = added.length === 1 && !removed.length ? `Added ${name(added[0])} to the reviewer pool` : removed.length === 1 && !added.length ? `Removed ${name(removed[0])} from the reviewer pool` : 'Updated the reviewer pool';
    write({ reviewerIds: ids, managerIds }, msg);
  };
  const setManagers = (ids: string[]) => write({ reviewerIds, managerIds: ids }, 'Updated program managers');

  const managerOptions = ws.managers
    .filter(m => m.id !== program.ownerId)
    .map(m => ({ value: m.id, label: m.id === ws.me.id ? `${m.name} (you)` : m.name, icon: <MemberAvatar member={m} size={16} />, keywords: [m.email], hint: m.role }));

  const pool = reviewerIds.map(id => ws.memberById.get(id)).filter((m): m is Member => Boolean(m)).sort((a, b) => a.name.localeCompare(b.name));
  const managers = managerIds.filter(id => id !== program.ownerId).map(id => ws.memberById.get(id)).filter((m): m is Member => Boolean(m));
  const stalePool = reviewerIds.filter(id => !ws.memberById.get(id));

  const openLabel = (id: string) => {
    const r = loadBy.get(id);
    if (!r) return progress ? 'No reviews yet' : '';
    const open = r.inProgress + r.notStarted;
    return (
      <>
        <span className={cn(open ? 'text-foreground' : undefined)}>{plural(open, 'open review')}</span>
        {r.overdue > 0 && <span className="text-tone-danger"> · {r.overdue} overdue</span>}
        <div>{r.submitted} submitted</div>
      </>
    );
  };

  return (
    <div>
      <PageTitle title="Reviewers & team" description="Who reviews this program’s submissions and who runs it. Changes save as you make them." />

      <SettingsSection
        title="Reviewer pool"
        description={program.reviewersPerSubmission ? `Submissions entering a review stage are assigned ${plural(program.reviewersPerSubmission, 'reviewer')} from this pool, least busy first.` : 'Automatic assignment is off for this program — the pool is who you’ll be offered first when assigning by hand.'}
        actions={
          <MemberMultiPicker
            programId={program.id}
            value={reviewerIds}
            onChange={setReviewers}
            open={poolOpen}
            onOpenChange={setPoolOpen}
            align="end"
            trigger={
              <button type="button" className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-[12.5px] shadow-2xs hover:bg-accent">
                <Plus className="h-3.5 w-3.5" /> Add reviewers
              </button>
            }
          />
        }
      >
        <div className="overflow-hidden rounded-lg border bg-background">
          {pool.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[13px] font-medium">Nobody in the pool yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Add staff or outside reviewers. Outside reviewers are invited in Settings › Members, then added here.</p>
              <button type="button" onClick={() => setPoolOpen(true)} className="mt-3 text-[13px] text-primary hover:underline">
                Choose reviewers
              </button>
            </div>
          ) : (
            <ul className="divide-y">
              {pool.map(m => (
                <PersonRow key={m.id} member={m} meta={openLabel(m.id)} onRemove={() => setReviewers(reviewerIds.filter(id => id !== m.id))} removeLabel={`Remove ${m.name} from the pool`} />
              ))}
            </ul>
          )}
          {stalePool.length > 0 && <div className="border-t px-4 py-2 text-xs text-muted-foreground">{plural(stalePool.length, 'former member')} still listed — removing anyone will clean {stalePool.length === 1 ? 'it' : 'them'} up.</div>}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Removing someone doesn’t take away reviews they already have. Manage those on the <Link to={`/programs/${program.id}/reviews`} className="text-primary hover:underline">Reviews tab</Link>.
        </p>
      </SettingsSection>

      <SettingsSection
        title="Program managers"
        description="Managers are notified about new submissions and messages in this program, alongside the owner."
        actions={
          <OptionPicker
            multiple
            options={managerOptions}
            value={managerIds.filter(id => id !== program.ownerId)}
            onChange={ids => setManagers(ids)}
            open={managersOpen}
            onOpenChange={setManagersOpen}
            align="end"
            placeholder="Choose managers…"
            width={280}
            trigger={
              <button type="button" className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-[12.5px] shadow-2xs hover:bg-accent">
                <Plus className="h-3.5 w-3.5" /> Add managers
              </button>
            }
          />
        }
      >
        <div className="overflow-hidden rounded-lg border bg-background">
          <ul className="divide-y">
            {owner ? (
              <PersonRow
                member={owner}
                badge={
                  <span className="inline-flex h-5 items-center gap-1 rounded-full bg-muted px-1.5 text-2xs text-muted-foreground">
                    <Crown className="h-3 w-3" /> Owner
                  </span>
                }
                meta={<Link to={`/programs/${program.id}/settings/general`} className="hover:text-foreground">Change in General</Link>}
              />
            ) : (
              <li className="px-4 py-3 text-xs text-muted-foreground">
                No owner — admins are notified instead. <Link to={`/programs/${program.id}/settings/general`} className="text-primary hover:underline">Choose an owner</Link>
              </li>
            )}
            {managers.map(m => (
              <PersonRow key={m.id} member={m} badge={<span className="text-2xs text-muted-foreground">{m.role}</span>} onRemove={() => setManagers(managerIds.filter(id => id !== m.id))} removeLabel={`Remove ${m.name} as a manager`} />
            ))}
          </ul>
        </div>
      </SettingsSection>
    </div>
  );
}
