import {
  AlertTriangle, BadgeCheck, CalendarRange, ChevronLeft, CircleDashed, CircleDollarSign, ClipboardCheck, Gauge, Layers, ListFilter, Megaphone, Radio, Tag, UserRound, Users, X,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@project/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@project/components/ui/popover';
import { cn } from '@project/components/lib/utils';
import { addDays } from '../../lib/format';
import type { SubmissionFilters } from '../../lib/types';
import { useWorkspace, type Workspace } from '../../lib/workspace';
import { MemberAvatar, UnassignedAvatar } from '../primitives/Avatar';
import { OutcomeGlyph, StageGlyph } from '../primitives/icons';
import { Glyph, LabelDot } from '../primitives/bits';

type Opt = { value: string; label: string; icon?: ReactNode; keywords?: string[] };

export type FilterKey =
  | 'program' | 'stage' | 'stageKind' | 'status' | 'owner' | 'label' | 'reviewer' | 'reviewState' | 'release' | 'score' | 'amount' | 'submitted' | 'award' | 'signals';

type FilterDef = {
  key: FilterKey;
  label: string;
  icon: ReactNode;
  multi: boolean;
  options: (ws: Workspace, programId: string | null) => Opt[];
  get: (f: SubmissionFilters) => string[];
  set: (f: SubmissionFilters, values: string[]) => SubmissionFilters;
  hidden?: (programId: string | null) => boolean;
};

const ic = 'h-3.5 w-3.5 text-muted-foreground';

const listField = (field: keyof SubmissionFilters) => ({
  get: (f: SubmissionFilters) => ((f[field] as string[] | undefined) ?? []).map(String),
  set: (f: SubmissionFilters, values: string[]) => {
    const next = { ...f } as Record<string, unknown>;
    if (values.length) next[field] = values;
    else delete next[field];
    return next as SubmissionFilters;
  },
});

const SCORE_BANDS: Array<[string, string, number | undefined, number | undefined]> = [
  ['80+', '80 and above', 80, undefined],
  ['65-79', '65 to 79', 65, 79.99],
  ['50-64', '50 to 64', 50, 64.99],
  ['<50', 'Below 50', undefined, 49.99],
];

const AMOUNT_BANDS: Array<[string, string, number | undefined, number | undefined]> = [
  ['<1k', 'Under 1,000', undefined, 999.99],
  ['1-5k', '1,000 to 5,000', 1000, 5000],
  ['5-10k', '5,000 to 10,000', 5000, 10000],
  ['>10k', 'Over 10,000', 10000.01, undefined],
];

const SUBMITTED: Array<[string, string, number]> = [
  ['7', 'In the last week', 7],
  ['30', 'In the last month', 30],
  ['90', 'In the last 3 months', 90],
  ['365', 'In the last year', 365],
];

export const FILTERS: FilterDef[] = [
  {
    key: 'program', label: 'Program', icon: <Layers className={ic} />, multi: true,
    hidden: programId => Boolean(programId),
    options: ws => ws.orderedPrograms.map(p => ({ value: p.id, label: p.name, icon: <Glyph icon={p.icon} color={p.color} size={16} />, keywords: [p.key] })),
    ...listField('programIds'),
  },
  {
    key: 'stage', label: 'Stage', icon: <CircleDashed className={ic} />, multi: true,
    hidden: programId => !programId,
    options: (ws, programId) => ws.stagesFor(programId).map(s => ({ value: s.id, label: s.name, icon: <StageGlyph kind={s.kind} color={s.color} /> })),
    ...listField('stageIds'),
  },
  {
    key: 'stageKind', label: 'Stage type', icon: <CircleDashed className={ic} />, multi: true,
    hidden: programId => Boolean(programId),
    options: () => (['Intake', 'Review', 'Decision'] as const).map(k => ({ value: k, label: k, icon: <StageGlyph kind={k} color="#8b8d98" /> })),
    ...listField('stageKinds'),
  },
  {
    key: 'status', label: 'Status', icon: <BadgeCheck className={ic} />, multi: true,
    options: () => [
      { value: 'Submitted', label: 'In review', icon: <StageGlyph kind="Review" color="#6943d0" /> },
      { value: 'Accepted', label: 'Accepted', icon: <OutcomeGlyph status="Accepted" /> },
      { value: 'Waitlisted', label: 'Waitlisted', icon: <OutcomeGlyph status="Waitlisted" /> },
      { value: 'Declined', label: 'Declined', icon: <OutcomeGlyph status="Declined" /> },
      { value: 'Withdrawn', label: 'Withdrawn', icon: <OutcomeGlyph status="Withdrawn" /> },
      { value: 'Draft', label: 'Draft (not submitted)', icon: <OutcomeGlyph status="Draft" /> },
    ],
    ...listField('statuses'),
  },
  {
    key: 'owner', label: 'Owner', icon: <UserRound className={ic} />, multi: true,
    options: ws => [
      { value: '__me__', label: 'Me', icon: <MemberAvatar member={ws.memberById.get(ws.me.id)} size={16} /> },
      { value: '__none__', label: 'No owner', icon: <UnassignedAvatar size={16} /> },
      ...ws.managers.filter(m => m.id !== ws.me.id).map(m => ({ value: m.id, label: m.name, icon: <MemberAvatar member={m} size={16} />, keywords: [m.email] })),
    ],
    ...listField('ownerIds'),
  },
  {
    key: 'reviewer', label: 'Reviewer', icon: <Users className={ic} />, multi: true,
    options: (ws, programId) => [
      { value: '__me__', label: 'Me', icon: <MemberAvatar member={ws.memberById.get(ws.me.id)} size={16} /> },
      ...(programId ? ws.reviewerPool(programId) : ws.activeMembers).filter(m => m.id !== ws.me.id).map(m => ({ value: m.id, label: m.name, icon: <MemberAvatar member={m} size={16} />, keywords: [m.email] })),
    ],
    ...listField('reviewerIds'),
  },
  {
    key: 'reviewState', label: 'Review progress', icon: <ClipboardCheck className={ic} />, multi: false,
    options: () => [
      { value: 'unassigned', label: 'Needs reviewers' },
      { value: 'in_review', label: 'Reviews outstanding' },
      { value: 'reviewed', label: 'All reviews in' },
      { value: 'disagreement', label: 'Reviewers disagree', icon: <AlertTriangle className="h-3.5 w-3.5 text-tone-warning" /> },
    ],
    get: f => (f.reviewState ? [f.reviewState] : []),
    set: (f, v) => ({ ...f, reviewState: (v[v.length - 1] as SubmissionFilters['reviewState']) || undefined }),
  },
  {
    key: 'score', label: 'Score', icon: <Gauge className={ic} />, multi: false,
    options: () => SCORE_BANDS.map(([value, label]) => ({ value, label })),
    get: f => {
      const band = SCORE_BANDS.find(([, , min, max]) => (f.scoreMin ?? undefined) === min && (f.scoreMax ?? undefined) === max);
      return band ? [band[0]] : f.scoreMin != null || f.scoreMax != null ? ['custom'] : [];
    },
    set: (f, v) => {
      const band = SCORE_BANDS.find(b => b[0] === v[v.length - 1]);
      return { ...f, scoreMin: band?.[2], scoreMax: band?.[3] };
    },
  },
  {
    key: 'amount', label: 'Requested', icon: <CircleDollarSign className={ic} />, multi: false,
    options: () => AMOUNT_BANDS.map(([value, label]) => ({ value, label })),
    get: f => {
      const band = AMOUNT_BANDS.find(([, , min, max]) => (f.amountMin ?? undefined) === min && (f.amountMax ?? undefined) === max);
      return band ? [band[0]] : f.amountMin != null || f.amountMax != null ? ['custom'] : [];
    },
    set: (f, v) => {
      const band = AMOUNT_BANDS.find(b => b[0] === v[v.length - 1]);
      return { ...f, amountMin: band?.[2], amountMax: band?.[3] };
    },
  },
  {
    key: 'label', label: 'Labels', icon: <Tag className={ic} />, multi: true,
    options: (ws, programId) => ws.labelsFor(programId).map(l => ({ value: l.id, label: l.name, icon: <LabelDot color={l.color} /> })),
    ...listField('labelIds'),
  },
  {
    key: 'submitted', label: 'Submitted', icon: <CalendarRange className={ic} />, multi: false,
    options: () => SUBMITTED.map(([value, label]) => ({ value, label })),
    get: f => {
      if (!f.submittedAfter) return [];
      const hit = SUBMITTED.find(([, , days]) => f.submittedAfter === addDays(-days));
      return hit ? [hit[0]] : ['custom'];
    },
    set: (f, v) => {
      const hit = SUBMITTED.find(s => s[0] === v[v.length - 1]);
      return { ...f, submittedAfter: hit ? addDays(-hit[2]) : undefined, submittedBefore: undefined };
    },
  },
  {
    key: 'release', label: 'Decision', icon: <Megaphone className={ic} />, multi: false,
    options: () => [
      { value: 'unreleased', label: 'Decided, not yet released' },
      { value: 'released', label: 'Released to applicant' },
    ],
    get: f => (f.release ? [f.release] : []),
    set: (f, v) => ({ ...f, release: (v[v.length - 1] as SubmissionFilters['release']) || undefined }),
  },
  {
    key: 'award', label: 'Award status', icon: <BadgeCheck className={ic} />, multi: true,
    options: () => ['Pending', 'Active', 'Completed', 'Cancelled'].map(s => ({ value: s, label: s })),
    ...listField('awardStatuses'),
  },
  {
    key: 'signals', label: 'Needs attention', icon: <Radio className={ic} />, multi: true,
    options: () => [
      { value: 'messages', label: 'Unread applicant messages' },
      { value: 'tasks', label: 'Open or submitted tasks' },
      { value: 'late', label: 'Submitted after the deadline' },
    ],
    get: f => [f.hasUnreadMessages && 'messages', f.hasOpenTasks && 'tasks', f.late && 'late'].filter(Boolean) as string[],
    set: (f, v) => ({ ...f, hasUnreadMessages: v.includes('messages') || undefined, hasOpenTasks: v.includes('tasks') || undefined, late: v.includes('late') || undefined }),
  },
];

function OptionList({ def, filters, onChange, programId, onBack }: { def: FilterDef; filters: SubmissionFilters; onChange: (f: SubmissionFilters) => void; programId: string | null; onBack?: () => void }) {
  const ws = useWorkspace();
  const [q, setQ] = useState('');
  const options = useMemo(() => def.options(ws, programId), [def, ws, programId]);
  const current = def.get(filters);
  const labelOf = useMemo(() => new Map(options.flatMap(o => [[`${o.label} ${o.value}`, o.label], [`${o.label} ${o.value}`.toLowerCase(), o.label]] as Array<[string, string]>)), [options]);
  return (
    <Command
      loop
      filter={(value, search, keywords) => {
        const needle = search.trim().toLowerCase();
        if (!needle) return 1;
        const label = (labelOf.get(value) ?? value).toLowerCase();
        if (label.startsWith(needle)) return 1;
        if (label.includes(needle)) return 0.8;
        return (keywords ?? []).some(k => k && k.toLowerCase().includes(needle)) ? 0.4 : 0;
      }}
    >
      <div className="flex items-center border-b">
        {onBack && (
          <button type="button" onClick={onBack} className="ml-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent" aria-label="Back">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="flex-1 [&>div]:border-0">
          <CommandInput value={q} onValueChange={setQ} placeholder={`${def.label}…`} className="h-9 text-[13px]" onKeyDown={e => e.key === 'Backspace' && !q && onBack?.()} />
        </div>
      </div>
      <CommandList className="max-h-[300px] p-1">
        <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">No options</CommandEmpty>
        <CommandGroup className="p-0">
          {options.map(o => {
            const on = current.includes(o.value);
            return (
              <CommandItem
                key={o.value}
                value={`${o.label} ${o.value}`}
                keywords={o.keywords}
                onSelect={() => onChange(def.set(filters, def.multi ? (on ? current.filter(v => v !== o.value) : [...current, o.value]) : on ? [] : [o.value]))}
                className="h-8 gap-2 rounded-[5px] px-2 text-[13px]"
              >
                <span className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center border', def.multi ? 'rounded-[4px]' : 'rounded-full', on ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>
                  {on && (def.multi ? <span className="text-[9px] font-bold leading-none">✓</span> : <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />)}
                </span>
                {o.icon && <span className="flex w-4 shrink-0 justify-center">{o.icon}</span>}
                <span className="truncate">{o.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

/** "Filter" → pick a property → pick values. Changes apply as you click. */
export function FilterMenu({ filters, onChange, programId, locked = [] }: { filters: SubmissionFilters; onChange: (f: SubmissionFilters) => void; programId: string | null; locked?: FilterKey[] }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<FilterKey | null>(null);
  const defs = FILTERS.filter(d => !d.hidden?.(programId) && !locked.includes(d.key));
  const def = defs.find(d => d.key === step);
  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setStep(null); }}>
      <PopoverTrigger asChild>
        <button type="button" className="ghost-chip h-7 gap-1.5 text-muted-foreground hover:text-foreground">
          <ListFilter className="h-3.5 w-3.5" /> Filter
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[270px] overflow-hidden p-0 shadow-lg">
        {def ? (
          <OptionList def={def} filters={filters} onChange={onChange} programId={programId} onBack={() => setStep(null)} />
        ) : (
          <Command loop>
            <CommandInput placeholder="Filter by…" className="h-9 text-[13px]" autoFocus />
            <CommandList className="max-h-[360px] p-1">
              <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">No filters</CommandEmpty>
              <CommandGroup className="p-0">
                {defs.map(d => {
                  const count = d.get(filters).length;
                  return (
                    <CommandItem key={d.key} value={d.label} onSelect={() => setStep(d.key)} className="h-8 gap-2 rounded-[5px] px-2 text-[13px]">
                      <span className="flex w-4 justify-center">{d.icon}</span>
                      <span className="flex-1">{d.label}</span>
                      {count > 0 && <span className="rounded bg-primary/10 px-1.5 text-2xs font-medium text-primary">{count}</span>}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Active filters as editable chips: "Stage is Panel review ×". */
export function FilterChips({ filters, onChange, programId, locked = [] }: { filters: SubmissionFilters; onChange: (f: SubmissionFilters) => void; programId: string | null; locked?: FilterKey[] }) {
  const ws = useWorkspace();
  const active = FILTERS.filter(d => !locked.includes(d.key) && !d.hidden?.(programId) && d.get(filters).length > 0);
  if (active.length === 0) return null;
  return (
    <>
      {active.map(def => {
        const values = def.get(filters);
        const options = def.options(ws, programId);
        const chosen = values.map(v => options.find(o => o.value === v)).filter(Boolean) as Opt[];
        const text = chosen.length === 0 ? 'Custom' : chosen.length <= 2 ? chosen.map(c => c.label).join(', ') : `${chosen.length} ${def.label.toLowerCase()}`;
        return (
          <span key={def.key} className="inline-flex h-7 items-center overflow-hidden rounded-md border bg-background text-[12.5px] shadow-2xs animate-fade-in">
            <span className="flex h-full items-center gap-1.5 border-r px-2 text-muted-foreground">
              {def.icon}
              {def.label}
            </span>
            <span className="flex h-full items-center border-r px-2 text-muted-foreground">{def.multi && values.length > 1 ? 'is any of' : 'is'}</span>
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="flex h-full max-w-[220px] items-center gap-1.5 px-2 hover:bg-accent">
                  {chosen.some(c => c.icon) && <span className="flex items-center -space-x-1">{chosen.slice(0, 3).map((c, i) => <span key={i} className="flex">{c.icon}</span>)}</span>}
                  <span className="truncate">{text}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[270px] overflow-hidden p-0 shadow-lg">
                <OptionList def={def} filters={filters} onChange={onChange} programId={programId} />
              </PopoverContent>
            </Popover>
            <button type="button" onClick={() => onChange(def.set(filters, []))} aria-label={`Remove ${def.label} filter`} className="flex h-full items-center border-l px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        );
      })}
      <button type="button" onClick={() => onChange(filters.search ? { search: filters.search } : {})} className="h-7 rounded-md px-2 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground">
        Clear
      </button>
    </>
  );
}
