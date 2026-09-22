import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { defaultCriteria, parseCriteria } from '@project/shared/scoring';
import { assertManager, getActor } from '@project/shared/server/members';
import { num, str } from '@project/shared/server/sql';

/**
 * Rubrics: the weighted criteria reviewers score against. Criteria are
 * sanitised on the way in (scales, weights, level labels), and a rubric a
 * stage still scores with, or that finished reviews were scored on, can't be
 * deleted out from under them.
 */

const criterion = z.object({
  id: z.string().max(40).optional(),
  name: z.string().trim().min(1, 'Name every criterion').max(120, 'Keep criterion names under 120 characters'),
  description: z.string().max(1000).optional().nullable(),
  weight: z.number().min(0.1, 'Weights must be above zero').max(100),
  min: z.number().int().min(0).max(1),
  max: z.number().int().min(2).max(10),
  levels: z.array(z.object({ score: z.number(), label: z.string().max(80) })).max(11).optional(),
});

const Input = z.object({
  action: z.enum(['create', 'update', 'delete']),
  id: z.string().optional(),
  programId: z.string().optional(),
  name: z.string().trim().min(1, 'Name the rubric').max(80, 'Keep the rubric name under 80 characters').optional(),
  instructions: z.string().max(4000).nullable().optional(),
  criteria: z.array(criterion).min(1, 'A rubric needs at least one criterion').max(25, 'Up to 25 criteria per rubric').optional(),
  askRecommendation: z.boolean().optional(),
});

const newCriterionId = () => `c_${Math.random().toString(36).slice(2, 10)}`;

function clean(criteria: z.infer<typeof criterion>[]) {
  const seen = new Set<string>();
  const withIds = criteria.map(c => {
    let id = c.id && /^[A-Za-z0-9_-]+$/.test(c.id) ? c.id : newCriterionId();
    if (seen.has(id)) id = newCriterionId();
    seen.add(id);
    // Labels only for scores on the scale, and only the ones someone actually wrote.
    const levels = (c.levels ?? []).filter(l => l.label.trim() && l.score >= c.min && l.score <= c.max).map(l => ({ score: l.score, label: l.label.trim() }));
    return { ...c, id, description: c.description ?? '', levels };
  });
  return parseCriteria(withIds);
}

export default createEndpoint({
  description: 'Create, edit or delete a review rubric',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ id: z.string().nullable() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw ?? {});
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Check the rubric', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);

    if (input.action === 'create') {
      if (!input.programId) throw new ZiteError('Which program is this rubric for?', 'BAD_REQUEST');
      const { rows } = await zite.sql({ query: `SELECT id FROM "Programs" WHERE id::text = $1`, params: [input.programId] });
      if (!rows[0]) throw new ZiteError('That program no longer exists', 'NOT_FOUND');
      const created = await zite.rubrics.create({
        record: {
          name: input.name ?? 'New scorecard',
          programId: input.programId,
          instructions: input.instructions || null,
          criteria: JSON.stringify(input.criteria ? clean(input.criteria) : defaultCriteria()),
          askRecommendation: input.askRecommendation ?? true,
        },
      });
      return { id: created.id };
    }

    if (!input.id) throw new ZiteError('Which rubric?', 'BAD_REQUEST');
    const { rows } = await zite.sql({ query: `SELECT * FROM "Rubrics" WHERE id::text = $1`, params: [input.id] });
    const rubric = rows[0];
    if (!rubric) throw new ZiteError('That rubric no longer exists', 'NOT_FOUND');

    if (input.action === 'delete') {
      const { rows: stages } = await zite.sql({ query: `SELECT "name" FROM "Stages" WHERE "rubricId" = $1 ORDER BY COALESCE("position", 0) ASC`, params: [input.id] });
      if (stages.length) {
        const names = stages.map(s => str(s.name) || 'a stage');
        const list = names.length === 1 ? `the ${names[0]} stage` : `the ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} stages`;
        throw new ZiteError(`“${str(rubric.name) || 'This rubric'}” is used by ${list}. Choose a different rubric there first.`, 'CONFLICT');
      }
      const { rows: scored } = await zite.sql({ query: `SELECT COUNT(*) AS n FROM "Reviews" WHERE "rubricId" = $1 AND "status" = 'Submitted'`, params: [input.id] });
      const n = num(scored[0]?.n);
      if (n > 0) throw new ZiteError(`${n} finished review${n === 1 ? ' was' : 's were'} scored with “${str(rubric.name) || 'this rubric'}”, so it has to stay to show those scores.`, 'CONFLICT');
      await zite.rubrics.delete({ id: input.id });
      return { id: null };
    }

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.instructions !== undefined) patch.instructions = input.instructions || null;
    if (input.askRecommendation !== undefined) patch.askRecommendation = input.askRecommendation;
    if (input.criteria !== undefined) patch.criteria = JSON.stringify(clean(input.criteria));
    if (Object.keys(patch).length) await zite.rubrics.update({ id: input.id, record: patch as never });
    return { id: input.id };
  },
});
