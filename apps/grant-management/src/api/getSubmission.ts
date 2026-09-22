import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { parseAnswers, parseFields } from '@project/shared/forms/logic';
import { parseScores } from '@project/shared/scoring';
import { parseData } from '@project/shared/server/activity';
import { assertManager, getActor } from '@project/shared/server/members';
import { Params, day, iso, num, numOrNull, ref, str } from '@project/shared/server/sql';
import { mapSubmissionRow, selectSubmissions, submissionRowSchema } from '../server/submissions';

const field = z.any();

export default createEndpoint({
  description: 'Everything about one submission: answers, reviews, conversation, tasks, payments and history',
  authenticated: true,
  inputSchema: z.object({ id: z.string().optional(), reference: z.string().optional() }),
  outputSchema: z.object({
    submission: submissionRowSchema.extend({
      answers: z.record(z.any()),
      decisionNote: z.string().nullable(),
      awardStartDate: z.string().nullable(),
      awardEndDate: z.string().nullable(),
      withdrawnAt: z.string().nullable(),
      lastSavedAt: z.string().nullable(),
      decidedById: z.string().nullable(),
    }),
    applicant: z.object({
      id: z.string(), name: z.string(), email: z.string(), phone: z.string(), organization: z.string(), location: z.string(), website: z.string(),
      notes: z.string(), joinedAt: z.string().nullable(), lastActiveAt: z.string().nullable(),
      otherSubmissions: z.array(z.object({ id: z.string(), reference: z.string(), title: z.string(), programId: z.string(), status: z.string(), submittedAt: z.string().nullable(), awardAmount: z.number().nullable(), notifiedAt: z.string().nullable() })),
    }).nullable(),
    form: z.object({ id: z.string(), fields: z.array(field), titleFieldId: z.string().nullable(), amountFieldId: z.string().nullable() }).nullable(),
    reviews: z.array(z.object({
      id: z.string(), reviewerId: z.string(), stageId: z.string().nullable(), rubricId: z.string().nullable(), status: z.string(),
      scores: z.record(z.number().nullable()), totalScore: z.number().nullable(), recommendation: z.string().nullable(), comment: z.string(),
      applicantFeedback: z.string(), recusalReason: z.string(), dueDate: z.string().nullable(), assignedAt: z.string().nullable(),
      assignedById: z.string().nullable(), startedAt: z.string().nullable(), submittedAt: z.string().nullable(),
    })),
    notes: z.array(z.object({ id: z.string(), authorId: z.string().nullable(), body: z.string(), postedAt: z.string().nullable(), editedAt: z.string().nullable() })),
    messages: z.array(z.object({
      id: z.string(), subject: z.string(), body: z.string(), direction: z.string(), kind: z.string(), delivery: z.string(),
      senderId: z.string().nullable(), templateId: z.string().nullable(), sentAt: z.string().nullable(), readAt: z.string().nullable(),
    })),
    tasks: z.array(z.object({
      id: z.string(), title: z.string(), formId: z.string().nullable(), formName: z.string().nullable(), fields: z.array(field), instructions: z.string(),
      dueDate: z.string().nullable(), status: z.string(), answers: z.record(z.any()), requestedById: z.string().nullable(), requestedAt: z.string().nullable(),
      submittedAt: z.string().nullable(), reviewedAt: z.string().nullable(), reviewedById: z.string().nullable(), reviewNote: z.string(),
    })),
    payments: z.array(z.object({
      id: z.string(), name: z.string(), amount: z.number(), dueDate: z.string().nullable(), paidDate: z.string().nullable(), status: z.string(),
      method: z.string().nullable(), reference: z.string(), notes: z.string(), recordedById: z.string().nullable(),
    })),
    attachments: z.array(z.object({ id: z.string(), name: z.string(), url: z.string(), size: z.number(), mimeType: z.string(), uploadedById: z.string().nullable(), uploadedAt: z.string().nullable() })),
    activity: z.array(z.object({ id: z.string(), type: z.string(), actorId: z.string().nullable(), actorType: z.string(), data: z.record(z.any()), occurredAt: z.string().nullable() })),
  }),
  execute: async ({ input, context }) => {
    const actor = await getActor(context);
    assertManager(actor);

    const p = new Params();
    let clause: string;
    if (input.id) clause = `s.id::text = ${p.add(input.id)}`;
    else if (input.reference && /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(input.reference)) {
      const [key, n] = input.reference.split('-');
      clause = `UPPER(p."key") = ${p.add(key.toUpperCase())} AND s."number" = ${p.add(Number(n))}`;
    } else throw new ZiteError('Submission not found', 'NOT_FOUND');
    // The list query again, so a detail row and a list row agree field for field.
    const { rows } = await zite.sql({ query: `${selectSubmissions(true)} WHERE ${clause} LIMIT 1`, params: p.values });
    const row = rows[0];
    if (!row) throw new ZiteError('Submission not found', 'NOT_FOUND');
    const id = String(row.id);
    const base = mapSubmissionRow(row, true);

    const [extraRes, applicantRes, formRes, reviewsRes, notesRes, messagesRes, tasksRes, paymentsRes, attachmentsRes, activityRes] = await Promise.all([
      zite.sql({ query: `SELECT "decisionNote", "awardStartDate", "awardEndDate", "withdrawnAt", "lastSavedAt", "decidedById" FROM "Submissions" WHERE id::text = $1`, params: [id] }),
      base.applicantId ? zite.sql({ query: `SELECT * FROM "Applicants" WHERE id::text = $1`, params: [base.applicantId] }) : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
      zite.sql({ query: `SELECT id, "fields", "titleFieldId", "amountFieldId" FROM "Forms" WHERE "programId" = $1 AND "kind" = 'Application' ORDER BY created_at ASC LIMIT 1`, params: [base.programId] }),
      zite.sql({ query: `SELECT * FROM "Reviews" WHERE "submissionId" = $1 ORDER BY "assignedAt" ASC NULLS LAST, created_at ASC`, params: [id] }),
      zite.sql({ query: `SELECT * FROM "Notes" WHERE "submissionId" = $1 ORDER BY "postedAt" ASC NULLS LAST, created_at ASC`, params: [id] }),
      zite.sql({ query: `SELECT * FROM "Messages" WHERE "submissionId" = $1 ORDER BY "sentAt" ASC NULLS LAST, created_at ASC`, params: [id] }),
      zite.sql({
        query: `SELECT t.*, f."name" AS "formName", f."fields" AS "formFields" FROM "Tasks" t LEFT JOIN "Forms" f ON f.id::text = t."formId" WHERE t."submissionId" = $1 ORDER BY t."requestedAt" ASC NULLS LAST, t.created_at ASC`,
        params: [id],
      }),
      zite.sql({ query: `SELECT * FROM "Payments" WHERE "submissionId" = $1 ORDER BY "dueDate" ASC NULLS LAST, created_at ASC`, params: [id] }),
      zite.sql({ query: `SELECT * FROM "Attachments" WHERE "submissionId" = $1 ORDER BY "uploadedAt" ASC NULLS LAST, created_at ASC`, params: [id] }),
      zite.sql({ query: `SELECT id, "type", "actorId", "actorType", "data", "occurredAt" FROM "Activity" WHERE "submissionId" = $1 ORDER BY "occurredAt" ASC NULLS LAST, created_at ASC LIMIT 500`, params: [id] }),
    ]);

    const extra = extraRes.rows[0] ?? {};
    const a = applicantRes.rows[0];
    let otherSubmissions: Array<{ id: string; reference: string; title: string; programId: string; status: string; submittedAt: string | null; awardAmount: number | null; notifiedAt: string | null }> = [];
    if (a) {
      const { rows: others } = await zite.sql({
        query: `SELECT s.id, s."number", s."title", s."programId", s."status", s."submittedAt", s."awardAmount", s."notifiedAt", p."key" AS "programKey"
                FROM "Submissions" s LEFT JOIN "Programs" p ON p.id::text = s."programId"
                WHERE s."applicantId" = $1 AND s.id::text <> $2 ORDER BY COALESCE(s."submittedAt", s.created_at) DESC LIMIT 50`,
        params: [String(a.id), id],
      });
      otherSubmissions = others.map(o => ({
        id: String(o.id),
        reference: o.number ? `${str(o.programKey) || 'APP'}-${num(o.number)}` : 'Draft',
        title: str(o.title) ?? '',
        programId: String(o.programId ?? ''),
        status: str(o.status) ?? 'Draft',
        submittedAt: iso(o.submittedAt),
        awardAmount: numOrNull(o.awardAmount),
        notifiedAt: iso(o.notifiedAt),
      }));
    }
    const form = formRes.rows[0];

    return {
      submission: {
        ...base,
        answers: base.answers ?? {},
        decisionNote: ref(extra.decisionNote),
        awardStartDate: day(extra.awardStartDate),
        awardEndDate: day(extra.awardEndDate),
        withdrawnAt: iso(extra.withdrawnAt),
        lastSavedAt: iso(extra.lastSavedAt),
        decidedById: ref(extra.decidedById),
      },
      applicant: a
        ? {
            id: String(a.id),
            name: str(a.name) ?? '',
            email: str(a.email) ?? '',
            phone: str(a.phone) ?? '',
            organization: str(a.organization) ?? '',
            location: str(a.location) ?? '',
            website: str(a.website) ?? '',
            notes: str(a.notes) ?? '',
            joinedAt: iso(a.joinedAt) ?? iso(a.created_at),
            lastActiveAt: iso(a.lastActiveAt),
            otherSubmissions,
          }
        : null,
      form: form ? { id: String(form.id), fields: parseFields(form.fields), titleFieldId: ref(form.titleFieldId), amountFieldId: ref(form.amountFieldId) } : null,
      reviews: reviewsRes.rows.map(r => ({
        id: String(r.id),
        reviewerId: String(r.reviewerId ?? ''),
        stageId: ref(r.stageId),
        rubricId: ref(r.rubricId),
        status: str(r.status) || 'Assigned',
        scores: parseScores(r.scores),
        totalScore: numOrNull(r.totalScore),
        recommendation: ref(r.recommendation),
        comment: str(r.comment) ?? '',
        applicantFeedback: str(r.applicantFeedback) ?? '',
        recusalReason: str(r.recusalReason) ?? '',
        dueDate: day(r.dueDate),
        assignedAt: iso(r.assignedAt),
        assignedById: ref(r.assignedById),
        startedAt: iso(r.startedAt),
        submittedAt: iso(r.submittedAt),
      })),
      notes: notesRes.rows.map(n => ({ id: String(n.id), authorId: ref(n.authorId), body: str(n.body) ?? '', postedAt: iso(n.postedAt) ?? iso(n.created_at), editedAt: iso(n.editedAt) })),
      messages: messagesRes.rows.map(m => ({
        id: String(m.id),
        subject: str(m.subject) ?? '',
        body: str(m.body) ?? '',
        direction: str(m.direction) || 'Outbound',
        kind: str(m.kind) || 'Message',
        delivery: str(m.delivery) || 'Sent',
        senderId: ref(m.senderId),
        templateId: ref(m.templateId),
        sentAt: iso(m.sentAt) ?? iso(m.created_at),
        readAt: iso(m.readAt),
      })),
      tasks: tasksRes.rows.map(t => ({
        id: String(t.id),
        title: str(t.title) ?? '',
        formId: ref(t.formId),
        formName: ref(t.formName),
        fields: parseFields(t.formFields),
        instructions: str(t.instructions) ?? '',
        dueDate: day(t.dueDate),
        status: str(t.status) || 'Open',
        answers: parseAnswers(t.answers),
        requestedById: ref(t.requestedById),
        requestedAt: iso(t.requestedAt) ?? iso(t.created_at),
        submittedAt: iso(t.submittedAt),
        reviewedAt: iso(t.reviewedAt),
        reviewedById: ref(t.reviewedById),
        reviewNote: str(t.reviewNote) ?? '',
      })),
      payments: paymentsRes.rows.map(pay => ({
        id: String(pay.id),
        name: str(pay.name) ?? '',
        amount: num(pay.amount),
        dueDate: day(pay.dueDate),
        paidDate: day(pay.paidDate),
        status: str(pay.status) || 'Scheduled',
        method: ref(pay.method),
        reference: str(pay.reference) ?? '',
        notes: str(pay.notes) ?? '',
        recordedById: ref(pay.recordedById),
      })),
      attachments: attachmentsRes.rows.map(f => ({
        id: String(f.id),
        name: str(f.name) ?? 'File',
        url: str(f.url) ?? '',
        size: num(f.size),
        mimeType: str(f.mimeType) ?? '',
        uploadedById: ref(f.uploadedById),
        uploadedAt: iso(f.uploadedAt) ?? iso(f.created_at),
      })),
      activity: activityRes.rows.map(e => ({
        id: String(e.id),
        type: str(e.type) ?? '',
        actorId: ref(e.actorId),
        actorType: str(e.actorType) || 'System',
        data: parseData(e.data),
        occurredAt: iso(e.occurredAt),
      })),
    };
  },
});

