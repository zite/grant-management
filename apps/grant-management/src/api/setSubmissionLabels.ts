import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { logActivity } from '@project/shared/server/activity';
import { assertManager, getActor } from '@project/shared/server/members';
import { ref } from '@project/shared/server/sql';

export default createEndpoint({
  description: 'Replace the labels on a submission',
  authenticated: true,
  inputSchema: z.object({ submissionId: z.string(), labelIds: z.array(z.string()).max(50) }),
  outputSchema: z.object({ labelIds: z.array(z.string()) }),
  execute: async ({ input, context }) => {
    const actor = await getActor(context);
    assertManager(actor);
    const labelIds = [...new Set((input.labelIds ?? []).filter(l => typeof l === 'string'))];
    const { rows: subRows } = await zite.sql({ query: `SELECT id, "programId", "applicantId" FROM "Submissions" WHERE id::text = $1`, params: [input.submissionId] });
    const s = subRows[0];
    if (!s) throw new ZiteError('Submission not found', 'NOT_FOUND');
    if (labelIds.length) {
      const { rows: valid } = await zite.sql({ query: `SELECT id::text AS id FROM "Labels" WHERE id::text = ANY($1::text[])`, params: [labelIds] });
      if (valid.length !== labelIds.length) throw new ZiteError('One of those labels no longer exists', 'BAD_REQUEST');
    }
    const { rows: existing } = await zite.sql({ query: `SELECT id, "labelId" FROM "SubmissionLabels" WHERE "submissionId" = $1`, params: [input.submissionId] });
    const current = new Set(existing.map(e => String(e.labelId)));
    const added = labelIds.filter(l => !current.has(l));
    const removed = existing.filter(e => !labelIds.includes(String(e.labelId)));
    if (added.length) await zite.submissionLabels.bulkCreate({ records: added.map(labelId => ({ name: 'label', submissionId: input.submissionId, labelId })) });
    for (const r of removed) await zite.submissionLabels.delete({ id: String(r.id) });
    if (added.length || removed.length) {
      await logActivity({
        type: 'labels_changed', submissionId: input.submissionId, programId: ref(s.programId), applicantId: ref(s.applicantId), actorId: actor.id, actorType: 'Member',
        data: { added, removed: removed.map(r => String(r.labelId)) },
      });
    }
    return { labelIds };
  },
});
