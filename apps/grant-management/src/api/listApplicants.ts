import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertManager, getActor } from '@project/shared/server/members';
import { Params, iso, num, str } from '@project/shared/server/sql';

/**
 * Everyone who has applied, or been added by staff, with their track record
 * worked out in SQL: applications (drafts excluded), how many were accepted,
 * what they asked for, what they were awarded and when they were last active.
 */

const Input = z.object({
  search: z.string().max(200).optional(),
  programId: z.string().nullable().optional(),
  sort: z.enum(['name', 'last_active', 'applications', 'awarded']).default('name'),
});

const ORDER: Record<z.infer<typeof Input>['sort'], string> = {
  name: `LOWER(a."name") ASC, a.created_at ASC`,
  last_active: `"lastActive" DESC NULLS LAST, LOWER(a."name") ASC`,
  applications: `"applications" DESC, "accepted" DESC, LOWER(a."name") ASC`,
  awarded: `"awarded" DESC, "accepted" DESC, LOWER(a."name") ASC`,
};

export default createEndpoint({
  description: 'List applicants with application counts, awards and last activity',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({
    applicants: z.array(z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      organization: z.string(),
      phone: z.string(),
      location: z.string(),
      website: z.string(),
      applications: z.number(),
      drafts: z.number(),
      accepted: z.number(),
      requested: z.number(),
      awarded: z.number(),
      programIds: z.array(z.string()),
      joinedAt: z.string().nullable(),
      lastActiveAt: z.string().nullable(),
    })),
    total: z.number(),
  }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw ?? {});
    if (!parsed.success) throw new ZiteError('That applicant search isn’t valid', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);

    const p = new Params();
    const where: string[] = [];
    const q = input.search?.trim();
    if (q) {
      const like = p.add(`%${q.replace(/[%_\\]/g, m => `\\${m}`)}%`);
      where.push(`(a."name" ILIKE ${like} OR a."email" ILIKE ${like} OR a."organization" ILIKE ${like})`);
    }
    if (input.programId) {
      where.push(`EXISTS (SELECT 1 FROM "Submissions" sx WHERE sx."applicantId" = a.id::text AND sx."programId" = ${p.add(input.programId)})`);
    }

    const { rows } = await zite.sql({
      query: `
        SELECT a.id, a."name", a."email", a."organization", a."phone", a."location", a."website", a."joinedAt", a.created_at,
          COALESCE(agg."applications", 0) AS "applications", COALESCE(agg."drafts", 0) AS "drafts", COALESCE(agg."accepted", 0) AS "accepted",
          COALESCE(agg."requested", 0) AS "requested", COALESCE(agg."awarded", 0) AS "awarded", agg."programIds",
          GREATEST(a."lastActiveAt", agg."lastSubmissionActivity") AS "lastActive",
          LEAST(COALESCE(a."joinedAt", a.created_at), agg."firstStarted") AS "joined"
        FROM "Applicants" a
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) FILTER (WHERE s."status" <> 'Draft') AS "applications",
            COUNT(*) FILTER (WHERE s."status" = 'Draft') AS "drafts",
            COUNT(*) FILTER (WHERE s."status" = 'Accepted') AS "accepted",
            SUM(s."requestedAmount") FILTER (WHERE s."status" <> 'Draft') AS "requested",
            SUM(s."awardAmount") FILTER (WHERE s."status" = 'Accepted' AND COALESCE(s."awardStatus", '') <> 'Cancelled') AS "awarded",
            STRING_AGG(DISTINCT s."programId", ',') FILTER (WHERE COALESCE(s."programId", '') <> '') AS "programIds",
            MAX(GREATEST(s."submittedAt", s."lastSavedAt", s."startedAt")) AS "lastSubmissionActivity",
            MIN(COALESCE(s."startedAt", s."submittedAt")) AS "firstStarted"
          FROM "Submissions" s WHERE s."applicantId" = a.id::text
        ) agg ON true
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY ${ORDER[input.sort]}
        LIMIT 2000`,
      params: p.values,
    });

    return {
      applicants: rows.map(r => ({
        id: String(r.id),
        name: str(r.name) ?? '',
        email: str(r.email) ?? '',
        organization: str(r.organization) ?? '',
        phone: str(r.phone) ?? '',
        location: str(r.location) ?? '',
        website: str(r.website) ?? '',
        applications: num(r.applications),
        drafts: num(r.drafts),
        accepted: num(r.accepted),
        requested: num(r.requested),
        awarded: num(r.awarded),
        programIds: (str(r.programIds) ?? '').split(',').filter(Boolean),
        joinedAt: iso(r.joined),
        lastActiveAt: iso(r.lastActive),
      })),
      total: rows.length,
    };
  },
});
