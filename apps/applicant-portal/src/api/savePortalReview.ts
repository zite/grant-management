import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { getPortalReviewer } from '@project/shared/server/members';
import { saveReviewForReviewer } from '@project/shared/server/reviews';
import { parseInput } from '../server/portal';

const Input = z.object({
  id: z.string().trim().min(1).max(100),
  action: z.enum(['save', 'submit', 'recuse', 'reopen']),
  scores: z.record(z.number().nullable()).optional(),
  comment: z.string().max(20000, 'Keep committee notes under 20,000 characters.').nullable().optional(),
  applicantFeedback: z.string().max(5000, 'Keep feedback for the applicant under 5,000 characters.').nullable().optional(),
  recommendation: z.enum(['Yes', 'Maybe', 'No']).nullable().optional(),
  recusalReason: z.string().max(2000, 'Keep the reason under 2,000 characters.').nullable().optional(),
});

/** Save, submit, recuse from or reopen your own review, from the portal. */
export default createEndpoint({
  description: 'Save or submit one of your reviews',
  authenticated: true,
  inputSchema: Input,
  execute: async ({ input: raw, context }) => {
    const { id, ...rest } = parseInput(Input, raw);
    const reviewer = await getPortalReviewer(context);
    if (!reviewer) throw new ZiteError("You don't have access to reviews. Sign in with the email address your invitation was sent to.", 'FORBIDDEN');
    return saveReviewForReviewer(id, reviewer, rest, 'portal');
  },
});
