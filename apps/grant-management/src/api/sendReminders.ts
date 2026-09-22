import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { formatLongDay } from '@project/shared/merge';
import { formatMoney } from '@project/shared/forms/logic';
import { buildMergeContext, emailMember, findTemplate, messageApplicant } from '@project/shared/server/email';
import { assertAdmin, getActor, programManagerIds } from '@project/shared/server/members';
import { notify } from '@project/shared/server/notify';
import { getSettings, portalLink, staffLink } from '@project/shared/server/settings';
import { renderMerge } from '@project/shared/merge';
import { iso, num, ref, str } from '@project/shared/server/sql';

/**
 * The daily nudges that keep a grant cycle moving, run every morning:
 *
 *   - applicants with unsubmitted drafts, three days and one day before a deadline
 *   - reviewers whose reviews are due tomorrow or just went overdue
 *   - applicants with follow-up tasks due in two days or just overdue
 *   - managers, when a program's deadline has passed and when payments fall due
 *
 * Every nudge is idempotent through `remindedAt` or a recent notification, so
 * a retry or a manual run never double-sends. Admins can run it by hand.
 */

const HOURS = (h: number) => `NOW() - INTERVAL '${h} hours'`;

export default createEndpoint({
  description: 'Send daily deadline, review, task and payment reminders',
  schedule: {
    scheduleType: 'recurring',
    schedule: { frequency: 'daily', interval: 1, times: ['14:00'] },
    timezone: 'UTC',
    overlapPolicy: 'skip',
  },
  inputSchema: z.object({}),
  outputSchema: z.object({ drafts: z.number(), reviews: z.number(), tasks: z.number(), deadlines: z.number(), payments: z.number() }),
  execute: async ({ context }) => {
    // Scheduled runs have no user; a manual run must come from an admin.
    if (context?.user) assertAdmin(await getActor(context as never));
    const settings = await getSettings();
    const out = { drafts: 0, reviews: 0, tasks: 0, deadlines: 0, payments: 0 };

    // ── Drafts before a deadline ──────────────────────────────────────────
    const { rows: drafts } = await zite.sql({
      query: `
        SELECT s.id, s."title", s."applicantId", p.id AS "programId", p."name" AS "programName", p."key", p."deadline",
          a."name" AS "applicantName", a."email" AS "applicantEmail"
        FROM "Submissions" s
        JOIN "Programs" p ON p.id::text = s."programId"
        JOIN "Applicants" a ON a.id::text = s."applicantId"
        WHERE s."status" = 'Draft' AND p."status" = 'Published' AND p."deadline" IS NOT NULL
          AND p."deadline" > NOW()
          AND (p."deadline" <= NOW() + INTERVAL '3 days')
          AND (s."remindedAt" IS NULL OR s."remindedAt" < ${HOURS(40)})
          AND COALESCE(a."email", '') <> ''
          AND s."startedAt" < ${HOURS(1)}
        LIMIT 500`,
      params: [],
    });
    const templateCache = new Map<string, Awaited<ReturnType<typeof findTemplate>>>();
    for (const d of drafts) {
      const programId = String(d.programId);
      if (!templateCache.has(programId)) templateCache.set(programId, await findTemplate('Draft reminder', programId, { requireEnabled: true }));
      const template = templateCache.get(programId);
      if (!template) continue;
      const applicant = { id: String(d.applicantId), email: str(d.applicantEmail) ?? '', name: str(d.applicantName) };
      const ctx = buildMergeContext({ settings, applicant, program: { name: str(d.programName), key: str(d.key), deadline: iso(d.deadline) }, submission: { id: String(d.id), title: str(d.title), number: null } });
      await messageApplicant({
        settings,
        applicant,
        submissionId: String(d.id),
        subject: renderMerge(template.subject, ctx),
        body: renderMerge(template.body, ctx),
        kind: 'Reminder',
        templateId: template.id,
        deliver: true,
        buttonLabel: 'Finish your application',
      });
      await zite.submissions.update({ id: String(d.id), record: { remindedAt: new Date().toISOString() } });
      out.drafts++;
    }

    // ── Reviews due tomorrow or just overdue ──────────────────────────────
    const { rows: reviews } = await zite.sql({
      query: `
        SELECT r.id, r."reviewerId", r."dueDate", r."programId", r."submissionId", s."title", p."name" AS "programName",
          m."name" AS "reviewerName", m."email" AS "reviewerEmail", m."role" AS "reviewerRole",
          CASE WHEN r."dueDate" >= CURRENT_DATE THEN 'soon' ELSE 'overdue' END AS "kind"
        FROM "Reviews" r
        JOIN "Submissions" s ON s.id::text = r."submissionId"
        LEFT JOIN "Programs" p ON p.id::text = r."programId"
        JOIN "Members" m ON m.id::text = r."reviewerId"
        WHERE r."status" IN ('Assigned', 'In progress') AND s."status" = 'Submitted' AND COALESCE(s."stageId", '') = COALESCE(r."stageId", '')
          AND r."dueDate" IS NOT NULL AND r."dueDate" BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE + 1
          AND (r."remindedAt" IS NULL OR r."remindedAt" < ${HOURS(20)})
          AND COALESCE(m."status", '') <> 'Deactivated'
        LIMIT 1000`,
      params: [],
    });
    const byReviewer = new Map<string, typeof reviews>();
    for (const r of reviews) {
      const k = String(r.reviewerId);
      if (!byReviewer.has(k)) byReviewer.set(k, []);
      byReviewer.get(k)!.push(r);
    }
    for (const [reviewerId, list] of byReviewer) {
      const overdue = list.filter(r => r.kind === 'overdue').length;
      const first = list[0];
      const title = list.length === 1
        ? `${overdue ? 'Overdue' : 'Due tomorrow'}: review ${str(first.title) || 'an application'}`
        : `${list.length} reviews ${overdue === list.length ? 'are overdue' : overdue ? `need attention (${overdue} overdue)` : 'are due tomorrow'}`;
      await notify({ recipientIds: [reviewerId], type: 'review_due', title, body: str(first.programName), submissionId: list.length === 1 ? String(first.submissionId) : null, programId: ref(first.programId), actorType: 'System', link: list.length === 1 ? `/reviews/${first.id}` : '/reviews' });
      if (first.reviewerEmail) {
        const staff = first.reviewerRole === 'Admin' || first.reviewerRole === 'Manager';
        await emailMember({
          settings,
          to: String(first.reviewerEmail),
          subject: title,
          text: `Hi ${String(first.reviewerName ?? '').split(' ')[0] || 'there'},\n\n${list.map(r => `• ${str(r.title) || 'An application'} (${str(r.programName)}) — ${r.kind === 'overdue' ? 'overdue' : `due ${formatLongDay(String(r.dueDate).slice(0, 10))}`}`).join('\n')}\n\nThank you for reviewing.`,
          link: staff ? staffLink(settings, '/reviews') || portalLink(settings, '/reviews') : portalLink(settings, '/reviews') || staffLink(settings, '/reviews'),
          linkLabel: 'Open my reviews',
        });
      }
      const now = new Date().toISOString();
      for (const r of list) await zite.reviews.update({ id: String(r.id), record: { remindedAt: now } });
      out.reviews += list.length;
    }

    // ── Follow-up tasks due soon or just overdue ──────────────────────────
    const { rows: tasks } = await zite.sql({
      query: `
        SELECT t.id, t."title", t."dueDate", t."submissionId", t."applicantId", t."programId", t."requestedById",
          s."title" AS "submissionTitle", s."number", p."name" AS "programName", p."key", a."name" AS "applicantName", a."email" AS "applicantEmail",
          CASE WHEN t."dueDate" >= CURRENT_DATE THEN 'soon' ELSE 'overdue' END AS "kind"
        FROM "Tasks" t
        JOIN "Submissions" s ON s.id::text = t."submissionId"
        LEFT JOIN "Programs" p ON p.id::text = t."programId"
        JOIN "Applicants" a ON a.id::text = t."applicantId"
        WHERE t."status" IN ('Open', 'Returned') AND t."dueDate" IS NOT NULL
          AND (t."dueDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + 2 OR t."dueDate" = CURRENT_DATE - 1)
          AND (t."remindedAt" IS NULL OR t."remindedAt" < ${HOURS(40)})
        LIMIT 500`,
      params: [],
    });
    for (const t of tasks) {
      const applicant = { id: String(t.applicantId), email: str(t.applicantEmail) ?? '', name: str(t.applicantName) };
      const due = formatLongDay(String(t.dueDate).slice(0, 10));
      await messageApplicant({
        settings,
        applicant,
        submissionId: String(t.submissionId),
        subject: t.kind === 'overdue' ? `Overdue: ${str(t.title)}` : `Reminder: ${str(t.title)} is due ${due}`,
        body: `Hi ${String(applicant.name ?? '').split(' ')[0] || 'there'},\n\n${t.kind === 'overdue' ? `We haven't received "${str(t.title)}" for ${str(t.programName)}, which was due ${due}.` : `A quick reminder that "${str(t.title)}" for ${str(t.programName)} is due ${due}.`} You can complete it in the applicant portal.\n\nThank you,\n${settings.organizationName}`,
        kind: 'Reminder',
        deliver: Boolean(applicant.email),
        buttonLabel: 'Open the request',
      });
      await zite.tasks.update({ id: String(t.id), record: { remindedAt: new Date().toISOString() } });
      if (t.kind === 'overdue') {
        await notify({ recipientIds: [ref(t.requestedById)], type: 'task_overdue', title: `${applicant.name ?? 'An applicant'} is late with ${str(t.title)}`, body: str(t.programName), submissionId: String(t.submissionId), programId: ref(t.programId), actorType: 'System' });
      }
      out.tasks++;
    }

    // ── Deadlines that passed in the last day ─────────────────────────────
    const { rows: closed } = await zite.sql({
      query: `
        SELECT p.id, p."name",
          (SELECT COUNT(*) FROM "Submissions" s WHERE s."programId" = p.id::text AND s."status" NOT IN ('Draft', 'Withdrawn')) AS "submitted",
          (SELECT COUNT(*) FROM "Submissions" s WHERE s."programId" = p.id::text AND s."status" = 'Draft') AS "drafts"
        FROM "Programs" p
        WHERE p."status" = 'Published' AND p."deadline" IS NOT NULL AND p."deadline" <= NOW() AND p."deadline" > NOW() - INTERVAL '26 hours'
          AND NOT EXISTS (SELECT 1 FROM "Notifications" n WHERE n."programId" = p.id::text AND n."type" = 'deadline_passed' AND n."occurredAt" > NOW() - INTERVAL '3 days')`,
      params: [],
    });
    for (const p of closed) {
      const managers = await programManagerIds(String(p.id));
      await notify({
        recipientIds: managers,
        type: 'deadline_passed',
        title: `Applications closed for ${str(p.name)}`,
        body: `${num(p.submitted)} submitted · ${num(p.drafts)} draft${num(p.drafts) === 1 ? '' : 's'} never submitted`,
        programId: String(p.id),
        actorType: 'System',
        link: `/programs/${p.id}`,
      });
      out.deadlines++;
    }

    // ── Payments due within three days ────────────────────────────────────
    const { rows: payments } = await zite.sql({
      query: `
        SELECT pay.id, pay."name", pay."amount", pay."dueDate", pay."programId", pay."submissionId", s."title", s."ownerId", a."name" AS "applicantName", a."organization"
        FROM "Payments" pay
        JOIN "Submissions" s ON s.id::text = pay."submissionId"
        LEFT JOIN "Applicants" a ON a.id::text = s."applicantId"
        WHERE pay."status" = 'Scheduled' AND pay."dueDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + 3
          AND NOT EXISTS (SELECT 1 FROM "Notifications" n WHERE n."submissionId" = pay."submissionId" AND n."type" = 'payment_due' AND n."title" LIKE '%' || pay."name" || '%' AND n."occurredAt" > NOW() - INTERVAL '4 days')
        LIMIT 200`,
      params: [],
    });
    for (const pay of payments) {
      const managers = await programManagerIds(ref(pay.programId));
      await notify({
        recipientIds: [...managers, ref(pay.ownerId)],
        type: 'payment_due',
        title: `Payment due ${formatLongDay(String(pay.dueDate).slice(0, 10))}: ${str(pay.name)}`,
        body: `${formatMoney(num(pay.amount), settings.currency)} to ${str(pay.organization) || str(pay.applicantName) || 'the recipient'} · ${str(pay.title)}`,
        submissionId: String(pay.submissionId),
        programId: ref(pay.programId),
        actorType: 'System',
        link: '/awards?tab=payments',
      });
      out.payments++;
    }

    return out;
  },
});
