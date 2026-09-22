import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { logActivity } from '@project/shared/server/activity';
import { getApplicant } from '@project/shared/server/applicants';
import { programManagerIds } from '@project/shared/server/members';
import { notify } from '@project/shared/server/notify';
import { isDecision } from '@project/shared/status';
import { loadOwnSubmission, parseInput } from '../server/portal';

const Input = z.object({
  id: z.string().trim().min(1).max(100),
  reason: z.string().trim().max(1000, 'Keep the reason under 1,000 characters.').optional(),
});

/**
 * Withdraw a submitted application. Allowed for anything the applicant sees
 * as still undecided — including a decision staff haven't released yet, so
 * the answer never hints at one.
 */
export default createEndpoint({
  description: 'Withdraw one of your submitted applications',
  authenticated: true,
  inputSchema: Input,
  execute: async ({ input: raw, context }) => {
    const input = parseInput(Input, raw);
    const applicant = await getApplicant(context);
    const sub = await loadOwnSubmission(applicant.id, input.id);
    const released = Boolean(sub.notifiedAt) && isDecision(sub.status);
    if (sub.status === 'Draft') throw new ZiteError("This application hasn't been submitted. You can delete the draft instead.", 'BAD_REQUEST');
    if (sub.status === 'Withdrawn') throw new ZiteError('You already withdrew this application.', 'CONFLICT');
    if (released) throw new ZiteError('A decision has already been made on this application, so it can no longer be withdrawn. Contact the program team if something has changed.', 'CONFLICT');

    const now = new Date().toISOString();
    await zite.submissions.update({ id: sub.id, record: { status: 'Withdrawn', withdrawnAt: now, lastActivityAt: now } });
    const reason = input.reason?.trim() || null;
    await logActivity({
      type: 'withdrawn',
      submissionId: sub.id,
      programId: sub.programId,
      applicantId: applicant.id,
      actorId: applicant.id,
      actorType: 'Applicant',
      data: { reason, previousStatus: sub.status },
      occurredAt: now,
    });
    await notify({
      recipientIds: [...(await programManagerIds(sub.programId)), sub.ownerId],
      type: 'submission_withdrawn',
      title: `${applicant.name || applicant.email} withdrew ${sub.title || 'an application'}`,
      body: reason,
      submissionId: sub.id,
      programId: sub.programId,
      actorId: applicant.id,
      actorType: 'Applicant',
      occurredAt: now,
    });
    return { withdrawnAt: now };
  },
});
