import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertManager, getActor } from '@project/shared/server/members';

const Input = z.object({
  action: z.enum(['create', 'update', 'delete']),
  id: z.string().optional(),
  name: z.string().trim().min(1).max(80).optional(),
  scope: z.enum(['Personal', 'Shared']).optional(),
  programId: z.string().nullable().optional(),
  config: z.string().max(20000).optional(),
});

/** Saved submission views. Personal views belong to their owner; anyone on staff can edit a shared view. */
export default createEndpoint({
  description: 'Create, update or delete a saved submission view',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ id: z.string().nullable() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid view', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);
    if (input.config) {
      try {
        JSON.parse(input.config);
      } catch {
        throw new ZiteError('View settings are malformed', 'BAD_REQUEST');
      }
    }
    if (input.action === 'create') {
      if (!input.name) throw new ZiteError('Name the view', 'BAD_REQUEST');
      const { rows } = await zite.sql({ query: `SELECT COALESCE(MAX("position"), 0) AS p FROM "Views"`, params: [] });
      const created = await zite.views.create({
        record: { name: input.name, ownerId: actor.id, scope: input.scope ?? 'Personal', programId: input.programId ?? null, config: input.config ?? '{}', position: Number(rows[0]?.p ?? 0) + 1 },
      });
      return { id: created.id };
    }
    if (!input.id) throw new ZiteError('Which view?', 'BAD_REQUEST');
    const view = await zite.views.findOne({ id: input.id });
    if (!view || (view.scope !== 'Shared' && view.ownerId !== actor.id)) throw new ZiteError('View not found', 'NOT_FOUND');
    if (input.action === 'delete') {
      if (view.ownerId !== actor.id && actor.role !== 'Admin') throw new ZiteError("Only the person who made this view, or an admin, can delete it", 'FORBIDDEN');
      await zite.views.delete({ id: input.id });
      return { id: null };
    }
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.scope !== undefined) patch.scope = input.scope;
    if (input.programId !== undefined) patch.programId = input.programId;
    if (input.config !== undefined) patch.config = input.config;
    await zite.views.update({ id: input.id, record: patch as never });
    return { id: input.id };
  },
});
