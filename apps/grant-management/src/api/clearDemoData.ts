import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { assertAdmin, getActor } from '@project/shared/server/members';
import { removeDemoData } from '../server/demo';

/**
 * Take the Riverbend demo out of a workspace that's ready for real use. See
 * `server/demo.ts` for what counts as demo; anything created since stays.
 */
export default createEndpoint({
  description: 'Remove the demo organization’s programs, submissions, applicants and people',
  authenticated: true,
  inputSchema: z.object({ dryRun: z.boolean().optional() }),
  outputSchema: z.object({ removed: z.number(), tables: z.record(z.number()), reset: z.array(z.string()).optional() }),
  execute: async ({ input, context }) => {
    const actor = await getActor(context);
    assertAdmin(actor);
    return removeDemoData(actor.id, { dryRun: input?.dryRun === true });
  },
});
