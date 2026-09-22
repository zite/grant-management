import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor, isManager } from '@project/shared/server/members';
import { iso, num, ref, str } from '@project/shared/server/sql';

/**
 * The signed-in person's inbox. Everything is scoped to the session's member,
 * so nobody can read someone else's notifications by passing an id.
 *
 *   inbox    — not archived, and not snoozed into the future
 *   unread   — the inbox, unread only
 *   snoozed  — waiting to come back
 *   archived — done with
 *
 * A snoozed item that has woken up sorts by the moment it came back, so it
 * reappears at the top rather than buried under its original date.
 */

const Input = z.object({ filter: z.enum(['inbox', 'unread', 'snoozed', 'archived']).default('inbox') });

const LIVE = `n."archivedAt" IS NULL AND (n."snoozedUntil" IS NULL OR n."snoozedUntil" <= NOW())`;

const WHERE: Record<z.infer<typeof Input>['filter'], string> = {
  inbox: LIVE,
  unread: `${LIVE} AND n."readAt" IS NULL`,
  snoozed: `n."archivedAt" IS NULL AND n."snoozedUntil" > NOW()`,
  archived: `n."archivedAt" IS NOT NULL`,
};

const ORDER: Record<z.infer<typeof Input>['filter'], string> = {
  inbox: `"sortAt" DESC`,
  unread: `"sortAt" DESC`,
  snoozed: `n."snoozedUntil" ASC`,
  archived: `n."archivedAt" DESC`,
};

export default createEndpoint({
  description: "List the signed-in member's notifications for one inbox tab",
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({
    notifications: z.array(z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      body: z.string(),
      actorId: z.string().nullable(),
      actorType: z.string(),
      actorName: z.string().nullable(),
      submissionId: z.string().nullable(),
      submissionReference: z.string().nullable(),
      submissionTitle: z.string().nullable(),
      submissionStatus: z.string().nullable(),
      programId: z.string().nullable(),
      reviewId: z.string().nullable(),
      reviewStatus: z.string().nullable(),
      link: z.string().nullable(),
      occurredAt: z.string().nullable(),
      sortAt: z.string().nullable(),
      readAt: z.string().nullable(),
      archivedAt: z.string().nullable(),
      snoozedUntil: z.string().nullable(),
    })),
    counts: z.object({ inbox: z.number(), unread: z.number(), snoozed: z.number() }),
  }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw ?? {});
    if (!parsed.success) throw new ZiteError('Choose inbox, unread, snoozed or archived', 'BAD_REQUEST');
    const { filter } = parsed.data;
    const actor = await getActor(context);
    const manager = isManager(actor);

    const [listRes, countRes] = await Promise.all([
      zite.sql({
        query: `
          SELECT n.id, n."type", n."title", n."body", n."actorId", n."actorType", n."submissionId", n."programId", n."link",
            n."occurredAt", n."readAt", n."archivedAt", n."snoozedUntil",
            GREATEST(n."occurredAt", CASE WHEN n."snoozedUntil" <= NOW() THEN n."snoozedUntil" END) AS "sortAt",
            m."name" AS "memberName", a."name" AS "applicantName",
            s."title" AS "submissionTitle", s."number" AS "submissionNumber", s."status" AS "submissionStatus", s."programId" AS "submissionProgramId",
            p."key" AS "programKey",
            rv.id AS "reviewId", rv."status" AS "reviewStatus"
          FROM "Notifications" n
          LEFT JOIN "Members" m ON n."actorType" = 'Member' AND m.id::text = n."actorId"
          LEFT JOIN "Applicants" a ON n."actorType" = 'Applicant' AND a.id::text = n."actorId"
          LEFT JOIN "Submissions" s ON s.id::text = n."submissionId"
          LEFT JOIN "Programs" p ON p.id::text = COALESCE(NULLIF(s."programId", ''), n."programId")
          LEFT JOIN LATERAL (
            SELECT r.id, r."status" FROM "Reviews" r
            WHERE COALESCE(n."submissionId", '') <> '' AND r."submissionId" = n."submissionId" AND r."reviewerId" = $1
            ORDER BY CASE WHEN r."status" IN ('Assigned', 'In progress') THEN 0 WHEN r."status" = 'Submitted' THEN 1 ELSE 2 END, r."assignedAt" DESC NULLS LAST
            LIMIT 1
          ) rv ON true
          WHERE n."recipientId" = $1 AND ${WHERE[filter]}
          ORDER BY ${ORDER[filter]}, n.created_at DESC
          LIMIT 300`,
        params: [actor.id],
      }),
      zite.sql({
        query: `
          SELECT
            COUNT(*) FILTER (WHERE ${LIVE}) AS "inbox",
            COUNT(*) FILTER (WHERE ${LIVE} AND n."readAt" IS NULL) AS "unread",
            COUNT(*) FILTER (WHERE n."archivedAt" IS NULL AND n."snoozedUntil" > NOW()) AS "snoozed"
          FROM "Notifications" n WHERE n."recipientId" = $1`,
        params: [actor.id],
      }),
    ]);

    const c = countRes.rows[0] ?? {};
    return {
      notifications: listRes.rows.map(r => {
        const actorType = str(r.actorType) || 'System';
        const number = num(r.submissionNumber);
        const hasSubmission = Boolean(ref(r.submissionId) && r.submissionStatus != null);
        return {
          id: String(r.id),
          type: str(r.type) ?? '',
          title: str(r.title) ?? '',
          body: str(r.body) ?? '',
          actorId: ref(r.actorId),
          actorType,
          // Reviewers never see applicant identities, even in a notification.
          actorName: actorType === 'Applicant' ? (manager ? ref(r.applicantName) : null) : ref(r.memberName),
          submissionId: hasSubmission ? String(r.submissionId) : null,
          submissionReference: hasSubmission ? (number ? `${str(r.programKey) || 'APP'}-${number}` : 'Draft') : null,
          submissionTitle: hasSubmission ? str(r.submissionTitle) ?? '' : null,
          submissionStatus: hasSubmission ? str(r.submissionStatus) : null,
          programId: ref(r.submissionProgramId) ?? ref(r.programId),
          reviewId: ref(r.reviewId),
          reviewStatus: ref(r.reviewStatus),
          link: ref(r.link),
          occurredAt: iso(r.occurredAt),
          sortAt: iso(r.sortAt) ?? iso(r.occurredAt),
          readAt: iso(r.readAt),
          archivedAt: iso(r.archivedAt),
          snoozedUntil: iso(r.snoozedUntil),
        };
      }),
      counts: { inbox: num(c.inbox), unread: num(c.unread), snoozed: num(c.snoozed) },
    };
  },
});
