import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '@project/shared/server/members';
import { parseCriteria, parseScores, RECOMMENDATION_LABEL, type Recommendation, type RubricCriterion } from '@project/shared/scoring';
import { ref, str } from '@project/shared/server/sql';
import { isConfigured, structured, truncate } from '../server/ai';

/**
 * Turns a reviewer's own scores and notes into a first draft of feedback the
 * applicant may read. It only ever sees the rubric, the reviewer's scoring and
 * the application's title — never who applied — so a blind review stays blind
 * and the draft can't lean on anything the reviewer didn't write.
 */

const Input = z.object({
  reviewId: z.string().min(1),
  tone: z.enum(['encouraging', 'direct']).optional(),
});

const SCHEMA = {
  type: 'object',
  properties: {
    feedback: { type: 'string', description: 'The feedback, as plain text paragraphs addressed to the applicant.' },
  },
  required: ['feedback'],
  additionalProperties: false,
};

const SYSTEM = `You help volunteer grant reviewers write feedback that an applicant may read.
Write in plain, warm, specific language, addressed to the applicant as "you". 90–160 words, two or three short paragraphs, no headings, no bullet lists, no sign-off.
Only use what the reviewer wrote and scored. Never invent facts about the application, never mention scores as numbers, weights, the rubric by name, other reviewers, the committee's deliberations, or whether the application will be funded.
Name one or two genuine strengths first, then the most useful things to strengthen next time. If the reviewer's notes include anything unkind, confidential or about the applicant as a person, leave it out.`;

export default createEndpoint({
  description: "Draft applicant-facing feedback from the reviewer's own scores and notes",
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ available: z.boolean(), feedback: z.string() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError('Choose a review to draft feedback for', 'BAD_REQUEST');
    const actor = await getActor(context);
    const { reviewId, tone = 'encouraging' } = parsed.data;

    const { rows } = await zite.sql({
      query: `
        SELECT r."reviewerId", r."status", r."scores", r."comment", r."recommendation", r."rubricId", r."stageId",
          s."title" AS "submissionTitle", p."name" AS "programName"
        FROM "Reviews" r
        LEFT JOIN "Submissions" s ON s.id::text = r."submissionId"
        LEFT JOIN "Programs" p ON p.id::text = r."programId"
        WHERE r.id::text = $1
        LIMIT 1`,
      params: [reviewId],
    });
    const r = rows[0];
    // The same rule as the reviewer's own review endpoints: someone else's review reads as missing.
    if (!r || String(r.reviewerId) !== actor.id) throw new ZiteError('Review not found', 'NOT_FOUND');

    if (!isConfigured()) return { available: false, feedback: '' };

    let rubricId = ref(r.rubricId);
    if (!rubricId && ref(r.stageId)) {
      const { rows: st } = await zite.sql({ query: `SELECT "rubricId" FROM "Stages" WHERE id::text = $1`, params: [String(r.stageId)] });
      rubricId = ref(st[0]?.rubricId);
    }
    let criteria: RubricCriterion[] = [];
    if (rubricId) {
      const { rows: rb } = await zite.sql({ query: `SELECT "criteria" FROM "Rubrics" WHERE id::text = $1`, params: [rubricId] });
      criteria = parseCriteria(rb[0]?.criteria);
    }

    const scores = parseScores(r.scores);
    const comment = str(r.comment) ?? '';
    const scored = criteria.filter(c => scores[c.id] != null);
    if (scored.length === 0 && !comment.trim()) {
      throw new ZiteError('Score the application or write a few notes first, so there is something to draft from', 'BAD_REQUEST');
    }

    const lines = criteria.map(c => {
      const s = scores[c.id];
      if (s == null) return `- ${c.name}: not scored${c.description ? ` (${truncate(c.description, 160)})` : ''}`;
      const level = c.levels?.find(l => l.score === s)?.label;
      const share = (s - c.min) / Math.max(1, c.max - c.min);
      const band = share >= 0.75 ? 'a strength' : share >= 0.5 ? 'solid' : share >= 0.25 ? 'needs work' : 'a significant gap';
      return `- ${c.name}: ${level ? `"${level}", ` : ''}${band}${c.description ? ` (${truncate(c.description, 160)})` : ''}`;
    });
    const rec = ref(r.recommendation) as Recommendation | null;

    const prompt = [
      `Program: ${str(r.programName) ?? 'Grant program'}`,
      `Application title: ${truncate(str(r.submissionTitle) ?? 'Untitled application', 160)}`,
      '',
      'How the reviewer assessed each criterion:',
      lines.length ? lines.join('\n') : '- (this rubric has no criteria)',
      rec ? `Reviewer's overall view: ${RECOMMENDATION_LABEL[rec]} (do not reveal this)` : '',
      '',
      "Reviewer's private notes for the committee (source material only — do not quote them directly):",
      comment.trim() ? truncate(comment, 4000) : '(none)',
      '',
      tone === 'direct'
        ? 'Tone: direct and constructive — clear about what fell short, still respectful.'
        : 'Tone: encouraging — lead with what works and frame gaps as next steps.',
    ].filter(l => l !== null).join('\n');

    let out: { feedback?: string } | null = null;
    try {
      out = await structured<{ feedback: string }>({ system: SYSTEM, prompt, schema: SCHEMA, maxTokens: 1200, effort: 'low' });
    } catch (e) {
      console.error('aiDraftApplicantFeedback failed', e);
      throw new ZiteError("Couldn't draft feedback right now. Try again in a moment.", 'CONFLICT');
    }
    const feedback = (out?.feedback ?? '').trim();
    if (!feedback) throw new ZiteError("Couldn't draft feedback from these notes. Try adding a little more detail.", 'CONFLICT');
    return { available: true, feedback: feedback.slice(0, 5000) };
  },
});
