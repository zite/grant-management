import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { logActivity } from '@project/shared/server/activity';
import { assertManager, getActor } from '@project/shared/server/members';
import { ref, str } from '@project/shared/server/sql';

/**
 * Staff documents on a submission — site-visit notes, a signed paper form,
 * due-diligence checks. Internal only: applicants and reviewers never see them.
 * The file itself is uploaded from the browser first; this records it.
 */
const Input = z.object({
  action: z.enum(['create', 'delete']),
  submissionId: z.string().min(1),
  id: z.string().optional(),
  name: z.string().trim().max(240).optional(),
  url: z.string().max(2000).optional(),
  size: z.number().min(0).optional(),
  mimeType: z.string().max(160).optional(),
});

export default createEndpoint({
  description: 'Add or remove a staff document on a submission',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ id: z.string() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid document', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);

    const { rows } = await zite.sql({ query: `SELECT id, "programId", "applicantId" FROM "Submissions" WHERE id::text = $1`, params: [input.submissionId] });
    const s = rows[0];
    if (!s) throw new ZiteError('Submission not found', 'NOT_FOUND');
    const common = { submissionId: input.submissionId, programId: ref(s.programId), applicantId: ref(s.applicantId), actorId: actor.id, actorType: 'Member' as const };

    if (input.action === 'create') {
      const url = (input.url ?? '').trim();
      if (!/^https:\/\//i.test(url)) throw new ZiteError('That upload didn’t finish — try adding the file again', 'BAD_REQUEST');
      const name = input.name?.trim() || decodeURIComponent(url.split('?')[0].split('/').pop() || 'Document');
      const created = await zite.attachments.create({
        record: { name, url, size: Math.round(input.size ?? 0), mimeType: input.mimeType ?? null, submissionId: input.submissionId, uploadedById: actor.id, uploadedAt: new Date().toISOString() },
      });
      await logActivity({ ...common, type: 'attachment_added', data: { name, attachmentId: created.id } });
      return { id: created.id };
    }

    if (!input.id) throw new ZiteError('Which document?', 'BAD_REQUEST');
    const { rows: found } = await zite.sql({ query: `SELECT id, "name", "submissionId" FROM "Attachments" WHERE id::text = $1`, params: [input.id] });
    const a = found[0];
    if (!a || String(a.submissionId) !== input.submissionId) throw new ZiteError('That document was already removed', 'NOT_FOUND');
    await zite.attachments.delete({ id: input.id });
    await logActivity({ ...common, type: 'attachment_removed', data: { name: str(a.name) ?? 'Document' } });
    return { id: input.id };
  },
});
