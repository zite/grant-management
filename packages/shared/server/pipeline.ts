import { ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { logActivity } from './activity';
import { emailMember } from './email';
import { notify } from './notify';
import { getSettings, portalLink, staffLink } from './settings';
import { bool, chunked, iso, num, ref, str } from './sql';

/**
 * Moving submissions through a program: numbering, stages and reviewer
 * assignment. Both apps call into this, so a submission that arrives through
 * the portal and one a manager drags on the board follow the same rules.
 */

export type ProgramRow = {
  id: string;
  name: string;
  key: string;
  slug: string;
  type: string;
  status: string;
  opensAt: string | null;
  deadline: string | null;
  allowLate: boolean;
  blindReview: boolean;
  reviewersPerSubmission: number;
  showScoresToReviewers: boolean;
  maxPerApplicant: number;
  ownerId: string | null;
  color: string;
  icon: string;
  confirmationMessage: string;
  contactEmail: string | null;
  budget: number | null;
};

export function toProgram(r: Record<string, unknown>): ProgramRow {
  return {
    id: String(r.id),
    name: str(r.name) ?? '',
    key: str(r.key) || 'APP',
    slug: str(r.slug) ?? '',
    type: str(r.type) || 'Grant',
    status: str(r.status) || 'Draft',
    opensAt: iso(r.opensAt),
    deadline: iso(r.deadline),
    allowLate: bool(r.allowLate),
    blindReview: bool(r.blindReview),
    reviewersPerSubmission: num(r.reviewersPerSubmission, 0),
    showScoresToReviewers: bool(r.showScoresToReviewers),
    maxPerApplicant: num(r.maxPerApplicant, 1) || 1,
    ownerId: ref(r.ownerId),
    color: str(r.color) || '#6d4fd8',
    icon: str(r.icon) || '',
    confirmationMessage: str(r.confirmationMessage) ?? '',
    contactEmail: ref(r.contactEmail),
    budget: r.budget == null || r.budget === '' ? null : num(r.budget),
  };
}

export async function loadProgram(id: string): Promise<ProgramRow | null> {
  const { rows } = await zite.sql({ query: `SELECT * FROM "Programs" WHERE id::text = $1 LIMIT 1`, params: [id] });
  return rows[0] ? toProgram(rows[0]) : null;
}

export type StageRow = { id: string; name: string; kind: string; position: number; rubricId: string | null; programId: string };

export async function loadStages(programId: string): Promise<StageRow[]> {
  const { rows } = await zite.sql({
    query: `SELECT id, "name", "kind", "position", "rubricId", "programId" FROM "Stages" WHERE "programId" = $1 ORDER BY COALESCE("position", 0) ASC, created_at ASC`,
    params: [programId],
  });
  return rows.map(r => ({ id: String(r.id), name: str(r.name) ?? '', kind: str(r.kind) || 'Review', position: num(r.position), rubricId: ref(r.rubricId), programId: String(r.programId) }));
}

/** The next reference number in a program. Numbers are assigned at submission, so drafts don't burn them. */
export async function nextNumber(programId: string) {
  const { rows } = await zite.sql({ query: `SELECT COALESCE(MAX("number"), 0) AS n FROM "Submissions" WHERE "programId" = $1`, params: [programId] });
  const n = num(rows[0]?.n) + 1;
  await zite.programs.update({ id: programId, record: { submissionCounter: n } }).catch(() => undefined);
  return n;
}

export async function applicationForm(programId: string) {
  const { rows } = await zite.sql({
    query: `SELECT id, "name", "fields", "titleFieldId", "amountFieldId", "description" FROM "Forms" WHERE "programId" = $1 AND "kind" = 'Application' ORDER BY created_at ASC LIMIT 1`,
    params: [programId],
  });
  const r = rows[0];
  if (!r) return null;
  return { id: String(r.id), name: str(r.name) ?? '', fieldsJson: str(r.fields) ?? '[]', titleFieldId: ref(r.titleFieldId), amountFieldId: ref(r.amountFieldId), description: str(r.description) ?? '' };
}

type Actor = { id: string; name: string } | null;

/**
 * Put submissions into a stage. Entering a Review stage hands each one to
 * reviewers from the program's pool when the program asks for a set number
 * per submission.
 */
export async function moveToStage(input: { submissionIds: string[]; stageId: string; actor: Actor; actorType?: 'Member' | 'System' | 'Applicant'; skipAutoAssign?: boolean }) {
  if (!input.submissionIds.length) return { moved: 0, assigned: 0 };
  const { rows: stageRows } = await zite.sql({ query: `SELECT id, "name", "kind", "programId", "rubricId" FROM "Stages" WHERE id::text = $1 LIMIT 1`, params: [input.stageId] });
  const stage = stageRows[0];
  if (!stage) throw new ZiteError('That stage no longer exists', 'NOT_FOUND');
  const programId = String(stage.programId);

  const { rows: subs } = await zite.sql({
    query: `SELECT id, "stageId", "programId", "applicantId" FROM "Submissions" WHERE id::text = ANY($1::text[])`,
    params: [input.submissionIds],
  });
  const eligible = subs.filter(s => String(s.programId) === programId && String(s.stageId ?? '') !== input.stageId);
  if (!eligible.length) return { moved: 0, assigned: 0 };

  const now = new Date().toISOString();
  for (const s of eligible) {
    await zite.submissions.update({ id: String(s.id), record: { stageId: input.stageId, stageEnteredAt: now } });
  }
  await logActivity(
    eligible.map(s => ({
      type: 'stage_changed' as const,
      submissionId: String(s.id),
      programId,
      applicantId: ref(s.applicantId),
      actorId: input.actor?.id ?? null,
      actorType: input.actorType ?? (input.actor ? 'Member' : 'System'),
      data: { from: ref(s.stageId), to: input.stageId },
      occurredAt: now,
    })),
  );

  let assigned = 0;
  if (!input.skipAutoAssign && stage.kind === 'Review') {
    const program = await loadProgram(programId);
    if (program && program.reviewersPerSubmission > 0) {
      const res = await autoAssign({ submissionIds: eligible.map(s => String(s.id)), stageId: input.stageId, programId, target: program.reviewersPerSubmission, actor: input.actor });
      assigned = res.created;
    }
  }
  return { moved: eligible.length, assigned };
}

export type ReviewerLoad = { memberId: string; name: string; email: string; role: string; open: number };

/** A program's reviewer pool with each person's open workload in that program. */
export async function reviewerPool(programId: string): Promise<ReviewerLoad[]> {
  const { rows } = await zite.sql({
    query: `
      SELECT m.id::text AS "memberId", m."name", m."email", m."role",
        (SELECT COUNT(*) FROM "Reviews" r
          JOIN "Submissions" s ON s.id::text = r."submissionId"
          WHERE r."reviewerId" = m.id::text AND r."programId" = $1
            AND r."status" IN ('Assigned', 'In progress') AND s."status" = 'Submitted') AS "open"
      FROM "ProgramMembers" pm
      JOIN "Members" m ON m.id::text = pm."memberId"
      WHERE pm."programId" = $1 AND pm."role" = 'Reviewer' AND COALESCE(m."status", '') <> 'Deactivated'
      ORDER BY m."name" ASC`,
    params: [programId],
  });
  return rows.map(r => ({ memberId: String(r.memberId), name: str(r.name) ?? '', email: str(r.email) ?? '', role: str(r.role) ?? 'Reviewer', open: num(r.open) }));
}

function defaultDueDate(days = 14) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Balance reviewers across submissions: each submission gets up to `target`
 * active reviewers for the stage, always from the least-loaded people who
 * haven't already reviewed (or recused from) it.
 */
export async function autoAssign(input: { submissionIds: string[]; stageId: string; programId: string; target: number; actor: Actor; dueDate?: string | null }) {
  const pool = await reviewerPool(input.programId);
  if (!pool.length) return { created: 0, reason: 'no_pool' as const };
  const { rows: existing } = await zite.sql({
    query: `SELECT "submissionId", "reviewerId", "status" FROM "Reviews" WHERE "stageId" = $1 AND "submissionId" = ANY($2::text[])`,
    params: [input.stageId, input.submissionIds],
  });
  const bySub = new Map<string, Array<{ reviewerId: string; status: string }>>();
  for (const r of existing) {
    const k = String(r.submissionId);
    if (!bySub.has(k)) bySub.set(k, []);
    bySub.get(k)!.push({ reviewerId: String(r.reviewerId), status: String(r.status) });
  }
  const load = new Map(pool.map(p => [p.memberId, p.open]));
  const plan: Array<{ submissionId: string; reviewerId: string }> = [];
  for (const submissionId of input.submissionIds) {
    const current = bySub.get(submissionId) ?? [];
    const active = current.filter(c => c.status !== 'Recused').length;
    const need = Math.max(0, input.target - active);
    if (!need) continue;
    const taken = new Set(current.map(c => c.reviewerId));
    const candidates = pool
      .filter(p => !taken.has(p.memberId))
      .sort((a, b) => (load.get(a.memberId)! - load.get(b.memberId)!) || a.name.localeCompare(b.name));
    for (const c of candidates.slice(0, need)) {
      plan.push({ submissionId, reviewerId: c.memberId });
      load.set(c.memberId, load.get(c.memberId)! + 1);
    }
  }
  const created = await createReviews({ assignments: plan, stageId: input.stageId, programId: input.programId, actor: input.actor, dueDate: input.dueDate ?? defaultDueDate() });
  return { created, reason: null };
}

/** Create review assignments, skipping any reviewer already on that submission for that stage. Notifies each reviewer once. */
export async function createReviews(input: { assignments: Array<{ submissionId: string; reviewerId: string }>; stageId: string; programId: string; actor: Actor; dueDate?: string | null }) {
  if (!input.assignments.length) return 0;
  const subIds = [...new Set(input.assignments.map(a => a.submissionId))];
  const { rows: existing } = await zite.sql({
    query: `SELECT "submissionId", "reviewerId" FROM "Reviews" WHERE "stageId" = $1 AND "submissionId" = ANY($2::text[])`,
    params: [input.stageId, subIds],
  });
  const have = new Set(existing.map(r => `${r.submissionId}:${r.reviewerId}`));
  const fresh = input.assignments.filter((a, i, arr) => !have.has(`${a.submissionId}:${a.reviewerId}`) && arr.findIndex(b => b.submissionId === a.submissionId && b.reviewerId === a.reviewerId) === i);
  if (!fresh.length) return 0;

  const [{ rows: stageRows }, { rows: subRows }, { rows: memberRows }, program] = await Promise.all([
    zite.sql({ query: `SELECT "rubricId", "name" FROM "Stages" WHERE id::text = $1`, params: [input.stageId] }),
    zite.sql({ query: `SELECT id, "title", "number", "applicantId" FROM "Submissions" WHERE id::text = ANY($1::text[])`, params: [subIds] }),
    zite.sql({ query: `SELECT id, "name", "email", "role" FROM "Members" WHERE id::text = ANY($1::text[])`, params: [[...new Set(fresh.map(a => a.reviewerId))]] }),
    loadProgram(input.programId),
  ]);
  const rubricId = ref(stageRows[0]?.rubricId);
  const subById = new Map(subRows.map(s => [String(s.id), s]));
  const memberById = new Map(memberRows.map(m => [String(m.id), m]));
  const now = new Date().toISOString();

  await chunked(fresh, async batch => {
    await zite.reviews.bulkCreate({
      records: batch.map(a => {
        const s = subById.get(a.submissionId);
        const m = memberById.get(a.reviewerId);
        return {
          name: `${program?.key ?? 'APP'}-${s?.number ?? '?'} · ${m?.name ?? 'Reviewer'}`,
          submissionId: a.submissionId,
          reviewerId: a.reviewerId,
          stageId: input.stageId,
          rubricId,
          programId: input.programId,
          status: 'Assigned',
          scores: null,
          totalScore: null,
          recommendation: null,
          comment: null,
          applicantFeedback: null,
          recusalReason: null,
          dueDate: input.dueDate ?? null,
          assignedAt: now,
          assignedById: input.actor?.id ?? null,
          startedAt: null,
          submittedAt: null,
          remindedAt: null,
        };
      }),
    });
  });

  await logActivity(
    fresh.map(a => ({
      type: 'reviewer_assigned' as const,
      submissionId: a.submissionId,
      programId: input.programId,
      applicantId: ref(subById.get(a.submissionId)?.applicantId),
      actorId: input.actor?.id ?? null,
      actorType: input.actor ? ('Member' as const) : ('System' as const),
      data: { reviewerId: a.reviewerId, stageId: input.stageId },
      occurredAt: now,
    })),
  );

  const perReviewer = new Map<string, number>();
  for (const a of fresh) perReviewer.set(a.reviewerId, (perReviewer.get(a.reviewerId) ?? 0) + 1);
  const settings = await getSettings();
  for (const [reviewerId, count] of perReviewer) {
    const m = memberById.get(reviewerId);
    const title = count === 1 ? `New review in ${program?.name ?? 'a program'}` : `${count} new reviews in ${program?.name ?? 'a program'}`;
    const single = count === 1 ? fresh.find(a => a.reviewerId === reviewerId) : undefined;
    await notify({
      recipientIds: [reviewerId],
      type: 'review_assigned',
      title,
      body: input.dueDate ? `Due ${input.dueDate}` : null,
      submissionId: single?.submissionId ?? null,
      programId: input.programId,
      actorId: input.actor?.id ?? null,
      link: '/reviews',
    });
    if (m?.email && reviewerId !== input.actor?.id) {
      const isStaff = m.role === 'Admin' || m.role === 'Manager';
      const link = isStaff ? staffLink(settings, '/reviews') || portalLink(settings, '/reviews') : portalLink(settings, '/reviews') || staffLink(settings, '/reviews');
      await emailMember({
        settings,
        to: String(m.email),
        subject: title,
        text: `Hi ${String(m.name ?? '').split(' ')[0] || 'there'},\n\n${input.actor?.name ?? settings.organizationName} assigned you ${count === 1 ? 'an application' : `${count} applications`} to review for ${program?.name ?? 'a program'}${input.dueDate ? `, due ${input.dueDate}` : ''}.`,
        link,
        linkLabel: 'Start reviewing',
      });
    }
  }
  return fresh.length;
}
