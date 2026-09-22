import { ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getSettings } from './settings';

/**
 * Staff and reviewers, as workspace members.
 *
 * Every endpoint resolves the actor from the SESSION and never from an id in
 * the request, so nobody can score, decide or message as someone else.
 *
 * Roles:
 *   Admin    — everything, including people and organization settings
 *   Manager  — programs, forms, submissions, decisions, awards, templates
 *   Reviewer — only the reviews assigned to them
 */

export type Role = 'Admin' | 'Manager' | 'Reviewer';
export type Actor = { id: string; name: string; email: string; role: Role; created: boolean };

export const asRole = (v: unknown): Role => (v === 'Admin' || v === 'Reviewer' ? v : 'Manager');

export const isManager = (actor: Pick<Actor, 'role'>) => actor.role === 'Admin' || actor.role === 'Manager';

export function assertManager(actor: Actor) {
  if (!isManager(actor)) throw new ZiteError("Reviewers can only work on the reviews assigned to them", 'FORBIDDEN');
}

export function assertAdmin(actor: Actor) {
  if (actor.role !== 'Admin') throw new ZiteError('Only admins can do that', 'FORBIDDEN');
}

type UserLike = { email?: string | null; firstName?: string | null; lastName?: string | null } | null | undefined;

const AVATAR_COLORS = ['#6d4fd8', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#8b5cf6', '#f97316', '#3b82f6'];

/** A stable colour per person, so an avatar never changes between loads. */
export function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function nameFromEmail(email: string) {
  return email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function profileName(context: { user?: UserLike }, email: string) {
  const { rows } = await zite.sql({ query: `SELECT "name", "image" FROM "ziteUsers" WHERE LOWER("email") = $1 LIMIT 1`, params: [email] });
  const profile = rows[0] ?? {};
  const name =
    [context.user?.firstName, context.user?.lastName].filter(Boolean).join(' ').trim() ||
    (profile.name ? String(profile.name) : '') ||
    nameFromEmail(email);
  return { name, image: profile.image ? String(profile.image) : null };
}

export async function findMemberByEmail(email: string) {
  const { rows } = await zite.sql({
    query: `SELECT id, "name", "email", "role", "status" FROM "Members" WHERE LOWER("email") = $1 ORDER BY created_at ASC LIMIT 1`,
    params: [email.trim().toLowerCase()],
  });
  return rows[0] as { id: string; name: string; email: string; role: string; status: string } | undefined;
}

const SEEN_EVERY_MS = 10 * 60 * 1000;

/** The signed-in staff member. Creates a member the first time someone new opens the app. */
export async function getActor(context: { user?: UserLike }): Promise<Actor> {
  const email = context.user?.email?.trim().toLowerCase();
  if (!email) throw new ZiteError('You need to be signed in', 'UNAUTHORIZED');

  const existing = await zite.sql({
    query: `SELECT id, "name", "role", "status", "lastSeenAt" FROM "Members" WHERE LOWER("email") = $1 ORDER BY created_at ASC LIMIT 1`,
    params: [email],
  });
  const row = existing.rows[0];
  if (row) {
    if (row.status === 'Deactivated') {
      throw new ZiteError('Your access to this workspace has been deactivated. Ask an admin to reactivate you.', 'FORBIDDEN');
    }
    const patch: Record<string, unknown> = {};
    // An invitation is accepted by showing up.
    if (row.status === 'Invited') patch.status = 'Active';
    const seen = row.lastSeenAt ? Date.parse(String(row.lastSeenAt)) : 0;
    if (Date.now() - seen > SEEN_EVERY_MS) patch.lastSeenAt = new Date().toISOString();
    if (Object.keys(patch).length) await zite.members.update({ id: String(row.id), record: patch as never });
    return { id: String(row.id), name: String(row.name || nameFromEmail(email)), email, role: asRole(row.role), created: false };
  }

  const { name, image } = await profileName(context, email);
  // The first person in runs the place; everyone after gets the organization's default role.
  const { rows: admins } = await zite.sql({ query: `SELECT 1 FROM "Members" WHERE "role" = 'Admin' LIMIT 1`, params: [] });
  const role: Role = admins.length ? (await getSettings()).defaultRole : 'Admin';

  const created = await zite.members.create({
    record: {
      name,
      email,
      role,
      status: 'Active',
      color: colorFor(email),
      avatarUrl: image,
      title: null,
      expertise: null,
      invitedAt: null,
      lastSeenAt: new Date().toISOString(),
    },
  });
  return { id: created.id, name, email, role, created: true };
}

/**
 * A reviewer signing in through the public portal. Never creates anyone —
 * only people a manager has added as members can review there.
 */
export async function getPortalReviewer(context: { user?: UserLike }): Promise<Actor | null> {
  const email = context.user?.email?.trim().toLowerCase();
  if (!email) return null;
  const m = await findMemberByEmail(email);
  if (!m || m.status === 'Deactivated') return null;
  if (m.status === 'Invited') await zite.members.update({ id: String(m.id), record: { status: 'Active' } });
  return { id: String(m.id), name: String(m.name || nameFromEmail(email)), email, role: asRole(m.role), created: false };
}

/** Active managers responsible for a program: its owner and program managers, or every admin when nobody is named. */
export async function programManagerIds(programId: string | null | undefined): Promise<string[]> {
  if (programId) {
    const { rows } = await zite.sql({
      query: `
        SELECT DISTINCT m.id::text AS id FROM "Members" m
        WHERE COALESCE(m."status", '') <> 'Deactivated' AND m."role" IN ('Admin', 'Manager') AND (
          m.id::text = (SELECT "ownerId" FROM "Programs" WHERE id::text = $1)
          OR EXISTS (SELECT 1 FROM "ProgramMembers" pm WHERE pm."programId" = $1 AND pm."memberId" = m.id::text AND pm."role" = 'Manager')
        )`,
      params: [programId],
    });
    if (rows.length) return rows.map(r => String(r.id));
  }
  const { rows } = await zite.sql({ query: `SELECT id::text AS id FROM "Members" WHERE "role" = 'Admin' AND COALESCE("status", '') <> 'Deactivated'`, params: [] });
  return rows.map(r => String(r.id));
}
