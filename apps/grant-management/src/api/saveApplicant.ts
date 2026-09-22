import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertManager, getActor } from '@project/shared/server/members';

/**
 * Add an applicant by hand (a paper application, someone about to be invited)
 * or edit one. Email is how an applicant signs in to the portal, so it must
 * stay unique, ignoring case.
 *
 * `update` is a patch: only the fields sent change, which is what lets notes
 * autosave without resending the whole profile.
 */

const text = (max: number) => z.string().max(max).nullable().optional();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const Input = z.object({
  action: z.enum(['create', 'update']),
  id: z.string().optional(),
  name: z.string().max(160).optional(),
  email: z.string().max(254).optional(),
  phone: text(60),
  organization: text(200),
  location: text(200),
  website: text(500),
  notes: text(20000),
});

const clean = (v: string | null | undefined) => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

function normalizeWebsite(v: string | null | undefined) {
  const t = clean(v);
  if (!t) return null;
  const url = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(url);
    if (!u.hostname.includes('.')) throw new Error('no tld');
    return u.toString().replace(/\/$/, '');
  } catch {
    throw new ZiteError('Enter the website as an address like example.org', 'BAD_REQUEST');
  }
}

export default createEndpoint({
  description: 'Create or update an applicant profile',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ id: z.string() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Check the applicant details', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);

    const email = input.email !== undefined ? input.email.trim().toLowerCase() : undefined;
    if (email !== undefined && !EMAIL.test(email)) throw new ZiteError('Enter a valid email address', 'BAD_REQUEST');
    if (input.name !== undefined && !input.name.trim()) throw new ZiteError('Enter the applicant’s name', 'BAD_REQUEST');

    const assertEmailFree = async (exceptId: string | null) => {
      if (email === undefined) return;
      const { rows } = await zite.sql({
        query: `SELECT id, "name" FROM "Applicants" WHERE LOWER("email") = $1 AND id::text <> $2 LIMIT 1`,
        params: [email, exceptId ?? ''],
      });
      if (rows[0]) {
        throw new ZiteError(`${String(rows[0].name || 'Another applicant')} already uses ${email}. Open their profile instead, or use a different address.`, 'CONFLICT');
      }
    };

    if (input.action === 'create') {
      if (!input.name?.trim()) throw new ZiteError('Enter the applicant’s name', 'BAD_REQUEST');
      if (!email) throw new ZiteError('Enter the applicant’s email address', 'BAD_REQUEST');
      await assertEmailFree(null);
      const created = await zite.applicants.create({
        record: {
          name: input.name.trim(),
          email,
          phone: clean(input.phone),
          organization: clean(input.organization),
          location: clean(input.location),
          website: normalizeWebsite(input.website),
          notes: clean(input.notes),
          joinedAt: new Date().toISOString(),
          lastActiveAt: null,
        },
      });
      return { id: created.id };
    }

    if (!input.id) throw new ZiteError('Which applicant?', 'BAD_REQUEST');
    const existing = await zite.applicants.findOne({ id: input.id });
    if (!existing) throw new ZiteError('Applicant not found', 'NOT_FOUND');
    await assertEmailFree(input.id);

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (email !== undefined) patch.email = email;
    if (input.phone !== undefined) patch.phone = clean(input.phone);
    if (input.organization !== undefined) patch.organization = clean(input.organization);
    if (input.location !== undefined) patch.location = clean(input.location);
    if (input.website !== undefined) patch.website = normalizeWebsite(input.website);
    // Notes keep their own whitespace — only an entirely blank note is cleared.
    if (input.notes !== undefined) patch.notes = input.notes?.trim() ? input.notes : null;
    if (Object.keys(patch).length) await zite.applicants.update({ id: input.id, record: patch as never });
    return { id: input.id };
  },
});
