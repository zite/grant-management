import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertManager, getActor } from '@project/shared/server/members';

const Input = z.object({
  action: z.enum(['create', 'update', 'delete']),
  id: z.string().optional(),
  name: z.string().trim().min(1).max(60).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  description: z.string().max(200).nullable().optional(),
  programId: z.string().nullable().optional(),
});

export default createEndpoint({
  description: 'Create, rename, recolor or delete a label',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ id: z.string().nullable() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid label', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);
    if (input.action === 'create') {
      if (!input.name) throw new ZiteError('Name the label', 'BAD_REQUEST');
      const { rows } = await zite.sql({ query: `SELECT id FROM "Labels" WHERE LOWER("name") = LOWER($1) AND COALESCE("programId", '') = $2 LIMIT 1`, params: [input.name, input.programId ?? ''] });
      if (rows[0]) return { id: String(rows[0].id) };
      const created = await zite.labels.create({ record: { name: input.name, color: input.color ?? '#8b5cf6', description: input.description ?? null, programId: input.programId ?? null } });
      return { id: created.id };
    }
    if (!input.id) throw new ZiteError('Which label?', 'BAD_REQUEST');
    const existing = await zite.labels.findOne({ id: input.id });
    if (!existing) throw new ZiteError('Label not found', 'NOT_FOUND');
    if (input.action === 'delete') {
      const { rows } = await zite.sql({ query: `SELECT id FROM "SubmissionLabels" WHERE "labelId" = $1`, params: [input.id] });
      for (const r of rows) await zite.submissionLabels.delete({ id: String(r.id) });
      await zite.labels.delete({ id: input.id });
      return { id: null };
    }
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.color !== undefined) patch.color = input.color;
    if (input.description !== undefined) patch.description = input.description;
    if (input.programId !== undefined) patch.programId = input.programId;
    await zite.labels.update({ id: input.id, record: patch as never });
    return { id: input.id };
  },
});
