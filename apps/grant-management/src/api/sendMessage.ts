import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { renderMerge } from '@project/shared/merge';
import { logActivity } from '@project/shared/server/activity';
import { buildMergeContext, messageApplicant } from '@project/shared/server/email';
import { assertManager, getActor } from '@project/shared/server/members';
import { getSettings } from '@project/shared/server/settings';
import { iso, num, str } from '@project/shared/server/sql';

/**
 * Message one or many applicants about their submissions. The subject and body
 * are templates: merge tags are filled per applicant, so one bulk message
 * reads as personal to each person.
 */
const Input = z.object({
  submissionIds: z.array(z.string()).min(1).max(500),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
  templateId: z.string().nullable().optional(),
  /** false keeps it in the portal only, with no email. */
  sendEmail: z.boolean().default(true),
  kind: z.enum(['Message', 'Request', 'Reminder']).default('Message'),
});

export default createEndpoint({
  description: 'Send a message to applicants, by email and in the portal',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ sent: z.number(), failed: z.number(), portalOnly: z.number() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid message', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);
    const settings = await getSettings();
    const { rows } = await zite.sql({
      query: `SELECT s.id, s."title", s."number", s."programId", s."applicantId", s."awardAmount", p."name" AS "programName", p."key" AS "programKey", p."deadline",
                a."name" AS "applicantName", a."email" AS "applicantEmail"
              FROM "Submissions" s LEFT JOIN "Programs" p ON p.id::text = s."programId" LEFT JOIN "Applicants" a ON a.id::text = s."applicantId"
              WHERE s.id::text = ANY($1::text[])`,
      params: [input.submissionIds],
    });
    const out = { sent: 0, failed: 0, portalOnly: 0 };
    const now = new Date().toISOString();
    for (const r of rows) {
      if (!r.applicantId) continue;
      const applicant = { id: String(r.applicantId), email: str(r.applicantEmail) ?? '', name: str(r.applicantName) };
      const ctx = buildMergeContext({
        settings,
        applicant,
        program: { name: str(r.programName), key: str(r.programKey), deadline: iso(r.deadline) },
        submission: { id: String(r.id), title: str(r.title), number: num(r.number), awardAmount: r.awardAmount == null ? null : num(r.awardAmount) },
      });
      const subject = renderMerge(input.subject, ctx);
      const res = await messageApplicant({
        settings,
        applicant,
        submissionId: String(r.id),
        subject,
        body: renderMerge(input.body, ctx),
        kind: input.kind,
        senderId: actor.id,
        templateId: input.templateId ?? null,
        deliver: input.sendEmail && Boolean(applicant.email),
      });
      if (res.delivery === 'Sent') out.sent++;
      else if (res.delivery === 'Failed') out.failed++;
      else out.portalOnly++;
      await logActivity({ type: 'message_sent', submissionId: String(r.id), programId: String(r.programId), applicantId: applicant.id, actorId: actor.id, actorType: 'Member', data: { subject, delivery: res.delivery }, occurredAt: now });
    }
    return out;
  },
});
