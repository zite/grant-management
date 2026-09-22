import type { z } from 'zod';
import { ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { isInputField, type Answers, type FormField } from '@project/shared/forms/types';
import { acceptingSubmissions, programPhase, type ProgramPhase } from '@project/shared/status';
import { bool, iso, num, numOrNull, ref, str } from '@project/shared/server/sql';

/**
 * Helpers shared by the portal's endpoints. Everything an applicant can read
 * is shaped here, so a field that must never leave the building (internal
 * counts, owners, stage names, decision notes) has exactly one place to be
 * left out of.
 */

/** `inputSchema` isn't enforced by the runtime, so every endpoint re-parses. */
export function parseInput<T extends z.ZodTypeAny>(schema: T, raw: unknown, fallback = "That request wasn't valid. Reload the page and try again."): z.infer<T> {
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // Zod's own wording ("Expected string, received number") means nothing to an applicant.
    const custom = issue && issue.code === 'custom' ? issue.message : issue?.message && /[A-Z].*\.$/.test(issue.message) ? issue.message : null;
    throw new ZiteError(custom ?? fallback, 'BAD_REQUEST');
  }
  return parsed.data;
}

export type PublicProgram = {
  id: string;
  key: string;
  slug: string;
  name: string;
  type: string;
  summary: string;
  color: string;
  icon: string;
  coverImageUrl: string | null;
  opensAt: string | null;
  deadline: string | null;
  allowLate: boolean;
  awardMin: number | null;
  awardMax: number | null;
  phase: ProgramPhase;
  accepting: boolean;
};

export function toPublicProgram(r: Record<string, unknown>): PublicProgram {
  const base = {
    status: str(r.status) || 'Draft',
    opensAt: iso(r.opensAt),
    deadline: iso(r.deadline),
    allowLate: bool(r.allowLate),
  };
  const cover = ref(r.coverImageUrl);
  return {
    id: String(r.id),
    key: str(r.key) || 'APP',
    slug: str(r.slug) || String(r.id),
    name: str(r.name) || 'Untitled program',
    type: str(r.type) || 'Grant',
    summary: str(r.summary) ?? '',
    color: /^#[0-9a-f]{6}$/i.test(String(r.color ?? '')) ? String(r.color) : '#8a8177',
    icon: str(r.icon) ?? '',
    coverImageUrl: cover && /^https:\/\//i.test(cover) ? cover : null,
    opensAt: base.opensAt,
    deadline: base.deadline,
    allowLate: base.allowLate,
    awardMin: numOrNull(r.awardMin),
    awardMax: numOrNull(r.awardMax),
    phase: programPhase(base),
    accepting: acceptingSubmissions(base),
  };
}

export async function loadProgramRow(where: { id?: string; slug?: string }) {
  const { rows } = where.id
    ? await zite.sql({ query: `SELECT * FROM "Programs" WHERE id::text = $1 LIMIT 1`, params: [where.id] })
    : await zite.sql({ query: `SELECT * FROM "Programs" WHERE LOWER("slug") = LOWER($1) ORDER BY created_at ASC LIMIT 1`, params: [where.slug ?? ''] });
  return rows[0] ?? null;
}

/** A program the public may see: published and not archived. Drafts are indistinguishable from programs that don't exist. */
export async function loadPublishedProgram(where: { id?: string; slug?: string }) {
  const row = await loadProgramRow(where);
  if (!row || row.status !== 'Published') throw new ZiteError("We couldn't find that program. It may have been unpublished.", 'NOT_FOUND');
  return row;
}

export type OwnSubmission = {
  id: string;
  title: string;
  number: number | null;
  status: string;
  answers: string;
  programId: string;
  applicantId: string;
  stageId: string | null;
  stageKind: string | null;
  ownerId: string | null;
  requestedAmount: number | null;
  awardAmount: number | null;
  startedAt: string | null;
  lastSavedAt: string | null;
  submittedAt: string | null;
  withdrawnAt: string | null;
  notifiedAt: string | null;
};

/** The applicant's own submission, or NOT_FOUND — the same answer for "missing" and "someone else's", so ids can't be probed. */
export async function loadOwnSubmission(applicantId: string, id: string): Promise<OwnSubmission> {
  const { rows } = await zite.sql({
    query: `
      SELECT s.id, s."title", s."number", s."status", s."answers", s."programId", s."applicantId", s."stageId", s."ownerId",
        s."requestedAmount", s."awardAmount", s."startedAt", s."lastSavedAt", s."submittedAt", s."withdrawnAt", s."notifiedAt",
        st."kind" AS "stageKind"
      FROM "Submissions" s
      LEFT JOIN "Stages" st ON st.id::text = s."stageId"
      WHERE s.id::text = $1 AND s."applicantId" = $2
      LIMIT 1`,
    params: [id, applicantId],
  });
  const r = rows[0];
  if (!r) throw new ZiteError("We couldn't find that application. It may have been deleted.", 'NOT_FOUND');
  return {
    id: String(r.id),
    title: str(r.title) ?? '',
    number: numOrNull(r.number),
    status: str(r.status) || 'Draft',
    answers: str(r.answers) ?? '',
    programId: String(r.programId ?? ''),
    applicantId: String(r.applicantId ?? ''),
    stageId: ref(r.stageId),
    stageKind: ref(r.stageKind),
    ownerId: ref(r.ownerId),
    requestedAmount: numOrNull(r.requestedAmount),
    awardAmount: numOrNull(r.awardAmount),
    startedAt: iso(r.startedAt),
    lastSavedAt: iso(r.lastSavedAt),
    submittedAt: iso(r.submittedAt),
    withdrawnAt: iso(r.withdrawnAt),
    notifiedAt: iso(r.notifiedAt),
  };
}

/** The section a field sits under, for errors that say where to look. */
export function sectionOf(fields: FormField[], fieldId: string) {
  let section = '';
  for (const f of fields) {
    if (f.type === 'section') section = f.label;
    if (f.id === fieldId) return section;
  }
  return section;
}

/** Answers too large to be a real application are someone probing, not someone applying. */
export function assertReasonableSize(answers: unknown) {
  let size = 0;
  try {
    size = JSON.stringify(answers ?? {}).length;
  } catch {
    throw new ZiteError("Those answers couldn't be read. Reload the page and try again.", 'BAD_REQUEST');
  }
  if (size > 400_000) throw new ZiteError('This application is too long to save. Shorten your longest answers and try again.', 'BAD_REQUEST');
}

/**
 * Fill what we already know about the applicant into a new application, so
 * nobody types their own email address twice. Only empty answers are filled.
 */
export function prefillFromProfile(fields: FormField[], answers: Answers, applicant: { name: string; email: string; phone: string; organization: string; website: string }) {
  const out: Answers = { ...answers };
  const put = (f: FormField | undefined, value: string) => {
    if (f && value && (out[f.id] === undefined || out[f.id] === '')) out[f.id] = value;
  };
  const inputs = fields.filter(f => isInputField(f));
  put(inputs.find(f => f.type === 'email'), applicant.email);
  put(inputs.find(f => f.type === 'phone'), applicant.phone);
  put(inputs.find(f => f.type === 'short_text' && /^(full name|your name|name|contact name|applicant name)$/i.test(f.label.trim())), applicant.name);
  if (applicant.website) put(inputs.find(f => f.type === 'url' && /website/i.test(f.label)), applicant.website);
  if (applicant.organization) put(inputs.find(f => f.type === 'short_text' && /^(organization|organization name|group name)$/i.test(f.label.trim()) && !f.showIf), applicant.organization);
  return out;
}

/**
 * The status an applicant may see. A decision staff haven't released reads as
 * "Submitted" — the raw value must never reach the browser, not even in a
 * field the UI doesn't render.
 */
export function visibleStatus(status: string | null | undefined, notifiedAt: string | null | undefined) {
  const s = status || 'Draft';
  if ((s === 'Accepted' || s === 'Declined' || s === 'Waitlisted') && !notifiedAt) return 'Submitted';
  return s;
}

/**
 * A date and time for a server-side sentence, like "September 4, 2026 at 11:00 PM UTC".
 * Intl rejects `dateStyle` combined with `timeZoneName`, so the parts are spelled out.
 * The portal UI shows the applicant's own time zone; a server message can only honestly say UTC.
 */
export function formatWhen(value: string | null | undefined) {
  if (!value) return 'a date to be announced';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'a date to be announced';
  const date = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(d);
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(d);
  return `${date} at ${time} UTC`;
}
