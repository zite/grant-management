import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { parseAnswers, parseFields } from '@project/shared/forms/logic';
import { getApplicant } from '@project/shared/server/applicants';
import { applicationForm } from '@project/shared/server/pipeline';
import { getSettings } from '@project/shared/server/settings';
import { day, iso, ref, str } from '@project/shared/server/sql';
import { applicantStatus, isDecision, reference } from '@project/shared/status';
import { loadOwnSubmission, loadProgramRow, parseInput, toPublicProgram, visibleStatus } from '../server/portal';

const Input = z.object({ id: z.string().trim().min(1).max(100) });

/**
 * One of the applicant's own applications, as the applicant may see it.
 *
 * What is NOT here is the point: no reviews, scores, notes, owner, stage
 * names, decision reasons, or award before a decision is released. Status is
 * always run through `applicantStatus`, which never reveals an unreleased
 * decision.
 */
export default createEndpoint({
  description: 'One of your applications: answers, status, messages and tasks',
  authenticated: true,
  inputSchema: Input,
  execute: async ({ input: raw, context }) => {
    const { id } = parseInput(Input, raw);
    const applicant = await getApplicant(context);
    const sub = await loadOwnSubmission(applicant.id, id);
    const [programRow, form, settings] = await Promise.all([loadProgramRow({ id: sub.programId }), applicationForm(sub.programId), getSettings()]);
    const program = programRow ? toPublicProgram(programRow) : null;

    const released = Boolean(sub.notifiedAt) && isDecision(sub.status);
    const status = applicantStatus({ status: sub.status, notifiedAt: sub.notifiedAt, stageKind: sub.stageKind });
    const isDraft = sub.status === 'Draft';

    const [{ rows: messageRows }, { rows: taskRows }] = await Promise.all([
      isDraft
        ? Promise.resolve({ rows: [] as Array<Record<string, unknown>> })
        : zite.sql({
            query: `SELECT id, "subject", "body", "direction", "kind", "sentAt", "readAt" FROM "Messages" WHERE "submissionId" = $1 AND "applicantId" = $2 ORDER BY "sentAt" ASC NULLS LAST, created_at ASC`,
            params: [sub.id, applicant.id],
          }),
      zite.sql({
        query: `SELECT id, "title", "status", "dueDate", "requestedAt", "submittedAt", "reviewedAt", "reviewNote" FROM "Tasks" WHERE "submissionId" = $1 AND "applicantId" = $2 ORDER BY "requestedAt" ASC NULLS LAST, created_at ASC`,
        params: [sub.id, applicant.id],
      }),
    ]);

    // Opening the application is reading the thread.
    const unreadIds = messageRows.filter(m => m.direction === 'Outbound' && !m.readAt).map(m => String(m.id));
    const now = new Date().toISOString();
    for (const messageId of unreadIds) {
      await zite.messages.update({ id: messageId, record: { readAt: now } });
    }

    const reviewReached = sub.stageKind === 'Review' || sub.stageKind === 'Decision' || isDecision(sub.status);
    const timeline: Array<{ key: string; label: string; at: string | null; done: boolean }> = [{ key: 'started', label: 'Started', at: sub.startedAt, done: true }];
    if (!isDraft) {
      timeline.push({ key: 'submitted', label: 'Submitted', at: sub.submittedAt, done: Boolean(sub.submittedAt) });
      if (sub.status === 'Withdrawn') {
        timeline.push({ key: 'withdrawn', label: 'Withdrawn', at: sub.withdrawnAt, done: true });
      } else {
        timeline.push({ key: 'review', label: 'Under review', at: null, done: reviewReached });
        timeline.push({ key: 'decision', label: released ? status.label : 'Decision', at: released ? sub.notifiedAt : null, done: released });
      }
    } else {
      timeline.push({ key: 'submitted', label: 'Submitted', at: null, done: false });
    }

    return {
      application: {
        id: sub.id,
        status: visibleStatus(sub.status, sub.notifiedAt),
        title: sub.title,
        reference: sub.number ? reference(program?.key, sub.number) : null,
        answers: parseAnswers(sub.answers),
        startedAt: sub.startedAt,
        lastSavedAt: sub.lastSavedAt,
        submittedAt: sub.submittedAt,
        withdrawnAt: sub.withdrawnAt,
        releasedAt: released ? sub.notifiedAt : null,
        awardAmount: released && sub.status === 'Accepted' ? sub.awardAmount : null,
        canEdit: isDraft && Boolean(program?.accepting),
        // Withdrawal is offered for anything the applicant sees as undecided, so an unreleased decision can't be inferred from a missing button.
        canWithdraw: sub.status === 'Submitted' || (isDecision(sub.status) && !released),
      },
      status,
      program: program
        ? {
            ...program,
            contactEmail: programRow ? ref(programRow.contactEmail) : null,
            confirmationMessage: programRow ? str(programRow.confirmationMessage) ?? '' : '',
          }
        : null,
      form: { fields: form ? parseFields(form.fieldsJson) : [], description: form?.description ?? '' },
      organizationName: settings.organizationName,
      currency: settings.currency,
      messages: messageRows.map(m => ({
        id: String(m.id),
        subject: str(m.subject) ?? '',
        body: str(m.body) ?? '',
        direction: m.direction === 'Inbound' ? ('Inbound' as const) : ('Outbound' as const),
        kind: str(m.kind) || 'Message',
        sentAt: iso(m.sentAt),
        unread: unreadIds.includes(String(m.id)),
      })),
      tasks: taskRows.map(t => ({
        id: String(t.id),
        title: str(t.title) || 'Request',
        status: str(t.status) || 'Open',
        dueDate: day(t.dueDate),
        requestedAt: iso(t.requestedAt),
        submittedAt: iso(t.submittedAt),
        reviewNote: t.status === 'Returned' ? str(t.reviewNote) ?? '' : '',
      })),
      timeline,
    };
  },
});
