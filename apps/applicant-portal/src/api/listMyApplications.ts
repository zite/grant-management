import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { completion, parseAnswers, parseFields } from '@project/shared/forms/logic';
import type { FormField } from '@project/shared/forms/types';
import { findApplicantByEmail, getApplicant } from '@project/shared/server/applicants';
import { getPortalReviewer } from '@project/shared/server/members';
import { day, iso, num, numOrNull, str } from '@project/shared/server/sql';
import { acceptingSubmissions, applicantStatus, programPhase, reference } from '@project/shared/status';
import { visibleStatus } from '../server/portal';

/** Everything the signed-in applicant has started, submitted or been asked for. */
export default createEndpoint({
  description: 'Your applications and the tasks waiting on you',
  authenticated: true,
  inputSchema: z.object({}),
  execute: async ({ context }) => {
    // A panelist who has never applied gets an empty list, not an applicant record.
    const reviewer = await getPortalReviewer(context);
    const applicant = reviewer ? await findApplicantByEmail(context.user?.email ?? '') : await getApplicant(context);
    if (!applicant) return { applications: [], tasks: [] };
    const [{ rows }, { rows: taskRows }] = await Promise.all([
      zite.sql({
        query: `
          SELECT s.id, s."title", s."number", s."status", s."programId", s."startedAt", s."lastSavedAt", s."submittedAt", s."withdrawnAt", s."notifiedAt",
            CASE WHEN s."status" = 'Draft' THEN s."answers" ELSE '' END AS "draftAnswers",
            st."kind" AS "stageKind",
            p."name" AS "programName", p."slug" AS "programSlug", p."key" AS "programKey", p."color" AS "programColor", p."icon" AS "programIcon",
            p."type" AS "programType", p."status" AS "programStatus", p."opensAt", p."deadline", p."allowLate",
            (SELECT COUNT(*) FROM "Messages" m WHERE m."submissionId" = s.id::text AND m."direction" = 'Outbound' AND m."readAt" IS NULL) AS "unread",
            (SELECT COUNT(*) FROM "Tasks" t WHERE t."submissionId" = s.id::text AND t."applicantId" = $1 AND t."status" IN ('Open', 'Returned')) AS "openTasks"
          FROM "Submissions" s
          LEFT JOIN "Programs" p ON p.id::text = s."programId"
          LEFT JOIN "Stages" st ON st.id::text = s."stageId"
          WHERE s."applicantId" = $1
          ORDER BY COALESCE(s."submittedAt", s."lastSavedAt", s."startedAt", s.created_at) DESC
          LIMIT 500`,
        params: [applicant.id],
      }),
      zite.sql({
        query: `
          SELECT t.id, t."title", t."status", t."dueDate", t."requestedAt", t."reviewNote", t."submissionId",
            s."title" AS "applicationTitle", s."number", p."key" AS "programKey", p."name" AS "programName", p."color" AS "programColor", p."icon" AS "programIcon"
          FROM "Tasks" t
          JOIN "Submissions" s ON s.id::text = t."submissionId"
          LEFT JOIN "Programs" p ON p.id::text = s."programId"
          WHERE t."applicantId" = $1 AND s."applicantId" = $1 AND t."status" IN ('Open', 'Returned')
          ORDER BY t."dueDate" ASC NULLS LAST, t."requestedAt" ASC NULLS LAST`,
        params: [applicant.id],
      }),
    ]);

    // Drafts show how far along they are, which needs each program's form.
    const draftProgramIds = [...new Set(rows.filter(r => r.status === 'Draft').map(r => String(r.programId)))];
    const formsByProgram = new Map<string, FormField[]>();
    if (draftProgramIds.length) {
      const { rows: forms } = await zite.sql({
        query: `SELECT DISTINCT ON ("programId") "programId", "fields" FROM "Forms" WHERE "programId" = ANY($1::text[]) AND "kind" = 'Application' ORDER BY "programId", created_at ASC`,
        params: [draftProgramIds],
      });
      for (const f of forms) formsByProgram.set(String(f.programId), parseFields(f.fields));
    }

    return {
      applications: rows.map(r => {
        const programState = { status: str(r.programStatus), opensAt: iso(r.opensAt), deadline: iso(r.deadline), allowLate: r.allowLate === true };
        const isDraft = r.status === 'Draft';
        const fields = isDraft ? formsByProgram.get(String(r.programId)) ?? [] : [];
        return {
          id: String(r.id),
          status: visibleStatus(str(r.status), iso(r.notifiedAt)),
          applicantStatus: applicantStatus({ status: str(r.status), notifiedAt: iso(r.notifiedAt), stageKind: str(r.stageKind) }),
          title: str(r.title) ?? '',
          reference: numOrNull(r.number) ? reference(str(r.programKey), num(r.number)) : null,
          programId: String(r.programId ?? ''),
          programName: str(r.programName) ?? '',
          programSlug: str(r.programSlug) ?? '',
          programColor: str(r.programColor) || '#8a8177',
          programIcon: str(r.programIcon) ?? '',
          programType: str(r.programType) ?? '',
          deadline: programState.deadline,
          phase: programPhase(programState),
          accepting: acceptingSubmissions(programState),
          allowLate: programState.allowLate,
          startedAt: iso(r.startedAt),
          lastSavedAt: iso(r.lastSavedAt),
          submittedAt: iso(r.submittedAt),
          withdrawnAt: iso(r.withdrawnAt),
          progress: isDraft ? completion(fields, parseAnswers(r.draftAnswers)) : null,
          unreadMessages: num(r.unread),
          openTasks: num(r.openTasks),
        };
      }),
      tasks: taskRows.map(t => ({
        id: String(t.id),
        title: str(t.title) || 'Request',
        status: str(t.status) || 'Open',
        dueDate: day(t.dueDate),
        requestedAt: iso(t.requestedAt),
        reviewNote: t.status === 'Returned' ? str(t.reviewNote) ?? '' : '',
        submissionId: String(t.submissionId),
        applicationTitle: str(t.applicationTitle) ?? '',
        reference: numOrNull(t.number) ? reference(str(t.programKey), num(t.number)) : null,
        programName: str(t.programName) ?? '',
        programColor: str(t.programColor) || '#8a8177',
        programIcon: str(t.programIcon) ?? '',
      })),
    };
  },
});
