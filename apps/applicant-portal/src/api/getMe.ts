import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { findApplicantByEmail, getApplicant } from '@project/shared/server/applicants';
import { getPortalReviewer } from '@project/shared/server/members';
import { num } from '@project/shared/server/sql';

/**
 * Who is signed in: their applicant profile, what's waiting for them, and
 * whether they also review for the organization.
 */
export default createEndpoint({
  description: "The signed-in person's profile, to-dos and reviewer access",
  authenticated: true,
  inputSchema: z.object({}),
  execute: async ({ context }) => {
    const reviewer = await getPortalReviewer(context);
    // A panelist who only came to review shouldn't turn up in the staff app's applicant list.
    const email = context.user?.email ?? '';
    const existing = reviewer ? await findApplicantByEmail(email) : null;
    const applicant = reviewer && !existing ? null : await getApplicant(context);

    let counts = { drafts: 0, submitted: 0, openTasks: 0, unreadMessages: 0 };
    if (applicant) {
      const { rows } = await zite.sql({
        query: `
          SELECT
            (SELECT COUNT(*) FROM "Submissions" s WHERE s."applicantId" = $1 AND s."status" = 'Draft') AS "drafts",
            (SELECT COUNT(*) FROM "Submissions" s WHERE s."applicantId" = $1 AND s."status" <> 'Draft') AS "submitted",
            (SELECT COUNT(*) FROM "Tasks" t JOIN "Submissions" s ON s.id::text = t."submissionId"
              WHERE t."applicantId" = $1 AND s."applicantId" = $1 AND t."status" IN ('Open', 'Returned')) AS "openTasks",
            (SELECT COUNT(*) FROM "Messages" m JOIN "Submissions" s ON s.id::text = m."submissionId"
              WHERE s."applicantId" = $1 AND m."direction" = 'Outbound' AND m."readAt" IS NULL AND s."status" <> 'Draft') AS "unreadMessages"`,
        params: [applicant.id],
      });
      const r = rows[0] ?? {};
      counts = { drafts: num(r.drafts), submitted: num(r.submitted), openTasks: num(r.openTasks), unreadMessages: num(r.unreadMessages) };
    }

    let reviews = { isReviewer: false, open: 0 };
    if (reviewer) {
      const { rows } = await zite.sql({
        query: `
          SELECT COUNT(*) AS "total",
            COUNT(*) FILTER (WHERE r."status" IN ('Assigned', 'In progress') AND s."status" = 'Submitted' AND COALESCE(s."stageId", '') = COALESCE(r."stageId", '')) AS "open"
          FROM "Reviews" r JOIN "Submissions" s ON s.id::text = r."submissionId"
          WHERE r."reviewerId" = $1`,
        params: [reviewer.id],
      });
      const total = num(rows[0]?.total);
      reviews = { isReviewer: reviewer.role === 'Reviewer' || total > 0, open: num(rows[0]?.open) };
    }

    const fallbackName = [context.user?.firstName, context.user?.lastName].filter(Boolean).join(' ').trim();
    return {
      profile: applicant
        ? { id: applicant.id, name: applicant.name, email: applicant.email, phone: applicant.phone, organization: applicant.organization, location: applicant.location, website: applicant.website }
        : { id: null, name: reviewer?.name || fallbackName, email, phone: '', organization: '', location: '', website: '' },
      counts: { ...counts, todo: counts.openTasks + counts.unreadMessages },
      reviewer: { ...reviews, name: reviewer?.name ?? null },
    };
  },
});
