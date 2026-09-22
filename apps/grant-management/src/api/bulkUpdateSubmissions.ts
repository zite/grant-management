import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { logActivity } from '@project/shared/server/activity';
import { assertManager, getActor } from '@project/shared/server/members';
import { notify } from '@project/shared/server/notify';
import { moveToStage } from '@project/shared/server/pipeline';
import { ref } from '@project/shared/server/sql';

const Input = z.object({
  ids: z.array(z.string()).min(1).max(500),
  /** A stage id, or a stage NAME when the selection spans programs (each program's stage of that name). */
  stageId: z.string().optional(),
  stageName: z.string().optional(),
  ownerId: z.string().nullable().optional(),
  addLabelIds: z.array(z.string()).optional(),
  removeLabelIds: z.array(z.string()).optional(),
  awardStatus: z.enum(['Pending', 'Active', 'Completed', 'Cancelled']).optional(),
});

export default createEndpoint({
  description: 'Apply one change to many submissions at once',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ updated: z.number(), skipped: z.number(), assigned: z.number() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid update', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);

    const { rows } = await zite.sql({
      query: `SELECT id, "programId", "applicantId", "ownerId", "stageId", "status", "title" FROM "Submissions" WHERE id::text = ANY($1::text[])`,
      params: [input.ids],
    });
    let updated = 0;
    let skipped = 0;
    let assigned = 0;

    if (input.ownerId !== undefined) {
      if (input.ownerId) {
        const { rows: m } = await zite.sql({ query: `SELECT id FROM "Members" WHERE id::text = $1 AND "role" IN ('Admin', 'Manager')`, params: [input.ownerId] });
        if (!m.length) throw new ZiteError('Owners must be admins or managers', 'BAD_REQUEST');
      }
      const changing = rows.filter(r => ref(r.ownerId) !== (input.ownerId ?? null));
      for (const r of changing) await zite.submissions.update({ id: String(r.id), record: { ownerId: input.ownerId ?? null } });
      await logActivity(changing.map(r => ({ type: 'owner_changed' as const, submissionId: String(r.id), programId: String(r.programId), applicantId: ref(r.applicantId), actorId: actor.id, actorType: 'Member' as const, data: { from: ref(r.ownerId), to: input.ownerId ?? null } })));
      if (input.ownerId && input.ownerId !== actor.id && changing.length) {
        await notify({
          recipientIds: [input.ownerId],
          type: 'owner_assigned',
          title: changing.length === 1 ? `${actor.name} made you the owner of ${String(changing[0].title || 'a submission')}` : `${actor.name} made you the owner of ${changing.length} submissions`,
          submissionId: changing.length === 1 ? String(changing[0].id) : null,
          actorId: actor.id,
        });
      }
      updated = Math.max(updated, changing.length);
    }

    if (input.addLabelIds?.length || input.removeLabelIds?.length) {
      const { rows: existing } = await zite.sql({ query: `SELECT id, "submissionId", "labelId" FROM "SubmissionLabels" WHERE "submissionId" = ANY($1::text[])`, params: [input.ids] });
      const have = new Set(existing.map(e => `${e.submissionId}:${e.labelId}`));
      const toAdd = rows.flatMap(r => (input.addLabelIds ?? []).filter(l => !have.has(`${r.id}:${l}`)).map(l => ({ name: 'label', submissionId: String(r.id), labelId: l })));
      if (toAdd.length) await zite.submissionLabels.bulkCreate({ records: toAdd });
      const toRemove = existing.filter(e => (input.removeLabelIds ?? []).includes(String(e.labelId)));
      for (const e of toRemove) await zite.submissionLabels.delete({ id: String(e.id) });
      await logActivity(rows.map(r => ({
        type: 'labels_changed' as const, submissionId: String(r.id), programId: String(r.programId), applicantId: ref(r.applicantId), actorId: actor.id, actorType: 'Member' as const,
        data: { added: (input.addLabelIds ?? []).filter(l => !have.has(`${r.id}:${l}`)), removed: toRemove.filter(e => String(e.submissionId) === String(r.id)).map(e => String(e.labelId)) },
      })).filter(e => (e.data.added as string[]).length || (e.data.removed as string[]).length));
      updated = Math.max(updated, rows.length);
    }

    if (input.awardStatus) {
      const accepted = rows.filter(r => r.status === 'Accepted');
      for (const r of accepted) await zite.submissions.update({ id: String(r.id), record: { awardStatus: input.awardStatus } });
      await logActivity(accepted.map(r => ({ type: 'award_updated' as const, submissionId: String(r.id), programId: String(r.programId), applicantId: ref(r.applicantId), actorId: actor.id, actorType: 'Member' as const, data: { field: 'awardStatus', to: input.awardStatus } })));
      skipped += rows.length - accepted.length;
      updated = Math.max(updated, accepted.length);
    }

    if (input.stageId || input.stageName) {
      const inPipeline = rows.filter(r => r.status !== 'Draft');
      skipped += rows.length - inPipeline.length;
      const byProgram = new Map<string, string[]>();
      for (const r of inPipeline) {
        const k = String(r.programId);
        if (!byProgram.has(k)) byProgram.set(k, []);
        byProgram.get(k)!.push(String(r.id));
      }
      for (const [programId, ids] of byProgram) {
        let stageId = input.stageId;
        const { rows: st } = await zite.sql({ query: `SELECT id, "name", "programId" FROM "Stages" WHERE "programId" = $1`, params: [programId] });
        if (!stageId || !st.some(s => String(s.id) === stageId)) {
          const named = input.stageName ?? (await zite.sql({ query: `SELECT "name" FROM "Stages" WHERE id::text = $1`, params: [input.stageId ?? ''] })).rows[0]?.name;
          stageId = st.find(s => String(s.name).toLowerCase() === String(named ?? '').toLowerCase())?.id as string | undefined;
        }
        if (!stageId) {
          skipped += ids.length;
          continue;
        }
        const res = await moveToStage({ submissionIds: ids, stageId: String(stageId), actor });
        updated = Math.max(updated, res.moved);
        assigned += res.assigned;
      }
    }

    return { updated, skipped, assigned };
  },
});
