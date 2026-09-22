import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { checkForm } from '@project/shared/forms/builder';
import { newField } from '@project/shared/forms/catalog';
import { newId } from '@project/shared/forms/logic';
import { FIELD_TYPES, FILE_KINDS, isChoiceField, type FieldType, type FormField } from '@project/shared/forms/types';
import { assertManager, getActor } from '@project/shared/server/members';
import { getSettings } from '@project/shared/server/settings';
import { numOrNull, str } from '@project/shared/server/sql';
import { isConfigured, structured, truncate } from '../server/ai';

/**
 * Draft a form from a plain-language brief. Nothing is saved: the builder shows
 * the questions for review and the manager chooses to replace the form or add
 * them to the end. Without an Anthropic connection it says so, and the builder
 * offers the recommended starter form instead.
 */

const Input = z.object({
  programId: z.string().min(1),
  prompt: z.string().trim().min(1, 'Describe the form you need.').max(4000, 'Keep the description under 4,000 characters.'),
  kind: z.enum(['Application', 'Follow-up']),
  /** Labels already on the form, so added questions don't repeat them. */
  existingLabels: z.array(z.string()).max(300).optional(),
});

const Output = z.object({
  available: z.boolean(),
  fields: z.array(z.any()),
  titleFieldId: z.string().nullable(),
  amountFieldId: z.string().nullable(),
});

type Generated = {
  fields: Array<{
    type: FieldType;
    label: string;
    help: string;
    required: boolean;
    options: string[];
    width: 'full' | 'half';
    maxWords: number | null;
    hideFromReviewers: boolean;
    disqualifyingAnswers: string[];
    eligibilityMessage: string;
    fileKinds: string[];
    role: 'none' | 'title' | 'amount';
  }>;
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['fields'],
  properties: {
    fields: {
      type: 'array',
      description: 'The form, in order. Sections start a new step; content blocks are instructions with no answer.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'label', 'help', 'required', 'options', 'width', 'maxWords', 'hideFromReviewers', 'disqualifyingAnswers', 'eligibilityMessage', 'fileKinds', 'role'],
        properties: {
          type: { type: 'string', enum: [...FIELD_TYPES] },
          label: { type: 'string', description: 'The question, or the section heading. Empty for a content block.' },
          help: { type: 'string', description: 'Short guidance under the question, or the full text of a content block. Empty when not needed.' },
          required: { type: 'boolean' },
          options: { type: 'array', items: { type: 'string' }, description: 'Option labels for single_choice, multiple_choice and dropdown. Empty otherwise.' },
          width: { type: 'string', enum: ['full', 'half'], description: 'half pairs short inputs side by side (name + email).' },
          maxWords: { anyOf: [{ type: 'integer' }, { type: 'null' }], description: 'Word limit for long_text; null otherwise.' },
          hideFromReviewers: { type: 'boolean', description: 'True for names, contact details and demographics reviewers should not see.' },
          disqualifyingAnswers: { type: 'array', items: { type: 'string' }, description: 'For eligibility questions: the option labels (or "Yes"/"No") that make an applicant ineligible. Empty otherwise.' },
          eligibilityMessage: { type: 'string', description: 'What an ineligible applicant is told, kindly, with an alternative if one exists. Empty when not an eligibility question.' },
          fileKinds: { type: 'array', items: { type: 'string', enum: Object.keys(FILE_KINDS) }, description: 'Allowed kinds for file questions. Empty otherwise.' },
          role: { type: 'string', enum: ['none', 'title', 'amount'], description: 'title: the short_text naming the project. amount: the currency question for the amount requested. At most one of each.' },
        },
      },
    },
  },
};

const SYSTEM = `You design application and reporting forms for foundations, nonprofits and public funders. You write forms applicants find clear and respectful, and reviewers find easy to score.

Principles:
- Group questions into sections that become steps. Put eligibility screening first, in its own section, with a few decisive single_choice or yes_no questions and a kind, specific message for ineligible answers (point to an alternative where one exists).
- Ask only what the funder will actually use. Prefer 8–25 questions for an application, 4–12 for a follow-up report.
- Contact details (name, email, phone) and demographics are hideFromReviewers: true. Put name and email side by side with width "half".
- Narrative questions are long_text with realistic word limits (150–600). Make each question specific ("Who will benefit, and how will you reach them?"), never vague ("Tell us about your project").
- Grant applications ask for the amount requested as a currency question (role "amount"), a short project title (short_text, role "title"), and a budget upload (file, pdf + spreadsheet). Work samples use image/audio/video/pdf.
- Use single_choice for up to ~6 options, dropdown for longer lists, multiple_choice when several apply. Offer realistic options.
- Content blocks (type "content", empty label, text in help) are for brief instructions only — at most one or two.
- Plain, warm, sentence-case language. No jargon, no emojis.`;

export default createEndpoint({
  description: 'Draft form questions with AI from a description, for review in the builder',
  authenticated: true,
  inputSchema: Input,
  outputSchema: Output,
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Describe the form you need.', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);

    if (!isConfigured()) return { available: false, fields: [], titleFieldId: null, amountFieldId: null };

    const program = await zite.programs.findOne({ id: input.programId });
    if (!program) throw new ZiteError('That program no longer exists.', 'NOT_FOUND');
    const settings = await getSettings();
    const awardMin = numOrNull(program.awardMin);
    const awardMax = numOrNull(program.awardMax);

    const prompt = [
      `Draft ${input.kind === 'Application' ? 'the application form' : 'a follow-up form (sent to applicants after a decision, e.g. an agreement or report)'} for this program.`,
      '',
      `Program: ${str(program.name) ?? ''} (${str(program.type) || 'Grant'})`,
      program.summary ? `Summary: ${truncate(str(program.summary), 400)}` : '',
      program.description ? `Description: ${truncate(str(program.description), 1500)}` : '',
      program.eligibility ? `Eligibility notes: ${truncate(str(program.eligibility), 1200)}` : '',
      awardMin != null || awardMax != null ? `Awards: ${awardMin ?? '?'}–${awardMax ?? '?'} ${settings.currency}` : '',
      input.existingLabels?.length ? `\nThe form already asks (don't repeat these):\n${input.existingLabels.slice(0, 120).map(l => `- ${truncate(l, 140)}`).join('\n')}` : '',
      '',
      `What the program manager asked for:\n${input.prompt}`,
    ].filter(Boolean).join('\n');

    let result: Generated | null;
    try {
      result = await structured<Generated>({ system: SYSTEM, prompt, schema: SCHEMA, maxTokens: 16000, effort: 'low' });
    } catch (e) {
      console.error('aiGenerateForm failed', e);
      throw new ZiteError("The AI couldn't draft a form just now. Try again in a moment.", 'BAD_REQUEST');
    }
    if (!result?.fields?.length) throw new ZiteError("The AI didn't return any questions. Try describing the form differently.", 'BAD_REQUEST');

    let titleFieldId: string | null = null;
    let amountFieldId: string | null = null;
    const fields: FormField[] = [];

    for (const g of result.fields.slice(0, 80)) {
      if (!(FIELD_TYPES as readonly string[]).includes(g.type)) continue;
      const label = (g.label ?? '').trim().slice(0, 500);
      const help = (g.help ?? '').trim().slice(0, 4000);
      if (g.type === 'content') {
        if (help || label) fields.push(newField('content', { label: '', help: help || label }));
        continue;
      }
      if (!label) continue;
      if (g.type === 'section') {
        fields.push(newField('section', { label, ...(help ? { help } : {}) }));
        continue;
      }
      const f = newField(g.type, { label, required: Boolean(g.required) });
      if (help) f.help = help;
      else delete f.help;
      if (g.width === 'half') f.width = 'half';
      if (g.hideFromReviewers) f.hideFromReviewers = true;

      if (isChoiceField(f)) {
        const labels = [...new Set((g.options ?? []).map(o => String(o).trim().slice(0, 300)).filter(Boolean))].slice(0, 100);
        if (labels.length < 2) continue;
        f.options = labels.map(l => ({ id: newId('o'), label: l }));
      }
      if (f.type === 'long_text') f.maxWords = g.maxWords && g.maxWords > 0 ? Math.min(g.maxWords, 5000) : 300;
      if (f.type === 'file') {
        const kinds = [...new Set((g.fileKinds ?? []).filter(k => FILE_KINDS[k]))];
        f.accept = kinds.length ? kinds : ['pdf', 'document'];
        f.maxFiles = /sample|photo|image|portfolio/i.test(label) ? 5 : 1;
        f.maxSizeMb = 20;
      }
      if (f.type === 'currency' || f.type === 'number') f.min = 0;

      const disqualify = (g.disqualifyingAnswers ?? []).map(a => String(a).trim().toLowerCase()).filter(Boolean);
      if (disqualify.length && (isChoiceField(f) || f.type === 'yes_no')) {
        const values = f.type === 'yes_no'
          ? (['yes', 'no'] as const).filter(v => disqualify.includes(v))
          : f.options!.filter(o => disqualify.includes(o.label.toLowerCase())).map(o => o.id);
        const total = f.type === 'yes_no' ? 2 : f.options!.length;
        if (values.length && values.length < total) {
          f.eligibility = { disqualifyValues: [...values], ...(g.eligibilityMessage?.trim() ? { message: g.eligibilityMessage.trim().slice(0, 500) } : {}) };
          f.required = true;
        }
      }

      if (input.kind === 'Application') {
        if (g.role === 'title' && !titleFieldId && f.type === 'short_text') {
          titleFieldId = f.id;
          f.required = true;
        }
        if (g.role === 'amount' && !amountFieldId && (f.type === 'currency' || f.type === 'number')) {
          amountFieldId = f.id;
          f.required = true;
          if (awardMin != null) f.min = awardMin;
          if (awardMax != null) f.max = awardMax;
        }
      }
      fields.push(f);
    }

    // The same rules a save runs; anything the model got structurally wrong is dropped, not passed on.
    const checked = checkForm(fields, { kind: input.kind, titleFieldId, amountFieldId });
    const bad = new Set(checked.errors.map(e => e.fieldId).filter(Boolean));
    const clean = checked.fields.filter(f => !bad.has(f.id));
    return {
      available: true,
      fields: clean,
      titleFieldId: titleFieldId && clean.some(f => f.id === titleFieldId) ? titleFieldId : null,
      amountFieldId: amountFieldId && clean.some(f => f.id === amountFieldId) ? amountFieldId : null,
    };
  },
});
