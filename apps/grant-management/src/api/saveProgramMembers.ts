import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertManager, getActor } from '@project/shared/server/members';
import { notify } from '@project/shared/server/notify';
import { chunked, str } from '@project/shared/server/sql';

/**
 * A program's people: its reviewer pool (who automatic assignment draws from)
 * and its program managers (who hear about new submissions). Each call sends
 * both full sets, and the stored rows are made to match.
 */

const Input = z.object({
  programId: z.string().min(1),
  reviewerIds: z.array(z.string()).max(500),
  managerIds: z.array(z.string()).max(200),
});

export default createEndpoint({
  description: 'Replace a program’s reviewer pool and program managers',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ added: z.number(), removed: z.number() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw ?? {});
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Check the people you chose', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);

    const { rows: programs } = await zite.sql({ query: `SELECT id, "name", "key" FROM "Programs" WHERE id::text = $1`, params: [input.programId] });
    const program = programs[0];
    if (!program) throw new ZiteError('That program no longer exists', 'NOT_FOUND');

    const reviewerIds = [...new Set(input.reviewerIds)];
    const managerIds = [...new Set(input.managerIds)];
    const everyone = [...new Set([...reviewerIds, ...managerIds])];
    const { rows: members } = everyone.length
      ? await zite.sql({ query: `SELECT id, "name", "role", "status" FROM "Members" WHERE id::text = ANY($1::text[])`, params: [everyone] })
      : { rows: [] as Record<string, unknown>[] };
    const byId = new Map(members.map(m => [String(m.id), m]));
    for (const id of everyone) {
      const m = byId.get(id);
      if (!m) throw new ZiteError('One of those people is no longer in this workspace. Refresh and try again.', 'BAD_REQUEST');
      if (m.status === 'Deactivated') throw new ZiteError(`${str(m.name) || 'That person'} is deactivated and can’t be added`, 'BAD_REQUEST');
    }
    for (const id of managerIds) {
      const m = byId.get(id)!;
      if (m.role !== 'Admin' && m.role !== 'Manager') throw new ZiteError(`${str(m.name) || 'That person'} is a reviewer, so they can’t manage a program. Change their role in Settings › Members first.`, 'BAD_REQUEST');
    }

    const { rows: existing } = await zite.sql({ query: `SELECT id, "memberId", "role" FROM "ProgramMembers" WHERE "programId" = $1`, params: [input.programId] });
    const want = new Set([...reviewerIds.map(id => `Reviewer:${id}`), ...managerIds.map(id => `Manager:${id}`)]);
    const have = new Set<string>();
    let removed = 0;
    for (const row of existing) {
      const k = `${str(row.role) || 'Reviewer'}:${String(row.memberId)}`;
      // Duplicates of the same person and role collapse to one row.
      if (!want.has(k) || have.has(k)) {
        await zite.programMembers.delete({ id: String(row.id) });
        removed += 1;
      } else have.add(k);
    }
    const toAdd = [...want].filter(k => !have.has(k)).map(k => {
      const [role, memberId] = k.split(':');
      return { role, memberId };
    });
    await chunked(toAdd, async batch => {
      await zite.programMembers.bulkCreate({
        records: batch.map(a => ({ name: `${str(program.key) || 'APP'} · ${str(byId.get(a.memberId)?.name) || 'Member'}`, programId: input.programId, memberId: a.memberId, role: a.role })),
      });
    });

    const newReviewers = toAdd.filter(a => a.role === 'Reviewer').map(a => a.memberId);
    if (newReviewers.length) {
      await notify({
        recipientIds: newReviewers,
        type: 'review_assigned',
        title: `${actor.name} added you to the ${str(program.name) || 'program'} reviewer pool`,
        body: 'You’ll be assigned applications to review from this program.',
        programId: input.programId,
        actorId: actor.id,
        link: '/reviews',
      });
    }
    return { added: toAdd.length, removed };
  },
});
