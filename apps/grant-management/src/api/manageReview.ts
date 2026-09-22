import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { logActivity } from '@project/shared/server/activity';
import { emailMember } from '@project/shared/server/email';
import { assertManager, getActor } from '@project/shared/server/members';
import { notify } from '@project/shared/server/notify';
import { getSettings, portalLink, staffLink } from '@project/shared/server/settings';
import { ref, str } from '@project/shared/server/sql';

/** A manager's controls over one review assignment: remove it, change its due date, nudge the reviewer, or reopen it. */
export default createEndpoint({
  description: 'Remove, reschedule, remind or reopen a review assignment',
  authenticated: true,
  inputSchema: z.object({
    reviewId: z.string(),
    action: z.enum(['remove', 'set_due', 'remind', 'reopen']),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input, context }) => {
    const actor = await getActor(context);
    assertManager(actor);
    const { rows } = await zite.sql({
      query: `SELECT r.*, m."name" AS "reviewerName", m."email" AS "reviewerEmail", m."role" AS "reviewerRole", s."title" AS "submissionTitle", s."applicantId"
              FROM "Reviews" r LEFT JOIN "Members" m ON m.id::text = r."reviewerId" LEFT JOIN "Submissions" s ON s.id::text = r."submissionId"
              WHERE r.id::text = $1`,
      params: [input.reviewId],
    });
    const r = rows[0];
    if (!r) throw new ZiteError('Review not found', 'NOT_FOUND');
    const common = { submissionId: String(r.submissionId), programId: ref(r.programId), applicantId: ref(r.applicantId), actorId: actor.id, actorType: 'Member' as const };

    switch (input.action) {
      case 'remove':
        await zite.reviews.delete({ id: input.reviewId });
        await logActivity({ ...common, type: 'reviewer_removed', data: { reviewerId: ref(r.reviewerId), hadScore: r.status === 'Submitted' } });
        break;
      case 'set_due':
        await zite.reviews.update({ id: input.reviewId, record: { dueDate: input.dueDate ?? null } });
        break;
      case 'reopen':
        if (r.status !== 'Submitted' && r.status !== 'Recused') throw new ZiteError('Only finished reviews can be reopened', 'BAD_REQUEST');
        await zite.reviews.update({ id: input.reviewId, record: { status: 'In progress', submittedAt: null } });
        await logActivity({ ...common, type: 'review_reopened', data: { reviewerId: ref(r.reviewerId) } });
        await notify({ recipientIds: [ref(r.reviewerId)], type: 'review_assigned', title: `${actor.name} reopened your review of ${str(r.submissionTitle) || 'an application'}`, submissionId: String(r.submissionId), programId: ref(r.programId), actorId: actor.id, link: '/reviews' });
        break;
      case 'remind': {
        if (r.status === 'Submitted' || r.status === 'Recused') throw new ZiteError('This review is already finished', 'BAD_REQUEST');
        const settings = await getSettings();
        const title = `Reminder: review ${str(r.submissionTitle) || 'an application'}`;
        await notify({ recipientIds: [ref(r.reviewerId)], type: 'review_due', title, body: r.dueDate ? `Due ${String(r.dueDate).slice(0, 10)}` : null, submissionId: String(r.submissionId), programId: ref(r.programId), actorId: actor.id, link: `/reviews/${input.reviewId}` });
        if (r.reviewerEmail) {
          const staff = r.reviewerRole === 'Admin' || r.reviewerRole === 'Manager';
          const path = `/reviews/${input.reviewId}`;
          await emailMember({
            settings,
            to: String(r.reviewerEmail),
            subject: title,
            text: `Hi ${String(r.reviewerName ?? '').split(' ')[0] || 'there'},\n\n${actor.name} sent a friendly reminder about your review of "${str(r.submissionTitle) || 'an application'}"${r.dueDate ? `, due ${String(r.dueDate).slice(0, 10)}` : ''}.`,
            link: staff ? staffLink(settings, path) || portalLink(settings, path) : portalLink(settings, path) || staffLink(settings, path),
            linkLabel: 'Open the review',
          });
        }
        await zite.reviews.update({ id: input.reviewId, record: { remindedAt: new Date().toISOString() } });
        break;
      }
    }
    return { ok: true };
  },
});
