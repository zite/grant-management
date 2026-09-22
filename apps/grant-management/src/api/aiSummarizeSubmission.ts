import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { answerToText, formatMoney, parseAnswers, parseFields, visibleFieldIds } from '@project/shared/forms/logic';
import { isInputField } from '@project/shared/forms/types';
import { assertManager, getActor } from '@project/shared/server/members';
import { getSettings } from '@project/shared/server/settings';
import { numOrNull, str } from '@project/shared/server/sql';
import { isConfigured, structured, truncate } from '../server/ai';

/**
 * A first read of an application for the person triaging it: what it is,
 * where it's strong, what to worry about and what to ask. Advisory only —
 * it never scores or decides, and the UI labels it as AI.
 */
const Input = z.object({ id: z.string().min(1) });

type Summary = { summary: string; strengths: string[]; concerns: string[]; questions: string[] };

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Two or three plain sentences: who is applying, what for, how much, and the gist of the plan.' },
    strengths: { type: 'array', items: { type: 'string' }, description: 'Up to four specific strengths, each one short sentence grounded in the answers.' },
    concerns: { type: 'array', items: { type: 'string' }, description: 'Up to four specific gaps or risks a reviewer should check, each one short sentence.' },
    questions: { type: 'array', items: { type: 'string' }, description: 'Up to three questions staff could ask the applicant.' },
  },
  required: ['summary', 'strengths', 'concerns', 'questions'],
  additionalProperties: false,
};

export default createEndpoint({
  description: 'Summarize an application with its strengths, concerns and questions to ask (AI, advisory)',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ available: z.boolean(), summary: z.string(), strengths: z.array(z.string()), concerns: z.array(z.string()), questions: z.array(z.string()) }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError('Which submission?', 'BAD_REQUEST');
    const actor = await getActor(context);
    assertManager(actor);
    const empty = { summary: '', strengths: [], concerns: [], questions: [] };
    if (!isConfigured()) return { available: false, ...empty };

    const { rows } = await zite.sql({
      query: `SELECT s."title", s."answers", s."requestedAmount", s."status", p.id AS "programId", p."name" AS "programName", p."type" AS "programType", p."summary" AS "programSummary",
                a."name" AS "applicantName", a."organization" AS "applicantOrganization",
                (SELECT f."fields" FROM "Forms" f WHERE f."programId" = p.id::text AND f."kind" = 'Application' ORDER BY f.created_at ASC LIMIT 1) AS "fields"
              FROM "Submissions" s
              LEFT JOIN "Programs" p ON p.id::text = s."programId"
              LEFT JOIN "Applicants" a ON a.id::text = s."applicantId"
              WHERE s.id::text = $1`,
      params: [parsed.data.id],
    });
    const s = rows[0];
    if (!s) throw new ZiteError('Submission not found', 'NOT_FOUND');
    const settings = await getSettings();
    const fields = parseFields(s.fields);
    const answers = parseAnswers(s.answers);
    const visible = visibleFieldIds(fields, answers);
    const qa = fields
      .filter(f => isInputField(f) && visible.has(f.id) && f.type !== 'file' && f.type !== 'email' && f.type !== 'phone')
      .map(f => {
        const text = answerToText(f, answers, { currency: settings.currency });
        return text ? `Q: ${f.label}\nA: ${truncate(text, f.type === 'long_text' ? 1500 : 200)}` : '';
      })
      .filter(Boolean)
      .join('\n\n');
    if (!qa) return { available: true, summary: 'There are no answers to summarize yet.', strengths: [], concerns: [], questions: [] };

    const amount = numOrNull(s.requestedAmount);
    const prompt = [
      `Program: ${str(s.programName)} (${str(s.programType) || 'Grant'}) at ${settings.organizationName}.`,
      s.programSummary ? `Program purpose: ${truncate(str(s.programSummary), 400)}` : '',
      `Application: "${str(s.title) || 'Untitled'}" from ${str(s.applicantName) || 'an applicant'}${s.applicantOrganization ? ` (${str(s.applicantOrganization)})` : ''}${amount != null ? `, requesting ${formatMoney(amount, settings.currency)}` : ''}.`,
      '',
      'Answers:',
      qa.length > 14000 ? `${qa.slice(0, 14000)}…` : qa,
    ].join('\n');

    let result: Summary | null;
    try {
      result = await structured<Summary>({
        system: 'You help grant managers at a community foundation triage applications. Be concrete and fair, cite what the applicant actually wrote, never invent facts, and do not recommend a decision or a score. Plain, warm, professional English.',
        prompt,
        schema: SCHEMA,
        maxTokens: 1500,
      });
    } catch (e) {
      console.error('aiSummarizeSubmission failed', e instanceof Error ? e.message : e);
      throw new ZiteError('Couldn’t reach the AI service. Try again in a moment.', 'CONFLICT');
    }
    if (!result) throw new ZiteError('The AI summary isn’t available for this application right now', 'CONFLICT');
    return {
      available: true,
      summary: result.summary ?? '',
      strengths: (result.strengths ?? []).slice(0, 4),
      concerns: (result.concerns ?? []).slice(0, 4),
      questions: (result.questions ?? []).slice(0, 3),
    };
  },
});
