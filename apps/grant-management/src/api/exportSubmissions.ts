import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { answerToText, parseAnswers, parseFields } from '@project/shared/forms/logic';
import { isInputField, type FormField } from '@project/shared/forms/types';
import { assertManager, getActor } from '@project/shared/server/members';
import { getSettings } from '@project/shared/server/settings';
import { Params, str } from '@project/shared/server/sql';
import { ORDERINGS, buildSubmissionWhere, mapSubmissionRow, orderBy, selectSubmissions, submissionFilterSchema } from '../server/submissions';

/**
 * A complete CSV of submissions: pipeline fields, review aggregates and every
 * answer. Built on the server so it's never limited to what a list happened to
 * load, and with one column per question (prefixed by program when an export
 * spans several).
 */
const Input = z.object({
  filters: submissionFilterSchema.default({}),
  ordering: z.enum(ORDERINGS).default('submitted_desc'),
  ids: z.array(z.string()).max(2000).optional(),
});

function cell(v: unknown) {
  const s = v == null ? '' : String(v);
  // Guard against spreadsheet formula injection from applicant-written text.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export default createEndpoint({
  description: 'Export submissions, with all answers, as CSV',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ filename: z.string(), csv: z.string(), rows: z.number() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw ?? {});
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid export', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);
    const settings = await getSettings();

    const p = new Params();
    const where = input.ids?.length ? [`s.id::text = ANY(${p.add(input.ids)}::text[])`] : buildSubmissionWhere(input.filters, p, actor.id);
    const { rows } = await zite.sql({ query: `${selectSubmissions(true)} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${orderBy(input.ordering)} LIMIT 2000`, params: p.values });
    const subs = rows.map(r => ({ row: mapSubmissionRow(r, false), answers: parseAnswers(r.answers) }));

    const programIds = [...new Set(subs.map(s => s.row.programId))];
    const [{ rows: programs }, { rows: forms }, { rows: stages }, { rows: members }, { rows: labels }] = await Promise.all([
      zite.sql({ query: `SELECT id, "name", "key" FROM "Programs" WHERE id::text = ANY($1::text[])`, params: [programIds] }),
      zite.sql({ query: `SELECT "programId", "fields" FROM "Forms" WHERE "kind" = 'Application' AND "programId" = ANY($1::text[]) ORDER BY created_at ASC`, params: [programIds] }),
      zite.sql({ query: `SELECT id, "name" FROM "Stages" WHERE "programId" = ANY($1::text[])`, params: [programIds] }),
      zite.sql({ query: `SELECT id, "name" FROM "Members"`, params: [] }),
      zite.sql({ query: `SELECT id, "name" FROM "Labels"`, params: [] }),
    ]);
    const programName = new Map(programs.map(r => [String(r.id), str(r.name) ?? '']));
    const stageName = new Map(stages.map(r => [String(r.id), str(r.name) ?? '']));
    const memberName = new Map(members.map(r => [String(r.id), str(r.name) ?? '']));
    const labelName = new Map(labels.map(r => [String(r.id), str(r.name) ?? '']));
    const fieldsByProgram = new Map<string, FormField[]>();
    for (const f of forms) if (!fieldsByProgram.has(String(f.programId))) fieldsByProgram.set(String(f.programId), parseFields(f.fields).filter(isInputField));
    const multi = programIds.length > 1;

    const answerColumns: Array<{ header: string; programId: string; field: FormField }> = [];
    for (const pid of programIds) {
      for (const field of fieldsByProgram.get(pid) ?? []) {
        answerColumns.push({ header: multi ? `${programName.get(pid)}: ${field.label}` : field.label, programId: pid, field });
      }
    }

    const headers = [
      'Reference', 'Title', 'Program', 'Status', 'Stage', 'Applicant', 'Applicant email', 'Organization', 'Owner', 'Labels',
      'Requested amount', 'Award amount', 'Award status', 'Average score', 'Reviews submitted', 'Recommend', 'Unsure', "Don't recommend",
      'Submitted at', 'Decided at', 'Decision released at', 'Decision reason', 'Late',
      ...answerColumns.map(c => c.header),
    ];
    const lines = [headers.map(cell).join(',')];
    for (const { row: s, answers } of subs) {
      lines.push(
        [
          s.reference, s.title, programName.get(s.programId), s.status, stageName.get(s.stageId ?? ''), s.applicantName, s.applicantEmail, s.applicantOrganization,
          memberName.get(s.ownerId ?? ''), s.labelIds.map(id => labelName.get(id)).filter(Boolean).join('; '),
          s.requestedAmount ?? '', s.awardAmount ?? '', s.awardStatus ?? '', s.avgScore ?? '', s.reviewsSubmitted,
          s.recommendations.yes, s.recommendations.maybe, s.recommendations.no,
          s.submittedAt ?? '', s.decidedAt ?? '', s.notifiedAt ?? '', s.decisionReason ?? '', s.late ? 'Yes' : '',
          ...answerColumns.map(c => (c.programId === s.programId ? answerToText(c.field, answers, { currency: settings.currency }) : '')),
        ].map(cell).join(','),
      );
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const scope = programIds.length === 1 ? (programs[0]?.key ? String(programs[0].key).toLowerCase() : 'program') : 'submissions';
    return { filename: `${scope}-${stamp}.csv`, csv: `﻿${lines.join('\r\n')}`, rows: subs.length };
  },
});
