import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertManager, getActor } from '@project/shared/server/members';

/** Opening a submission's conversation marks the applicant's messages as read for the whole team. */
const Input = z.object({ submissionId: z.string().min(1) });

export default createEndpoint({
  description: 'Mark the applicant’s unread messages on a submission as read',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ marked: z.number() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError('Which submission?', 'BAD_REQUEST');
    const actor = await getActor(context);
    assertManager(actor);
    const { rows } = await zite.sql({
      query: `SELECT id::text AS id FROM "Messages" WHERE "submissionId" = $1 AND "direction" = 'Inbound' AND "readAt" IS NULL`,
      params: [parsed.data.submissionId],
    });
    const now = new Date().toISOString();
    for (const r of rows) await zite.messages.update({ id: String(r.id), record: { readAt: now } });
    return { marked: rows.length };
  },
});
