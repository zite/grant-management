import { zite } from 'zitejs/db';
import { DEFAULTS, getSettings, type OrgSettings } from '@project/shared/server/settings';
import { num } from '@project/shared/server/sql';
import { DEMO_ORG } from '../seed/org';

/**
 * The sample organization: when it can be loaded, and how to take it away again.
 *
 * An admin loads it by hand from Settings → General, and only into a workspace
 * with no programs or submissions yet. Loading stamps `seededAt`.
 *
 * Demo rows are the ones the seed created: everything inserted from a minute
 * before `seededAt` (clock skew between the endpoint and the database) to a few
 * minutes after it (the seed takes seconds), plus anything added later to a
 * demo program or submission, which would be orphaned otherwise. Records made
 * before the sample was loaded, or afterwards for real, stay. Seeded people all
 * use reserved example domains, so a member is only removed when both the
 * window and the address say demo.
 */

const WINDOW = `INTERVAL '15 minutes'`;
const EXAMPLE_EMAIL = `'@([a-z0-9-]+\\.)*example\\.(org|com|net)$'`;
/** A seed that started this recently and has nothing to show yet is still running. */
const LOADING_MS = 15 * 60 * 1000;

/** `created_at` within the demo window. `$1` is always `seededAt`. */
const inWindow = (alias = '') => `(${alias}created_at >= $1::timestamptz - INTERVAL '1 minute' AND ${alias}created_at <= $1::timestamptz + ${WINDOW})`;

export type DemoCounts = { programs: number; submissions: number; applicants: number; members: number };

export async function demoCounts(settings: OrgSettings): Promise<DemoCounts | null> {
  if (!settings.seededAt) return null;
  const { rows } = await zite.sql({
    query: `
      SELECT
        (SELECT COUNT(*) FROM "Programs" WHERE ${inWindow()}) AS programs,
        (SELECT COUNT(*) FROM "Submissions" WHERE ${inWindow()}) AS submissions,
        (SELECT COUNT(*) FROM "Applicants" WHERE ${inWindow()}) AS applicants,
        (SELECT COUNT(*) FROM "Members" WHERE ${inWindow()} AND LOWER("email") ~ ${EXAMPLE_EMAIL}) AS members`,
    params: [settings.seededAt],
  });
  const r = rows[0] ?? {};
  const counts = { programs: num(r.programs), submissions: num(r.submissions), applicants: num(r.applicants), members: num(r.members) };
  return counts.programs + counts.submissions + counts.applicants + counts.members > 0 ? counts : null;
}

/**
 * Whether the sample can be loaded now, and the reason when it can't. Real
 * content is any program or submission. Applicants without one (signing in to
 * the portal creates an applicant), teammates, labels, email templates, saved
 * views and organization settings don't count.
 */
export async function sampleStatus(settings: OrgSettings, demo?: DemoCounts | null): Promise<{ canLoad: boolean; reason: string | null }> {
  const loaded = demo === undefined ? await demoCounts(settings) : demo;
  if (loaded) return { canLoad: false, reason: 'Sample data is already loaded. Remove it from Settings → General before loading it again.' };
  if (settings.seededAt && Date.now() - Date.parse(settings.seededAt) < LOADING_MS) {
    return { canLoad: false, reason: 'Sample data is already being loaded. Refresh in a minute to see it.' };
  }
  const { rows } = await zite.sql({
    query: `SELECT (SELECT COUNT(*) FROM "Programs") AS programs, (SELECT COUNT(*) FROM "Submissions") AS submissions`,
    params: [],
  });
  const r = rows[0] ?? {};
  if (num(r.programs) + num(r.submissions) > 0) {
    return { canLoad: false, reason: 'Sample data can only be loaded into an empty workspace, and this one already has programs or submissions.' };
  }
  return { canLoad: true, reason: null };
}

type Accessor = { delete: (a: { id: string }) => Promise<unknown> };

async function ids(query: string, params: unknown[]) {
  const out: string[] = [];
  // zite.sql caps at 2000 rows; page by id so a large demo still clears in one run.
  for (let after = ''; ; ) {
    const { rows } = await zite.sql({ query: `SELECT id::text AS id FROM (${query}) q WHERE id::text > $${params.length + 1} ORDER BY id::text LIMIT 2000`, params: [...params, after] });
    out.push(...rows.map(r => String(r.id)));
    if (rows.length < 2000) return out;
    after = out[out.length - 1];
  }
}

/** Live Zite turns away bursts of parallel writes, so deletes go a few at a time and back off when told to. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts || !/too many requests/i.test(e instanceof Error ? e.message : String(e))) throw e;
      await new Promise(r => setTimeout(r, 400 * 2 ** (i - 1)));
    }
  }
}

async function deleteAll(client: Accessor, list: string[], dryRun: boolean) {
  if (dryRun) return list.length;
  for (let i = 0; i < list.length; i += 4) {
    await Promise.all(list.slice(i, i + 4).map(id => withRetry(() => client.delete({ id }))));
  }
  return list.length;
}

/**
 * Children first and programs last, so an interrupted run leaves nothing
 * dangling and simply picks up where it stopped when run again.
 */
export async function removeDemoData(actorId: string, { dryRun = false } = {}) {
  const settings = await getSettings();
  if (!settings.seededAt) return { removed: 0, tables: {} as Record<string, number> };
  const at = settings.seededAt;

  const programs = await ids(`SELECT id FROM "Programs" WHERE ${inWindow()}`, [at]);
  const submissions = await ids(`SELECT id FROM "Submissions" WHERE ${inWindow()} OR "programId" = ANY($2::text[])`, [at, programs]);
  const members = await ids(`SELECT id FROM "Members" WHERE ${inWindow()} AND LOWER("email") ~ ${EXAMPLE_EMAIL} AND id::text <> $2`, [at, actorId]);

  // Postgres rejects a bound parameter the query never uses, so each lookup passes exactly what it references.
  const bySubmission = (table: string, also?: { column: string; values: string[] }) =>
    ids(`SELECT id FROM "${table}" WHERE ${inWindow()} OR "submissionId" = ANY($2::text[])${also ? ` OR "${also.column}" = ANY($3::text[])` : ''}`, also ? [at, submissions, also.values] : [at, submissions]);
  const byProgram = (table: string, also?: { column: string; values: string[] }) =>
    ids(`SELECT id FROM "${table}" WHERE "programId" = ANY($1::text[])${also ? ` OR "${also.column}" = ANY($2::text[])` : ''}`, also ? [programs, also.values] : [programs]);

  let removed = 0;
  const tables: Record<string, number> = {};
  const removeAll = async (client: Accessor, list: string[], name: string) => {
    tables[name] = list.length;
    return deleteAll(client, list, dryRun);
  };
  removed += await removeAll(zite.notifications, [...new Set([...(await bySubmission('Notifications', { column: 'programId', values: programs })), ...(await ids(`SELECT id FROM "Notifications" WHERE "recipientId" = ANY($1::text[])`, [members]))])], 'notifications');
  removed += await removeAll(zite.activity, await bySubmission('Activity', { column: 'programId', values: programs }), 'activity');
  removed += await removeAll(zite.submissionLabels, await bySubmission('SubmissionLabels'), 'submissionLabels');
  removed += await removeAll(zite.attachments, await bySubmission('Attachments'), 'attachments');
  removed += await removeAll(zite.payments, await bySubmission('Payments'), 'payments');
  removed += await removeAll(zite.tasks, await bySubmission('Tasks'), 'tasks');
  removed += await removeAll(zite.messages, await bySubmission('Messages'), 'messages');
  removed += await removeAll(zite.notes, await bySubmission('Notes'), 'notes');
  removed += await removeAll(zite.reviews, await bySubmission('Reviews', { column: 'reviewerId', values: members }), 'reviews');
  removed += await removeAll(zite.submissions, submissions, 'submissions');

  // Applicants from the demo who have nothing left; a real person who also applied keeps their record.
  removed += await removeAll(zite.applicants, await ids(`SELECT a.id FROM "Applicants" a WHERE ${inWindow('a.')} AND NOT EXISTS (SELECT 1 FROM "Submissions" s WHERE s."applicantId" = a.id::text)`, [at]), 'applicants');

  removed += await removeAll(zite.views, await ids(`SELECT id FROM "Views" WHERE ${inWindow()} OR "programId" = ANY($2::text[]) OR "ownerId" = ANY($3::text[])`, [at, programs, members]), 'views');
  removed += await removeAll(zite.emailTemplates, await byProgram('EmailTemplates'), 'emailTemplates');
  removed += await removeAll(zite.labels, await byProgram('Labels'), 'labels');
  removed += await removeAll(zite.programMembers, await byProgram('ProgramMembers', { column: 'memberId', values: members }), 'programMembers');
  removed += await removeAll(zite.forms, await byProgram('Forms'), 'forms');
  removed += await removeAll(zite.rubrics, await byProgram('Rubrics'), 'rubrics');
  removed += await removeAll(zite.stages, await byProgram('Stages'), 'stages');
  removed += await removeAll(zite.programs, programs, 'programs');

  // Real work owned by a departing demo person becomes unowned rather than pointing at no one.
  if (members.length && !dryRun) {
    for (const table of ['Submissions', 'Programs'] as const) {
      const owned = await ids(`SELECT id FROM "${table}" WHERE "ownerId" = ANY($1::text[])`, [members]);
      const client = table === 'Submissions' ? zite.submissions : zite.programs;
      for (const id of owned) await client.update({ id, record: { ownerId: null } });
    }
  }
  removed += await removeAll(zite.members, members, 'members');

  // Organization details go back to neutral only where nobody has changed them since.
  const reset: Record<string, string | null> = {};
  if (settings.organizationName === DEMO_ORG.organizationName) reset.organizationName = DEFAULTS.organizationName;
  if (settings.supportEmail === DEMO_ORG.supportEmail) reset.supportEmail = null;
  if (settings.websiteUrl === DEMO_ORG.websiteUrl) reset.websiteUrl = null;
  if (settings.portalHeadline === DEMO_ORG.portalHeadline) reset.portalHeadline = DEFAULTS.portalHeadline;
  if (settings.portalIntro === DEMO_ORG.portalIntro) reset.portalIntro = DEFAULTS.portalIntro;
  if (settings.emailSignature === DEMO_ORG.emailSignature) reset.emailSignature = DEFAULTS.emailSignature;
  // `seededAt` is cleared last, so an interrupted run can still find the window. An empty workspace can then load the sample again.
  if (!dryRun) await zite.settings.update({ id: settings.id, record: { ...reset, seededAt: null } });

  return { removed, tables, reset: Object.keys(reset) };
}
