import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { firstName, formatLongDay } from '@project/shared/merge';
import { logActivity } from '@project/shared/server/activity';
import { messageApplicant, sendTriggered } from '@project/shared/server/email';
import { assertManager, getActor } from '@project/shared/server/members';
import { getSettings } from '@project/shared/server/settings';
import { day, iso, numOrNull, ref, str } from '@project/shared/server/sql';

/**
 * Follow-up requests: ask an applicant for something more (a revised budget,
 * a signed agreement, a final report) and review what comes back.
 *
 *   create  — a follow-up form from the program, or a free-form request the
 *             applicant answers with text and files
 *   update  — change the title, instructions or due date
 *   approve — accept what they sent
 *   return  — send it back with a note they can see
 *   remind  — nudge them about an open request
 *   delete  — withdraw a request that hasn't been answered
 *
 * Every applicant-facing step goes through the message thread, so the portal
 * shows the same history staff see.
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const Input = z.object({
  action: z.enum(['create', 'update', 'approve', 'return', 'remind', 'delete']),
  id: z.string().optional(),
  submissionId: z.string().optional(),
  title: z.string().trim().max(200, 'Keep the title under 200 characters').optional(),
  formId: z.string().nullable().optional(),
  instructions: z.string().max(5000, 'Instructions can be up to 5,000 characters').nullable().optional(),
  dueDate: z.string().regex(DAY, 'Choose a valid due date').nullable().optional(),
  notify: z.boolean().optional(),
  reviewNote: z.string().max(5000, 'Keep the note under 5,000 characters').nullable().optional(),
});

type Row = Record<string, unknown>;

async function loadSubmission(id: string) {
  const { rows } = await zite.sql({
    query: `SELECT s.id, s."title", s."number", s."status", s."programId", s."applicantId", s."awardAmount",
              p."name" AS "programName", p."key" AS "programKey", p."deadline" AS "programDeadline",
              a."name" AS "applicantName", a."email" AS "applicantEmail"
            FROM "Submissions" s
            LEFT JOIN "Programs" p ON p.id::text = s."programId"
            LEFT JOIN "Applicants" a ON a.id::text = s."applicantId"
            WHERE s.id::text = $1`,
    params: [id],
  });
  return rows[0] as Row | undefined;
}

export default createEndpoint({
  description: 'Request, review, remind about or remove a follow-up task for an applicant',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ id: z.string(), status: z.string().nullable(), delivery: z.string().nullable() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid request', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);
    const now = new Date().toISOString();

    if (input.action === 'create') {
      if (!input.submissionId) throw new ZiteError('Which submission is this request for?', 'BAD_REQUEST');
      const s = await loadSubmission(input.submissionId);
      if (!s) throw new ZiteError('Submission not found', 'NOT_FOUND');
      if (!s.applicantId) throw new ZiteError('This submission has no applicant to ask', 'BAD_REQUEST');
      if (s.status === 'Withdrawn') throw new ZiteError('This application was withdrawn. Put it back in review before asking for more.', 'BAD_REQUEST');
      const programId = String(s.programId);

      let formId: string | null = null;
      let formName = '';
      if (input.formId) {
        const { rows: forms } = await zite.sql({ query: `SELECT id, "name", "kind", "programId" FROM "Forms" WHERE id::text = $1`, params: [input.formId] });
        const f = forms[0];
        if (!f || String(f.programId) !== programId || f.kind !== 'Follow-up') throw new ZiteError('Choose a follow-up form from this program', 'BAD_REQUEST');
        formId = String(f.id);
        formName = str(f.name) ?? '';
      }
      const title = (input.title ?? '').trim() || formName;
      if (!title) throw new ZiteError('Give the request a title the applicant will recognise', 'BAD_REQUEST');
      const instructions = (input.instructions ?? '').trim();
      if (!formId && !instructions) throw new ZiteError('Tell the applicant what you need — a free-form request needs instructions', 'BAD_REQUEST');

      const created = await zite.tasks.create({
        record: {
          title,
          submissionId: input.submissionId,
          applicantId: String(s.applicantId),
          programId,
          formId,
          instructions: instructions || null,
          dueDate: input.dueDate ?? null,
          status: 'Open',
          answers: null,
          requestedById: actor.id,
          requestedAt: now,
          submittedAt: null,
          reviewedAt: null,
          reviewedById: null,
          reviewNote: null,
          remindedAt: null,
        },
      });

      let delivery: string | null = null;
      if (input.notify) {
        const settings = await getSettings();
        const applicant = { id: String(s.applicantId), email: str(s.applicantEmail) ?? '', name: str(s.applicantName) };
        const submission = { id: String(s.id), title: str(s.title), number: numOrNull(s.number), awardAmount: numOrNull(s.awardAmount) };
        const task = { title, dueDate: input.dueDate ?? null };
        const triggered = await sendTriggered({
          trigger: 'Task requested',
          settings,
          applicant,
          program: { id: programId, name: str(s.programName), key: str(s.programKey), deadline: iso(s.programDeadline) },
          submission,
          task,
          kind: 'Request',
          senderId: actor.id,
        });
        const sent = triggered ?? await messageApplicant({
          settings,
          applicant,
          submissionId: String(s.id),
          subject: `${settings.organizationName} needs something more: ${title}`,
          body: [
            `Hi ${firstName(applicant.name) || 'there'},`,
            `We need one more thing for your application "${str(s.title) || 'your application'}" to ${str(s.programName) || 'our program'}: ${title}.`,
            instructions,
            input.dueDate ? `Please send it by ${formatLongDay(input.dueDate)}.` : '',
            'You can respond in the portal.',
          ].filter(Boolean).join('\n\n'),
          kind: 'Request',
          senderId: actor.id,
          deliver: Boolean(applicant.email),
          buttonLabel: 'Open the request',
        });
        delivery = sent.delivery;
      }

      await logActivity({ type: 'task_requested', submissionId: input.submissionId, programId, applicantId: String(s.applicantId), actorId: actor.id, actorType: 'Member', data: { title, taskId: created.id, formId, delivery } });
      return { id: created.id, status: 'Open', delivery };
    }

    if (!input.id) throw new ZiteError('Which request?', 'BAD_REQUEST');
    const { rows } = await zite.sql({ query: `SELECT * FROM "Tasks" WHERE id::text = $1`, params: [input.id] });
    const t = rows[0];
    if (!t) throw new ZiteError('That request no longer exists', 'NOT_FOUND');
    const status = str(t.status) || 'Open';
    const title = str(t.title) || 'your follow-up';
    const submissionId = ref(t.submissionId);
    const common = { submissionId, programId: ref(t.programId), applicantId: ref(t.applicantId), actorId: actor.id, actorType: 'Member' as const };

    const applicantFor = async () => {
      const s = submissionId ? await loadSubmission(submissionId) : undefined;
      if (!s?.applicantId) throw new ZiteError('This request has no applicant to message', 'BAD_REQUEST');
      return { s, applicant: { id: String(s.applicantId), email: str(s.applicantEmail) ?? '', name: str(s.applicantName) } };
    };

    switch (input.action) {
      case 'update': {
        if (status === 'Approved') throw new ZiteError('This request is already approved', 'BAD_REQUEST');
        const patch: Record<string, unknown> = {};
        if (input.title !== undefined) {
          if (!input.title.trim()) throw new ZiteError('A request needs a title', 'BAD_REQUEST');
          patch.title = input.title.trim();
        }
        if (input.instructions !== undefined) patch.instructions = input.instructions?.trim() || null;
        if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
        if (Object.keys(patch).length) await zite.tasks.update({ id: input.id, record: patch as never });
        return { id: input.id, status, delivery: null };
      }

      case 'approve': {
        if (status !== 'Submitted') throw new ZiteError(status === 'Approved' ? 'This request is already approved' : 'The applicant hasn’t sent anything to approve yet', 'BAD_REQUEST');
        await zite.tasks.update({ id: input.id, record: { status: 'Approved', reviewedAt: now, reviewedById: actor.id, reviewNote: input.reviewNote?.trim() || null } });
        await logActivity({ ...common, type: 'task_approved', data: { title, taskId: input.id } });
        return { id: input.id, status: 'Approved', delivery: null };
      }

      case 'return': {
        if (status !== 'Submitted') throw new ZiteError('Only a request the applicant has answered can be returned', 'BAD_REQUEST');
        const note = input.reviewNote?.trim();
        if (!note) throw new ZiteError('Tell the applicant what needs to change', 'BAD_REQUEST');
        const { s, applicant } = await applicantFor();
        await zite.tasks.update({ id: input.id, record: { status: 'Returned', reviewedAt: now, reviewedById: actor.id, reviewNote: note } });
        const settings = await getSettings();
        const due = day(t.dueDate);
        const res = await messageApplicant({
          settings,
          applicant,
          submissionId,
          subject: `Changes requested: ${title}`,
          body: [
            `Hi ${firstName(applicant.name) || 'there'},`,
            `Thanks for sending "${title}" for "${str(s.title) || 'your application'}". Before we can approve it, ${actor.name} asked for a change:`,
            note,
            `You can update your response in the portal${due ? ` by ${formatLongDay(due)}` : ''}.`,
          ].join('\n\n'),
          kind: 'Request',
          senderId: actor.id,
          deliver: input.notify !== false && Boolean(applicant.email),
          buttonLabel: 'Update your response',
        });
        await logActivity({ ...common, type: 'task_returned', data: { title, taskId: input.id, note: note.slice(0, 280), delivery: res.delivery } });
        return { id: input.id, status: 'Returned', delivery: res.delivery };
      }

      case 'remind': {
        if (status !== 'Open' && status !== 'Returned') throw new ZiteError('Only open requests need a reminder', 'BAD_REQUEST');
        const { s, applicant } = await applicantFor();
        const settings = await getSettings();
        const due = day(t.dueDate);
        const subject = `Reminder: ${title}`;
        const res = await messageApplicant({
          settings,
          applicant,
          submissionId,
          subject,
          body: [
            `Hi ${firstName(applicant.name) || 'there'},`,
            `A friendly reminder that we're still waiting on "${title}" for your application "${str(s.title) || 'your application'}"${due ? `, due ${formatLongDay(due)}` : ''}.`,
            str(t.instructions) ?? '',
            'You can respond in the portal.',
          ].filter(Boolean).join('\n\n'),
          kind: 'Reminder',
          senderId: actor.id,
          deliver: Boolean(applicant.email),
          buttonLabel: 'Open the request',
        });
        await zite.tasks.update({ id: input.id, record: { remindedAt: now } });
        await logActivity({ ...common, type: 'message_sent', data: { subject, delivery: res.delivery, kind: 'Reminder', taskId: input.id } });
        return { id: input.id, status, delivery: res.delivery };
      }

      case 'delete': {
        if (status !== 'Open' && status !== 'Returned') throw new ZiteError('The applicant already answered this request — approve or return it instead of deleting', 'CONFLICT');
        await zite.tasks.delete({ id: input.id });
        return { id: input.id, status: null, delivery: null };
      }
    }
    throw new ZiteError('Unknown action', 'BAD_REQUEST');
  },
});

