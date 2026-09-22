import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertManager, getActor } from '@project/shared/server/members';

/**
 * Permanently delete submissions and everything hanging off them. The UI
 * steers people to Withdraw or Decline first; this is for spam, tests and
 * duplicates.
 */
const CHILD_TABLES = ['Reviews', 'Notes', 'Messages', 'Tasks', 'Payments', 'Attachments', 'SubmissionLabels', 'Activity', 'Notifications'] as const;
const ACCESSOR = {
  Reviews: 'reviews', Notes: 'notes', Messages: 'messages', Tasks: 'tasks', Payments: 'payments', Attachments: 'attachments',
  SubmissionLabels: 'submissionLabels', Activity: 'activity', Notifications: 'notifications',
} as const;

export default createEndpoint({
  description: 'Permanently delete submissions and their reviews, messages, tasks and history',
  authenticated: true,
  inputSchema: z.object({ ids: z.array(z.string()).min(1).max(200) }),
  outputSchema: z.object({ deleted: z.number() }),
  execute: async ({ input, context }) => {
    const actor = await getActor(context);
    assertManager(actor);
    const ids = [...new Set((input.ids ?? []).filter(i => typeof i === 'string'))];
    const { rows } = await zite.sql({ query: `SELECT id::text AS id FROM "Submissions" WHERE id::text = ANY($1::text[])`, params: [ids] });
    if (!rows.length) throw new ZiteError('Nothing to delete', 'NOT_FOUND');
    const found = rows.map(r => String(r.id));
    for (const table of CHILD_TABLES) {
      const { rows: children } = await zite.sql({ query: `SELECT id::text AS id FROM "${table}" WHERE "submissionId" = ANY($1::text[])`, params: [found] });
      const client = zite[ACCESSOR[table]] as { delete: (a: { id: string }) => Promise<unknown> };
      for (const c of children) await client.delete({ id: String(c.id) });
    }
    for (const id of found) await zite.submissions.delete({ id });
    return { deleted: found.length };
  },
});
