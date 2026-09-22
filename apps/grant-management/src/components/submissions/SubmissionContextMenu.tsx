import { Copy, Link2, Mail, PanelRight, RotateCcw, SquareArrowOutUpRight, Tag, Trash2, UserRound, Users, Megaphone } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ContextMenu, ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger,
} from '@project/components/ui/context-menu';
import { useAppActions } from '../../lib/app-actions';
import { copyText } from '../../lib/clipboard';
import { appUrl } from '../../lib/format';
import { useSubmissionActions } from '../../lib/mutations';
import type { Submission } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { MemberAvatar, UnassignedAvatar } from '../primitives/Avatar';
import { OutcomeGlyph, StageGlyph } from '../primitives/icons';
import { LabelDot } from '../primitives/bits';

const item = 'gap-2 text-[13px] h-8';
const subContent = 'max-h-[360px] min-w-[200px] overflow-y-auto';

/**
 * Right-click on any submission. When the row is part of a selection, every
 * action applies to the whole selection.
 */
export function SubmissionContextMenu({ getTargets, children }: { getTargets: () => Submission[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <ContextMenu onOpenChange={setOpen}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-60 shadow-lg" onClick={e => e.stopPropagation()}>
        {open && <MenuBody targets={getTargets()} />}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function MenuBody({ targets }: { targets: Submission[] }) {
  const ws = useWorkspace();
  const actions = useSubmissionActions();
  const app = useAppActions();
  const navigate = useNavigate();
  if (!targets.length) return null;
  const single = targets.length === 1 ? targets[0] : null;
  const programIds = [...new Set(targets.map(t => t.programId))];
  const programId = programIds.length === 1 ? programIds[0] : null;
  const inPipeline = targets.filter(t => t.status === 'Submitted');
  const decided = targets.filter(t => ['Accepted', 'Declined', 'Waitlisted'].includes(t.status));
  const unreleased = decided.filter(t => !t.notifiedAt);

  return (
    <>
      {targets.length > 1 && <div className="px-2 pb-1 pt-1.5 text-2xs font-medium text-muted-foreground">{targets.length} submissions selected</div>}

      {programId && inPipeline.length > 0 && (
        <ContextMenuSub>
          <ContextMenuSubTrigger className={item}>
            <StageGlyph kind="Review" color="#6943d0" /> Move to stage
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className={subContent}>
            {ws.stagesFor(programId).map((s, i) => (
              <ContextMenuItem key={s.id} className={item} onSelect={() => (single ? actions.update(single, { stageId: s.id }).catch(() => undefined) : actions.bulkUpdate(inPipeline, { stageId: s.id }, { success: `Moved to ${s.name}` }))}>
                <StageGlyph kind={s.kind} color={s.color} /> {s.name}
                <ContextMenuShortcut>{i + 1}</ContextMenuShortcut>
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}

      <ContextMenuSub>
        <ContextMenuSubTrigger className={item}>
          <OutcomeGlyph status="Accepted" /> Decide
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className={subContent}>
          {(['Accepted', 'Waitlisted', 'Declined'] as const).map(d => (
            <ContextMenuItem key={d} className={item} onSelect={() => app.openDecision(targets, d)}>
              <OutcomeGlyph status={d} /> {d === 'Accepted' ? 'Accept…' : d === 'Waitlisted' ? 'Waitlist…' : 'Decline…'}
            </ContextMenuItem>
          ))}
          {decided.length > 0 && (
            <>
              <ContextMenuSeparator />
              {unreleased.length > 0 && (
                <ContextMenuItem className={item} onSelect={() => app.openDecision(unreleased, 'release')}>
                  <Megaphone className="h-3.5 w-3.5 text-muted-foreground" /> Release decision{unreleased.length === 1 ? '' : 's'}…
                </ContextMenuItem>
              )}
              <ContextMenuItem className={item} onSelect={() => app.openDecision(decided, 'reopen')}>
                <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" /> Reopen decision{decided.length === 1 ? '' : 's'}…
              </ContextMenuItem>
            </>
          )}
        </ContextMenuSubContent>
      </ContextMenuSub>

      {inPipeline.length > 0 && (
        <ContextMenuItem className={item} onSelect={() => app.openAssignReviewers(inPipeline)}>
          <Users className="h-3.5 w-3.5 text-muted-foreground" /> Assign reviewers…
          <ContextMenuShortcut>R</ContextMenuShortcut>
        </ContextMenuItem>
      )}

      <ContextMenuSub>
        <ContextMenuSubTrigger className={item}>
          <UserRound className="h-3.5 w-3.5 text-muted-foreground" /> Owner
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className={subContent}>
          <ContextMenuItem className={item} onSelect={() => (single ? actions.update(single, { ownerId: ws.me.id }).catch(() => undefined) : actions.bulkUpdate(targets, { ownerId: ws.me.id }))}>
            <MemberAvatar member={ws.memberById.get(ws.me.id)} size={16} /> Assign to me
            <ContextMenuShortcut>I</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem className={item} onSelect={() => (single ? actions.update(single, { ownerId: null }).catch(() => undefined) : actions.bulkUpdate(targets, { ownerId: null }))}>
            <UnassignedAvatar size={16} /> No owner
          </ContextMenuItem>
          <ContextMenuSeparator />
          {ws.managers.filter(m => m.id !== ws.me.id).map(m => (
            <ContextMenuItem key={m.id} className={item} onSelect={() => (single ? actions.update(single, { ownerId: m.id }).catch(() => undefined) : actions.bulkUpdate(targets, { ownerId: m.id }))}>
              <MemberAvatar member={m} size={16} /> <span className="truncate">{m.name}</span>
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger className={item}>
          <Tag className="h-3.5 w-3.5 text-muted-foreground" /> Labels
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className={subContent}>
          {ws.labelsFor(programId).map(l => {
            const on = targets.every(t => t.labelIds.includes(l.id));
            return (
              <ContextMenuCheckboxItem
                key={l.id}
                checked={on}
                className="h-8 gap-2 text-[13px]"
                onSelect={e => {
                  e.preventDefault();
                  if (single) actions.setLabels(single, on ? single.labelIds.filter(x => x !== l.id) : [...single.labelIds, l.id]);
                  else actions.bulkUpdate(targets, on ? { removeLabelIds: [l.id] } : { addLabelIds: [l.id] });
                }}
              >
                <LabelDot color={l.color} /> {l.name}
              </ContextMenuCheckboxItem>
            );
          })}
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuItem className={item} onSelect={() => app.openCompose(targets)}>
        <Mail className="h-3.5 w-3.5 text-muted-foreground" /> Message applicant{targets.length === 1 ? '' : 's'}…
        <ContextMenuShortcut>M</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuSeparator />
      {single ? (
        <>
          <ContextMenuItem className={item} onSelect={() => navigate(`/submission/${single.reference}`)}>
            <SquareArrowOutUpRight className="h-3.5 w-3.5 text-muted-foreground" /> Open
            <ContextMenuShortcut>↵</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem className={item} onSelect={() => app.openPeek(single.reference)}>
            <PanelRight className="h-3.5 w-3.5 text-muted-foreground" /> Peek
            <ContextMenuShortcut>Space</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem className={item} onSelect={() => copyText(single.reference, `Copied ${single.reference}`)}>
            <Copy className="h-3.5 w-3.5 text-muted-foreground" /> Copy reference
          </ContextMenuItem>
          <ContextMenuItem className={item} onSelect={() => copyText(appUrl(`/submission/${single.reference}`), 'Copied link')}>
            <Link2 className="h-3.5 w-3.5 text-muted-foreground" /> Copy link
          </ContextMenuItem>
        </>
      ) : (
        <ContextMenuItem className={item} onSelect={() => copyText(targets.map(t => t.reference).join(', '), `Copied ${targets.length} references`)}>
          <Copy className="h-3.5 w-3.5 text-muted-foreground" /> Copy references
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem
        className={`${item} text-destructive focus:text-destructive`}
        onSelect={async () => {
          const ok = await app.confirm({
            title: single ? `Delete ${single.reference}?` : `Delete ${targets.length} submissions?`,
            description: 'This permanently removes the application with its reviews, messages, tasks, payments and history. To keep a record, decline or withdraw it instead.',
            confirmLabel: 'Delete permanently',
            destructive: true,
          });
          if (ok) actions.remove(targets);
        }}
      >
        <Trash2 className="h-3.5 w-3.5" /> Delete…
      </ContextMenuItem>
    </>
  );
}
