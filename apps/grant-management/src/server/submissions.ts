import { z } from 'zod';
import { parseAnswers } from '@project/shared/forms/logic';
import { Params, iso, num, numOrNull, ref, str } from '@project/shared/server/sql';

/**
 * The submission list query: one SELECT that every list, board and table in
 * the staff app runs, with filters built from closed allowlists and values
 * always bound as parameters.
 *
 * Rows carry ids (stage, owner, labels, reviewers); the client resolves names
 * from `bootstrap`, which is what lets one optimistic cache write update every
 * surface at once.
 */

export const submissionFilterSchema = z.object({
  programIds: z.array(z.string()).optional(),
  stageIds: z.array(z.string()).optional(),
  stageKinds: z.array(z.enum(['Intake', 'Review', 'Decision'])).optional(),
  statuses: z.array(z.enum(['Draft', 'Submitted', 'Accepted', 'Declined', 'Waitlisted', 'Withdrawn'])).optional(),
  ownerIds: z.array(z.string()).optional(),
  labelIds: z.array(z.string()).optional(),
  reviewerIds: z.array(z.string()).optional(),
  awardStatuses: z.array(z.string()).optional(),
  reviewState: z.enum(['unassigned', 'in_review', 'reviewed', 'disagreement']).optional(),
  release: z.enum(['unreleased', 'released']).optional(),
  scoreMin: z.number().optional(),
  scoreMax: z.number().optional(),
  amountMin: z.number().optional(),
  amountMax: z.number().optional(),
  submittedAfter: z.string().optional(),
  submittedBefore: z.string().optional(),
  hasUnreadMessages: z.boolean().optional(),
  hasOpenTasks: z.boolean().optional(),
  late: z.boolean().optional(),
  applicantId: z.string().optional(),
  search: z.string().max(200).optional(),
});

export type SubmissionFilters = z.infer<typeof submissionFilterSchema>;

export const ORDERINGS = ['submitted_desc', 'submitted_asc', 'score_desc', 'score_asc', 'amount_desc', 'amount_asc', 'updated_desc', 'reference_asc', 'title_asc', 'applicant_asc'] as const;
export type Ordering = (typeof ORDERINGS)[number];

export const submissionRowSchema = z.object({
  id: z.string(),
  number: z.number(),
  reference: z.string(),
  title: z.string(),
  programId: z.string(),
  applicantId: z.string().nullable(),
  applicantName: z.string(),
  applicantEmail: z.string(),
  applicantOrganization: z.string(),
  stageId: z.string().nullable(),
  ownerId: z.string().nullable(),
  status: z.string(),
  requestedAmount: z.number().nullable(),
  awardAmount: z.number().nullable(),
  awardStatus: z.string().nullable(),
  decisionReason: z.string().nullable(),
  startedAt: z.string().nullable(),
  submittedAt: z.string().nullable(),
  decidedAt: z.string().nullable(),
  notifiedAt: z.string().nullable(),
  stageEnteredAt: z.string().nullable(),
  lastActivityAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  late: z.boolean(),
  labelIds: z.array(z.string()),
  reviewerIds: z.array(z.string()),
  avgScore: z.number().nullable(),
  scoreSpread: z.number().nullable(),
  reviewsSubmitted: z.number(),
  reviewsActive: z.number(),
  reviewsDoneInStage: z.number(),
  recommendations: z.object({ yes: z.number(), maybe: z.number(), no: z.number() }),
  unreadMessages: z.number(),
  openTasks: z.number(),
  answers: z.record(z.any()).optional(),
});

export type SubmissionRow = z.infer<typeof submissionRowSchema>;

export const SUBMISSION_SELECT = `
  SELECT s.id, s."number", s."title", s."programId", s."applicantId", s."stageId", s."ownerId", s."status",
    s."requestedAmount", s."awardAmount", s."awardStatus", s."decisionReason",
    s."startedAt", s."submittedAt", s."decidedAt", s."notifiedAt", s."stageEnteredAt", s."lastActivityAt", s.updated_at,
    p."key" AS "programKey", p."deadline" AS "programDeadline",
    a."name" AS "applicantName", a."email" AS "applicantEmail", a."organization" AS "applicantOrganization",
    rv."avgScore", rv."minScore", rv."maxScore", rv."submittedCount", rv."activeCount", rv."doneInStage",
    rv."yesCount", rv."maybeCount", rv."noCount", rv."reviewerIds",
    (SELECT COALESCE(string_agg(sl."labelId", ','), '') FROM "SubmissionLabels" sl WHERE sl."submissionId" = s.id::text) AS "labelIds",
    (SELECT COUNT(*) FROM "Messages" m WHERE m."submissionId" = s.id::text AND m."direction" = 'Inbound' AND m."readAt" IS NULL) AS "unreadMessages",
    (SELECT COUNT(*) FROM "Tasks" t WHERE t."submissionId" = s.id::text AND t."status" IN ('Open', 'Returned', 'Submitted')) AS "openTasks"
    __ANSWERS__
  FROM "Submissions" s
  LEFT JOIN "Programs" p ON p.id::text = s."programId"
  LEFT JOIN "Applicants" a ON a.id::text = s."applicantId"
  LEFT JOIN LATERAL (
    SELECT
      AVG(r."totalScore") FILTER (WHERE r."status" = 'Submitted') AS "avgScore",
      MIN(r."totalScore") FILTER (WHERE r."status" = 'Submitted') AS "minScore",
      MAX(r."totalScore") FILTER (WHERE r."status" = 'Submitted') AS "maxScore",
      COUNT(*) FILTER (WHERE r."status" = 'Submitted') AS "submittedCount",
      COUNT(*) FILTER (WHERE r."status" <> 'Recused' AND r."stageId" = s."stageId") AS "activeCount",
      COUNT(*) FILTER (WHERE r."status" = 'Submitted' AND r."stageId" = s."stageId") AS "doneInStage",
      COUNT(*) FILTER (WHERE r."status" = 'Submitted' AND r."recommendation" = 'Yes') AS "yesCount",
      COUNT(*) FILTER (WHERE r."status" = 'Submitted' AND r."recommendation" = 'Maybe') AS "maybeCount",
      COUNT(*) FILTER (WHERE r."status" = 'Submitted' AND r."recommendation" = 'No') AS "noCount",
      string_agg(r."reviewerId", ',') FILTER (WHERE r."status" <> 'Recused' AND r."stageId" = s."stageId") AS "reviewerIds"
    FROM "Reviews" r WHERE r."submissionId" = s.id::text
  ) rv ON true`;

export function selectSubmissions(includeAnswers: boolean) {
  return SUBMISSION_SELECT.replace('__ANSWERS__', includeAnswers ? ', s."answers"' : '');
}

const ids = (v: unknown) => (typeof v === 'string' && v ? v.split(',').filter(Boolean) : []);

export function mapSubmissionRow(r: Record<string, unknown>, includeAnswers = false): SubmissionRow {
  const submittedAt = iso(r.submittedAt);
  const deadline = iso(r.programDeadline);
  const min = numOrNull(r.minScore);
  const max = numOrNull(r.maxScore);
  const avg = numOrNull(r.avgScore);
  const row: SubmissionRow = {
    id: String(r.id),
    number: num(r.number),
    reference: r.number ? `${str(r.programKey) || 'APP'}-${num(r.number)}` : 'Draft',
    title: str(r.title) || '',
    programId: String(r.programId ?? ''),
    applicantId: ref(r.applicantId),
    applicantName: str(r.applicantName) ?? '',
    applicantEmail: str(r.applicantEmail) ?? '',
    applicantOrganization: str(r.applicantOrganization) ?? '',
    stageId: ref(r.stageId),
    ownerId: ref(r.ownerId),
    status: str(r.status) || 'Draft',
    requestedAmount: numOrNull(r.requestedAmount),
    awardAmount: numOrNull(r.awardAmount),
    awardStatus: ref(r.awardStatus),
    decisionReason: ref(r.decisionReason),
    startedAt: iso(r.startedAt),
    submittedAt,
    decidedAt: iso(r.decidedAt),
    notifiedAt: iso(r.notifiedAt),
    stageEnteredAt: iso(r.stageEnteredAt),
    lastActivityAt: iso(r.lastActivityAt) ?? iso(r.updated_at),
    updatedAt: iso(r.updated_at),
    late: Boolean(submittedAt && deadline && Date.parse(submittedAt) > Date.parse(deadline)),
    labelIds: ids(r.labelIds),
    reviewerIds: [...new Set(ids(r.reviewerIds))],
    avgScore: avg == null ? null : Math.round(avg * 10) / 10,
    scoreSpread: min != null && max != null && num(r.submittedCount) > 1 ? Math.round((max - min) * 10) / 10 : null,
    reviewsSubmitted: num(r.submittedCount),
    reviewsActive: num(r.activeCount),
    reviewsDoneInStage: num(r.doneInStage),
    recommendations: { yes: num(r.yesCount), maybe: num(r.maybeCount), no: num(r.noCount) },
    unreadMessages: num(r.unreadMessages),
    openTasks: num(r.openTasks),
  };
  if (includeAnswers) row.answers = parseAnswers(r.answers);
  return row;
}

/** WHERE clauses for a filter set. `meId` resolves the `__me__` token saved views use. */
export function buildSubmissionWhere(f: SubmissionFilters, p: Params, meId: string) {
  const w: string[] = [];
  const list = (values: string[] | undefined) => (values ?? []).map(v => (v === '__me__' ? meId : v));

  if (f.programIds?.length) w.push(`s."programId" = ANY(${p.add(f.programIds)}::text[])`);
  if (f.stageIds?.length) w.push(`s."stageId" = ANY(${p.add(f.stageIds)}::text[])`);
  if (f.stageKinds?.length) w.push(`EXISTS (SELECT 1 FROM "Stages" st WHERE st.id::text = s."stageId" AND st."kind" = ANY(${p.add(f.stageKinds)}::text[]))`);
  // Drafts are the applicant's, not the pipeline's: they only appear when asked for.
  if (f.statuses?.length) w.push(`s."status" = ANY(${p.add(f.statuses)}::text[])`);
  else w.push(`s."status" <> 'Draft'`);

  if (f.ownerIds?.length) {
    const owners = list(f.ownerIds);
    const named = owners.filter(o => o !== '__none__');
    const parts: string[] = [];
    if (named.length) parts.push(`s."ownerId" = ANY(${p.add(named)}::text[])`);
    if (owners.includes('__none__')) parts.push(`COALESCE(s."ownerId", '') = ''`);
    w.push(`(${parts.join(' OR ')})`);
  }
  if (f.labelIds?.length) {
    w.push(`EXISTS (SELECT 1 FROM "SubmissionLabels" sl WHERE sl."submissionId" = s.id::text AND sl."labelId" = ANY(${p.add(f.labelIds)}::text[]))`);
  }
  if (f.reviewerIds?.length) {
    w.push(`EXISTS (SELECT 1 FROM "Reviews" r WHERE r."submissionId" = s.id::text AND r."reviewerId" = ANY(${p.add(list(f.reviewerIds))}::text[]))`);
  }
  if (f.awardStatuses?.length) w.push(`s."awardStatus" = ANY(${p.add(f.awardStatuses)}::text[])`);

  switch (f.reviewState) {
    case 'unassigned':
      // Only a review stage can be missing reviewers.
      w.push(`s."status" = 'Submitted' AND COALESCE(rv."activeCount", 0) = 0 AND EXISTS (SELECT 1 FROM "Stages" st WHERE st.id::text = s."stageId" AND st."kind" = 'Review')`);
      break;
    case 'in_review':
      w.push(`COALESCE(rv."activeCount", 0) > COALESCE(rv."doneInStage", 0)`);
      break;
    case 'reviewed':
      w.push(`COALESCE(rv."activeCount", 0) > 0 AND COALESCE(rv."activeCount", 0) = COALESCE(rv."doneInStage", 0)`);
      break;
    case 'disagreement':
      w.push(`COALESCE(rv."submittedCount", 0) > 1 AND (rv."maxScore" - rv."minScore") >= 25`);
      break;
  }
  if (f.release === 'unreleased') w.push(`s."status" IN ('Accepted', 'Declined', 'Waitlisted') AND s."notifiedAt" IS NULL`);
  if (f.release === 'released') w.push(`s."notifiedAt" IS NOT NULL`);

  if (f.scoreMin != null) w.push(`rv."avgScore" >= ${p.add(f.scoreMin)}`);
  if (f.scoreMax != null) w.push(`rv."avgScore" <= ${p.add(f.scoreMax)}`);
  if (f.amountMin != null) w.push(`s."requestedAmount" >= ${p.add(f.amountMin)}`);
  if (f.amountMax != null) w.push(`s."requestedAmount" <= ${p.add(f.amountMax)}`);
  if (f.submittedAfter) w.push(`s."submittedAt" >= ${p.add(f.submittedAfter)}::timestamptz`);
  if (f.submittedBefore) w.push(`s."submittedAt" < (${p.add(f.submittedBefore)}::date + 1)`);
  if (f.hasUnreadMessages) w.push(`EXISTS (SELECT 1 FROM "Messages" m WHERE m."submissionId" = s.id::text AND m."direction" = 'Inbound' AND m."readAt" IS NULL)`);
  if (f.hasOpenTasks) w.push(`EXISTS (SELECT 1 FROM "Tasks" t WHERE t."submissionId" = s.id::text AND t."status" IN ('Open', 'Returned', 'Submitted'))`);
  if (f.late) w.push(`s."submittedAt" > p."deadline"`);
  if (f.applicantId) w.push(`s."applicantId" = ${p.add(f.applicantId)}`);

  const q = f.search?.trim();
  if (q) {
    const like = p.add(`%${q.replace(/[%_\\]/g, m => `\\${m}`)}%`);
    const refMatch = q.match(/^([A-Za-z][A-Za-z0-9]*)-(\d+)$/);
    const parts = [`s."title" ILIKE ${like}`, `a."name" ILIKE ${like}`, `a."email" ILIKE ${like}`, `a."organization" ILIKE ${like}`, `s."answers" ILIKE ${like}`];
    if (refMatch) parts.push(`(UPPER(p."key") = ${p.add(refMatch[1].toUpperCase())} AND s."number" = ${p.add(Number(refMatch[2]))})`);
    else if (/^\d+$/.test(q)) parts.push(`s."number" = ${p.add(Number(q))}`);
    w.push(`(${parts.join(' OR ')})`);
  }
  // Archived programs stay out of cross-program lists unless named explicitly.
  if (!f.programIds?.length && !f.applicantId) w.push(`COALESCE(p."status", '') <> 'Archived'`);
  return w;
}

export function orderBy(ordering: Ordering) {
  switch (ordering) {
    case 'submitted_asc':
      return `s."submittedAt" ASC NULLS LAST, s."number" ASC`;
    case 'score_desc':
      return `rv."avgScore" DESC NULLS LAST, s."submittedAt" ASC NULLS LAST`;
    case 'score_asc':
      return `rv."avgScore" ASC NULLS LAST, s."submittedAt" ASC NULLS LAST`;
    case 'amount_desc':
      return `s."requestedAmount" DESC NULLS LAST, s."submittedAt" ASC NULLS LAST`;
    case 'amount_asc':
      return `s."requestedAmount" ASC NULLS LAST, s."submittedAt" ASC NULLS LAST`;
    case 'updated_desc':
      return `COALESCE(s."lastActivityAt", s.updated_at) DESC`;
    case 'reference_asc':
      return `p."key" ASC, s."number" ASC`;
    case 'title_asc':
      return `LOWER(COALESCE(NULLIF(s."title", ''), a."name")) ASC`;
    case 'applicant_asc':
      return `LOWER(a."name") ASC, s."number" ASC`;
    case 'submitted_desc':
    default:
      return `s."submittedAt" DESC NULLS LAST, s.created_at DESC`;
  }
}

