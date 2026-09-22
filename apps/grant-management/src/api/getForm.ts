import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { parseFields } from '@project/shared/forms/logic';
import { assertManager, getActor } from '@project/shared/server/members';
import { iso, num, ref, str } from '@project/shared/server/sql';

export default createEndpoint({
  description: 'A form with its fields, for the builder, previews and answer columns',
  authenticated: true,
  inputSchema: z.object({ id: z.string() }),
  outputSchema: z.object({
    id: z.string(), programId: z.string(), name: z.string(), kind: z.string(), description: z.string(),
    fields: z.array(z.any()), titleFieldId: z.string().nullable(), amountFieldId: z.string().nullable(), position: z.number(),
    updatedAt: z.string().nullable(), submissionCount: z.number(),
  }),
  execute: async ({ input, context }) => {
    const actor = await getActor(context);
    assertManager(actor);
    const { rows } = await zite.sql({ query: `SELECT * FROM "Forms" WHERE id::text = $1`, params: [String(input.id)] });
    const f = rows[0];
    if (!f) throw new ZiteError('Form not found', 'NOT_FOUND');
    const counted = str(f.kind) === 'Application'
      ? await zite.sql({ query: `SELECT COUNT(*) AS n FROM "Submissions" WHERE "programId" = $1`, params: [String(f.programId)] })
      : await zite.sql({ query: `SELECT COUNT(*) AS n FROM "Tasks" WHERE "formId" = $1`, params: [String(f.id)] });
    return {
      id: String(f.id),
      programId: String(f.programId ?? ''),
      name: str(f.name) ?? '',
      kind: str(f.kind) || 'Application',
      description: str(f.description) ?? '',
      fields: parseFields(f.fields),
      titleFieldId: ref(f.titleFieldId),
      amountFieldId: ref(f.amountFieldId),
      position: num(f.position),
      updatedAt: iso(f.updated_at),
      submissionCount: num(counted.rows[0]?.n),
    };
  },
});
