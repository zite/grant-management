import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { saveView } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Input } from '@project/components/ui/input';
import { cn } from '@project/components/lib/utils';
import { errorMessage } from '../../lib/errors';
import { qk } from '../../lib/queries';
import type { SubmissionFilters } from '../../lib/types';
import type { ViewOptions } from '../../lib/view';

export function SaveViewDialog({ open, onOpenChange, filters, options, programId, existing }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  filters: SubmissionFilters;
  options: ViewOptions;
  programId: string | null;
  existing?: { id: string; name: string; scope: string } | null;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'Personal' | 'Shared'>('Personal');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName(existing?.name ?? '');
      setScope(existing?.scope === 'Shared' ? 'Shared' : 'Personal');
    }
  }, [open, existing]);

  const submit = async (asNew: boolean) => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const config = JSON.stringify({ filters, options });
      const res = existing && !asNew
        ? await saveView({ action: 'update', id: existing.id, name: name.trim(), scope, config })
        : await saveView({ action: 'create', name: name.trim(), scope, config, programId });
      await qc.invalidateQueries({ queryKey: qk.bootstrap });
      toast.success(existing && !asNew ? 'View updated' : `Saved “${name.trim()}”`);
      onOpenChange(false);
      if (res.id && (asNew || !existing)) navigate(`/view/${res.id}`);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't save the view"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="px-5 pb-2 pt-5">
          <DialogTitle className="text-[15px]">{existing ? 'Save view' : 'Save as view'}</DialogTitle>
          <DialogDescription className="text-[13px]">Keeps these filters, grouping and columns one click away in the sidebar.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={e => {
            e.preventDefault();
            submit(false);
          }}
          className="space-y-4 px-5 pb-4 pt-2"
        >
          <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Finalists to discuss" className="h-9 text-[13px]" maxLength={80} />
          <div className="grid grid-cols-2 gap-2">
            {(['Personal', 'Shared'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={cn('rounded-lg border px-3 py-2.5 text-left transition-colors', scope === s ? 'border-primary/60 bg-primary/[0.05] ring-1 ring-primary/30' : 'hover:bg-accent')}
              >
                <div className="text-[13px] font-medium">{s === 'Personal' ? 'Just me' : 'Everyone on staff'}</div>
                <div className="text-xs text-muted-foreground">{s === 'Personal' ? 'Only you see it' : 'Shared in the sidebar'}</div>
              </button>
            ))}
          </div>
        </form>
        <DialogFooter className="gap-2 border-t px-5 py-3">
          {existing && (
            <Button variant="ghost" size="sm" className="mr-auto h-8 text-[13px]" disabled={busy || !name.trim()} onClick={() => submit(true)}>
              Save as new
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" className="h-8 text-[13px]" disabled={busy || !name.trim()} onClick={() => submit(false)}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {existing ? 'Save changes' : 'Save view'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
