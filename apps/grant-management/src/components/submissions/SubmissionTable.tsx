import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import { memo, useMemo, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@project/components/lib/utils';
import { answerToText } from '@project/shared/forms/logic';
import type { FormField } from '@project/shared/forms/types';
import type { DisplayProperty } from '../../lib/constants';
import { shortDate, timeAgo } from '../../lib/format';
import type { Ordering, Submission } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { AvatarStack, MemberAvatar } from '../primitives/Avatar';
import { RecommendationBar, ReviewProgress, ScorePill, SubmissionGlyph } from '../primitives/icons';
import { Glyph, LabelDot } from '../primitives/bits';
import { SubmissionContextMenu } from './SubmissionContextMenu';

type Column = {
  key: string;
  header: string;
  width: number;
  align?: 'left' | 'right';
  sort?: [Ordering, Ordering | null];
  show?: (p: Set<DisplayProperty>) => boolean;
  cell: (s: Submission) => ReactNode;
};

/**
 * A spreadsheet of submissions, for when a committee wants every answer side by
 * side. Answer columns come from the program's form; headers sort where the
 * server can sort.
 */
function SubmissionTableInner({ rows, properties, selection, focusedId, multiProgram, answerFields, currency, ordering, onOrdering, onRowClick, onToggleSelect, onHover, getTargets, onSelectAll }: {
  rows: Submission[];
  properties: Set<DisplayProperty>;
  selection: Set<string>;
  focusedId: string | null;
  multiProgram: boolean;
  answerFields: FormField[];
  currency: string;
  ordering: Ordering;
  onOrdering: (o: Ordering) => void;
  onRowClick: (s: Submission, e: MouseEvent) => void;
  onToggleSelect: (s: Submission, e: MouseEvent) => void;
  onHover: (s: Submission) => void;
  getTargets: (s: Submission) => Submission[];
  onSelectAll: (all: boolean) => void;
}) {
  const ws = useWorkspace();
  const columns = useMemo<Column[]>(() => {
    const base: Column[] = [
      { key: 'program', header: 'Program', width: 150, show: () => multiProgram, cell: s => {
        const p = ws.programById.get(s.programId);
        return p ? <span className="flex min-w-0 items-center gap-1.5"><Glyph icon={p.icon} color={p.color} size={14} className="text-[9px]" /><span className="truncate">{p.name}</span></span> : null;
      } },
      { key: 'applicant', header: 'Applicant', width: 190, sort: ['applicant_asc', null], show: p => p.has('applicant'), cell: s => (
        <span className="block min-w-0">
          <span className="block truncate">{s.applicantName || '—'}</span>
          {s.applicantOrganization && <span className="block truncate text-xs text-muted-foreground">{s.applicantOrganization}</span>}
        </span>
      ) },
      { key: 'stage', header: 'Stage', width: 150, show: p => p.has('stage'), cell: s => {
        const stage = s.stageId ? ws.stageById.get(s.stageId) : undefined;
        return (
          <span className="flex items-center gap-1.5 truncate">
            <SubmissionGlyph submission={s} stage={stage} stages={ws.stagesFor(s.programId)} size={13} />
            <span className="truncate">{s.status === 'Submitted' ? stage?.name ?? '—' : s.status}</span>
          </span>
        );
      } },
      { key: 'score', header: 'Score', width: 80, align: 'right', sort: ['score_desc', 'score_asc'], show: p => p.has('score'), cell: s => <ScorePill score={s.avgScore} spread={s.scoreSpread} count={s.reviewsSubmitted} /> },
      { key: 'recommend', header: 'Recommend', width: 96, show: p => p.has('score'), cell: s => <RecommendationBar {...s.recommendations} /> },
      { key: 'reviews', header: 'Reviews', width: 120, show: p => p.has('reviews'), cell: s => (
        <span className="flex items-center gap-2">
          {s.reviewerIds.length > 0 && <AvatarStack members={s.reviewerIds.map(id => ws.memberById.get(id))} size={18} max={3} />}
          <ReviewProgress done={s.reviewsDoneInStage} total={s.reviewsActive} />
        </span>
      ) },
      { key: 'amount', header: 'Requested', width: 104, align: 'right', sort: ['amount_desc', 'amount_asc'], show: p => p.has('amount'), cell: s => (s.requestedAmount != null ? ws.money(s.requestedAmount) : <span className="text-muted-foreground/60">—</span>) },
      { key: 'award', header: 'Award', width: 104, align: 'right', show: p => p.has('award'), cell: s => (s.awardAmount != null ? <span className="font-medium text-tone-success">{ws.money(s.awardAmount)}</span> : <span className="text-muted-foreground/60">—</span>) },
      { key: 'labels', header: 'Labels', width: 170, show: p => p.has('labels'), cell: s => (
        <span className="flex items-center gap-1 overflow-hidden">
          {s.labelIds.map(id => ws.labelById.get(id)).filter(Boolean).slice(0, 3).map(l => (
            <span key={l!.id} className="chip h-[22px] shrink-0 bg-background"><LabelDot color={l!.color} />{l!.name}</span>
          ))}
        </span>
      ) },
      { key: 'owner', header: 'Owner', width: 140, show: p => p.has('owner'), cell: s => {
        const m = s.ownerId ? ws.memberById.get(s.ownerId) : undefined;
        return m ? <span className="flex items-center gap-1.5 truncate"><MemberAvatar member={m} size={18} />{m.name}</span> : <span className="text-muted-foreground/60">—</span>;
      } },
      { key: 'submitted', header: 'Submitted', width: 104, sort: ['submitted_desc', 'submitted_asc'], show: p => p.has('submitted'), cell: s => <span className="tabular-nums text-muted-foreground">{shortDate(s.submittedAt ?? s.startedAt)}</span> },
      { key: 'activity', header: 'Last activity', width: 110, sort: ['updated_desc', null], show: p => p.has('activity'), cell: s => <span className="tabular-nums text-muted-foreground">{timeAgo(s.lastActivityAt)}</span> },
    ];
    const answers: Column[] = answerFields.map(f => ({
      key: `answer:${f.id}`,
      header: f.label || 'Untitled question',
      width: f.type === 'long_text' ? 320 : f.type === 'file' ? 220 : 180,
      align: f.type === 'currency' || f.type === 'number' ? 'right' : 'left',
      cell: s => {
        const text = s.answers ? answerToText(f, s.answers, { currency }) : '';
        const shown = f.type === 'file' ? text.replace(/ \(https?:\/\/[^)]+\)/g, '') : text;
        return shown ? <span className="block truncate" title={shown}>{shown}</span> : <span className="text-muted-foreground/60">—</span>;
      },
    }));
    return [...base.filter(c => !c.show || c.show(properties)), ...answers];
  }, [ws, properties, multiProgram, answerFields, currency]);

  const allSelected = rows.length > 0 && rows.every(r => selection.has(r.id));
  const sortIcon = (c: Column) => {
    if (!c.sort) return null;
    if (ordering === c.sort[0]) return c.sort[0].endsWith('_asc') ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
    if (c.sort[1] && ordering === c.sort[1]) return c.sort[1].endsWith('_asc') ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
    return null;
  };
  const cycle = (c: Column) => {
    if (!c.sort) return;
    onOrdering(ordering === c.sort[0] && c.sort[1] ? c.sort[1] : c.sort[0]);
  };
  const stickyCols = 'sticky z-[1] bg-background group-hover/tr:bg-accent/60';

  return (
    <div className="h-full overflow-auto pb-24">
      <table className="w-max min-w-full border-separate border-spacing-0 text-[13px]" role="grid" aria-label="Submissions">
        <thead className="sticky top-0 z-20">
          <tr className="h-9 bg-subtle text-left text-xs font-medium text-muted-foreground">
            <th className="sticky left-0 z-[2] w-9 border-b bg-subtle pl-3">
              <button type="button" aria-label={allSelected ? 'Deselect all' : 'Select all'} onClick={() => onSelectAll(!allSelected)} className={cn('flex h-4 w-4 items-center justify-center rounded-[4px] border', allSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background')}>
                {allSelected && <Check className="h-3 w-3" strokeWidth={3} />}
              </button>
            </th>
            <th className="sticky left-9 z-[2] w-[84px] border-b bg-subtle px-2">
              <button type="button" onClick={() => onOrdering('reference_asc')} className="flex items-center gap-1 hover:text-foreground">Ref {ordering === 'reference_asc' && <ArrowUp className="h-3 w-3" />}</button>
            </th>
            <th className="sticky left-[120px] z-[2] w-[280px] border-b border-r bg-subtle px-2">
              <button type="button" onClick={() => onOrdering('title_asc')} className="flex items-center gap-1 hover:text-foreground">Title {ordering === 'title_asc' && <ArrowUp className="h-3 w-3" />}</button>
            </th>
            {columns.map(c => (
              <th key={c.key} style={{ width: c.width, minWidth: c.width, maxWidth: c.width }} className={cn('border-b px-3 font-medium', c.align === 'right' && 'text-right', c.key.startsWith('answer:') && 'bg-primary/[0.03]')}>
                {c.sort ? (
                  <button type="button" onClick={() => cycle(c)} className={cn('inline-flex max-w-full items-center gap-1 truncate hover:text-foreground', c.align === 'right' && 'flex-row-reverse')}>
                    <span className="truncate">{c.header}</span>
                    {sortIcon(c)}
                  </button>
                ) : (
                  <span className="block truncate" title={c.header}>{c.header}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(s => {
            const selected = selection.has(s.id);
            const focused = focusedId === s.id;
            return (
              <SubmissionContextMenu key={s.id} getTargets={() => getTargets(s)}>
                <tr
                  data-row-id={s.id}
                  aria-selected={selected}
                  onClick={e => onRowClick(s, e)}
                  onMouseMove={() => !focused && onHover(s)}
                  className={cn('group/tr h-10 cursor-default', focused && '[&>td]:bg-accent/80', selected && '[&>td]:bg-primary/[0.07]')}
                >
                  <td className={cn(stickyCols, 'left-0 border-b pl-3')}>
                    <button
                      type="button"
                      aria-label={selected ? 'Deselect' : 'Select'}
                      onClick={e => {
                        e.stopPropagation();
                        onToggleSelect(s, e);
                      }}
                      className={cn('flex h-4 w-4 items-center justify-center rounded-[4px] border', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background')}
                    >
                      {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                    </button>
                  </td>
                  <td className={cn(stickyCols, 'left-9 border-b px-2 text-[12.5px] tabular-nums text-muted-foreground')}>{s.reference}</td>
                  <td className={cn(stickyCols, 'left-[120px] max-w-[280px] border-b border-r px-2')}>
                    <span className={cn('block truncate', (s.status === 'Declined' || s.status === 'Withdrawn') && 'text-muted-foreground')}>{s.title || 'Untitled application'}</span>
                  </td>
                  {columns.map(c => (
                    <td key={c.key} style={{ width: c.width, minWidth: c.width, maxWidth: c.width }} className={cn('overflow-hidden border-b px-3 group-hover/tr:bg-accent/40', c.align === 'right' && 'text-right')}>
                      <div className={cn('flex items-center', c.align === 'right' && 'justify-end')}>{c.cell(s)}</div>
                    </td>
                  ))}
                </tr>
              </SubmissionContextMenu>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const SubmissionTable = memo(SubmissionTableInner);
