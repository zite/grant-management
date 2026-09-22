import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { logActivity } from '@project/shared/server/activity';
import { getApplicant } from '@project/shared/server/applicants';
import { programManagerIds } from '@project/shared/server/members';
import { notify } from '@project/shared/server/notify';
import { str } from '@project/shared/server/sql';
import { loadOwnSubmission, parseInput } from '../server/portal';

const Input = z.object({
  submissionId: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1, 'Write a message before sending.').max(10000, 'Keep your message under 10,000 characters.'),
});

/** The applicant writes to the program team. It lands in the thread and in the owner's inbox. */
export default createEndpoint({
  description: 'Send a message to the program team about your application',
  authenticated: true,
  inputSchema: Input,
  execute: async ({ input: raw, context }) => {
    const input = parseInput(Input, raw);
    const applicant = await getApplicant(context);
    const sub = await loadOwnSubmission(applicant.id, input.submissionId);
    if (sub.status === 'Draft') throw new ZiteError('Submit your application before sending messages about it. For questions before then, email the program team.', 'CONFLICT');

    // Reply in the subject of the latest message from the team, so staff see one conversation.
    const { rows } = await zite.sql({
      query: `SELECT "subject" FROM "Messages" WHERE "submissionId" = $1 AND "direction" = 'Outbound' AND "kind" <> 'Confirmation' ORDER BY "sentAt" DESC NULLS LAST LIMIT 1`,
      params: [sub.id],
    });
    const last = str(rows[0]?.subject) ?? '';
    const subject = last ? (/^re:/i.test(last) ? last : `Re: ${last}`) : `Message about ${sub.title || 'my application'}`;

    const now = new Date().toISOString();
    const created = await zite.messages.create({
      record: {
        subject: subject.slice(0, 240),
        body: input.body,
        submissionId: sub.id,
        applicantId: applicant.id,
        senderId: null,
        direction: 'Inbound',
        kind: 'Message',
        delivery: 'Portal only',
        templateId: null,
        sentAt: now,
        readAt: null,
      },
    });
    await logActivity({ type: 'message_received', submissionId: sub.id, programId: sub.programId, applicantId: applicant.id, actorId: applicant.id, actorType: 'Applicant', data: { subject }, occurredAt: now });
    const recipients = sub.ownerId ? [sub.ownerId] : await programManagerIds(sub.programId);
    const preview = input.body.replace(/\s+/g, ' ');
    await notify({
      recipientIds: recipients,
      type: 'applicant_message',
      title: `${applicant.name || applicant.email} ${/^re:/i.test(subject) ? 'replied' : 'sent a message'}: ${subject}`,
      body: preview.length > 140 ? `${preview.slice(0, 140)}…` : preview,
      submissionId: sub.id,
      programId: sub.programId,
      actorId: applicant.id,
      actorType: 'Applicant',
      occurredAt: now,
    });
    return { id: created.id, subject, body: input.body, direction: 'Inbound' as const, kind: 'Message', sentAt: now, unread: false };
  },
});
