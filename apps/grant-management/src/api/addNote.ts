import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertManager, getActor } from '@project/shared/server/members';
import { mentionedIds, notify, plainMentions } from '@project/shared/server/notify';
import { iso, num, ref, str } from '@project/shared/server/sql';

/**
 * An internal note on a submission. Applicants never see notes. Anyone
 * mentioned with `@[Name](memberId)` hears about it in their inbox, and the
 * owner hears about every note they didn't write.
 */
const Input = z.object({
  submissionId: z.string().min(1),
  body: z.string().trim().min(1, 'Write something first').max(10000, 'Notes can be up to 10,000 characters'),
});

export default createEndpoint({
  description: 'Add an internal note to a submission, notifying anyone mentioned',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ id: z.string(), authorId: z.string().nullable(), body: z.string(), postedAt: z.string().nullable(), editedAt: z.string().nullable() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid note', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);

    const { rows } = await zite.sql({
      query: `SELECT s.id, s."title", s."number", s."programId", s."applicantId", s."ownerId", p."key" AS "programKey"
              FROM "Submissions" s LEFT JOIN "Programs" p ON p.id::text = s."programId" WHERE s.id::text = $1`,
      params: [input.submissionId],
    });
    const s = rows[0];
    if (!s) throw new ZiteError('Submission not found', 'NOT_FOUND');

    const now = new Date().toISOString();
    const created = await zite.notes.create({
      record: { body: input.body, submissionId: input.submissionId, applicantId: ref(s.applicantId), authorId: actor.id, postedAt: now, editedAt: null },
    });
    await zite.submissions.update({ id: input.submissionId, record: { lastActivityAt: now } }).catch(() => undefined);

    const title = str(s.title) || 'a submission';
    const reference = s.number ? `${str(s.programKey) || 'APP'}-${num(s.number)}` : null;
    const link = reference ? `/submission/${reference}` : null;
    const preview = plainMentions(input.body).slice(0, 280);

    // Only staff who can open the submission are notified; a stray id in the body notifies nobody.
    const mentioned = mentionedIds(input.body);
    let staff: string[] = [];
    if (mentioned.length) {
      const { rows: people } = await zite.sql({
        query: `SELECT id::text AS id FROM "Members" WHERE id::text = ANY($1::text[]) AND "role" IN ('Admin', 'Manager') AND COALESCE("status", '') <> 'Deactivated'`,
        params: [mentioned],
      });
      staff = people.map(p => String(p.id));
      await notify({ recipientIds: staff, type: 'mention', title: `${actor.name} mentioned you on ${title}`, body: preview, submissionId: input.submissionId, programId: ref(s.programId), actorId: actor.id, link });
    }
    const ownerId = ref(s.ownerId);
    if (ownerId && !staff.includes(ownerId)) {
      await notify({ recipientIds: [ownerId], type: 'note', title: `${actor.name} left a note on ${title}`, body: preview, submissionId: input.submissionId, programId: ref(s.programId), actorId: actor.id, link });
    }

    return { id: created.id, authorId: actor.id, body: input.body, postedAt: iso(now), editedAt: null };
  },
});
