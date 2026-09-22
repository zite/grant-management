import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { parseData } from '@project/shared/server/activity';
import { assertManager, getActor } from '@project/shared/server/members';
import { day, iso, num, numOrNull, ref, str } from '@project/shared/server/sql';

/**
 * One applicant across every program: their profile and internal notes, what
 * they applied for and how it went, every message exchanged, and a short
 * history of what they have done lately.
 */

const Input = z.object({ id: z.string().min(1) });

/** The milestones of an applicant's own journey — not the panel's internal review traffic. */
const APPLICANT_EVENTS = ['started', 'submitted', 'withdrawn', 'decision_released', 'message_sent', 'message_received', 'task_requested', 'task_submitted', 'task_approved', 'task_returned', 'payment_recorded', 'created_by_staff'];

export default createEndpoint({
  description: 'Load one applicant with their applications, messages and recent activity',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({
    applicant: z.object({
      id: z.string(), name: z.string(), email: z.string(), phone: z.string(), organization: z.string(), location: z.string(), website: z.string(),
      notes: z.string(), joinedAt: z.string().nullable(), lastActiveAt: z.string().nullable(),
    }),
    totals: z.object({
      applications: z.number(), drafts: z.number(), inReview: z.number(), accepted: z.number(), declined: z.number(), waitlisted: z.number(), withdrawn: z.number(),
      requested: z.number(), awarded: z.number(), paid: z.number(),
    }),
    submissions: z.array(z.object({
      id: z.string(), reference: z.string(), number: z.number().nullable(), title: z.string(), programId: z.string(), stageId: z.string().nullable(), status: z.string(),
      startedAt: z.string().nullable(), submittedAt: z.string().nullable(), decidedAt: z.string().nullable(), notifiedAt: z.string().nullable(),
      requestedAmount: z.number().nullable(), awardAmount: z.number().nullable(), awardStatus: z.string().nullable(), paid: z.number(),
      avgScore: z.number().nullable(), reviewsSubmitted: z.number(), lastActivityAt: z.string().nullable(),
    })),
    messages: z.array(z.object({
      id: z.string(), subject: z.string(), preview: z.string(), direction: z.string(), kind: z.string(), delivery: z.string(),
      senderId: z.string().nullable(), submissionId: z.string().nullable(), reference: z.string().nullable(), sentAt: z.string().nullable(), readAt: z.string().nullable(),
    })),
    activity: z.array(z.object({
      id: z.string(), type: z.string(), submissionId: z.string().nullable(), reference: z.string().nullable(), actorId: z.string().nullable(), actorType: z.string(),
      data: z.record(z.any()), occurredAt: z.string().nullable(),
    })),
  }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError('Which applicant?', 'BAD_REQUEST');
    const actor = await getActor(context);
    assertManager(actor);
    const id = parsed.data.id;

    const { rows: found } = await zite.sql({ query: `SELECT * FROM "Applicants" WHERE id::text = $1 LIMIT 1`, params: [id] });
    const a = found[0];
    if (!a) throw new ZiteError('Applicant not found', 'NOT_FOUND');

    const [subsRes, messagesRes, activityRes] = await Promise.all([
      zite.sql({
        query: `
          SELECT s.id, s."number", s."title", s."programId", s."stageId", s."status", s."startedAt", s."submittedAt", s."decidedAt", s."notifiedAt",
            s."requestedAmount", s."awardAmount", s."awardStatus", s."lastActivityAt", p."key" AS "programKey",
            (SELECT AVG(r."totalScore") FROM "Reviews" r WHERE r."submissionId" = s.id::text AND r."status" = 'Submitted') AS "avgScore",
            (SELECT COUNT(*) FROM "Reviews" r WHERE r."submissionId" = s.id::text AND r."status" = 'Submitted') AS "reviewsSubmitted",
            (SELECT COALESCE(SUM(pay."amount"), 0) FROM "Payments" pay WHERE pay."submissionId" = s.id::text AND pay."status" = 'Paid') AS "paid"
          FROM "Submissions" s LEFT JOIN "Programs" p ON p.id::text = s."programId"
          WHERE s."applicantId" = $1
          ORDER BY COALESCE(s."submittedAt", s."startedAt", s.created_at) DESC
          LIMIT 200`,
        params: [id],
      }),
      zite.sql({
        query: `
          SELECT m.id, m."subject", LEFT(m."body", 280) AS "preview", m."direction", m."kind", m."delivery", m."senderId", m."submissionId", m."sentAt", m."readAt",
            s.id AS "linkedSubmission", s."number", p."key" AS "programKey"
          FROM "Messages" m
          LEFT JOIN "Submissions" s ON s.id::text = m."submissionId"
          LEFT JOIN "Programs" p ON p.id::text = s."programId"
          WHERE m."applicantId" = $1
          ORDER BY m."sentAt" DESC NULLS LAST, m.created_at DESC
          LIMIT 100`,
        params: [id],
      }),
      zite.sql({
        query: `
          SELECT ac.id, ac."type", ac."submissionId", ac."actorId", ac."actorType", ac."data", ac."occurredAt", s.id AS "linkedSubmission", s."number", p."key" AS "programKey"
          FROM "Activity" ac
          LEFT JOIN "Submissions" s ON s.id::text = ac."submissionId"
          LEFT JOIN "Programs" p ON p.id::text = s."programId"
          WHERE ac."applicantId" = $1 AND ac."type" = ANY($2::text[])
          ORDER BY ac."occurredAt" DESC NULLS LAST, ac.created_at DESC
          LIMIT 40`,
        params: [id, APPLICANT_EVENTS],
      }),
    ]);

    const refOf = (key: unknown, number: unknown, hasSubmission: boolean) => {
      if (!hasSubmission) return null;
      const n = num(number);
      return n ? `${str(key) || 'APP'}-${n}` : 'Draft';
    };

    const submissions = subsRes.rows.map(s => {
      const avg = numOrNull(s.avgScore);
      return {
        id: String(s.id),
        reference: refOf(s.programKey, s.number, true)!,
        number: numOrNull(s.number),
        title: str(s.title) ?? '',
        programId: String(s.programId ?? ''),
        stageId: ref(s.stageId),
        status: str(s.status) || 'Draft',
        startedAt: iso(s.startedAt),
        submittedAt: iso(s.submittedAt),
        decidedAt: iso(s.decidedAt),
        notifiedAt: iso(s.notifiedAt),
        requestedAmount: numOrNull(s.requestedAmount),
        awardAmount: numOrNull(s.awardAmount),
        awardStatus: ref(s.awardStatus),
        paid: num(s.paid),
        avgScore: avg == null ? null : Math.round(avg * 10) / 10,
        reviewsSubmitted: num(s.reviewsSubmitted),
        lastActivityAt: iso(s.lastActivityAt),
      };
    });

    const count = (status: string) => submissions.filter(s => s.status === status).length;
    const pipeline = submissions.filter(s => s.status !== 'Draft');
    const accepted = submissions.filter(s => s.status === 'Accepted' && s.awardStatus !== 'Cancelled');

    return {
      applicant: {
        id: String(a.id),
        name: str(a.name) ?? '',
        email: str(a.email) ?? '',
        phone: str(a.phone) ?? '',
        organization: str(a.organization) ?? '',
        location: str(a.location) ?? '',
        website: str(a.website) ?? '',
        notes: str(a.notes) ?? '',
        // Staff-created and imported people can have applications older than their profile.
        joinedAt: [iso(a.joinedAt) ?? iso(a.created_at), ...submissions.map(s => s.startedAt)].filter(Boolean).sort()[0] ?? null,
        lastActiveAt: [iso(a.lastActiveAt), ...submissions.map(s => s.submittedAt ?? s.startedAt)].filter(Boolean).sort().pop() ?? null,
      },
      totals: {
        applications: pipeline.length,
        drafts: count('Draft'),
        inReview: count('Submitted'),
        accepted: count('Accepted'),
        declined: count('Declined'),
        waitlisted: count('Waitlisted'),
        withdrawn: count('Withdrawn'),
        requested: pipeline.reduce((sum, s) => sum + (s.requestedAmount ?? 0), 0),
        awarded: accepted.reduce((sum, s) => sum + (s.awardAmount ?? 0), 0),
        paid: submissions.reduce((sum, s) => sum + s.paid, 0),
      },
      submissions,
      messages: messagesRes.rows.map(m => ({
        id: String(m.id),
        subject: str(m.subject) ?? '',
        preview: (str(m.preview) ?? '').replace(/\s+/g, ' ').trim(),
        direction: str(m.direction) || 'Outbound',
        kind: str(m.kind) || 'Message',
        delivery: str(m.delivery) || 'Sent',
        senderId: ref(m.senderId),
        submissionId: m.linkedSubmission ? String(m.linkedSubmission) : null,
        reference: refOf(m.programKey, m.number, Boolean(m.linkedSubmission)),
        sentAt: iso(m.sentAt),
        readAt: iso(m.readAt),
      })),
      activity: activityRes.rows.map(r => ({
        id: String(r.id),
        type: str(r.type) ?? '',
        submissionId: r.linkedSubmission ? String(r.linkedSubmission) : null,
        reference: refOf(r.programKey, r.number, Boolean(r.linkedSubmission)),
        actorId: ref(r.actorId),
        actorType: str(r.actorType) || 'System',
        data: parseData(r.data),
        occurredAt: iso(r.occurredAt) ?? day(r.occurredAt),
      })),
    };
  },
});
