import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertManager, getActor } from '@project/shared/server/members';
import { Params, num } from '@project/shared/server/sql';
import { ORDERINGS, buildSubmissionWhere, mapSubmissionRow, orderBy, selectSubmissions, submissionFilterSchema, submissionRowSchema } from '../server/submissions';

const Input = z.object({
  filters: submissionFilterSchema.default({}),
  ordering: z.enum(ORDERINGS).default('submitted_desc'),
  limit: z.number().int().min(1).max(2000).default(1000),
  /** Answers are heavy; the table layout asks for them when it shows answer columns. */
  includeAnswers: z.boolean().optional(),
});

export default createEndpoint({
  description: 'List submissions with filters, ordering and review aggregates',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ submissions: z.array(submissionRowSchema), total: z.number(), truncated: z.boolean() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw ?? {});
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid filters', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);

    const p = new Params();
    const where = buildSubmissionWhere(input.filters, p, actor.id);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = p.add(input.limit);
    const { rows, truncated } = await zite.sql({
      query: `${selectSubmissions(Boolean(input.includeAnswers))} ${whereSql} ORDER BY ${orderBy(input.ordering)} LIMIT ${limit}`,
      params: p.values,
    });

    let total = rows.length;
    if (rows.length >= input.limit) {
      const cp = new Params();
      const countWhere = buildSubmissionWhere(input.filters, cp, actor.id);
      const { rows: countRows } = await zite.sql({
        query: `SELECT COUNT(*) AS n FROM (${selectSubmissions(false)} ${countWhere.length ? `WHERE ${countWhere.join(' AND ')}` : ''}) x`,
        params: cp.values,
      });
      total = num(countRows[0]?.n);
    }

    return {
      submissions: rows.map(r => mapSubmissionRow(r, Boolean(input.includeAnswers))),
      total,
      truncated: Boolean(truncated) || total > rows.length,
    };
  },
});
