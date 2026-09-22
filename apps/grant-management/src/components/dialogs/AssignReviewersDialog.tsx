import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, Loader2, Scale, Search, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { assignReviewers } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { cn } from '@project/components/lib/utils';
import type { SubmissionTarget } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import { addDays, shortDate } from '../../lib/format';
import { refreshEverythingSoon } from '../../lib/mutations';
import { useWorkspace } from '../../lib/workspace';
import { MemberAvatar } from '../primitives/Avatar';
import { DatePicker } from '../pickers/pickers';

export function AssignReviewersDialog({ open, onOpenChange, targets }: { open: boolean; onOpenChange: (o: boolean) => void; targets: SubmissionTarget[] }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const programIds = [...new Set(targets.map(t => t.programId))];
  const programId = programIds.length === 1 ? programIds[0] : null;
  const program = programId ? ws.programById.get(programId) : undefined;
  const pool = useMemo(() => (programId ? ws.reviewerPool(programId) : []), [ws, programId]);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [count, setCount] = useState(2);
  const [chosen, setChosen] = useState<string[]>([]);
  const [due, setDue] = useState<string | null>(addDays(14));
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(programId && pool.length ? 'auto' : 'manual');
    setCount(program?.reviewersPerSubmission || 2);
    setChosen([]);
    setDue(addDays(14));
    setQ('');
  }, [open, programId]);

  const people = useMemo(() => {
    const inPool = new Set(pool.map(p => p.id));
    return ws.activeMembers
      .filter(m => !q || `${m.name} ${m.email} ${m.expertise ?? ''}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => Number(inPool.has(b.id)) - Number(inPool.has(a.id)) || a.name.localeCompare(b.name))
      .map(m => ({ member: m, inPool: inPool.has(m.id) }));
  }, [ws.activeMembers, pool, q]);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await assignReviewers({ submissionIds: targets.map(t => t.id), mode, reviewerIds: mode === 'manual' ? chosen : undefined, count: mode === 'auto' ? count : undefined, dueDate: due });
      refreshEverythingSoon(qc, 200);
      if (res.created) toast.success(`Created ${res.created} review assignment${res.created === 1 ? '' : 's'}${res.message ? ` · ${res.message}` : ''}`);
      else toast.message(res.message ?? 'No new assignments were needed');
      if (res.created || !res.message?.startsWith('Add reviewers')) onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't assign reviewers"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle className="flex items-center gap-2 text-[15px]"><Users className="h-4 w-4 text-muted-foreground" /> Assign reviewers</DialogTitle>
          <DialogDescription className="text-[13px]">
            {targets.length === 1 ? `${targets[0].reference} · ${targets[0].title || targets[0].applicantName}` : `${targets.length} submissions`} — reviewers score them in their current stage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 pb-5">
          <div className="grid grid-cols-2 gap-2">
            {([
              ['auto', 'Balance from the pool', 'Spread work evenly across the program’s reviewers', Scale],
              ['manual', 'Choose people', 'Put specific reviewers on every selected submission', Users],
            ] as const).map(([value, label, hint, Icon]) => (
              <button
                key={value}
                type="button"
                disabled={value === 'auto' && !programId}
                onClick={() => setMode(value)}
                className={cn('rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50', mode === value ? 'border-primary/60 bg-primary/[0.05] ring-1 ring-primary/30' : 'hover:bg-accent')}
              >
                <div className="flex items-center gap-1.5 text-[13px] font-medium"><Icon className="h-3.5 w-3.5 text-muted-foreground" /> {label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{value === 'auto' && !programId ? 'Select submissions from one program' : hint}</div>
              </button>
            ))}
          </div>

          {mode === 'auto' ? (
            pool.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-[13px] text-muted-foreground">
                {program?.name ?? 'This program'} has no reviewer pool yet.{' '}
                <Link to={`/programs/${programId}/settings/team`} onClick={() => onOpenChange(false)} className="font-medium text-primary hover:underline">Add reviewers</Link>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                  <div>
                    <div className="text-[13px] font-medium">Reviewers per submission</div>
                    <div className="text-xs text-muted-foreground">Existing reviewers count toward this</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} type="button" onClick={() => setCount(n)} className={cn('h-7 w-7 rounded-md border text-[13px] tabular-nums', count === n ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">From {pool.length} reviewer{pool.length === 1 ? '' : 's'} in the pool</div>
                  <div className="flex flex-wrap gap-1.5">
                    {pool.map(m => (
                      <span key={m.id} className="chip h-7 bg-background"><MemberAvatar member={m} size={18} /> {m.name}</span>
                    ))}
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="rounded-lg border">
              <div className="flex items-center gap-2 border-b px-3">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search people or expertise…" className="h-9 flex-1 bg-transparent text-[13px] outline-none" />
                {chosen.length > 0 && <span className="text-xs text-muted-foreground">{chosen.length} chosen</span>}
              </div>
              <div className="max-h-64 overflow-y-auto p-1">
                {people.map(({ member: m, inPool }) => {
                  const on = chosen.includes(m.id);
                  return (
                    <button key={m.id} type="button" onClick={() => setChosen(c => (on ? c.filter(x => x !== m.id) : [...c, m.id]))} className={cn('flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-accent', on && 'bg-primary/[0.05]')}>
                      <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                      <MemberAvatar member={m} size={22} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">{m.name}{m.id === ws.me.id && <span className="text-muted-foreground"> (you)</span>}</span>
                        <span className="block truncate text-xs text-muted-foreground">{[m.role, m.expertise].filter(Boolean).join(' · ')}</span>
                      </span>
                      {inPool && <span className="rounded bg-muted px-1.5 py-px text-2xs text-muted-foreground">In pool</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted-foreground">Due</span>
            <DatePicker
              value={due}
              onChange={setDue}
              clearLabel="No due date"
              trigger={
                <button type="button" className="ghost-chip h-8 border-border gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" /> {due ? shortDate(due) : 'No due date'}
                </button>
              }
            />
          </div>
        </div>

        <DialogFooter className="border-t px-5 py-3">
          <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" className="h-8 text-[13px]" disabled={busy || (mode === 'manual' ? chosen.length === 0 : pool.length === 0)} onClick={submit}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
