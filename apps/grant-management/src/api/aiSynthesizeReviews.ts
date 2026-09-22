import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { RECOMMENDATION_LABEL, parseCriteria, parseScores, type Recommendation } from '@project/shared/scoring';
import { assertManager, getActor } from '@project/shared/server/members';
import { numOrNull, ref, str } from '@project/shared/server/sql';
import { isConfigured, structured, truncate } from '../server/ai';

/**
 * Where a panel agrees, where it splits, and what's still unanswered — read
 * from the submitted reviews so a manager can run the discussion. Advisory:
 * it never produces a score or a decision.
 */
const Input = z.object({ id: z.string().min(1) });

type Synthesis = { consensus: string; agreements: string[]; disagreements: string[]; openQuestions: string[] };

const SCHEMA = {
  type: 'object',
  properties: {
    consensus: { type: 'string', description: 'Two or three sentences on where the panel lands overall and how strongly.' },
    agreements: { type: 'array', items: { type: 'string' }, description: 'Up to four points most reviewers make, each one short sentence.' },
    disagreements: { type: 'array', items: { type: 'string' }, description: 'Up to four points where reviewers diverge, naming who sees it which way and on which criterion.' },
    openQuestions: { type: 'array', items: { type: 'string' }, description: 'Up to three questions the panel should settle before deciding.' },
  },
  required: ['consensus', 'agreements', 'disagreements', 'openQuestions'],
  additionalProperties: false,
};

export default createEndpoint({
  description: 'Synthesize a panel’s submitted reviews into agreements, disagreements and open questions (AI, advisory)',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({
    available: z.boolean(),
    reviewCount: z.number(),
    consensus: z.string(),
    agreements: z.array(z.string()),
    disagreements: z.array(z.string()),
    openQuestions: z.array(z.string()),
  }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError('Which submission?', 'BAD_REQUEST');
    const actor = await getActor(context);
    assertManager(actor);
    const empty = { consensus: '', agreements: [], disagreements: [], openQuestions: [] };
    if (!isConfigured()) return { available: false, reviewCount: 0, ...empty };

    const { rows: subs } = await zite.sql({
      query: `SELECT s."title", s."requestedAmount", p."name" AS "programName" FROM "Submissions" s LEFT JOIN "Programs" p ON p.id::text = s."programId" WHERE s.id::text = $1`,
      params: [parsed.data.id],
    });
    const s = subs[0];
    if (!s) throw new ZiteError('Submission not found', 'NOT_FOUND');

    const { rows: reviews } = await zite.sql({
      query: `SELECT r."scores", r."totalScore", r."recommendation", r."comment", r."rubricId", m."name" AS "reviewerName", st."name" AS "stageName", rb."criteria"
              FROM "Reviews" r
              LEFT JOIN "Members" m ON m.id::text = r."reviewerId"
              LEFT JOIN "Stages" st ON st.id::text = r."stageId"
              LEFT JOIN "Rubrics" rb ON rb.id::text = r."rubricId"
              WHERE r."submissionId" = $1 AND r."status" = 'Submitted'
              ORDER BY r."submittedAt" ASC NULLS LAST
              LIMIT 12`,
      params: [parsed.data.id],
    });
    if (reviews.length < 2) throw new ZiteError('A synthesis needs at least two submitted reviews', 'BAD_REQUEST');

    const blocks = reviews.map((r, i) => {
      const criteria = parseCriteria(r.criteria);
      const scores = parseScores(r.scores);
      const scoreLines = criteria.map(c => `${c.name}: ${scores[c.id] ?? '—'}/${c.max}`).join('; ');
      const rec = ref(r.recommendation) as Recommendation | null;
      return [
        `Reviewer ${i + 1}: ${str(r.reviewerName) || 'Reviewer'}${r.stageName ? ` (${str(r.stageName)})` : ''}`,
        `Total: ${numOrNull(r.totalScore) ?? '—'}/100${rec ? ` · ${RECOMMENDATION_LABEL[rec] ?? rec}` : ''}`,
        scoreLines ? `Scores: ${scoreLines}` : '',
        `Comment: ${truncate(str(r.comment), 1500) || '(none)'}`,
      ].filter(Boolean).join('\n');
    });

    let result: Synthesis | null;
    try {
      result = await structured<Synthesis>({
        system: 'You help a grant manager prepare for a panel discussion. Summarize only what reviewers actually wrote and scored; refer to reviewers by first name; never invent reasons, never recommend a decision and never produce a new score. Plain, neutral, concise English.',
        prompt: `Application: "${str(s.title) || 'Untitled'}" to ${str(s.programName) || 'a program'}.\n\n${reviews.length} submitted reviews:\n\n${blocks.join('\n\n')}`,
        schema: SCHEMA,
        maxTokens: 1500,
      });
    } catch (e) {
      console.error('aiSynthesizeReviews failed', e instanceof Error ? e.message : e);
      throw new ZiteError('Couldn’t reach the AI service. Try again in a moment.', 'CONFLICT');
    }
    if (!result) throw new ZiteError('The AI synthesis isn’t available for these reviews right now', 'CONFLICT');
    return {
      available: true,
      reviewCount: reviews.length,
      consensus: result.consensus ?? '',
      agreements: (result.agreements ?? []).slice(0, 4),
      disagreements: (result.disagreements ?? []).slice(0, 4),
      openQuestions: (result.openQuestions ?? []).slice(0, 3),
    };
  },
});
