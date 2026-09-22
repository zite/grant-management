import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getApplicant } from '@project/shared/server/applicants';
import { loadOwnSubmission, parseInput } from '../server/portal';

const Input = z.object({ id: z.string().trim().min(1).max(100) });

/** Delete an unsubmitted draft and its history. Submitted applications are withdrawn, never deleted. */
export default createEndpoint({
  description: 'Delete one of your draft applications',
  authenticated: true,
  inputSchema: Input,
  execute: async ({ input: raw, context }) => {
    const { id } = parseInput(Input, raw);
    const applicant = await getApplicant(context);
    const sub = await loadOwnSubmission(applicant.id, id);
    if (sub.status !== 'Draft') throw new ZiteError('Only drafts can be deleted. You can withdraw a submitted application instead.', 'CONFLICT');
    const { rows } = await zite.sql({ query: `SELECT id FROM "Activity" WHERE "submissionId" = $1 LIMIT 2000`, params: [sub.id] });
    for (const r of rows) await zite.activity.delete({ id: String(r.id) });
    await zite.submissions.delete({ id: sub.id });
    return { deleted: true };
  },
});
