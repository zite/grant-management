import { zite } from 'zitejs/db';
import { iso, str } from './sql';

/**
 * The organization's settings: one row, created on first read.
 *
 * Both apps read it — the portal for branding, the staff app for email
 * signatures and currency — so it lives here rather than in either app.
 */

export type OrgSettings = {
  id: string;
  organizationName: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  supportEmail: string | null;
  brandColor: string;
  currency: string;
  portalHeadline: string;
  portalIntro: string;
  emailSignature: string;
  privacyUrl: string | null;
  defaultRole: 'Manager' | 'Reviewer';
  portalUrl: string | null;
  staffAppUrl: string | null;
  seededAt: string | null;
};

export const DEFAULT_BRAND = '#1e5c48';

export const DEFAULTS = {
  organizationName: 'Your Organization',
  brandColor: DEFAULT_BRAND,
  currency: 'USD',
  portalHeadline: 'Apply for funding and opportunities',
  portalIntro: 'Browse our open programs, check your eligibility, and apply online. You can save your progress and come back any time.',
  emailSignature: '',
  defaultRole: 'Manager' as const,
};

function toSettings(r: Record<string, unknown>): OrgSettings {
  const role = r.defaultRole === 'Reviewer' ? 'Reviewer' : 'Manager';
  const blank = (v: unknown) => (v == null || v === '' ? null : String(v));
  return {
    id: String(r.id),
    organizationName: str(r.organizationName) || DEFAULTS.organizationName,
    logoUrl: blank(r.logoUrl),
    websiteUrl: blank(r.websiteUrl),
    supportEmail: blank(r.supportEmail),
    brandColor: /^#[0-9a-f]{6}$/i.test(String(r.brandColor ?? '')) ? String(r.brandColor) : DEFAULTS.brandColor,
    currency: /^[A-Z]{3}$/.test(String(r.currency ?? '')) ? String(r.currency) : DEFAULTS.currency,
    portalHeadline: str(r.portalHeadline) || DEFAULTS.portalHeadline,
    portalIntro: str(r.portalIntro) || DEFAULTS.portalIntro,
    emailSignature: str(r.emailSignature) ?? '',
    privacyUrl: blank(r.privacyUrl),
    defaultRole: role,
    portalUrl: blank(r.portalUrl),
    staffAppUrl: blank(r.staffAppUrl),
    seededAt: iso(r.seededAt),
  };
}

export async function getSettings(): Promise<OrgSettings> {
  const { rows } = await zite.sql({ query: `SELECT * FROM "Settings" ORDER BY created_at ASC LIMIT 1`, params: [] });
  if (rows[0]) return toSettings(rows[0]);
  const created = await zite.settings.create({
    record: {
      organizationName: DEFAULTS.organizationName,
      logoUrl: null,
      websiteUrl: null,
      supportEmail: null,
      brandColor: DEFAULTS.brandColor,
      currency: DEFAULTS.currency,
      portalHeadline: DEFAULTS.portalHeadline,
      portalIntro: DEFAULTS.portalIntro,
      emailSignature: null,
      privacyUrl: null,
      defaultRole: DEFAULTS.defaultRole,
      seededAt: null,
      portalUrl: null,
      staffAppUrl: null,
    },
  });
  return toSettings(created as unknown as Record<string, unknown>);
}

/**
 * The portal records its own public URL the first time it runs, so emails
 * sent from the staff app can link applicants to the right place without
 * anyone configuring it.
 */
export async function rememberPortalUrl(settings: OrgSettings) {
  const url = (process.env.ZITE_APP_URL ?? '').replace(/\/+$/, '');
  if (!url || !/^https:\/\//.test(url) || url === settings.portalUrl) return settings;
  // Editor previews run on preview hosts; only the live URL is worth keeping.
  if (/sandbox|preview|editor|localhost/i.test(url) && settings.portalUrl) return settings;
  await zite.settings.update({ id: settings.id, record: { portalUrl: url } });
  return { ...settings, portalUrl: url };
}

/** The staff app does the same, so reviewer emails can link managers back to it. */
export async function rememberStaffAppUrl(settings: OrgSettings) {
  const url = (process.env.ZITE_APP_URL ?? '').replace(/\/+$/, '');
  if (!url || !/^https:\/\//.test(url) || url === settings.staffAppUrl) return settings;
  if (/sandbox|preview|editor|localhost/i.test(url) && settings.staffAppUrl) return settings;
  await zite.settings.update({ id: settings.id, record: { staffAppUrl: url } });
  return { ...settings, staffAppUrl: url };
}

export function staffLink(settings: Pick<OrgSettings, 'staffAppUrl'>, hashPath = '') {
  const base = settings.staffAppUrl ?? '';
  if (!base) return '';
  return hashPath ? `${base}/#${hashPath.startsWith('/') ? hashPath : `/${hashPath}`}` : base;
}

export function portalLink(settings: Pick<OrgSettings, 'portalUrl'>, hashPath = '') {
  const base = settings.portalUrl ?? '';
  if (!base) return '';
  return hashPath ? `${base}/#${hashPath.startsWith('/') ? hashPath : `/${hashPath}`}` : base;
}
