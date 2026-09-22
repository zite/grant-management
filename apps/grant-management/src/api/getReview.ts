import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { getActor } from '@project/shared/server/members';
import { getReviewForReviewer } from '@project/shared/server/reviews';
import { getSettings } from '@project/shared/server/settings';

const criterion = z.object({ id: z.string(), name: z.string(), description: z.string().optional(), weight: z.number(), min: z.number(), max: z.number(), levels: z.array(z.object({ score: z.number(), label: z.string() })).optional() });

export const reviewDetailSchema = z.object({
  review: z.object({
    id: z.string(), status: z.string(), scores: z.record(z.number().nullable()), totalScore: z.number().nullable(), recommendation: z.string().nullable(),
    comment: z.string(), applicantFeedback: z.string(), recusalReason: z.string(), dueDate: z.string().nullable(), submittedAt: z.string().nullable(),
    locked: z.boolean(), lockedReason: z.string().nullable(),
  }),
  rubric: z.object({ id: z.string().nullable(), name: z.string(), instructions: z.string(), criteria: z.array(criterion), askRecommendation: z.boolean() }),
  submission: z.object({
    id: z.string(), reference: z.string(), title: z.string(), submittedAt: z.string().nullable(), requestedAmount: z.number().nullable(),
    applicantName: z.string().nullable(), applicantOrganization: z.string().nullable(), applicantLocation: z.string().nullable(),
  }),
  program: z.object({ id: z.string(), name: z.string(), key: z.string(), color: z.string(), icon: z.string(), blindReview: z.boolean(), currency: z.string() }),
  stageName: z.string(),
  fields: z.array(z.any()),
  answers: z.record(z.any()),
  peers: z.array(z.object({ reviewerName: z.string(), status: z.string(), totalScore: z.number().nullable(), recommendation: z.string().nullable(), comment: z.string() })).nullable(),
  queue: z.object({ index: z.number(), total: z.number(), prevId: z.string().nullable(), nextId: z.string().nullable() }),
});

export default createEndpoint({
  description: 'One review assigned to the signed-in person, with the application to score',
  authenticated: true,
  inputSchema: z.object({ id: z.string() }),
  outputSchema: reviewDetailSchema,
  execute: async ({ input, context }) => {
    const actor = await getActor(context);
    const settings = await getSettings();
    return getReviewForReviewer(String(input.id), actor.id, { currency: settings.currency });
  },
});
