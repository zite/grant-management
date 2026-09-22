import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { useAppActions } from '../../lib/app-actions';
import { useSubmissionActions } from '../../lib/mutations';
import type { Submission } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { LabelPicker, OwnerPicker, StagePicker } from '../pickers/pickers';

export type PickerKind = 'stage' | 'owner' | 'labels';

function common<T>(items: Submission[], get: (s: Submission) => T): T | undefined {
  if (!items.length) return undefined;
  const first = get(items[0]);
  return items.every(i => get(i) === first) ? first : undefined;
}

/**
 * Wires a property picker to one submission or a whole selection. Picking a
 * decision from the stage picker opens the decision flow instead of writing
 * straight away — a decision always gets a moment of confirmation.
 */
export function SubmissionPropertyPicker({ submissions, kind, trigger, open, onOpenChange, align = 'start' }: {
  submissions: Submission[];
  kind: PickerKind;
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'center' | 'end';
}) {
  const ws = useWorkspace();
  const actions = useSubmissionActions();
  const app = useAppActions();
  const single = submissions.length === 1 ? submissions[0] : null;
  const programIds = [...new Set(submissions.map(s => s.programId))];
  const programId = programIds.length === 1 ? programIds[0] : null;
  const pass = { trigger, open, onOpenChange, align };

  switch (kind) {
    case 'stage':
      return (
        <StagePicker
          {...pass}
          programId={programId ?? submissions[0]?.programId ?? null}
          value={single?.status === 'Submitted' ? single.stageId : common(submissions, s => s.stageId) ?? null}
          onChange={v => {
            if (!v) return;
            if (v.startsWith('decision:')) {
              app.openDecision(submissions, v.slice('decision:'.length) as 'Accepted' | 'Waitlisted' | 'Declined');
              return;
            }
            const decided = submissions.filter(s => s.status !== 'Submitted');
            if (decided.length === submissions.length) {
              toast.message(submissions.length === 1 ? 'Reopen the decision first to move it back into the pipeline' : 'These are decided — reopen them first to move them');
              return;
            }
            const stage = ws.stageById.get(v);
            if (single) actions.update(single, { stageId: v }, { success: `Moved ${single.reference} to ${stage?.name ?? 'stage'}` }).catch(() => undefined);
            else actions.bulkUpdate(submissions.filter(s => s.status === 'Submitted'), programId ? { stageId: v } : { stageId: v, stageName: stage?.name }, { success: `Moved to ${stage?.name}` });
          }}
        />
      );
    case 'owner':
      return (
        <OwnerPicker
          {...pass}
          value={(common(submissions, s => s.ownerId) ?? null) as string | null}
          onChange={v => {
            if (single) actions.update(single, { ownerId: v }).catch(() => undefined);
            else actions.bulkUpdate(submissions, { ownerId: v }, { success: v ? `Owner set on ${submissions.length} submissions` : 'Owner removed' });
          }}
        />
      );
    case 'labels': {
      const shared = ws.labels.map(l => l.id).filter(id => submissions.every(s => s.labelIds.includes(id)));
      return (
        <LabelPicker
          {...pass}
          programId={programId}
          value={single ? single.labelIds : shared}
          onChange={next => {
            if (single) return actions.setLabels(single, next);
            const added = next.filter(id => !shared.includes(id));
            const removed = shared.filter(id => !next.includes(id));
            return actions.bulkUpdate(submissions, { addLabelIds: added, removeLabelIds: removed }, { success: 'Labels updated' });
          }}
        />
      );
    }
  }
}
