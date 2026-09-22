import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { cloneFields, starterApplicationForm } from '@project/shared/forms/catalog';
import { parseFields } from '@project/shared/forms/logic';
import { isInputField } from '@project/shared/forms/types';
import { DEFAULT_CONFIRMATION, DEFAULT_STAGES, PROGRAM_KEY_PATTERN, PROGRAM_TYPE_ICON, deriveProgramKey, uniqueProgramKey, uniqueSlug } from '@project/shared/programSetup';
import { defaultCriteria } from '@project/shared/scoring';
import { PROGRAM_TYPES } from '@project/shared/status';
import { logActivity, type ActivityType } from '@project/shared/server/activity';
import { assertManager, getActor } from '@project/shared/server/members';
import { bool, chunked, iso, num, numOrNull, ref, str } from '@project/shared/server/sql';

/**
 * A program's whole lifecycle in one endpoint: create (from the recommended
 * form, a blank one, or a copy of another program), edit, publish and
 * unpublish, archive, duplicate and delete.
 *
 * Open/closed is derived from dates, so publishing is the only switch a
 * manager flips to make a program visible to applicants.
 */

const PROGRAM_COLORS = ['#6943d0', '#1c7ed6', '#0c8599', '#2f9e44', '#e8590c', '#d6336c', '#9c36b5', '#f08c00', '#495057'];

const money = z.number().min(0, 'Amounts can’t be negative').max(1_000_000_000).nullable();
const when = z
  .string()
  .refine(v => Number.isFinite(Date.parse(v)), 'Use a valid date and time')
  .nullable();
const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const Input = z.object({
  action: z.enum(['create', 'update', 'publish', 'unpublish', 'archive', 'unarchive', 'duplicate', 'delete']),
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Name the program').max(120, 'Keep the name under 120 characters').optional(),
  key: z
    .string()
    .trim()
    .transform(v => v.toUpperCase())
    .refine(v => PROGRAM_KEY_PATTERN.test(v), 'Keys are 2–8 letters or digits, like ARTS or STEM27')
    .optional(),
  type: z.enum(PROGRAM_TYPES as [string, ...string[]]).optional(),
  summary: z.preprocess(blankToNull, z.string().max(300, 'Keep the summary under 300 characters').nullable()).optional(),
  description: z.preprocess(blankToNull, z.string().max(20000).nullable()).optional(),
  eligibility: z.preprocess(blankToNull, z.string().max(10000).nullable()).optional(),
  confirmationMessage: z.preprocess(blankToNull, z.string().max(2000).nullable()).optional(),
  coverImageUrl: z.preprocess(blankToNull, z.string().url('Use a full image address starting with https://').max(1000).nullable()).optional(),
  opensAt: when.optional(),
  deadline: when.optional(),
  allowLate: z.boolean().optional(),
  maxPerApplicant: z.number().int().min(1, 'Allow at least one application per applicant').max(100).optional(),
  budget: money.optional(),
  awardMin: money.optional(),
  awardMax: money.optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour').optional(),
  icon: z.string().trim().min(1).max(16).optional(),
  ownerId: z.string().nullable().optional(),
  contactEmail: z.preprocess(blankToNull, z.string().trim().email('Use a valid contact email').nullable()).optional(),
  blindReview: z.boolean().optional(),
  showScoresToReviewers: z.boolean().optional(),
  reviewersPerSubmission: z.number().int().min(0).max(10, 'Up to 10 reviewers per submission').optional(),
  startFrom: z.union([z.enum(['recommended', 'blank']), z.object({ copyOf: z.string() })]).optional(),
});

type Parsed = z.infer<typeof Input>;

const EDITABLE = [
  'name', 'key', 'type', 'summary', 'description', 'eligibility', 'confirmationMessage', 'coverImageUrl', 'opensAt', 'deadline', 'allowLate',
  'maxPerApplicant', 'budget', 'awardMin', 'awardMax', 'color', 'icon', 'ownerId', 'contactEmail', 'blindReview', 'showScoresToReviewers', 'reviewersPerSubmission',
] as const;

async function takenKeys(exceptId?: string) {
  const { rows } = await zite.sql({ query: `SELECT id, "key", "name", "slug" FROM "Programs"`, params: [] });
  const others = rows.filter(r => String(r.id) !== exceptId);
  return {
    keys: new Map(others.map(r => [String(r.key ?? '').toUpperCase(), str(r.name) ?? 'another program'])),
    slugs: others.map(r => String(r.slug ?? '')),
  };
}

async function loadRow(id: string) {
  const { rows } = await zite.sql({ query: `SELECT * FROM "Programs" WHERE id::text = $1 LIMIT 1`, params: [id] });
  if (!rows[0]) throw new ZiteError('That program no longer exists', 'NOT_FOUND');
  return rows[0];
}

/** Rules that span fields, checked against the program as it would be after the change. */
function validateMerged(m: { opensAt: string | null; deadline: string | null; awardMin: number | null; awardMax: number | null }) {
  if (m.opensAt && m.deadline && Date.parse(m.deadline) <= Date.parse(m.opensAt)) {
    throw new ZiteError('The deadline has to be after the program opens', 'BAD_REQUEST');
  }
  if (m.awardMin != null && m.awardMax != null && m.awardMin > m.awardMax) {
    throw new ZiteError('The smallest award can’t be larger than the largest', 'BAD_REQUEST');
  }
}

async function assertOwner(ownerId: string | null | undefined) {
  if (!ownerId) return;
  const { rows } = await zite.sql({ query: `SELECT "role", "status" FROM "Members" WHERE id::text = $1`, params: [ownerId] });
  const m = rows[0];
  if (!m || m.status === 'Deactivated') throw new ZiteError('That person isn’t an active member of this workspace', 'BAD_REQUEST');
  if (m.role !== 'Admin' && m.role !== 'Manager') throw new ZiteError('A program owner has to be an admin or manager', 'BAD_REQUEST');
}

const logProgram = (type: string, programId: string, actorId: string, data?: Record<string, unknown>) =>
  // Program-level events have no submission; the overview's activity feed reads them by programId.
  logActivity({ type: type as ActivityType, programId, actorId, actorType: 'Member', data });

/**
 * Copy another program's structure into `targetId`: rubrics, stages (pointing
 * at the copied rubrics), forms with fresh field ids, program-specific email
 * templates and, when asked, its team.
 */
async function copyStructure(sourceId: string, targetId: string, opts: { members: boolean }) {
  const [rubrics, stages, forms, templates, members] = await Promise.all([
    zite.sql({ query: `SELECT * FROM "Rubrics" WHERE "programId" = $1 ORDER BY created_at ASC`, params: [sourceId] }),
    zite.sql({ query: `SELECT * FROM "Stages" WHERE "programId" = $1 ORDER BY COALESCE("position", 0) ASC, created_at ASC`, params: [sourceId] }),
    zite.sql({ query: `SELECT * FROM "Forms" WHERE "programId" = $1 ORDER BY COALESCE("position", 0) ASC, created_at ASC`, params: [sourceId] }),
    zite.sql({ query: `SELECT * FROM "EmailTemplates" WHERE "programId" = $1 ORDER BY COALESCE("position", 0) ASC, created_at ASC`, params: [sourceId] }),
    opts.members ? zite.sql({ query: `SELECT * FROM "ProgramMembers" WHERE "programId" = $1`, params: [sourceId] }) : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
  ]);

  const rubricMap = new Map<string, string>();
  for (const r of rubrics.rows) {
    const created = await zite.rubrics.create({
      record: { name: str(r.name) || 'Scorecard', programId: targetId, instructions: str(r.instructions) || null, criteria: str(r.criteria) || '[]', askRecommendation: bool(r.askRecommendation) },
    });
    rubricMap.set(String(r.id), created.id);
  }
  if (stages.rows.length) {
    await zite.stages.bulkCreate({
      records: stages.rows.map((s, i) => ({
        name: str(s.name) || 'Stage',
        programId: targetId,
        kind: str(s.kind) || 'Review',
        position: i,
        color: str(s.color) || '#868e96',
        rubricId: ref(s.rubricId) ? rubricMap.get(String(s.rubricId)) ?? null : null,
        description: str(s.description) || null,
      })),
    });
  }
  for (const f of forms.rows) {
    const { fields, idMap } = cloneFields(parseFields(f.fields));
    await zite.forms.create({
      record: {
        name: str(f.name) || 'Form',
        programId: targetId,
        kind: str(f.kind) || 'Application',
        description: str(f.description) || null,
        fields: JSON.stringify(fields),
        titleFieldId: ref(f.titleFieldId) ? idMap.get(String(f.titleFieldId)) ?? null : null,
        amountFieldId: ref(f.amountFieldId) ? idMap.get(String(f.amountFieldId)) ?? null : null,
        position: num(f.position),
      },
    });
  }
  if (templates.rows.length) {
    await chunked(templates.rows, async batch => {
      await zite.emailTemplates.bulkCreate({
        records: batch.map(t => ({ name: str(t.name) || 'Template', subject: str(t.subject) || '', body: str(t.body) || '', trigger: str(t.trigger) || 'Manual', programId: targetId, enabled: bool(t.enabled), position: num(t.position) })),
      });
    });
  }
  if (members.rows.length) {
    await chunked(members.rows, async batch => {
      await zite.programMembers.bulkCreate({
        records: batch.map(m => ({ name: str(m.name) || 'Member', programId: targetId, memberId: String(m.memberId), role: str(m.role) || 'Reviewer' })),
      });
    });
  }
}

/** The pipeline and scorecard every program starts with unless it copies another. */
async function createDefaults(programId: string) {
  const rubric = await zite.rubrics.create({
    record: { name: 'Scorecard', programId, instructions: 'Read the whole application before scoring. Score each criterion on its own terms.', criteria: JSON.stringify(defaultCriteria()), askRecommendation: true },
  });
  await zite.stages.bulkCreate({
    records: DEFAULT_STAGES.map((s, i) => ({ name: s.name, programId, kind: s.kind, position: i, color: s.color, rubricId: s.usesRubric ? rubric.id : null, description: s.description })),
  });
}

async function create(input: Parsed, actorId: string) {
  if (!input.name) throw new ZiteError('Name the program', 'BAD_REQUEST');
  const type = input.type ?? 'Grant';
  const { keys, slugs } = await takenKeys();
  let key: string;
  if (input.key) {
    if (keys.has(input.key)) throw new ZiteError(`The key ${input.key} is already used by ${keys.get(input.key)}. Choose another.`, 'CONFLICT');
    key = input.key;
  } else {
    key = uniqueProgramKey(deriveProgramKey(input.name), keys.keys());
  }

  const startFrom = input.startFrom ?? 'recommended';
  let source: Record<string, unknown> | null = null;
  if (typeof startFrom === 'object') source = await loadRow(startFrom.copyOf);

  const { rows: posRows } = await zite.sql({ query: `SELECT COALESCE(MAX("position"), -1) AS p, COUNT(*) AS n FROM "Programs"`, params: [] });
  const merged = {
    opensAt: input.opensAt !== undefined ? input.opensAt : null,
    deadline: input.deadline !== undefined ? input.deadline : null,
    awardMin: input.awardMin !== undefined ? input.awardMin : source ? numOrNull(source.awardMin) : null,
    awardMax: input.awardMax !== undefined ? input.awardMax : source ? numOrNull(source.awardMax) : null,
  };
  validateMerged(merged);

  const pick = <T,>(v: T | undefined, fromSource: T, fallback: T) => (v !== undefined ? v : source ? fromSource : fallback);
  const created = await zite.programs.create({
    record: {
      name: input.name,
      key,
      slug: uniqueSlug(input.name, slugs),
      type,
      status: 'Draft',
      summary: pick(input.summary, ref(source?.summary), null),
      description: pick(input.description, ref(source?.description), null),
      eligibility: pick(input.eligibility, ref(source?.eligibility), null),
      opensAt: merged.opensAt,
      deadline: merged.deadline,
      allowLate: pick(input.allowLate, bool(source?.allowLate), false),
      budget: pick(input.budget, numOrNull(source?.budget), null),
      awardMin: merged.awardMin,
      awardMax: merged.awardMax,
      color: input.color ?? (source ? str(source.color) : null) ?? PROGRAM_COLORS[num(posRows[0]?.n) % PROGRAM_COLORS.length],
      icon: input.icon ?? PROGRAM_TYPE_ICON[type] ?? '💡',
      coverImageUrl: pick(input.coverImageUrl, ref(source?.coverImageUrl), null),
      ownerId: actorId,
      blindReview: pick(input.blindReview, bool(source?.blindReview), false),
      reviewersPerSubmission: pick(input.reviewersPerSubmission, num(source?.reviewersPerSubmission), 2),
      showScoresToReviewers: pick(input.showScoresToReviewers, bool(source?.showScoresToReviewers), false),
      maxPerApplicant: pick(input.maxPerApplicant, num(source?.maxPerApplicant, 1) || 1, 1),
      confirmationMessage: pick(input.confirmationMessage, ref(source?.confirmationMessage), DEFAULT_CONFIRMATION),
      contactEmail: pick(input.contactEmail, ref(source?.contactEmail), null),
      submissionCounter: 0,
      position: num(posRows[0]?.p, -1) + 1,
      publishedAt: null,
    },
  });
  const programId = created.id;

  if (source) {
    await copyStructure(String(source.id), programId, { members: false });
    // A copied program always has an application form, even if the source somehow lost its own.
    const { rows } = await zite.sql({ query: `SELECT 1 FROM "Forms" WHERE "programId" = $1 AND "kind" = 'Application' LIMIT 1`, params: [programId] });
    if (!rows.length) await zite.forms.create({ record: { name: 'Application', programId, kind: 'Application', description: null, fields: '[]', titleFieldId: null, amountFieldId: null, position: 0 } });
    const { rows: stageRows } = await zite.sql({ query: `SELECT 1 FROM "Stages" WHERE "programId" = $1 LIMIT 1`, params: [programId] });
    if (!stageRows.length) await createDefaults(programId);
  } else {
    await createDefaults(programId);
    const starter = startFrom === 'recommended' ? starterApplicationForm(type) : null;
    await zite.forms.create({
      record: {
        name: 'Application',
        programId,
        kind: 'Application',
        description: null,
        fields: JSON.stringify(starter?.fields ?? []),
        titleFieldId: starter?.titleFieldId ?? null,
        amountFieldId: starter?.amountFieldId ?? null,
        position: 0,
      },
    });
  }
  await logProgram('program_created', programId, actorId, { name: input.name, from: source ? { copyOf: String(source.id), name: str(source.name) } : startFrom });
  return programId;
}

async function duplicate(id: string, actorId: string) {
  const src = await loadRow(id);
  const { keys, slugs } = await takenKeys();
  const name = `${str(src.name) || 'Program'} (copy)`.slice(0, 120);
  const { rows: posRows } = await zite.sql({ query: `SELECT COALESCE(MAX("position"), -1) AS p FROM "Programs"`, params: [] });
  const created = await zite.programs.create({
    record: {
      name,
      key: uniqueProgramKey(str(src.key) || deriveProgramKey(name), keys.keys()),
      slug: uniqueSlug(name, slugs),
      type: str(src.type) || 'Grant',
      status: 'Draft',
      summary: ref(src.summary),
      description: ref(src.description),
      eligibility: ref(src.eligibility),
      opensAt: iso(src.opensAt),
      deadline: iso(src.deadline),
      allowLate: bool(src.allowLate),
      budget: numOrNull(src.budget),
      awardMin: numOrNull(src.awardMin),
      awardMax: numOrNull(src.awardMax),
      color: str(src.color) || PROGRAM_COLORS[0],
      icon: str(src.icon) || '💡',
      coverImageUrl: ref(src.coverImageUrl),
      ownerId: actorId,
      blindReview: bool(src.blindReview),
      reviewersPerSubmission: num(src.reviewersPerSubmission),
      showScoresToReviewers: bool(src.showScoresToReviewers),
      maxPerApplicant: num(src.maxPerApplicant, 1) || 1,
      confirmationMessage: ref(src.confirmationMessage),
      contactEmail: ref(src.contactEmail),
      submissionCounter: 0,
      position: num(posRows[0]?.p, -1) + 1,
      publishedAt: null,
    },
  });
  await copyStructure(id, created.id, { members: true });
  await logProgram('program_created', created.id, actorId, { name, from: { duplicateOf: id, name: str(src.name) } });
  return created.id;
}

async function remove(id: string) {
  const row = await loadRow(id);
  const { rows } = await zite.sql({ query: `SELECT COUNT(*) AS n FROM "Submissions" WHERE "programId" = $1`, params: [id] });
  const n = num(rows[0]?.n);
  if (n > 0) {
    throw new ZiteError(`${str(row.name) || 'This program'} has ${n} submission${n === 1 ? '' : 's'}, drafts included. Archive it instead — deleting would erase their history.`, 'CONFLICT');
  }
  const owned = ['Stages', 'Rubrics', 'Forms', 'ProgramMembers', 'EmailTemplates', 'Labels', 'Views', 'Activity', 'Notifications'] as const;
  const accessor = {
    Stages: zite.stages, Rubrics: zite.rubrics, Forms: zite.forms, ProgramMembers: zite.programMembers, EmailTemplates: zite.emailTemplates,
    Labels: zite.labels, Views: zite.views, Activity: zite.activity, Notifications: zite.notifications,
  } as const;
  for (const table of owned) {
    const res = await zite.sql({ query: `SELECT id FROM "${table}" WHERE "programId" = $1`, params: [id] });
    for (const r of res.rows) await (accessor[table] as { delete: (a: { id: string }) => Promise<unknown> }).delete({ id: String(r.id) });
  }
  await zite.programs.delete({ id });
}

export default createEndpoint({
  description: 'Create, edit, publish, archive, duplicate or delete a program',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ id: z.string() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw ?? {});
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Check the program details', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);

    if (input.action === 'create') return { id: await create(input, actor.id) };
    if (!input.id) throw new ZiteError('Which program?', 'BAD_REQUEST');
    const id = input.id;

    switch (input.action) {
      case 'duplicate':
        return { id: await duplicate(id, actor.id) };

      case 'delete':
        await remove(id);
        return { id };

      case 'update': {
        const row = await loadRow(id);
        const patch: Record<string, unknown> = {};
        for (const k of EDITABLE) if (input[k] !== undefined) patch[k] = input[k];
        if (patch.name !== undefined && !patch.name) throw new ZiteError('Name the program', 'BAD_REQUEST');
        if (input.key !== undefined && input.key !== String(row.key ?? '').toUpperCase()) {
          const { keys } = await takenKeys(id);
          if (keys.has(input.key)) throw new ZiteError(`The key ${input.key} is already used by ${keys.get(input.key)}. Choose another.`, 'CONFLICT');
        }
        if (input.ownerId !== undefined) await assertOwner(input.ownerId);
        validateMerged({
          opensAt: input.opensAt !== undefined ? input.opensAt : iso(row.opensAt),
          deadline: input.deadline !== undefined ? input.deadline : iso(row.deadline),
          awardMin: input.awardMin !== undefined ? input.awardMin : numOrNull(row.awardMin),
          awardMax: input.awardMax !== undefined ? input.awardMax : numOrNull(row.awardMax),
        });
        if (Object.keys(patch).length) await zite.programs.update({ id, record: patch as never });
        return { id };
      }

      case 'publish': {
        const row = await loadRow(id);
        if (row.status === 'Archived') throw new ZiteError('Unarchive the program before publishing it', 'BAD_REQUEST');
        const [{ rows: forms }, { rows: stages }] = await Promise.all([
          zite.sql({ query: `SELECT "fields" FROM "Forms" WHERE "programId" = $1 AND "kind" = 'Application' ORDER BY created_at ASC LIMIT 1`, params: [id] }),
          zite.sql({ query: `SELECT COUNT(*) AS n FROM "Stages" WHERE "programId" = $1`, params: [id] }),
        ]);
        if (!forms[0] || !parseFields(forms[0].fields).some(isInputField)) {
          throw new ZiteError('Add at least one question to the application form before publishing', 'BAD_REQUEST');
        }
        if (num(stages[0]?.n) === 0) throw new ZiteError('Add at least one stage to the pipeline before publishing', 'BAD_REQUEST');
        await zite.programs.update({ id, record: { status: 'Published', publishedAt: new Date().toISOString() } });
        await logProgram('program_published', id, actor.id);
        return { id };
      }

      case 'unpublish': {
        const row = await loadRow(id);
        if (row.status !== 'Published') return { id };
        await zite.programs.update({ id, record: { status: 'Draft' } });
        await logProgram('program_unpublished', id, actor.id);
        return { id };
      }

      case 'archive': {
        const row = await loadRow(id);
        if (row.status === 'Archived') return { id };
        await zite.programs.update({ id, record: { status: 'Archived' } });
        await logProgram('program_archived', id, actor.id, { from: str(row.status) });
        return { id };
      }

      case 'unarchive': {
        const row = await loadRow(id);
        if (row.status !== 'Archived') return { id };
        // Back to where it was: published programs stay published, drafts stay drafts.
        const status = row.publishedAt ? 'Published' : 'Draft';
        await zite.programs.update({ id, record: { status } });
        await logProgram('program_unarchived', id, actor.id, { to: status });
        return { id };
      }
    }
    return { id };
  },
});
