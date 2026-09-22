import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '@project/shared/server/members';

/**
 * Read, archive and snooze inbox items. Only ever touches the signed-in
 * member's own notifications: ids that belong to someone else are ignored.
 *
 * `all: true` works on the live inbox instead of a list of ids —
 *   read    → every unread item becomes read
 *   archive → every READ item is archived (unread ones are never swept away)
 */

const Input = z.object({
  action: z.enum(['read', 'unread', 'archive', 'unarchive', 'snooze', 'unsnooze']),
  ids: z.array(z.string().min(1)).max(500).optional(),
  all: z.boolean().optional(),
  until: z.string().optional(),
});

const LIVE = `"archivedAt" IS NULL AND ("snoozedUntil" IS NULL OR "snoozedUntil" <= NOW())`;

export default createEndpoint({
  description: 'Mark notifications read or unread, archive, unarchive, snooze or unsnooze them',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ updated: z.number(), ids: z.array(z.string()) }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError('That inbox action isn’t recognised', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);

    if (!input.all && !input.ids?.length) return { updated: 0, ids: [] };
    if (input.all && input.action !== 'read' && input.action !== 'archive') {
      throw new ZiteError('Only “mark all read” and “archive all read” work on the whole inbox', 'BAD_REQUEST');
    }

    let until: string | null = null;
    if (input.action === 'snooze') {
      const t = input.until ? Date.parse(input.until) : NaN;
      if (!Number.isFinite(t)) throw new ZiteError('Choose when this should come back', 'BAD_REQUEST');
      if (t <= Date.now()) throw new ZiteError('Snooze until a time in the future', 'BAD_REQUEST');
      if (t > Date.now() + 366 * 86_400_000) throw new ZiteError('Snooze for less than a year', 'BAD_REQUEST');
      until = new Date(t).toISOString();
    }

    // Only rows that would actually change, so the count reflects real work.
    const needs: Record<typeof input.action, string> = {
      read: `"readAt" IS NULL`,
      unread: `"readAt" IS NOT NULL`,
      archive: `"archivedAt" IS NULL`,
      unarchive: `"archivedAt" IS NOT NULL`,
      snooze: `true`,
      unsnooze: `"snoozedUntil" IS NOT NULL`,
    };
    const scope = input.all
      ? input.action === 'read'
        ? `${LIVE}`
        : `${LIVE} AND "readAt" IS NOT NULL`
      : `id::text = ANY($2::text[])`;

    const { rows } = await zite.sql({
      query: `SELECT id FROM "Notifications" WHERE "recipientId" = $1 AND ${scope} AND ${needs[input.action]} LIMIT 1000`,
      params: input.all ? [actor.id] : [actor.id, input.ids],
    });
    const ids = rows.map(r => String(r.id));
    const now = new Date().toISOString();
    const patch: Record<string, unknown> =
      input.action === 'read' ? { readAt: now }
      : input.action === 'unread' ? { readAt: null }
      : input.action === 'archive' ? { archivedAt: now, snoozedUntil: null }
      : input.action === 'unarchive' ? { archivedAt: null }
      : input.action === 'snooze' ? { snoozedUntil: until }
      : { snoozedUntil: null };

    // No bulk update on the platform: a few at a time keeps "mark all read" quick without flooding it.
    for (let i = 0; i < ids.length; i += 10) {
      await Promise.all(ids.slice(i, i + 10).map(id => zite.notifications.update({ id, record: patch as never })));
    }
    return { updated: ids.length, ids };
  },
});
