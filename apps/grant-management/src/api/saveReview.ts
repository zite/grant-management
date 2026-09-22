import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { getActor } from '@project/shared/server/members';
import { saveReviewForReviewer } from '@project/shared/server/reviews';

const Input = z.object({
  id: z.string(),
  action: z.enum(['save', 'submit', 'recuse', 'reopen']),
  scores: z.record(z.number().nullable()).optional(),
  comment: z.string().max(20000).nullable().optional(),
  applicantFeedback: z.string().max(5000).nullable().optional(),
  recommendation: z.enum(['Yes', 'Maybe', 'No']).nullable().optional(),
  recusalReason: z.string().max(2000).nullable().optional(),
});

export default createEndpoint({
  description: 'Save, submit, recuse from or reopen your own review',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ status: z.string(), totalScore: z.number().nullable() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid review', 'BAD_REQUEST');
    const actor = await getActor(context);
    const { id, ...rest } = parsed.data;
    return saveReviewForReviewer(id, actor, rest, 'staff');
  },
});
