import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { getPortalReviewer } from '@project/shared/server/members';
import { getReviewForReviewer } from '@project/shared/server/reviews';
import { getSettings } from '@project/shared/server/settings';
import { parseInput } from '../server/portal';

const Input = z.object({ id: z.string().trim().min(1).max(100) });

/** One review: the (redacted) application, the rubric and the reviewer's work so far. */
export default createEndpoint({
  description: 'One of your reviews, with the application and rubric',
  authenticated: true,
  inputSchema: Input,
  execute: async ({ input: raw, context }) => {
    const { id } = parseInput(Input, raw);
    const reviewer = await getPortalReviewer(context);
    if (!reviewer) throw new ZiteError("You don't have access to reviews. Sign in with the email address your invitation was sent to.", 'FORBIDDEN');
    const settings = await getSettings();
    return getReviewForReviewer(id, reviewer.id, { currency: settings.currency });
  },
});
