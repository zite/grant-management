import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { renderMerge } from '@project/shared/merge';
import { logActivity, type ActivityInput } from '@project/shared/server/activity';
import { buildMergeContext, findTemplate, messageApplicant } from '@project/shared/server/email';
import { assertManager, getActor } from '@project/shared/server/members';
import { getSettings } from '@project/shared/server/settings';
import { iso, num, numOrNull, ref, str } from '@project/shared/server/sql';

/**
 * Decisions, recorded privately and released deliberately.
 *
 *   decide  — set Accepted / Waitlisted / Declined. With `release`, the
 *             applicant is told now; without it, the decision waits so a
 *             committee can finish the whole slate first.
 *   release — tell applicants about decisions already made, each with the
 *             email for their outcome.
 *   reopen  — put decided submissions back in the pipeline. A released
 *             decision can be reopened, but the applicant has already been
 *             told, so the response says how many that affects.
 */

const Input = z.object({
  ids: z.array(z.string()).min(1).max(500),
  action: z.enum(['decide', 'release', 'reopen']),
  decision: z.enum(['Accepted', 'Waitlisted', 'Declined']).optional(),
  reason: z.string().max(200).nullable().optional(),
  note: z.string().max(5000).nullable().optional(),
  /** For a single acceptance. Bulk acceptances default each award to the amount requested. */
  awardAmount: z.number().min(0).nullable().optional(),
  release: z.boolean().optional(),
  /** Override the outcome's template for everyone in this batch. Merge tags are filled per applicant. */
  subject: z.string().max(200).optional(),
  body: z.string().max(20000).optional(),
});

export default createEndpoint({
  description: 'Record, release or reopen decisions on submissions',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ decided: z.number(), released: z.number(), reopened: z.number(), emailed: z.number(), failed: z.number(), skipped: z.number(), alreadyReleased: z.number() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid decision', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);
    if (input.action === 'decide' && !input.decision) throw new ZiteError('Choose a decision', 'BAD_REQUEST');

    const { rows } = await zite.sql({
      query: `
        SELECT s.*, p."name" AS "programName", p."key" AS "programKey", p."deadline" AS "programDeadline", p."awardMax" AS "programAwardMax",
          a."name" AS "applicantName", a."email" AS "applicantEmail"
        FROM "Submissions" s
        LEFT JOIN "Programs" p ON p.id::text = s."programId"
        LEFT JOIN "Applicants" a ON a.id::text = s."applicantId"
        WHERE s.id::text = ANY($1::text[])`,
      params: [input.ids],
    });
    const settings = await getSettings();
    const now = new Date().toISOString();
    const events: ActivityInput[] = [];
    const out = { decided: 0, released: 0, reopened: 0, emailed: 0, failed: 0, skipped: 0, alreadyReleased: 0 };
    const templateCache = new Map<string, Awaited<ReturnType<typeof findTemplate>>>();

    const release = async (r: Record<string, unknown>, status: string, awardAmount: number | null) => {
      const trigger = status as 'Accepted' | 'Declined' | 'Waitlisted';
      const cacheKey = `${trigger}:${r.programId}`;
      if (!templateCache.has(cacheKey)) templateCache.set(cacheKey, await findTemplate(trigger, String(r.programId)));
      const template = templateCache.get(cacheKey);
      const subjectTemplate = input.subject?.trim() || template?.subject || (status === 'Accepted' ? 'Good news about your application to {{program_name}}' : 'An update on your application to {{program_name}}');
      const bodyTemplate = input.body?.trim() || template?.body || (status === 'Accepted'
        ? 'Hi {{applicant_first_name}},\n\nCongratulations — your application "{{submission_title}}" has been selected for {{program_name}}.\n\n{{organization_name}}'
        : status === 'Waitlisted'
          ? 'Hi {{applicant_first_name}},\n\nYour application "{{submission_title}}" to {{program_name}} has been placed on our waitlist. We will be in touch if a place opens up.\n\n{{organization_name}}'
          : 'Hi {{applicant_first_name}},\n\nThank you for applying to {{program_name}}. We are sorry to say that "{{submission_title}}" was not selected this time.\n\n{{organization_name}}');
      const applicant = { id: String(r.applicantId), email: str(r.applicantEmail) ?? '', name: str(r.applicantName) };
      const ctx = buildMergeContext({
        settings,
        applicant,
        program: { name: str(r.programName), key: str(r.programKey), deadline: iso(r.programDeadline) },
        submission: { id: String(r.id), title: str(r.title), number: num(r.number), awardAmount },
      });
      const res = await messageApplicant({
        settings,
        applicant,
        submissionId: String(r.id),
        subject: renderMerge(subjectTemplate, ctx),
        body: renderMerge(bodyTemplate, ctx),
        kind: 'Decision',
        senderId: actor.id,
        templateId: input.subject || input.body ? null : template?.id ?? null,
        deliver: Boolean(applicant.email),
      });
      if (res.delivery === 'Sent') out.emailed++;
      else out.failed++;
      await zite.submissions.update({ id: String(r.id), record: { notifiedAt: now } });
      events.push({ type: 'decision_released', submissionId: String(r.id), programId: ref(r.programId), applicantId: ref(r.applicantId), actorId: actor.id, actorType: 'Member', data: { decision: status, delivery: res.delivery }, occurredAt: now });
      out.released++;
    };

    for (const r of rows) {
      const status = String(r.status);
      if (input.action === 'decide') {
        if (status === 'Draft' || status === 'Withdrawn') {
          out.skipped++;
          continue;
        }
        if (r.notifiedAt && status !== input.decision) {
          // Changing a decision the applicant already heard about needs a deliberate reopen first.
          out.alreadyReleased++;
          continue;
        }
        const award = input.decision === 'Accepted'
          ? (rows.length === 1 && input.awardAmount !== undefined ? input.awardAmount : numOrNull(r.awardAmount) ?? numOrNull(r.requestedAmount) ?? numOrNull(r.programAwardMax))
          : null;
        await zite.submissions.update({
          id: String(r.id),
          record: {
            status: input.decision,
            decidedAt: now,
            decidedById: actor.id,
            decisionReason: input.decision === 'Declined' ? input.reason ?? null : input.reason ?? null,
            ...(input.note !== undefined ? { decisionNote: input.note } : {}),
            awardAmount: award,
            awardStatus: input.decision === 'Accepted' ? (str(r.awardStatus) || 'Pending') : null,
          },
        });
        events.push({ type: 'decision', submissionId: String(r.id), programId: ref(r.programId), applicantId: ref(r.applicantId), actorId: actor.id, actorType: 'Member', data: { decision: input.decision, from: status, reason: input.reason ?? null, awardAmount: award }, occurredAt: now });
        out.decided++;
        if (input.release && !r.notifiedAt) await release(r, input.decision!, award);
      } else if (input.action === 'release') {
        if (!['Accepted', 'Declined', 'Waitlisted'].includes(status)) {
          out.skipped++;
          continue;
        }
        if (r.notifiedAt) {
          out.alreadyReleased++;
          continue;
        }
        await release(r, status, numOrNull(r.awardAmount));
      } else {
        if (!['Accepted', 'Declined', 'Waitlisted'].includes(status)) {
          out.skipped++;
          continue;
        }
        if (r.notifiedAt) out.alreadyReleased++;
        await zite.submissions.update({
          id: String(r.id),
          record: { status: 'Submitted', decidedAt: null, decidedById: null, notifiedAt: null, decisionReason: null, awardStatus: status === 'Accepted' ? 'Cancelled' : null },
        });
        events.push({ type: 'reopened', submissionId: String(r.id), programId: ref(r.programId), applicantId: ref(r.applicantId), actorId: actor.id, actorType: 'Member', data: { from: status, wasReleased: Boolean(r.notifiedAt) }, occurredAt: now });
        out.reopened++;
      }
    }

    await logActivity(events);
    return out;
  },
});
