import { ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { parseAnswers, parseFields, redactForReviewers } from '../forms/logic';
import type { Answers, FormField } from '../forms/types';
import { RECOMMENDATIONS, missingCriteria, parseCriteria, parseScores, sanitizeScores, totalScore, type RubricCriterion, type Scores } from '../scoring';
import { logActivity } from './activity';
import { programManagerIds } from './members';
import { notify } from './notify';
import { day, iso, num, numOrNull, ref, str } from './sql';

/**
 * The reviewer's side of review, shared by the staff app ("My reviews") and
 * the portal (volunteer panelists). Everything a reviewer can see or change
 * goes through here, and every function checks the review belongs to them —
 * a reviewer id in a request is never trusted.
 */

export type ReviewQueueFilter = 'todo' | 'done' | 'all';

export type ReviewListItem = {
  id: string;
  status: string;
  dueDate: string | null;
  totalScore: number | null;
  recommendation: string | null;
  assignedAt: string | null;
  submittedAt: string | null;
  submissionId: string;
  reference: string;
  title: string;
  applicantLabel: string | null;
  programId: string;
  programName: string;
  programColor: string;
  programIcon: string;
  stageName: string;
  blind: boolean;
  /** The submission moved on or was decided, so this review is no longer waiting on anyone. */
  closed: boolean;
};

export async function listReviewsForReviewer(reviewerId: string, opts: { filter: ReviewQueueFilter; programId?: string | null }) {
  const clauses: string[] = [`r."reviewerId" = $1`, `s."status" <> 'Withdrawn'`, `COALESCE(p."status", '') <> 'Archived'`];
  const params: unknown[] = [reviewerId];
  const openExpr = `(r."status" IN ('Assigned', 'In progress') AND s."status" = 'Submitted' AND COALESCE(s."stageId", '') = COALESCE(r."stageId", ''))`;
  if (opts.filter === 'todo') clauses.push(openExpr);
  if (opts.filter === 'done') clauses.push(`r."status" IN ('Submitted', 'Recused')`);
  if (opts.programId) {
    params.push(opts.programId);
    clauses.push(`r."programId" = $${params.length}`);
  }
  const { rows } = await zite.sql({
    query: `
      SELECT r.id, r."status", r."dueDate", r."totalScore", r."recommendation", r."assignedAt", r."submittedAt", r."submissionId", r."programId",
        s."title", s."number", s."status" AS "submissionStatus",
        p."name" AS "programName", p."key" AS "programKey", p."color" AS "programColor", p."icon" AS "programIcon", p."blindReview",
        st."name" AS "stageName", a."name" AS "applicantName", a."organization" AS "applicantOrganization",
        ${openExpr} AS "isOpen"
      FROM "Reviews" r
      JOIN "Submissions" s ON s.id::text = r."submissionId"
      LEFT JOIN "Programs" p ON p.id::text = r."programId"
      LEFT JOIN "Stages" st ON st.id::text = r."stageId"
      LEFT JOIN "Applicants" a ON a.id::text = s."applicantId"
      WHERE ${clauses.join(' AND ')}
      ORDER BY CASE WHEN ${openExpr} THEN 0 ELSE 1 END,
        CASE r."status" WHEN 'In progress' THEN 0 WHEN 'Assigned' THEN 1 ELSE 2 END,
        r."dueDate" ASC NULLS LAST, r."submittedAt" DESC NULLS LAST, s."number" ASC
      LIMIT 1000`,
    params,
  });
  return rows.map((r): ReviewListItem => {
    const blind = r.blindReview === true;
    const isOpenStatus = r.status === 'Assigned' || r.status === 'In progress';
    return {
      id: String(r.id),
      status: str(r.status) ?? 'Assigned',
      dueDate: day(r.dueDate),
      totalScore: numOrNull(r.totalScore),
      recommendation: ref(r.recommendation),
      assignedAt: iso(r.assignedAt),
      submittedAt: iso(r.submittedAt),
      submissionId: String(r.submissionId),
      reference: `${str(r.programKey) || 'APP'}-${num(r.number)}`,
      title: str(r.title) || 'Untitled application',
      applicantLabel: blind ? null : [str(r.applicantName), str(r.applicantOrganization)].filter(Boolean).join(' · ') || null,
      programId: String(r.programId ?? ''),
      programName: str(r.programName) ?? '',
      programColor: str(r.programColor) || '#6d4fd8',
      programIcon: str(r.programIcon) ?? '',
      stageName: str(r.stageName) ?? '',
      blind,
      closed: isOpenStatus && r.isOpen !== true,
    };
  });
}

export type ReviewDetail = {
  review: {
    id: string;
    status: string;
    scores: Scores;
    totalScore: number | null;
    recommendation: string | null;
    comment: string;
    applicantFeedback: string;
    recusalReason: string;
    dueDate: string | null;
    submittedAt: string | null;
    locked: boolean;
    lockedReason: string | null;
  };
  rubric: { id: string | null; name: string; instructions: string; criteria: RubricCriterion[]; askRecommendation: boolean };
  submission: { id: string; reference: string; title: string; submittedAt: string | null; requestedAmount: number | null; applicantName: string | null; applicantOrganization: string | null; applicantLocation: string | null };
  program: { id: string; name: string; key: string; color: string; icon: string; blindReview: boolean; currency: string };
  stageName: string;
  fields: FormField[];
  answers: Answers;
  peers: Array<{ reviewerName: string; status: string; totalScore: number | null; recommendation: string | null; comment: string }> | null;
  queue: { index: number; total: number; prevId: string | null; nextId: string | null };
};

async function loadOwnedReview(reviewId: string, reviewerId: string) {
  const { rows } = await zite.sql({ query: `SELECT * FROM "Reviews" WHERE id::text = $1 LIMIT 1`, params: [reviewId] });
  const r = rows[0];
  // Same answer for "missing" and "someone else's", so ids can't be probed.
  if (!r || String(r.reviewerId) !== reviewerId) throw new ZiteError('Review not found', 'NOT_FOUND');
  return r;
}

async function loadRubric(rubricId: string | null, stageId: string | null) {
  let id = rubricId;
  if (!id && stageId) {
    const { rows } = await zite.sql({ query: `SELECT "rubricId" FROM "Stages" WHERE id::text = $1`, params: [stageId] });
    id = ref(rows[0]?.rubricId);
  }
  if (!id) return { id: null, name: 'Review', instructions: '', criteria: [] as RubricCriterion[], askRecommendation: true };
  const { rows } = await zite.sql({ query: `SELECT id, "name", "instructions", "criteria", "askRecommendation" FROM "Rubrics" WHERE id::text = $1`, params: [id] });
  const r = rows[0];
  if (!r) return { id: null, name: 'Review', instructions: '', criteria: [] as RubricCriterion[], askRecommendation: true };
  return { id: String(r.id), name: str(r.name) ?? 'Rubric', instructions: str(r.instructions) ?? '', criteria: parseCriteria(r.criteria), askRecommendation: r.askRecommendation === true };
}

function lockReason(reviewStatus: string, sub: Record<string, unknown>, reviewStageId: string | null) {
  if (sub.status === 'Withdrawn') return 'The applicant withdrew this application.';
  if (sub.status !== 'Submitted') return 'A decision has been made on this application, so reviews are closed.';
  if ((reviewStatus === 'Assigned' || reviewStatus === 'In progress') && reviewStageId && String(sub.stageId ?? '') !== reviewStageId) {
    return 'This application has moved to another stage, so this review is closed.';
  }
  return null;
}

export async function getReviewForReviewer(reviewId: string, reviewerId: string, opts: { currency: string }): Promise<ReviewDetail> {
  const r = await loadOwnedReview(reviewId, reviewerId);
  const [{ rows: subRows }, rubric] = await Promise.all([
    zite.sql({
      query: `
        SELECT s.*, a."name" AS "applicantName", a."organization" AS "applicantOrganization", a."location" AS "applicantLocation",
          p."name" AS "programName", p."key" AS "programKey", p."color" AS "programColor", p."icon" AS "programIcon",
          p."blindReview", p."showScoresToReviewers", st."name" AS "stageName"
        FROM "Submissions" s
        LEFT JOIN "Applicants" a ON a.id::text = s."applicantId"
        LEFT JOIN "Programs" p ON p.id::text = s."programId"
        LEFT JOIN "Stages" st ON st.id::text = $2
        WHERE s.id::text = $1 LIMIT 1`,
      params: [String(r.submissionId), String(r.stageId ?? '')],
    }),
    loadRubric(ref(r.rubricId), ref(r.stageId)),
  ]);
  const s = subRows[0];
  if (!s) throw new ZiteError('Review not found', 'NOT_FOUND');
  const blind = s.blindReview === true;

  const { rows: formRows } = await zite.sql({
    query: `SELECT "fields" FROM "Forms" WHERE "programId" = $1 AND "kind" = 'Application' ORDER BY created_at ASC LIMIT 1`,
    params: [String(s.programId)],
  });
  const redacted = redactForReviewers(parseFields(formRows[0]?.fields), parseAnswers(s.answers));

  const status = str(r.status) ?? 'Assigned';
  let peers: ReviewDetail['peers'] = null;
  if (s.showScoresToReviewers === true && status === 'Submitted') {
    const { rows: peerRows } = await zite.sql({
      query: `
        SELECT r."status", r."totalScore", r."recommendation", r."comment", m."name" AS "reviewerName"
        FROM "Reviews" r LEFT JOIN "Members" m ON m.id::text = r."reviewerId"
        WHERE r."submissionId" = $1 AND r.id::text <> $2 AND r."status" = 'Submitted'
        ORDER BY r."submittedAt" ASC`,
      params: [String(s.id), reviewId],
    });
    peers = peerRows.map(p => ({ reviewerName: str(p.reviewerName) ?? 'Reviewer', status: str(p.status) ?? '', totalScore: numOrNull(p.totalScore), recommendation: ref(p.recommendation), comment: str(p.comment) ?? '' }));
  }

  const queue = await listReviewsForReviewer(reviewerId, { filter: 'todo' });
  const ids = queue.map(q => q.id);
  const index = ids.indexOf(reviewId);
  const reason = lockReason(status, s, ref(r.stageId));

  return {
    review: {
      id: String(r.id),
      status,
      scores: parseScores(r.scores),
      totalScore: numOrNull(r.totalScore),
      recommendation: ref(r.recommendation),
      comment: str(r.comment) ?? '',
      applicantFeedback: str(r.applicantFeedback) ?? '',
      recusalReason: str(r.recusalReason) ?? '',
      dueDate: day(r.dueDate),
      submittedAt: iso(r.submittedAt),
      locked: Boolean(reason),
      lockedReason: reason,
    },
    rubric,
    submission: {
      id: String(s.id),
      reference: `${str(s.programKey) || 'APP'}-${num(s.number)}`,
      title: str(s.title) || 'Untitled application',
      submittedAt: iso(s.submittedAt),
      requestedAmount: numOrNull(s.requestedAmount),
      applicantName: blind ? null : ref(s.applicantName),
      applicantOrganization: blind ? null : ref(s.applicantOrganization),
      applicantLocation: blind ? null : ref(s.applicantLocation),
    },
    program: { id: String(s.programId), name: str(s.programName) ?? '', key: str(s.programKey) || 'APP', color: str(s.programColor) || '#6d4fd8', icon: str(s.programIcon) ?? '', blindReview: blind, currency: opts.currency },
    stageName: str(s.stageName) ?? '',
    fields: redacted.fields,
    answers: redacted.answers,
    peers,
    queue: {
      index: index >= 0 ? index : -1,
      total: ids.length,
      prevId: index > 0 ? ids[index - 1] : null,
      // After finishing one, "next" is the first remaining item.
      nextId: index >= 0 ? ids[index + 1] ?? null : ids[0] ?? null,
    },
  };
}

export type SaveReviewInput = {
  action: 'save' | 'submit' | 'recuse' | 'reopen';
  scores?: unknown;
  comment?: string | null;
  applicantFeedback?: string | null;
  recommendation?: string | null;
  recusalReason?: string | null;
};

export async function saveReviewForReviewer(reviewId: string, reviewer: { id: string; name: string }, input: SaveReviewInput, via: 'staff' | 'portal') {
  const r = await loadOwnedReview(reviewId, reviewer.id);
  const { rows: subRows } = await zite.sql({ query: `SELECT id, "status", "stageId", "programId", "applicantId", "ownerId", "title", "number" FROM "Submissions" WHERE id::text = $1`, params: [String(r.submissionId)] });
  const s = subRows[0];
  if (!s) throw new ZiteError('Review not found', 'NOT_FOUND');
  const status = str(r.status) ?? 'Assigned';
  const reason = lockReason(status, s, ref(r.stageId));
  if (reason) throw new ZiteError(reason, 'CONFLICT');

  const rubric = await loadRubric(ref(r.rubricId), ref(r.stageId));
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  const clip = (v: string | null | undefined, max = 20000) => (v == null ? undefined : String(v).slice(0, max));

  if (input.action === 'reopen') {
    if (status !== 'Submitted' && status !== 'Recused') throw new ZiteError('Only a finished review can be reopened', 'BAD_REQUEST');
    patch.status = 'In progress';
    patch.submittedAt = null;
    patch.recusalReason = null;
    await zite.reviews.update({ id: reviewId, record: patch as never });
    await logActivity({ type: 'review_reopened', submissionId: String(s.id), programId: ref(s.programId), actorId: reviewer.id, actorType: 'Member', data: { reviewId, via } });
    return { status: 'In progress', totalScore: numOrNull(r.totalScore) };
  }

  if (input.action === 'recuse') {
    const why = (input.recusalReason ?? '').trim();
    if (!why) throw new ZiteError('Say briefly why you are stepping back — for example, a conflict of interest', 'BAD_REQUEST');
    await zite.reviews.update({ id: reviewId, record: { status: 'Recused', recusalReason: why.slice(0, 2000), submittedAt: now } });
    await logActivity({ type: 'review_recused', submissionId: String(s.id), programId: ref(s.programId), actorId: reviewer.id, actorType: 'Member', data: { reviewId, reason: why.slice(0, 280), via } });
    const managers = await programManagerIds(ref(s.programId));
    await notify({
      recipientIds: [...managers, ref(s.ownerId)],
      type: 'review_recused',
      title: `${reviewer.name} recused from ${str(s.title) || 'an application'}`,
      body: why.slice(0, 280),
      submissionId: String(s.id),
      programId: ref(s.programId),
      actorId: reviewer.id,
    });
    return { status: 'Recused', totalScore: null };
  }

  if (status === 'Submitted' || status === 'Recused') throw new ZiteError('Reopen this review before changing it', 'CONFLICT');

  const scores = input.scores !== undefined ? sanitizeScores(rubric.criteria, input.scores) : parseScores(r.scores);
  patch.scores = JSON.stringify(scores);
  const comment = clip(input.comment);
  if (comment !== undefined) patch.comment = comment;
  const feedback = clip(input.applicantFeedback, 5000);
  if (feedback !== undefined) patch.applicantFeedback = feedback;
  if (input.recommendation !== undefined) {
    patch.recommendation = RECOMMENDATIONS.includes(input.recommendation as never) ? input.recommendation : null;
  }
  const total = totalScore(rubric.criteria, scores);
  patch.totalScore = total;
  if (!r.startedAt) patch.startedAt = now;

  if (input.action === 'submit') {
    const missing = missingCriteria(rubric.criteria, scores);
    if (missing.length) throw new ZiteError(`Score every criterion before submitting — ${missing.map(m => m.name).join(', ')} ${missing.length === 1 ? 'is' : 'are'} still blank`, 'BAD_REQUEST');
    const rec = patch.recommendation !== undefined ? patch.recommendation : ref(r.recommendation);
    if (rubric.askRecommendation && !rec) throw new ZiteError('Choose a recommendation before submitting', 'BAD_REQUEST');
    patch.status = 'Submitted';
    patch.submittedAt = now;
    await zite.reviews.update({ id: reviewId, record: patch as never });
    await logActivity({ type: 'review_submitted', submissionId: String(s.id), programId: ref(s.programId), actorId: reviewer.id, actorType: 'Member', data: { reviewId, score: total, recommendation: rec, via } });
    const managers = await programManagerIds(ref(s.programId));
    await notify({
      recipientIds: [...managers, ref(s.ownerId)],
      type: 'review_submitted',
      title: `${reviewer.name} reviewed ${str(s.title) || 'an application'}`,
      body: total != null ? `Score ${total}${rec ? ` · ${rec === 'Yes' ? 'Recommends' : rec === 'No' ? "Doesn't recommend" : 'Unsure'}` : ''}` : null,
      submissionId: String(s.id),
      programId: ref(s.programId),
      actorId: reviewer.id,
    });
    return { status: 'Submitted', totalScore: total };
  }

  patch.status = 'In progress';
  await zite.reviews.update({ id: reviewId, record: patch as never });
  return { status: 'In progress', totalScore: total };
}
