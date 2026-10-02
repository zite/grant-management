import { ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { isDemo } from './demoPreview';
import { iso, str } from './sql';
import { nameFromEmail } from './members';

/**
 * Applicants are matched to portal sign-ins by email. Staff can also create
 * applicants (a paper application, an invitation) before that person ever
 * signs in; when they do, they pick up everything already filed for them.
 */

export type ApplicantRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  organization: string;
  location: string;
  website: string;
  joinedAt: string | null;
};

type UserLike = { email?: string | null; firstName?: string | null; lastName?: string | null } | null | undefined;

export function toApplicant(r: Record<string, unknown>): ApplicantRow {
  return {
    id: String(r.id),
    name: str(r.name) ?? '',
    email: str(r.email) ?? '',
    phone: str(r.phone) ?? '',
    organization: str(r.organization) ?? '',
    location: str(r.location) ?? '',
    website: str(r.website) ?? '',
    joinedAt: iso(r.joinedAt) ?? iso(r.created_at),
  };
}

export async function findApplicantByEmail(email: string) {
  const { rows } = await zite.sql({
    query: `SELECT * FROM "Applicants" WHERE LOWER("email") = $1 ORDER BY created_at ASC LIMIT 1`,
    params: [email.trim().toLowerCase()],
  });
  return rows[0] ? toApplicant(rows[0]) : null;
}

const ACTIVE_EVERY_MS = 15 * 60 * 1000;

/** Who the demo visitor sees the portal as: the oldest applicant with an application, or nobody in an empty workspace. Never written. */
async function demoApplicant(context: { user?: UserLike }, email: string): Promise<ApplicantRow & { created: boolean }> {
  const { rows } = await zite.sql({
    query: `SELECT a.* FROM "Applicants" a WHERE EXISTS (SELECT 1 FROM "Submissions" s WHERE s."applicantId" = a.id::text) ORDER BY a.created_at ASC, a.id ASC LIMIT 1`,
    params: [],
  });
  if (rows[0]) return { ...toApplicant(rows[0]), created: false };
  const name = [context.user?.firstName, context.user?.lastName].filter(Boolean).join(' ').trim() || 'Demo User';
  return { ...toApplicant({ id: '00000000-0000-0000-0000-000000000000', name, email }), created: false };
}

/** The signed-in applicant, created on first sight. */
export async function getApplicant(context: { user?: UserLike }): Promise<ApplicantRow & { created: boolean }> {
  const email = context.user?.email?.trim().toLowerCase();
  if (!email) throw new ZiteError('Sign in to continue', 'UNAUTHORIZED');
  const { rows } = await zite.sql({
    query: `SELECT * FROM "Applicants" WHERE LOWER("email") = $1 ORDER BY created_at ASC LIMIT 1`,
    params: [email],
  });
  if (rows[0]) {
    const a = toApplicant(rows[0]);
    const last = rows[0].lastActiveAt ? Date.parse(String(rows[0].lastActiveAt)) : 0;
    // The demo's database is read-only and refuses the whole request on any write.
    if (Date.now() - last > ACTIVE_EVERY_MS && !isDemo(context)) {
      await zite.applicants.update({ id: a.id, record: { lastActiveAt: new Date().toISOString() } });
    }
    return { ...a, created: false };
  }
  if (isDemo(context)) return demoApplicant(context, email);
  const name = [context.user?.firstName, context.user?.lastName].filter(Boolean).join(' ').trim() || nameFromEmail(email);
  const now = new Date().toISOString();
  const created = await zite.applicants.create({
    record: { name, email, phone: null, organization: null, location: null, website: null, notes: null, joinedAt: now, lastActiveAt: now },
  });
  return { ...toApplicant(created as unknown as Record<string, unknown>), created: true };
}

/** Find or create an applicant by email, for staff entering a submission on someone's behalf. */
export async function ensureApplicant(input: { email: string; name?: string; organization?: string; phone?: string }) {
  const email = input.email.trim().toLowerCase();
  const found = await findApplicantByEmail(email);
  if (found) return found;
  const created = await zite.applicants.create({
    record: {
      name: input.name?.trim() || nameFromEmail(email),
      email,
      phone: input.phone?.trim() || null,
      organization: input.organization?.trim() || null,
      location: null,
      website: null,
      notes: null,
      joinedAt: new Date().toISOString(),
      lastActiveAt: null,
    },
  });
  return toApplicant(created as unknown as Record<string, unknown>);
}
