import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Globe, MoreHorizontal, Pencil, Plus, Search, Tag, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { listLabels, saveLabel, type ListLabelsOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { Input } from '@project/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@project/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { cn } from '@project/components/lib/utils';
import { useAppActions } from '../../lib/app-actions';
import { LABEL_COLORS } from '../../lib/constants';
import { plural } from '../../lib/format';
import { qk } from '../../lib/queries';
import type { Bootstrap } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { EmptyState, Glyph, IconButton, LabelDot, SkeletonRows } from '../primitives/bits';
import { Field, Locked, SettingsCard, SettingsPageTitle, inputClass, selectItemClass, selectTriggerClass, useSettingsLock, useSettingsMutation } from './ui';

type LabelRow = ListLabelsOutputType['labels'][number];
const ALL = '__all__';
export const labelUsageKey = ['settings-labels'] as const;

function ColorSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Label color">
      {LABEL_COLORS.map(c => {
        const on = c.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`Color ${c}`}
            onClick={() => onChange(c)}
            className={cn('flex h-6 w-6 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', on && 'ring-2 ring-foreground/60')}
            style={{ background: c }}
          >
            {on && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
          </button>
        );
      })}
    </div>
  );
}

function LabelColorButton({ label, disabled, onPick }: { label: LabelRow; disabled?: boolean; onPick: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Color of ${label.name}`} disabled={disabled} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-accent disabled:hover:bg-transparent data-[state=open]:bg-accent">
          <span className="h-3 w-3 rounded-full" style={{ background: label.color }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2.5 shadow-lg">
        <ColorSwatches
          value={label.color}
          onChange={c => {
            setOpen(false);
            if (c.toLowerCase() !== label.color.toLowerCase()) onPick(c);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function LabelDialog({ open, onOpenChange, label, labels }: { open: boolean; onOpenChange: (o: boolean) => void; label: LabelRow | null; labels: LabelRow[] }) {
  const ws = useWorkspace();
  const run = useSettingsMutation();
  const [form, setForm] = useState({ name: '', color: LABEL_COLORS[0], description: '', programId: null as string | null });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(label ? { name: label.name, color: label.color, description: label.description, programId: label.programId } : { name: '', color: LABEL_COLORS[labels.length % LABEL_COLORS.length], description: '', programId: null });
    setTouched(false);
  }, [open, label]);

  const clash = labels.find(l => l.id !== label?.id && l.name.trim().toLowerCase() === form.name.trim().toLowerCase() && (l.programId ?? null) === form.programId);
  const nameError = !form.name.trim() ? 'Name the label' : clash ? `There’s already a “${clash.name}” label ${form.programId ? 'in this program' : 'for all programs'}` : null;
  const scopeNarrowed = label && !label.programId && form.programId && label.usage > 0;

  const submit = async () => {
    setTouched(true);
    if (nameError || saving) return;
    setSaving(true);
    const payload = { name: form.name.trim(), color: form.color, description: form.description.trim() || null, programId: form.programId };
    const res = await run(() => saveLabel(label ? { action: 'update', id: label.id, ...payload } : { action: 'create', ...payload }), {
      success: label ? `Saved “${payload.name}”` : `Created “${payload.name}”`,
      error: label ? "Couldn't save the label" : "Couldn't create the label",
      optimistic: label ? (data: Bootstrap) => ({ ...data, labels: data.labels.map(l => (l.id === label.id ? { ...l, ...payload, description: payload.description ?? '' } : l)) }) : undefined,
      alsoInvalidate: [labelUsageKey, qk.submissionsRoot, qk.submissionRoot],
    });
    setSaving(false);
    if (res) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-5">
        <DialogHeader>
          <DialogTitle className="text-[15px]">{label ? 'Edit label' : 'New label'}</DialogTitle>
          <DialogDescription className="text-[13px]">Labels flag submissions for the team — “Budget question”, “Board interest”. Applicants never see them.</DialogDescription>
        </DialogHeader>
        <form id="label-form" className="space-y-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
          <Field label="Name" htmlFor="label-name" error={touched || clash ? nameError : null}>
            <div className="flex items-center gap-2">
              <span className="chip h-8 shrink-0 bg-background px-2.5">
                <LabelDot color={form.color} />
                <span className="max-w-[120px] truncate">{form.name.trim() || 'Preview'}</span>
              </span>
              <Input id="label-name" autoFocus value={form.name} maxLength={60} placeholder="Needs site visit" onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputClass} />
            </div>
          </Field>
          <Field label="Color">
            <ColorSwatches value={form.color} onChange={color => setForm(f => ({ ...f, color }))} />
          </Field>
          <Field label="Description" htmlFor="label-description" hint="Optional. Shown when someone hovers the label.">
            <Input id="label-description" value={form.description} maxLength={200} placeholder="When to use this label" onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inputClass} />
          </Field>
          <Field label="Available in" htmlFor="label-scope" hint={scopeNarrowed ? 'Submissions in other programs keep this label, but it won’t be offered there any more.' : undefined}>
            <Select value={form.programId ?? ALL} onValueChange={v => setForm(f => ({ ...f, programId: v === ALL ? null : v }))}>
              <SelectTrigger id="label-scope" className={cn(selectTriggerClass, '[&>span]:flex [&>span]:items-center [&>span]:gap-1.5')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL} className={selectItemClass}>
                  <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-muted-foreground" /> All programs</span>
                </SelectItem>
                <SelectSeparator />
                {ws.orderedPrograms.map(p => (
                  <SelectItem key={p.id} value={p.id} className={selectItemClass}>
                    <span className="flex items-center gap-1.5"><Glyph icon={p.icon} color={p.color} size={14} /> {p.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </form>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="label-form" size="sm" disabled={saving || (touched && Boolean(nameError))}>{saving ? 'Saving…' : label ? 'Save label' : 'Create label'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LabelsSettings() {
  const ws = useWorkspace();
  const app = useAppActions();
  const run = useSettingsMutation();
  const lock = useSettingsLock();
  const qc = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: labelUsageKey, queryFn: () => listLabels({}), staleTime: 15_000 });
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<{ open: boolean; label: LabelRow | null }>({ open: false, label: null });
  const labels = data?.labels ?? [];

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = labels.filter(l => !q || `${l.name} ${l.description}`.toLowerCase().includes(q));
    const out: Array<{ key: string; title: string; icon: React.ReactNode; labels: LabelRow[] }> = [];
    const global = shown.filter(l => !l.programId);
    if (global.length) out.push({ key: 'all', title: 'All programs', icon: <Globe className="h-3.5 w-3.5" />, labels: global });
    for (const p of ws.orderedPrograms) {
      const mine = shown.filter(l => l.programId === p.id);
      if (mine.length) out.push({ key: p.id, title: p.name, icon: <Glyph icon={p.icon} color={p.color} size={14} className="text-[9px]" />, labels: mine });
    }
    const orphans = shown.filter(l => l.programId && !ws.programById.has(l.programId));
    if (orphans.length) out.push({ key: 'orphans', title: 'Deleted programs', icon: <Tag className="h-3.5 w-3.5" />, labels: orphans });
    return out;
  }, [labels, query, ws.orderedPrograms, ws.programById]);

  const remove = async (l: LabelRow) => {
    const ok = await app.confirm({
      title: `Delete “${l.name}”?`,
      description: l.usage
        ? `It’s on ${plural(l.usage, 'submission')}. Deleting it takes it off all of them, and can’t be undone.`
        : 'It isn’t on any submissions yet. This can’t be undone.',
      confirmLabel: 'Delete label',
      destructive: true,
    });
    if (!ok) return;
    await run(() => saveLabel({ action: 'delete', id: l.id }), {
      optimistic: d => ({ ...d, labels: d.labels.filter(x => x.id !== l.id) }),
      success: `Deleted “${l.name}”`,
      error: "Couldn't delete the label",
      alsoInvalidate: [labelUsageKey, qk.submissionsRoot, qk.submissionRoot],
    });
  };

  const recolor = (l: LabelRow, color: string) => {
    qc.setQueryData<ListLabelsOutputType>(labelUsageKey, old => (old ? { labels: old.labels.map(x => (x.id === l.id ? { ...x, color } : x)) } : old));
    return run(() => saveLabel({ action: 'update', id: l.id, color }), {
      optimistic: d => ({ ...d, labels: d.labels.map(x => (x.id === l.id ? { ...x, color } : x)) }),
      error: "Couldn't change the color",
      alsoInvalidate: [labelUsageKey],
    });
  };

  return (
    <>
      <SettingsPageTitle
        title="Labels"
        description="Flags for submissions that the team can filter by. Labels for all programs show everywhere; a program’s own labels only show there."
        actions={
          <Button size="sm" onClick={() => setDialog({ open: true, label: null })}>
            <Plus /> New label
          </Button>
        }
      />
      {labels.length > 6 && (
        <div className="relative mb-3 sm:w-60">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search labels" aria-label="Search labels" className={cn(inputClass, 'pl-8')} />
        </div>
      )}
      {isPending ? (
        <SettingsCard><SkeletonRows rows={5} /></SettingsCard>
      ) : isError ? (
        <SettingsCard><EmptyState icon={<Tag />} title="Labels didn’t load" action={<Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>} /></SettingsCard>
      ) : labels.length === 0 ? (
        <SettingsCard>
          <EmptyState icon={<Tag />} title="No labels yet" description="Create one for the things your team keeps asking about a submission." action={<Locked><Button size="sm" onClick={() => setDialog({ open: true, label: null })}><Plus /> New label</Button></Locked>} />
        </SettingsCard>
      ) : groups.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted-foreground">No labels match “{query}”.</p>
      ) : (
        <div className="space-y-6">
          {groups.map(g => (
            <section key={g.key}>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{g.icon} {g.title} <span className="tabular-nums text-faint">{g.labels.length}</span></h3>
              <SettingsCard>
                {g.labels.map(l => (
                  <div key={l.id} className="group flex items-center gap-3 px-3 py-2">
                    <Locked>
                      <LabelColorButton label={l} disabled={Boolean(lock)} onPick={c => void recolor(l, c)} />
                    </Locked>
                    <button type="button" disabled={Boolean(lock)} onClick={() => setDialog({ open: true, label: l })} className="min-w-0 flex-1 text-left disabled:cursor-default">
                      <div className="truncate text-[13px] font-medium">{l.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{l.description || <span className="text-faint">No description</span>}</div>
                    </button>
                    <span className={cn('shrink-0 text-xs tabular-nums', l.usage ? 'text-muted-foreground' : 'text-faint')}>{l.usage ? plural(l.usage, 'submission') : 'Unused'}</span>
                    <Locked>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton aria-label={`Actions for ${l.name}`} disabled={Boolean(lock)}>
                            <MoreHorizontal />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem className="text-[13px]" onSelect={() => setDialog({ open: true, label: l })}>
                            <Pencil className="h-3.5 w-3.5" /> Edit…
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-[13px] text-tone-danger focus:text-tone-danger" onSelect={() => void remove(l)}>
                            <Trash2 className="h-3.5 w-3.5" /> Delete…
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Locked>
                  </div>
                ))}
              </SettingsCard>
            </section>
          ))}
        </div>
      )}
      <LabelDialog open={dialog.open} onOpenChange={o => setDialog(d => ({ ...d, open: o }))} label={dialog.label} labels={labels} />
    </>
  );
}
