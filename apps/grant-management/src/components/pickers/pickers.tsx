import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { addDays, endOfWeek, nextMonday } from 'date-fns';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { saveLabel } from 'zitejs/api';
import { Calendar } from '@project/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@project/components/ui/popover';
import { LABEL_COLORS } from '../../lib/constants';
import { errorMessage } from '../../lib/errors';
import { parseDay, shortDate, toDayString } from '../../lib/format';
import { qk } from '../../lib/queries';
import { useWorkspace } from '../../lib/workspace';
import { MemberAvatar, UnassignedAvatar } from '../primitives/Avatar';
import { OutcomeGlyph, StageGlyph } from '../primitives/icons';
import { Glyph, LabelDot } from '../primitives/bits';
import { OptionPicker, type Option } from './OptionPicker';

type PickerBase<V> = {
  value: V;
  onChange: (value: V) => void;
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
};

/** Stages of one program, plus decisions — a stage move and a decision are the same gesture in a pipeline. */
export function StagePicker({ programId, includeDecisions = true, ...p }: PickerBase<string | null> & { programId: string | null; includeDecisions?: boolean }) {
  const ws = useWorkspace();
  const stages = ws.stagesFor(programId);
  const options: Option<string>[] = [
    ...stages.map((s, i) => ({ value: s.id, label: s.name, icon: <StageGlyph kind={s.kind} color={s.color} />, keywords: [s.kind], group: 'Move to stage', shortcut: i < 9 ? String(i + 1) : undefined })),
    ...(includeDecisions
      ? (['Accepted', 'Waitlisted', 'Declined'] as const).map(d => ({ value: `decision:${d}`, label: d === 'Accepted' ? 'Accept…' : d === 'Waitlisted' ? 'Waitlist…' : 'Decline…', icon: <OutcomeGlyph status={d} />, group: 'Decide' }))
      : []),
  ];
  return <OptionPicker {...p} value={p.value} onChange={v => p.onChange(v)} options={options} placeholder="Move to…" width={240} emptyText={programId ? 'No stages' : 'Choose submissions from one program'} />;
}

export function OwnerPicker(p: PickerBase<string | null>) {
  const ws = useWorkspace();
  const me = ws.memberById.get(ws.me.id);
  const options: Option<string | null>[] = [
    { value: null, label: 'No owner', icon: <UnassignedAvatar size={16} /> },
    ...(me && ws.isManager ? [{ value: me.id, label: `${me.name} (you)`, icon: <MemberAvatar member={me} size={16} />, keywords: [me.email] }] : []),
    ...ws.managers.filter(m => m.id !== ws.me.id).map(m => ({ value: m.id, label: m.name, icon: <MemberAvatar member={m} size={16} />, keywords: [m.email], hint: m.title ?? undefined })),
  ];
  return <OptionPicker {...p} options={options} placeholder="Set owner…" />;
}

export function MemberMultiPicker({ programId, exclude = [], ...p }: PickerBase<string[]> & { programId?: string | null; exclude?: string[] }) {
  const ws = useWorkspace();
  const pool = new Set(ws.reviewerPool(programId).map(m => m.id));
  const options: Option<string>[] = ws.activeMembers
    .filter(m => !exclude.includes(m.id))
    .sort((a, b) => Number(pool.has(b.id)) - Number(pool.has(a.id)) || a.name.localeCompare(b.name))
    .map(m => ({
      value: m.id,
      label: m.id === ws.me.id ? `${m.name} (you)` : m.name,
      icon: <MemberAvatar member={m} size={16} />,
      keywords: [m.email, m.expertise ?? ''],
      hint: m.expertise ? <span className="max-w-[110px] truncate">{m.expertise}</span> : undefined,
      group: programId ? (pool.has(m.id) ? 'Reviewer pool' : 'Everyone else') : undefined,
    }));
  return <OptionPicker multiple {...p} options={options} placeholder="Choose reviewers…" width={300} />;
}

export function ProgramPicker({ allowNone, ...p }: PickerBase<string | null> & { allowNone?: boolean }) {
  const ws = useWorkspace();
  const options: Option<string | null>[] = [
    ...(allowNone ? [{ value: null, label: 'All programs' }] : []),
    ...ws.orderedPrograms.filter(pr => pr.phase !== 'archived').map(pr => ({ value: pr.id, label: pr.name, icon: <Glyph icon={pr.icon} color={pr.color} size={16} />, keywords: [pr.key], hint: pr.key })),
  ];
  return <OptionPicker {...p} options={options} placeholder="Choose a program…" width={300} />;
}

export function LabelPicker({ programId, ...p }: PickerBase<string[]> & { programId: string | null }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const options: Option<string>[] = ws.labelsFor(programId).map(l => ({ value: l.id, label: l.name, icon: <LabelDot color={l.color} />, keywords: [l.description] }));
  return (
    <OptionPicker
      multiple
      {...p}
      options={options}
      placeholder="Add labels…"
      onCreate={
        ws.isManager
          ? async name => {
              try {
                const res = await saveLabel({ action: 'create', name, color: LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)] });
                await qc.invalidateQueries({ queryKey: qk.bootstrap });
                if (res.id) p.onChange([...p.value, res.id]);
              } catch (e) {
                toast.error(errorMessage(e, "Couldn't create that label"));
              }
            }
          : undefined
      }
      createLabel={q => `Create label “${q}”`}
    />
  );
}

export function DatePicker({ value, onChange, trigger, open, onOpenChange, align = 'start', presets = true, clearLabel = 'Clear date' }: PickerBase<string | null> & { presets?: boolean; clearLabel?: string }) {
  const [inner, setInner] = useState(false);
  const isOpen = open ?? inner;
  const setOpen = onOpenChange ?? setInner;
  const today = new Date();
  const pick = (d: Date | null) => {
    onChange(d ? toDayString(d) : null);
    setOpen(false);
  };
  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-0 shadow-lg" onClick={e => e.stopPropagation()}>
        {presets && (
          <div className="grid grid-cols-2 gap-1 border-b p-2">
            {[
              ['Tomorrow', addDays(today, 1)],
              ['End of week', endOfWeek(today, { weekStartsOn: 1 })],
              ['Next week', nextMonday(today)],
              ['In two weeks', addDays(today, 14)],
            ].map(([label, d]) => (
              <button key={label as string} type="button" onClick={() => pick(d as Date)} className="flex h-7 items-center justify-between rounded-md px-2 text-[12.5px] hover:bg-accent">
                {label as string}
                <span className="text-muted-foreground">{shortDate(toDayString(d as Date))}</span>
              </button>
            ))}
          </div>
        )}
        <Calendar mode="single" selected={value ? parseDay(value) : undefined} onSelect={d => pick(d ?? null)} initialFocus />
        {value && (
          <div className="border-t p-1.5">
            <button type="button" onClick={() => pick(null)} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground">
              <X className="h-3.5 w-3.5" /> {clearLabel}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

