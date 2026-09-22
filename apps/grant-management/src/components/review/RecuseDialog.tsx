import { Loader2, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { cn } from '@project/components/lib/utils';
import { MOD } from '../../lib/hotkeys';
import { Kbd } from '../primitives/bits';

const REASONS = ['I know the applicant personally', 'I work with or for the applicant’s organization', 'I have a financial interest in the project', 'I applied to this program myself'];

/** Stepping back from a review. A reason is required — managers need it to decide who reviews instead. */
export function RecuseDialog({ open, onOpenChange, reference, title, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; reference: string; title: string; onConfirm: (reason: string) => Promise<boolean> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
    }
  }, [open]);

  const submit = async () => {
    setTouched(true);
    if (!reason.trim() || busy) return;
    setBusy(true);
    const ok = await onConfirm(reason.trim());
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  const invalid = touched && !reason.trim();

  return (
    <Dialog open={open} onOpenChange={o => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle className="flex items-center gap-2 text-[15px]"><UserX className="h-4 w-4 text-muted-foreground" /> Recuse from {reference}</DialogTitle>
          <DialogDescription className="text-[13px]">
            You won't score “{title}”. The program's managers are told why, so they can ask someone else. Your notes so far are kept, and you can reopen this later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5 px-5 pb-5">
          <label htmlFor="recuse-reason" className="text-[13px] font-medium">Conflict of interest</label>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map(r => (
              <button key={r} type="button" onClick={() => setReason(r)} className={cn('chip h-7 bg-background px-2.5 text-left hover:bg-accent', reason === r && 'border-primary/40 bg-primary/[0.07]')}>
                {r}
              </button>
            ))}
          </div>
          <textarea
            id="recuse-reason"
            autoFocus
            value={reason}
            onChange={e => setReason(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={3}
            maxLength={2000}
            placeholder="Briefly, what's the conflict?"
            aria-invalid={invalid}
            className={cn('w-full resize-none rounded-md border bg-transparent px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground focus:border-foreground/30', invalid && 'border-tone-danger focus:border-tone-danger')}
          />
          {invalid && <p className="text-xs text-tone-danger">Add a short reason so the program team knows why you stepped back.</p>}
        </div>
        <DialogFooter className="items-center border-t px-5 py-3">
          <span className="mr-auto hidden items-center gap-1 text-xs text-muted-foreground sm:flex"><Kbd>{MOD}</Kbd><Kbd>↵</Kbd> to recuse</span>
          <Button variant="outline" size="sm" className="h-8 text-[13px]" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" className="h-8 text-[13px]" disabled={busy} onClick={submit}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Recuse
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
