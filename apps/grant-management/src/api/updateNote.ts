import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertManager, getActor } from '@project/shared/server/members';
import { mentionedIds, notify, plainMentions } from '@project/shared/server/notify';
import { ref, str } from '@project/shared/server/sql';

/** Edit or delete a note. Only its author can edit it; admins can also delete anyone's. */
const Input = z.object({
  id: z.string().min(1),
  body: z.string().trim().min(1, 'A note can’t be empty — delete it instead').max(10000, 'Notes can be up to 10,000 characters').optional(),
  delete: z.boolean().optional(),
});

export default createEndpoint({
  description: 'Edit or delete an internal note',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ id: z.string(), deleted: z.boolean(), body: z.string().nullable(), editedAt: z.string().nullable() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid note', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);

    const { rows } = await zite.sql({
      query: `SELECT n.*, s."title" AS "submissionTitle", s."programId" FROM "Notes" n LEFT JOIN "Submissions" s ON s.id::text = n."submissionId" WHERE n.id::text = $1`,
      params: [input.id],
    });
    const note = rows[0];
    if (!note) throw new ZiteError('That note was already deleted', 'NOT_FOUND');
    const mine = ref(note.authorId) === actor.id;

    if (input.delete) {
      if (!mine && actor.role !== 'Admin') throw new ZiteError('You can only delete your own notes', 'FORBIDDEN');
      await zite.notes.delete({ id: input.id });
      return { id: input.id, deleted: true, body: null, editedAt: null };
    }

    if (!mine) throw new ZiteError('You can only edit your own notes', 'FORBIDDEN');
    if (input.body === undefined) throw new ZiteError('Nothing to change', 'BAD_REQUEST');
    const now = new Date().toISOString();
    await zite.notes.update({ id: input.id, record: { body: input.body, editedAt: now } });

    // People newly mentioned by the edit hear about it; people already mentioned aren't pinged twice.
    const before = new Set(mentionedIds(str(note.body) ?? ''));
    const added = mentionedIds(input.body).filter(id => !before.has(id));
    if (added.length && note.submissionId) {
      const { rows: people } = await zite.sql({
        query: `SELECT id::text AS id FROM "Members" WHERE id::text = ANY($1::text[]) AND "role" IN ('Admin', 'Manager') AND COALESCE("status", '') <> 'Deactivated'`,
        params: [added],
      });
      await notify({
        recipientIds: people.map(p => String(p.id)),
        type: 'mention',
        title: `${actor.name} mentioned you on ${str(note.submissionTitle) || 'a submission'}`,
        body: plainMentions(input.body).slice(0, 280),
        submissionId: String(note.submissionId),
        programId: ref(note.programId),
        actorId: actor.id,
      });
    }
    return { id: input.id, deleted: false, body: input.body, editedAt: now };
  },
});
