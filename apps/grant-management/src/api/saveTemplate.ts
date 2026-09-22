import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertManager, getActor } from '@project/shared/server/members';
import { str } from '@project/shared/server/sql';

/**
 * Email templates. A template either sends itself on a trigger (a submission
 * arriving, a decision being released, a task requested, a deadline nearing)
 * or is picked by hand in the composer (Manual).
 *
 * `programId` null or '' means every program; a program-scoped template wins
 * over an organization-wide one with the same trigger.
 *
 *   create    — name, subject and body required
 *   update    — a patch: only the fields sent change (so a switch sends just `enabled`)
 *   duplicate — copies `id`; any of name, programId, trigger, enabled sent override the copy.
 *               A copy of an automatic template starts switched off unless `enabled` is sent.
 *   delete    — removes `id`
 */

const TRIGGERS = ['Manual', 'Submission received', 'Accepted', 'Declined', 'Waitlisted', 'Task requested', 'Draft reminder'] as const;

const Input = z.object({
  action: z.enum(['create', 'update', 'delete', 'duplicate']),
  id: z.string().optional(),
  name: z.string().max(120).optional(),
  subject: z.string().max(200).optional(),
  body: z.string().max(20000).optional(),
  trigger: z.enum(TRIGGERS).optional(),
  programId: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

async function assertProgram(programId: string | null | undefined) {
  if (!programId) return null;
  const { rows } = await zite.sql({ query: `SELECT id FROM "Programs" WHERE id::text = $1 LIMIT 1`, params: [programId] });
  if (!rows[0]) throw new ZiteError('That program no longer exists', 'BAD_REQUEST');
  return programId;
}

const required = (value: string | undefined, message: string) => {
  const t = (value ?? '').trim();
  if (!t) throw new ZiteError(message, 'BAD_REQUEST');
  return t;
};

export default createEndpoint({
  description: 'Create, update, duplicate or delete an email template',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ id: z.string() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Check the template and try again', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);

    const nextPosition = async () => {
      const { rows } = await zite.sql({ query: `SELECT COALESCE(MAX("position"), -1) AS p FROM "EmailTemplates"`, params: [] });
      return Number(rows[0]?.p ?? -1) + 1;
    };

    if (input.action === 'create') {
      const trigger = input.trigger ?? 'Manual';
      const created = await zite.emailTemplates.create({
        record: {
          name: required(input.name, 'Name the template'),
          subject: required(input.subject, 'Add a subject line'),
          body: required(input.body, 'Write the message'),
          trigger,
          programId: await assertProgram(input.programId),
          enabled: input.enabled ?? true,
          position: await nextPosition(),
        },
      });
      return { id: created.id };
    }

    if (!input.id) throw new ZiteError('Which template?', 'BAD_REQUEST');
    const { rows } = await zite.sql({ query: `SELECT * FROM "EmailTemplates" WHERE id::text = $1 LIMIT 1`, params: [input.id] });
    const existing = rows[0];
    if (!existing) throw new ZiteError('That template no longer exists', 'NOT_FOUND');

    if (input.action === 'delete') {
      await zite.emailTemplates.delete({ id: input.id });
      return { id: input.id };
    }

    if (input.action === 'duplicate') {
      const trigger = input.trigger ?? ((str(existing.trigger) || 'Manual') as (typeof TRIGGERS)[number]);
      const baseName = str(existing.name) || 'Template';
      const created = await zite.emailTemplates.create({
        record: {
          name: input.name?.trim() || `${baseName} (copy)`.slice(0, 120),
          subject: input.subject?.trim() || str(existing.subject) || '',
          body: input.body?.trim() ? input.body : str(existing.body) || '',
          trigger,
          programId: input.programId !== undefined ? await assertProgram(input.programId) : str(existing.programId) || null,
          // Two live templates for one trigger would be confusing; the copy waits to be switched on.
          enabled: input.enabled ?? (trigger === 'Manual' ? true : false),
          position: await nextPosition(),
        },
      });
      return { id: created.id };
    }

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = required(input.name, 'Name the template');
    if (input.subject !== undefined) patch.subject = required(input.subject, 'Add a subject line');
    if (input.body !== undefined) patch.body = required(input.body, 'Write the message');
    if (input.trigger !== undefined) patch.trigger = input.trigger;
    if (input.programId !== undefined) patch.programId = await assertProgram(input.programId);
    if (input.enabled !== undefined) patch.enabled = input.enabled;
    if (Object.keys(patch).length) await zite.emailTemplates.update({ id: input.id, record: patch as never });
    return { id: input.id };
  },
});
