import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { firstName } from '@project/shared/merge';
import { emailMember } from '@project/shared/server/email';
import { assertAdmin, colorFor, findMemberByEmail, getActor, type Actor } from '@project/shared/server/members';
import { getSettings, portalLink, staffLink, type OrgSettings } from '@project/shared/server/settings';
import { str } from '@project/shared/server/sql';

/**
 * The team: invitations, roles, deactivation and each person's own profile.
 *
 * Admins manage everyone. Anyone can edit their own name, title and expertise
 * (`updateProfile`). Two rules hold no matter who asks: nobody changes their
 * own role or deactivates themselves, and the last active admin can never be
 * demoted or deactivated — a workspace without an admin can't be run.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const optional = (max: number) => z.string().max(max).nullable().optional();

const Input = z.object({
  action: z.enum(['invite', 'update', 'deactivate', 'reactivate', 'resendInvite', 'updateProfile']),
  id: z.string().optional(),
  name: z.string().max(120).optional(),
  email: z.string().max(254).optional(),
  role: z.enum(['Admin', 'Manager', 'Reviewer']).optional(),
  title: optional(120),
  expertise: optional(300),
  /** Programs whose reviewer pool this person is in. On update, replaces the current set. */
  programIds: z.array(z.string()).max(100).optional(),
  note: z.string().max(1000).optional(),
});

type MemberRow = { id: string; name: string; email: string; role: string; status: string };

async function loadMember(id: string | undefined): Promise<MemberRow> {
  if (!id) throw new ZiteError('Which teammate?', 'BAD_REQUEST');
  const { rows } = await zite.sql({ query: `SELECT id, "name", "email", "role", "status" FROM "Members" WHERE id::text = $1 LIMIT 1`, params: [id] });
  const r = rows[0];
  if (!r) throw new ZiteError('That teammate no longer exists', 'NOT_FOUND');
  return { id: String(r.id), name: str(r.name) ?? '', email: str(r.email) ?? '', role: str(r.role) || 'Manager', status: str(r.status) || 'Active' };
}

/** Would this change leave the workspace with no active admin? */
async function assertNotLastAdmin(target: MemberRow, what: string) {
  if (target.role !== 'Admin' || target.status !== 'Active') return;
  const { rows } = await zite.sql({
    query: `SELECT COUNT(*) AS n FROM "Members" WHERE "role" = 'Admin' AND "status" = 'Active' AND id::text <> $1`,
    params: [target.id],
  });
  if (Number(rows[0]?.n ?? 0) === 0) {
    throw new ZiteError(`${target.name} is the only active admin, so you can’t ${what}. Make someone else an admin first.`, 'CONFLICT');
  }
}

async function validPrograms(ids: string[] | undefined) {
  const unique = [...new Set((ids ?? []).filter(Boolean))];
  if (!unique.length) return [] as Array<{ id: string; name: string; key: string }>;
  const { rows } = await zite.sql({ query: `SELECT id, "name", "key" FROM "Programs" WHERE id::text = ANY($1::text[])`, params: [unique] });
  if (rows.length !== unique.length) throw new ZiteError('One of those programs no longer exists. Reload and try again.', 'BAD_REQUEST');
  return rows.map(r => ({ id: String(r.id), name: str(r.name) ?? '', key: str(r.key) ?? '' }));
}

/** Make the member's reviewer pools exactly `programs`. */
async function setReviewerPrograms(member: { id: string; name: string }, programs: Array<{ id: string; key: string }>) {
  const { rows } = await zite.sql({ query: `SELECT id, "programId" FROM "ProgramMembers" WHERE "memberId" = $1 AND "role" = 'Reviewer'`, params: [member.id] });
  const want = new Set(programs.map(p => p.id));
  const have = new Set(rows.map(r => String(r.programId)));
  for (const r of rows) if (!want.has(String(r.programId))) await zite.programMembers.delete({ id: String(r.id) });
  const add = programs.filter(p => !have.has(p.id));
  if (add.length) {
    await zite.programMembers.bulkCreate({
      records: add.map(p => ({ name: `${p.key} · ${member.name}`, programId: p.id, memberId: member.id, role: 'Reviewer' })),
    });
  }
}

const article = (role: string) => (role === 'Admin' ? 'an admin' : role === 'Manager' ? 'a manager' : 'a reviewer');

function listNames(names: string[]) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

async function sendInvitation(input: { settings: OrgSettings; actor: Actor; member: { name: string; email: string; role: string }; programNames: string[]; note?: string }) {
  const { settings, actor, member, programNames } = input;
  const org = settings.organizationName;
  const reviewer = member.role === 'Reviewer';
  const link = reviewer ? portalLink(settings, '/reviews') : staffLink(settings);
  const note = input.note?.trim();
  const paragraphs = [`Hi ${firstName(member.name) || 'there'},`];
  if (reviewer) {
    paragraphs.push(
      `${actor.name} has invited you to review applications for ${org}${programNames.length ? ` — ${listNames(programNames)}` : ''}.`,
      ...(note ? [`“${note}”\n— ${actor.name}`] : []),
      `Sign in to the review portal with this email address (${member.email}). Your assigned applications will be waiting there, each with a short scoring rubric.`,
      link ? 'Use the button below to get started.' : `${firstName(actor.name) || actor.name} will send you the link to the review portal.`,
    );
  } else {
    paragraphs.push(
      `${actor.name} has invited you to join the grants workspace for ${org} as ${article(member.role)} — where the team runs its programs, reviews and funding decisions.`,
      ...(note ? [`“${note}”\n— ${actor.name}`] : []),
      `Sign in with this email address (${member.email}). Everything runs in your organization’s Zite workspace, so if you’re asked to request access, let ${firstName(actor.name) || actor.name} know.`,
      ...(link ? [] : [`${firstName(actor.name) || actor.name} will send you the link to sign in.`]),
    );
  }
  const delivery = await emailMember({
    settings,
    to: member.email,
    subject: reviewer ? `${actor.name} invited you to review for ${org}` : `${actor.name} invited you to join ${org}`,
    text: paragraphs.join('\n\n'),
    link: link || null,
    linkLabel: reviewer ? 'Open the review portal' : 'Open the workspace',
  });
  return { delivery, link: link || null };
}

export default createEndpoint({
  description: 'Invite teammates, change roles, deactivate or reactivate them, resend invitations and edit profiles',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ id: z.string(), delivery: z.string().nullable(), link: z.string().nullable() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Check the details and try again', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);

    if (input.action === 'updateProfile') {
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) {
        if (!input.name.trim()) throw new ZiteError('Your name can’t be empty', 'BAD_REQUEST');
        patch.name = input.name.trim();
      }
      if (input.title !== undefined) patch.title = input.title?.trim() || null;
      if (input.expertise !== undefined) patch.expertise = input.expertise?.trim() || null;
      if (Object.keys(patch).length) await zite.members.update({ id: actor.id, record: patch as never });
      return { id: actor.id, delivery: null, link: null };
    }

    assertAdmin(actor);
    const settings = await getSettings();

    if (input.action === 'invite') {
      const name = input.name?.trim() ?? '';
      const email = input.email?.trim().toLowerCase() ?? '';
      if (!name) throw new ZiteError('Enter their name', 'BAD_REQUEST');
      if (!EMAIL.test(email)) throw new ZiteError('Enter a valid email address', 'BAD_REQUEST');
      const role = input.role ?? settings.defaultRole;
      const existing = await findMemberByEmail(email);
      if (existing) {
        throw new ZiteError(
          existing.status === 'Deactivated'
            ? `${existing.name} was deactivated. Reactivate them from the member list instead.`
            : `${existing.name} is already on the team${existing.status === 'Invited' ? ' — you can resend their invitation' : ''}.`,
          'CONFLICT',
        );
      }
      const programs = await validPrograms(input.programIds);
      const created = await zite.members.create({
        record: {
          name,
          email,
          role,
          status: 'Invited',
          color: colorFor(email),
          avatarUrl: null,
          title: input.title?.trim() || null,
          expertise: input.expertise?.trim() || null,
          invitedAt: new Date().toISOString(),
          lastSeenAt: null,
        },
      });
      if (programs.length) await setReviewerPrograms({ id: created.id, name }, programs);
      const sent = await sendInvitation({ settings, actor, member: { name, email, role }, programNames: programs.map(p => p.name), note: input.note });
      return { id: created.id, ...sent };
    }

    const target = await loadMember(input.id);
    const self = target.id === actor.id;

    if (input.action === 'update') {
      const patch: Record<string, unknown> = {};
      if (input.role !== undefined && input.role !== target.role) {
        if (self) throw new ZiteError('You can’t change your own role. Ask another admin to do it.', 'FORBIDDEN');
        if (target.role === 'Admin') await assertNotLastAdmin(target, 'change their role');
        patch.role = input.role;
      }
      if (input.name !== undefined) {
        if (!input.name.trim()) throw new ZiteError('A teammate needs a name', 'BAD_REQUEST');
        patch.name = input.name.trim();
      }
      if (input.title !== undefined) patch.title = input.title?.trim() || null;
      if (input.expertise !== undefined) patch.expertise = input.expertise?.trim() || null;
      if (Object.keys(patch).length) await zite.members.update({ id: target.id, record: patch as never });
      if (input.programIds !== undefined) {
        const programs = await validPrograms(input.programIds);
        await setReviewerPrograms({ id: target.id, name: String(patch.name ?? target.name) }, programs);
      }
      return { id: target.id, delivery: null, link: null };
    }

    if (input.action === 'deactivate') {
      if (self) throw new ZiteError('You can’t deactivate yourself. Ask another admin to do it.', 'FORBIDDEN');
      if (target.status === 'Deactivated') return { id: target.id, delivery: null, link: null };
      await assertNotLastAdmin(target, 'deactivate them');
      await zite.members.update({ id: target.id, record: { status: 'Deactivated' } });
      return { id: target.id, delivery: null, link: null };
    }

    if (input.action === 'reactivate') {
      if (target.status !== 'Deactivated') return { id: target.id, delivery: null, link: null };
      // Someone who never accepted their invitation goes back to Invited, not Active.
      const { rows } = await zite.sql({ query: `SELECT "lastSeenAt" FROM "Members" WHERE id::text = $1`, params: [target.id] });
      await zite.members.update({ id: target.id, record: { status: rows[0]?.lastSeenAt ? 'Active' : 'Invited' } });
      return { id: target.id, delivery: null, link: null };
    }

    // resendInvite
    if (target.status !== 'Invited') throw new ZiteError(`${target.name} has already joined, so there’s no invitation to resend.`, 'CONFLICT');
    const { rows: pools } = await zite.sql({
      query: `SELECT p."name" FROM "ProgramMembers" pm JOIN "Programs" p ON p.id::text = pm."programId" WHERE pm."memberId" = $1 AND pm."role" = 'Reviewer' ORDER BY p."name" ASC`,
      params: [target.id],
    });
    await zite.members.update({ id: target.id, record: { invitedAt: new Date().toISOString() } });
    const sent = await sendInvitation({ settings, actor, member: target, programNames: pools.map(r => str(r.name) ?? '').filter(Boolean), note: input.note });
    return { id: target.id, ...sent };
  },
});
