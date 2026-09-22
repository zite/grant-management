import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertManager, getActor } from '@project/shared/server/members';
import { autoAssign, createReviews, loadProgram } from '@project/shared/server/pipeline';
import { ref } from '@project/shared/server/sql';

/**
 * Put reviewers on submissions, either by name or by balancing the program's
 * reviewer pool. Assignments are always for a submission's CURRENT stage, so
 * the scorecard matches the step it's in.
 */

const Input = z.object({
  submissionIds: z.array(z.string()).min(1).max(500),
  mode: z.enum(['manual', 'auto']),
  reviewerIds: z.array(z.string()).optional(),
  /** Auto mode: reviewers per submission. Defaults to the program's setting. */
  count: z.number().int().min(1).max(10).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export default createEndpoint({
  description: 'Assign reviewers to submissions by hand or by balancing the reviewer pool',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ created: z.number(), skipped: z.number(), message: z.string().nullable() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid assignment', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);

    const { rows } = await zite.sql({ query: `SELECT id, "programId", "stageId", "status" FROM "Submissions" WHERE id::text = ANY($1::text[])`, params: [input.submissionIds] });
    const eligible = rows.filter(r => r.status === 'Submitted' && ref(r.stageId));
    let skipped = rows.length - eligible.length;
    let created = 0;
    let message: string | null = null;

    if (input.mode === 'manual') {
      const reviewerIds = [...new Set(input.reviewerIds ?? [])];
      if (!reviewerIds.length) throw new ZiteError('Choose at least one reviewer', 'BAD_REQUEST');
      const { rows: members } = await zite.sql({ query: `SELECT id::text AS id FROM "Members" WHERE id::text = ANY($1::text[]) AND COALESCE("status", '') <> 'Deactivated'`, params: [reviewerIds] });
      if (members.length !== reviewerIds.length) throw new ZiteError('One of those reviewers is no longer active', 'BAD_REQUEST');
      const groups = new Map<string, { programId: string; ids: string[] }>();
      for (const r of eligible) {
        const k = `${r.programId}:${r.stageId}`;
        if (!groups.has(k)) groups.set(k, { programId: String(r.programId), ids: [] });
        groups.get(k)!.ids.push(String(r.id));
      }
      for (const [k, g] of groups) {
        const stageId = k.split(':')[1];
        const n = await createReviews({
          assignments: g.ids.flatMap(submissionId => reviewerIds.map(reviewerId => ({ submissionId, reviewerId }))),
          stageId,
          programId: g.programId,
          actor,
          dueDate: input.dueDate ?? null,
        });
        created += n;
      }
      const possible = eligible.length * reviewerIds.length;
      if (created < possible) message = `${possible - created} assignment${possible - created === 1 ? ' was' : 's were'} already in place`;
    } else {
      const groups = new Map<string, { programId: string; stageId: string; ids: string[] }>();
      for (const r of eligible) {
        const k = `${r.programId}:${r.stageId}`;
        if (!groups.has(k)) groups.set(k, { programId: String(r.programId), stageId: String(r.stageId), ids: [] });
        groups.get(k)!.ids.push(String(r.id));
      }
      const noPool: string[] = [];
      for (const g of groups.values()) {
        const program = await loadProgram(g.programId);
        const target = input.count ?? (program?.reviewersPerSubmission || 2);
        const res = await autoAssign({ submissionIds: g.ids, stageId: g.stageId, programId: g.programId, target, actor, dueDate: input.dueDate ?? undefined });
        if (res.reason === 'no_pool') {
          noPool.push(program?.name ?? 'a program');
          skipped += g.ids.length;
        }
        created += res.created;
      }
      if (noPool.length) message = `Add reviewers to ${noPool.join(' and ')} in its settings first`;
      else if (created === 0) message = 'Every submission already has enough reviewers';
    }
    return { created, skipped, message };
  },
});
