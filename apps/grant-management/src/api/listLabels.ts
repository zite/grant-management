import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertManager, getActor } from '@project/shared/server/members';
import { num, ref, str } from '@project/shared/server/sql';

/** Labels with how many submissions carry each, so a delete can say what it will affect. */
export default createEndpoint({
  description: 'List labels with their usage counts',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({
    labels: z.array(z.object({ id: z.string(), name: z.string(), color: z.string(), description: z.string(), programId: z.string().nullable(), usage: z.number() })),
  }),
  execute: async ({ context }) => {
    const actor = await getActor(context);
    assertManager(actor);
    const { rows } = await zite.sql({
      query: `
        SELECT l.id, l."name", l."color", l."description", l."programId",
          (SELECT COUNT(DISTINCT sl."submissionId") FROM "SubmissionLabels" sl JOIN "Submissions" s ON s.id::text = sl."submissionId" WHERE sl."labelId" = l.id::text) AS "usage"
        FROM "Labels" l
        ORDER BY LOWER(l."name") ASC`,
      params: [],
    });
    return {
      labels: rows.map(r => ({
        id: String(r.id),
        name: str(r.name) ?? '',
        color: str(r.color) || '#8b8d98',
        description: str(r.description) ?? '',
        programId: ref(r.programId),
        usage: num(r.usage),
      })),
    };
  },
});
