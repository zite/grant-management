import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { getActor } from '@project/shared/server/members';
import { listReviewsForReviewer } from '@project/shared/server/reviews';

export default createEndpoint({
  description: "The signed-in person's review queue",
  authenticated: true,
  inputSchema: z.object({ filter: z.enum(['todo', 'done', 'all']).default('todo'), programId: z.string().optional() }),
  outputSchema: z.object({
    reviews: z.array(z.object({
      id: z.string(), status: z.string(), dueDate: z.string().nullable(), totalScore: z.number().nullable(), recommendation: z.string().nullable(),
      assignedAt: z.string().nullable(), submittedAt: z.string().nullable(), submissionId: z.string(), reference: z.string(), title: z.string(),
      applicantLabel: z.string().nullable(), programId: z.string(), programName: z.string(), programColor: z.string(), programIcon: z.string(),
      stageName: z.string(), blind: z.boolean(), closed: z.boolean(),
    })),
  }),
  execute: async ({ input, context }) => {
    const actor = await getActor(context);
    const filter = input?.filter === 'done' || input?.filter === 'all' ? input.filter : 'todo';
    return { reviews: await listReviewsForReviewer(actor.id, { filter, programId: input?.programId ?? null }) };
  },
});
