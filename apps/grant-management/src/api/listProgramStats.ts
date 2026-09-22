import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertManager, getActor } from '@project/shared/server/members';
import { num } from '@project/shared/server/sql';

/** Daily submission counts per program over the last N days, for the sparklines on the programs list. */

const Input = z.object({
  days: z.number().int().min(7).max(120).default(30),
  timeZone: z.string().max(64).regex(/^[A-Za-z0-9_+\-/]+$/).optional(),
});

export default createEndpoint({
  description: 'Daily submitted counts per program for sparklines',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({
    days: z.array(z.string()),
    programs: z.array(z.object({ programId: z.string(), total: z.number(), series: z.array(z.number()) })),
  }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw ?? {});
    if (!parsed.success) throw new ZiteError('Choose between 7 and 120 days', 'BAD_REQUEST');
    const { days, timeZone } = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);
    const tz = timeZone || 'UTC';

    const query = `
        WITH days AS (
          SELECT generate_series((NOW() AT TIME ZONE $2)::date - ($1::int - 1), (NOW() AT TIME ZONE $2)::date, INTERVAL '1 day')::date AS "day"
        ),
        sub AS (
          SELECT s."programId", (s."submittedAt" AT TIME ZONE $2)::date AS "day", COUNT(*) AS n
          FROM "Submissions" s
          WHERE s."status" <> 'Draft' AND s."submittedAt" IS NOT NULL AND s."submittedAt" >= NOW() - ($1::int + 1) * INTERVAL '1 day'
          GROUP BY 1, 2
        )
        SELECT p.id::text AS "programId", to_char(days."day", 'YYYY-MM-DD') AS "day", COALESCE(sub.n, 0) AS n
        FROM "Programs" p
        CROSS JOIN days
        LEFT JOIN sub ON sub."programId" = p.id::text AND sub."day" = days."day"
        ORDER BY p.id, days."day" ASC`;
    // An unrecognised zone falls back to UTC days rather than failing the list.
    const { rows } = await zite.sql({ query, params: [days, tz] }).catch(() => zite.sql({ query, params: [days, 'UTC'] }));

    const dayList: string[] = [];
    const byProgram = new Map<string, number[]>();
    for (const r of rows) {
      const pid = String(r.programId);
      if (!byProgram.has(pid)) byProgram.set(pid, []);
      const list = byProgram.get(pid)!;
      if (byProgram.size === 1) dayList.push(String(r.day));
      list.push(num(r.n));
    }
    return {
      days: dayList,
      programs: [...byProgram.entries()].map(([programId, series]) => ({ programId, series, total: series.reduce((a, b) => a + b, 0) })),
    };
  },
});
