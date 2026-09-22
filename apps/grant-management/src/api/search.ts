import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor, isManager } from '@project/shared/server/members';
import { iso, num, str } from '@project/shared/server/sql';

/** ⌘K search across submissions and applicants. Reviewers only find what they're assigned. */
export default createEndpoint({
  description: 'Search submissions and applicants by reference, title, name, email or answer text',
  authenticated: true,
  inputSchema: z.object({ query: z.string().max(200), limit: z.number().int().min(1).max(30).default(10) }),
  outputSchema: z.object({
    submissions: z.array(z.object({ id: z.string(), reference: z.string(), title: z.string(), status: z.string(), programId: z.string(), stageId: z.string().nullable(), applicantName: z.string(), submittedAt: z.string().nullable() })),
    applicants: z.array(z.object({ id: z.string(), name: z.string(), email: z.string(), organization: z.string(), submissions: z.number() })),
    reviews: z.array(z.object({ id: z.string(), reference: z.string(), title: z.string(), status: z.string() })),
  }),
  execute: async ({ input, context }) => {
    const actor = await getActor(context);
    const q = String(input?.query ?? '').trim();
    const limit = Math.min(30, Math.max(1, Number(input?.limit) || 10));
    if (!q) return { submissions: [], applicants: [], reviews: [] };
    const like = `%${q.replace(/[%_\\]/g, m => `\\${m}`)}%`;
    const ref = q.match(/^([A-Za-z][A-Za-z0-9]*)-(\d+)$/);

    const { rows: reviewRows } = await zite.sql({
      query: `SELECT r.id, r."status", s."title", s."number", p."key" FROM "Reviews" r JOIN "Submissions" s ON s.id::text = r."submissionId" LEFT JOIN "Programs" p ON p.id::text = r."programId"
              WHERE r."reviewerId" = $1 AND (s."title" ILIKE $2 OR (UPPER(p."key") = $3 AND s."number" = $4)) ORDER BY r."assignedAt" DESC NULLS LAST LIMIT $5`,
      params: [actor.id, like, ref ? ref[1].toUpperCase() : '', ref ? Number(ref[2]) : -1, limit],
    });
    const reviews = reviewRows.map(r => ({ id: String(r.id), reference: `${str(r.key) || 'APP'}-${num(r.number)}`, title: str(r.title) ?? '', status: str(r.status) ?? '' }));
    if (!isManager(actor)) return { submissions: [], applicants: [], reviews };

    const [{ rows: subs }, { rows: people }] = await Promise.all([
      zite.sql({
        query: `
          SELECT s.id, s."number", s."title", s."status", s."programId", s."stageId", s."submittedAt", p."key", a."name" AS "applicantName",
            CASE WHEN ${ref ? `UPPER(p."key") = $2 AND s."number" = $3` : 'false'} THEN 0 WHEN s."title" ILIKE $1 THEN 1 WHEN a."name" ILIKE $1 THEN 2 ELSE 3 END AS rank
          FROM "Submissions" s LEFT JOIN "Programs" p ON p.id::text = s."programId" LEFT JOIN "Applicants" a ON a.id::text = s."applicantId"
          WHERE s."title" ILIKE $1 OR a."name" ILIKE $1 OR a."email" ILIKE $1 OR a."organization" ILIKE $1 OR s."answers" ILIKE $1
            ${ref ? `OR (UPPER(p."key") = $2 AND s."number" = $3)` : ''}
          ORDER BY rank ASC, s."submittedAt" DESC NULLS LAST LIMIT ${ref ? '$4' : '$2'}`,
        params: ref ? [like, ref[1].toUpperCase(), Number(ref[2]), limit] : [like, limit],
      }),
      zite.sql({
        query: `SELECT a.id, a."name", a."email", a."organization", (SELECT COUNT(*) FROM "Submissions" s WHERE s."applicantId" = a.id::text AND s."status" <> 'Draft') AS n
                FROM "Applicants" a WHERE a."name" ILIKE $1 OR a."email" ILIKE $1 OR a."organization" ILIKE $1 ORDER BY a."name" ASC LIMIT $2`,
        params: [like, Math.min(limit, 6)],
      }),
    ]);
    return {
      submissions: subs.map(s => ({
        id: String(s.id),
        reference: s.number ? `${str(s.key) || 'APP'}-${num(s.number)}` : 'Draft',
        title: str(s.title) ?? '',
        status: str(s.status) ?? '',
        programId: String(s.programId ?? ''),
        stageId: s.stageId ? String(s.stageId) : null,
        applicantName: str(s.applicantName) ?? '',
        submittedAt: iso(s.submittedAt),
      })),
      applicants: people.map(a => ({ id: String(a.id), name: str(a.name) ?? '', email: str(a.email) ?? '', organization: str(a.organization) ?? '', submissions: num(a.n) })),
      reviews,
    };
  },
});
