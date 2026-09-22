import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { getPortalReviewer } from '@project/shared/server/members';
import { listReviewsForReviewer } from '@project/shared/server/reviews';
import { parseInput } from '../server/portal';

const Input = z.object({ filter: z.enum(['todo', 'done', 'all']).default('todo') });

/** A volunteer reviewer's queue. Only people the organization added as members can review. */
export default createEndpoint({
  description: 'The reviews assigned to you',
  authenticated: true,
  inputSchema: Input,
  execute: async ({ input: raw, context }) => {
    const { filter } = parseInput(Input, raw);
    const reviewer = await getPortalReviewer(context);
    if (!reviewer) throw new ZiteError("You don't have any reviews here. If you were invited to review, sign in with the email address the invitation was sent to.", 'FORBIDDEN');
    const [items, todo] = await Promise.all([
      listReviewsForReviewer(reviewer.id, { filter }),
      filter === 'todo' ? Promise.resolve(null) : listReviewsForReviewer(reviewer.id, { filter: 'todo' }),
    ]);
    return { reviews: items, todoCount: (todo ?? items).length, reviewerName: reviewer.name };
  },
});
