import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { STAGE_KIND_DEFAULT_COLOR } from '@project/shared/programSetup';
import { assertManager, getActor } from '@project/shared/server/members';
import { moveToStage } from '@project/shared/server/pipeline';
import { num, ref, str } from '@project/shared/server/sql';

/**
 * A program's pipeline: add, edit, reorder and delete stages.
 *
 * Deleting a stage that still holds submissions needs somewhere to put them;
 * the ones still in review move through the normal pipeline rules (so a Review
 * destination assigns reviewers), decided ones just change their stage quietly.
 */

const Input = z.object({
  action: z.enum(['create', 'update', 'reorder', 'delete']),
  id: z.string().optional(),
  programId: z.string().optional(),
  name: z.string().trim().min(1, 'Name the stage').max(60, 'Keep stage names under 60 characters').optional(),
  kind: z.enum(['Intake', 'Review', 'Decision']).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour').optional(),
  rubricId: z.string().nullable().optional(),
  description: z.string().max(300, 'Keep the description under 300 characters').nullable().optional(),
  orderedIds: z.array(z.string()).max(50).optional(),
  moveToStageId: z.string().optional(),
});

async function loadStage(id: string) {
  const { rows } = await zite.sql({ query: `SELECT * FROM "Stages" WHERE id::text = $1 LIMIT 1`, params: [id] });
  if (!rows[0]) throw new ZiteError('That stage no longer exists', 'NOT_FOUND');
  return rows[0];
}

async function assertRubricInProgram(rubricId: string | null | undefined, programId: string) {
  if (!rubricId) return;
  const { rows } = await zite.sql({ query: `SELECT "programId" FROM "Rubrics" WHERE id::text = $1`, params: [rubricId] });
  if (!rows[0] || String(rows[0].programId) !== programId) throw new ZiteError('That rubric belongs to a different program', 'BAD_REQUEST');
}

async function normalisePositions(programId: string) {
  const { rows } = await zite.sql({ query: `SELECT id, "position" FROM "Stages" WHERE "programId" = $1 ORDER BY COALESCE("position", 0) ASC, created_at ASC`, params: [programId] });
  for (const [i, r] of rows.entries()) if (num(r.position, -1) !== i) await zite.stages.update({ id: String(r.id), record: { position: i } });
}

export default createEndpoint({
  description: 'Add, edit, reorder or delete a stage in a program pipeline',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ id: z.string().nullable(), moved: z.number() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw ?? {});
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Check the stage details', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);

    if (input.action === 'create') {
      if (!input.programId) throw new ZiteError('Which program is this stage for?', 'BAD_REQUEST');
      if (!input.name) throw new ZiteError('Name the stage', 'BAD_REQUEST');
      const { rows: programs } = await zite.sql({ query: `SELECT id FROM "Programs" WHERE id::text = $1`, params: [input.programId] });
      if (!programs[0]) throw new ZiteError('That program no longer exists', 'NOT_FOUND');
      const kind = input.kind ?? 'Review';
      let rubricId = kind === 'Review' ? input.rubricId ?? null : null;
      await assertRubricInProgram(rubricId, input.programId);
      if (kind === 'Review' && input.rubricId === undefined) {
        // A new review stage scores with the program's first rubric until someone picks another.
        const { rows } = await zite.sql({ query: `SELECT id FROM "Rubrics" WHERE "programId" = $1 ORDER BY created_at ASC LIMIT 1`, params: [input.programId] });
        rubricId = rows[0] ? String(rows[0].id) : null;
      }
      const { rows: pos } = await zite.sql({ query: `SELECT COALESCE(MAX("position"), -1) AS p FROM "Stages" WHERE "programId" = $1`, params: [input.programId] });
      const created = await zite.stages.create({
        record: {
          name: input.name,
          programId: input.programId,
          kind,
          position: num(pos[0]?.p, -1) + 1,
          color: input.color ?? STAGE_KIND_DEFAULT_COLOR[kind],
          rubricId,
          description: input.description ?? null,
        },
      });
      return { id: created.id, moved: 0 };
    }

    if (input.action === 'reorder') {
      if (!input.programId || !input.orderedIds?.length) throw new ZiteError('Send the new stage order', 'BAD_REQUEST');
      const { rows } = await zite.sql({ query: `SELECT id, "position" FROM "Stages" WHERE "programId" = $1`, params: [input.programId] });
      const current = new Set(rows.map(r => String(r.id)));
      const next = [...new Set(input.orderedIds)];
      if (next.length !== current.size || next.some(id => !current.has(id))) {
        throw new ZiteError('The pipeline changed while you were editing. Refresh and try again.', 'CONFLICT');
      }
      const position = new Map(rows.map(r => [String(r.id), num(r.position, -1)]));
      for (const [i, id] of next.entries()) if (position.get(id) !== i) await zite.stages.update({ id, record: { position: i } });
      return { id: null, moved: 0 };
    }

    if (!input.id) throw new ZiteError('Which stage?', 'BAD_REQUEST');
    const stage = await loadStage(input.id);
    const programId = String(stage.programId);

    if (input.action === 'update') {
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.color !== undefined) patch.color = input.color;
      if (input.description !== undefined) patch.description = input.description || null;
      const kind = input.kind ?? (str(stage.kind) || 'Review');
      if (input.kind !== undefined) patch.kind = input.kind;
      if (kind !== 'Review') {
        // Only review stages score; a rubric left on another kind would silently apply if it changed back.
        if (ref(stage.rubricId)) patch.rubricId = null;
      } else if (input.rubricId !== undefined) {
        await assertRubricInProgram(input.rubricId, programId);
        patch.rubricId = input.rubricId;
      } else if (input.kind === 'Review' && !ref(stage.rubricId)) {
        const { rows } = await zite.sql({ query: `SELECT id FROM "Rubrics" WHERE "programId" = $1 ORDER BY created_at ASC LIMIT 1`, params: [programId] });
        if (rows[0]) patch.rubricId = String(rows[0].id);
      }
      if (Object.keys(patch).length) await zite.stages.update({ id: input.id, record: patch as never });
      return { id: input.id, moved: 0 };
    }

    // delete
    const { rows: siblings } = await zite.sql({ query: `SELECT id, "name", "kind" FROM "Stages" WHERE "programId" = $1`, params: [programId] });
    if (siblings.length <= 1) throw new ZiteError('A program needs at least one stage. Add another before deleting this one.', 'CONFLICT');
    const { rows: subs } = await zite.sql({ query: `SELECT id, "status" FROM "Submissions" WHERE "stageId" = $1`, params: [input.id] });
    let moved = 0;
    if (subs.length) {
      const destId = input.moveToStageId;
      if (!destId) throw new ZiteError(`Choose where the ${subs.length} submission${subs.length === 1 ? '' : 's'} in ${str(stage.name) || 'this stage'} should go`, 'BAD_REQUEST');
      const dest = siblings.find(s => String(s.id) === destId);
      if (!dest || destId === input.id) throw new ZiteError('Move them to another stage in the same program', 'BAD_REQUEST');
      // Review assignments follow the submissions into another review round; elsewhere they stay as history.
      if (dest.kind === 'Review') {
        const { rows: reviews } = await zite.sql({ query: `SELECT id FROM "Reviews" WHERE "stageId" = $1`, params: [input.id] });
        for (const r of reviews) await zite.reviews.update({ id: String(r.id), record: { stageId: destId } });
      }
      const inPipeline = subs.filter(s => s.status === 'Submitted').map(s => String(s.id));
      const res = await moveToStage({ submissionIds: inPipeline, stageId: destId, actor: { id: actor.id, name: actor.name } });
      moved += res.moved;
      for (const s of subs.filter(x => x.status !== 'Submitted')) {
        await zite.submissions.update({ id: String(s.id), record: { stageId: destId } });
        moved += 1;
      }
    }
    await zite.stages.delete({ id: input.id });
    await normalisePositions(programId);
    return { id: null, moved };
  },
});
