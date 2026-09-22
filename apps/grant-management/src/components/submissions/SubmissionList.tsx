import { ChevronRight } from 'lucide-react';
import { memo, type MouseEvent } from 'react';
import { cn } from '@project/components/lib/utils';
import type { DisplayProperty, Grouping } from '../../lib/constants';
import type { Submission } from '../../lib/types';
import type { SubmissionGroup } from '../../lib/view';
import { useWorkspace } from '../../lib/workspace';
import { MemberAvatar, UnassignedAvatar } from '../primitives/Avatar';
import { OutcomeGlyph, StageGlyph } from '../primitives/icons';
import { Glyph, LabelDot, Tip } from '../primitives/bits';
import type { PickerKind } from './SubmissionPropertyPicker';
import { SubmissionRow } from './SubmissionRow';

export function GroupIcon({ group, grouping }: { group: SubmissionGroup; grouping: Grouping }) {
  const ws = useWorkspace();
  if (group.stage) return <StageGlyph kind={group.stage.kind} color={group.stage.color} />;
  if (group.status) return group.status === 'Submitted' ? <StageGlyph kind="Review" color="#6943d0" /> : <OutcomeGlyph status={group.status} />;
  if (grouping === 'program' && group.programId) {
    const p = ws.programById.get(group.programId);
    return <Glyph icon={p?.icon} color={p?.color} size={16} className="text-[10px]" />;
  }
  if (grouping === 'owner') return group.memberId ? <MemberAvatar member={ws.memberById.get(group.memberId)} size={16} /> : <UnassignedAvatar size={16} />;
  if (grouping === 'label') return <LabelDot color={group.color ?? '#8b8d98'} />;
  if (group.color) return <span className="h-2 w-2 rounded-full" style={{ background: group.color }} />;
  return null;
}

type Props = {
  groups: SubmissionGroup[];
  grouping: Grouping;
  properties: Set<DisplayProperty>;
  selection: Set<string>;
  focusedId: string | null;
  multiProgram: boolean;
  activePicker: { id: string; kind: PickerKind } | null;
  collapsed: Set<string>;
  onToggleCollapse: (key: string) => void;
  onPickerChange: (id: string, kind: PickerKind | null) => void;
  onRowClick: (s: Submission, e: MouseEvent) => void;
  onToggleSelect: (s: Submission, e: MouseEvent) => void;
  onHover: (s: Submission) => void;
  getTargets: (s: Submission) => Submission[];
  onSelectGroup: (g: SubmissionGroup) => void;
};

function SubmissionListInner(props: Props) {
  const { groups, grouping, collapsed, selection, focusedId, activePicker } = props;
  const selecting = selection.size > 0;
  const single = grouping === 'none' || groups.length === 0;
  return (
    <div role="grid" aria-label="Submissions" className="pb-24">
      {groups.map(group => {
        const isCollapsed = collapsed.has(group.key);
        return (
          <section key={group.key} aria-label={group.label}>
            {!single && (
              <div
                className="group/header sticky top-0 z-10 flex h-9 items-center gap-2 border-b bg-subtle/95 pl-2 pr-3 backdrop-blur supports-[backdrop-filter]:bg-subtle/80"
                onClick={() => props.onToggleCollapse(group.key)}
              >
                <button type="button" aria-label={isCollapsed ? `Expand ${group.label}` : `Collapse ${group.label}`} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
                  <ChevronRight className={cn('h-3.5 w-3.5 transition-transform duration-150', !isCollapsed && 'rotate-90')} />
                </button>
                <span className="flex h-5 items-center">
                  <GroupIcon group={group} grouping={grouping} />
                </span>
                <span className="truncate text-[13px] font-medium">{group.label}</span>
                <span className="text-[12.5px] tabular-nums text-muted-foreground">{group.submissions.length}</span>
                {group.hint && <span className="hidden text-xs tabular-nums text-muted-foreground/80 sm:inline">· {group.hint} requested</span>}
                <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/header:opacity-100">
                  <Tip label={`Select everything in ${group.label}`}>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        props.onSelectGroup(group);
                      }}
                      className="rounded px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      Select
                    </button>
                  </Tip>
                </div>
              </div>
            )}
            {!isCollapsed &&
              group.submissions.map(s => (
                <SubmissionRow
                  key={`${group.key}:${s.id}`}
                  submission={s}
                  properties={props.properties}
                  selected={selection.has(s.id)}
                  focused={focusedId === s.id}
                  selecting={selecting}
                  multiProgram={props.multiProgram}
                  activePicker={activePicker?.id === s.id ? activePicker.kind : null}
                  onPickerChange={props.onPickerChange}
                  onClick={props.onRowClick}
                  onToggleSelect={props.onToggleSelect}
                  onHover={props.onHover}
                  getTargets={props.getTargets}
                />
              ))}
          </section>
        );
      })}
    </div>
  );
}

export const SubmissionList = memo(SubmissionListInner);
