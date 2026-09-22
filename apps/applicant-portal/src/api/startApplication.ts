import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { checkEligibility, deriveSummary, eligibilityFields, parseFields, sanitizeAnswers } from '@project/shared/forms/logic';
import { logActivity } from '@project/shared/server/activity';
import { getApplicant } from '@project/shared/server/applicants';
import { applicationForm } from '@project/shared/server/pipeline';
import { num } from '@project/shared/server/sql';
import { assertReasonableSize, formatWhen, loadPublishedProgram, parseInput, prefillFromProfile, toPublicProgram } from '../server/portal';

const Input = z.object({
  slug: z.string().trim().min(1).max(200),
  eligibilityAnswers: z.record(z.any()).optional(),
});

const MAX_DRAFTS = 20;

/**
 * Start (or resume) an application. Eligibility is checked again here — the
 * portal's check is a courtesy; this one is the rule.
 */
export default createEndpoint({
  description: 'Start an application to a program, or return your existing draft',
  authenticated: true,
  inputSchema: Input,
  execute: async ({ input: raw, context }) => {
    const input = parseInput(Input, raw);
    assertReasonableSize(input.eligibilityAnswers);
    const row = await loadPublishedProgram({ slug: input.slug });
    const program = toPublicProgram(row);
    const applicant = await getApplicant(context);

    const { rows: mine } = await zite.sql({
      query: `
        SELECT id, "status" FROM "Submissions"
        WHERE "programId" = $1 AND "applicantId" = $2 AND "status" <> 'Withdrawn'
        ORDER BY created_at DESC`,
      params: [program.id, applicant.id],
    });
    const draft = mine.find(s => s.status === 'Draft');
    if (draft) return { id: String(draft.id), existing: true };

    if (!program.accepting) {
      if (program.phase === 'scheduled') throw new ZiteError(`${program.name} opens for applications on ${formatWhen(program.opensAt)}.`, 'CONFLICT');
      throw new ZiteError(`${program.name} closed on ${formatWhen(program.deadline)} and isn't accepting applications.`, 'CONFLICT');
    }

    const max = num(row.maxPerApplicant, 1) || 1;
    if (mine.length >= max) {
      throw new ZiteError(
        max === 1 ? `You've already applied to ${program.name}. Each applicant can submit one application.` : `You've already submitted ${mine.length} applications to ${program.name}, which is the most allowed.`,
        'CONFLICT',
      );
    }

    const { rows: draftCount } = await zite.sql({ query: `SELECT COUNT(*) AS n FROM "Submissions" WHERE "applicantId" = $1 AND "status" = 'Draft'`, params: [applicant.id] });
    if (num(draftCount[0]?.n) >= MAX_DRAFTS) {
      throw new ZiteError(`You have ${MAX_DRAFTS} applications in progress. Finish or delete one before starting another.`, 'CONFLICT');
    }

    const form = await applicationForm(program.id);
    if (!form) throw new ZiteError(`The application form for ${program.name} isn't ready yet. Please check back soon.`, 'CONFLICT');
    const fields = parseFields(form.fieldsJson);

    // Only answers to eligibility questions are accepted at this point.
    const eligibilityIds = new Set(eligibilityFields(fields).map(f => f.id));
    const sanitized = sanitizeAnswers(fields, input.eligibilityAnswers ?? {});
    const eligibilityAnswers = Object.fromEntries(Object.entries(sanitized).filter(([k]) => eligibilityIds.has(k.replace(/__other$/, ''))));
    const result = checkEligibility(fields, eligibilityAnswers);
    if (!result.eligible) throw new ZiteError(result.reasons[0].message, 'BAD_REQUEST');

    const answers = prefillFromProfile(fields, eligibilityAnswers, applicant);
    const summary = deriveSummary(fields, answers, form);
    const now = new Date().toISOString();
    const created = await zite.submissions.create({
      record: {
        title: summary.title || null,
        number: null,
        programId: program.id,
        applicantId: applicant.id,
        stageId: null,
        ownerId: null,
        status: 'Draft',
        answers: JSON.stringify(answers),
        requestedAmount: summary.amount,
        awardAmount: null,
        awardStatus: null,
        awardStartDate: null,
        awardEndDate: null,
        decisionReason: null,
        decisionNote: null,
        startedAt: now,
        lastSavedAt: now,
        submittedAt: null,
        stageEnteredAt: null,
        decidedAt: null,
        decidedById: null,
        notifiedAt: null,
        withdrawnAt: null,
        lastActivityAt: now,
        remindedAt: null,
      },
    });
    await logActivity({ type: 'started', submissionId: created.id, programId: program.id, applicantId: applicant.id, actorId: applicant.id, actorType: 'Applicant', occurredAt: now });
    return { id: created.id, existing: false };
  },
});
