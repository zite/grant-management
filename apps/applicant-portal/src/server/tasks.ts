import { ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { parseFields } from '@project/shared/forms/logic';
import type { FormField } from '@project/shared/forms/types';
import { day, iso, num, numOrNull, ref, str } from '@project/shared/server/sql';
import { reference } from '@project/shared/status';
import { FREE_FORM_FIELDS } from '../lib/tasks';
import { visibleStatus } from './portal';

export type OwnTask = {
  id: string;
  title: string;
  instructions: string;
  status: string;
  dueDate: string | null;
  requestedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  answers: string;
  formId: string | null;
  formName: string | null;
  fields: FormField[];
  freeForm: boolean;
  submissionId: string;
  programId: string;
  ownerId: string | null;
  requestedById: string | null;
  application: { id: string; title: string; reference: string | null; status: string; programName: string; programColor: string; programIcon: string };
};

/** A task on one of the applicant's own applications, or NOT_FOUND. */
export async function loadOwnTask(applicantId: string, id: string): Promise<OwnTask> {
  const { rows } = await zite.sql({
    query: `
      SELECT t.id, t."title", t."instructions", t."status", t."dueDate", t."requestedAt", t."submittedAt", t."reviewedAt", t."reviewNote", t."answers", t."formId", t."requestedById",
        s.id AS "submissionId", s."title" AS "applicationTitle", s."number", s."status" AS "applicationStatus", s."notifiedAt", s."programId", s."ownerId",
        p."key" AS "programKey", p."name" AS "programName", p."color" AS "programColor", p."icon" AS "programIcon",
        f."name" AS "formName", f."fields" AS "formFields"
      FROM "Tasks" t
      JOIN "Submissions" s ON s.id::text = t."submissionId"
      LEFT JOIN "Programs" p ON p.id::text = s."programId"
      LEFT JOIN "Forms" f ON f.id::text = t."formId"
      WHERE t.id::text = $1 AND t."applicantId" = $2 AND s."applicantId" = $2
      LIMIT 1`,
    params: [id, applicantId],
  });
  const r = rows[0];
  if (!r) throw new ZiteError("We couldn't find that request. It may have been removed.", 'NOT_FOUND');
  const formId = ref(r.formId);
  const formFields = formId ? parseFields(r.formFields) : [];
  const freeForm = !formId || formFields.length === 0;
  return {
    id: String(r.id),
    title: str(r.title) || 'Request',
    instructions: str(r.instructions) ?? '',
    status: str(r.status) || 'Open',
    dueDate: day(r.dueDate),
    requestedAt: iso(r.requestedAt),
    submittedAt: iso(r.submittedAt),
    reviewedAt: iso(r.reviewedAt),
    reviewNote: str(r.reviewNote) ?? '',
    answers: str(r.answers) ?? '',
    formId,
    formName: ref(r.formName),
    fields: freeForm ? FREE_FORM_FIELDS : formFields,
    freeForm,
    submissionId: String(r.submissionId),
    programId: String(r.programId ?? ''),
    ownerId: ref(r.ownerId),
    requestedById: ref(r.requestedById),
    application: {
      id: String(r.submissionId),
      title: str(r.applicationTitle) ?? '',
      reference: numOrNull(r.number) ? reference(str(r.programKey), num(r.number)) : null,
      status: visibleStatus(str(r.applicationStatus), iso(r.notifiedAt)),
      programName: str(r.programName) ?? '',
      programColor: str(r.programColor) || '#8a8177',
      programIcon: str(r.programIcon) ?? '',
    },
  };
}

export const isTaskEditable = (status: string) => status === 'Open' || status === 'Returned';
