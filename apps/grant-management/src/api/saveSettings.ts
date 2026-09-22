import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertAdmin, getActor } from '@project/shared/server/members';
import { getSettings } from '@project/shared/server/settings';

/**
 * Organization settings: name and branding, the reply-to address, currency,
 * the portal's welcome, the email signature and the default role for new
 * teammates. Admins only. Every field is optional — only what is sent changes.
 */

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'JPY', 'INR', 'ZAR', 'MXN', 'BRL'] as const;

const optionalText = (max: number) => z.string().max(max).nullable().optional();

const Input = z.object({
  organizationName: z.string().max(120).optional(),
  logoUrl: optionalText(2000),
  websiteUrl: optionalText(500),
  supportEmail: optionalText(254),
  brandColor: z.string().optional(),
  currency: z.string().optional(),
  portalHeadline: z.string().max(160).optional(),
  portalIntro: z.string().max(4000).optional(),
  emailSignature: optionalText(1000),
  privacyUrl: optionalText(500),
  defaultRole: z.enum(['Manager', 'Reviewer']).optional(),
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function httpsUrl(value: string | null | undefined, what: string) {
  const t = (value ?? '').trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== 'https:' || !u.hostname.includes('.')) throw new Error('not https');
    return t;
  } catch {
    throw new ZiteError(`The ${what} must be a full https:// address`, 'BAD_REQUEST');
  }
}

export default createEndpoint({
  description: 'Update the organization settings (admins only)',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({
    organizationName: z.string(),
    logoUrl: z.string().nullable(),
    websiteUrl: z.string().nullable(),
    supportEmail: z.string().nullable(),
    brandColor: z.string(),
    currency: z.string(),
    portalHeadline: z.string(),
    portalIntro: z.string(),
    emailSignature: z.string(),
    privacyUrl: z.string().nullable(),
    defaultRole: z.enum(['Manager', 'Reviewer']),
    portalUrl: z.string().nullable(),
  }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw ?? {});
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Check the settings and try again', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertAdmin(actor);
    const settings = await getSettings();

    const patch: Record<string, unknown> = {};
    if (input.organizationName !== undefined) {
      const name = input.organizationName.trim();
      if (!name) throw new ZiteError('Your organization needs a name', 'BAD_REQUEST');
      patch.organizationName = name;
    }
    if (input.logoUrl !== undefined) patch.logoUrl = httpsUrl(input.logoUrl, 'logo');
    if (input.websiteUrl !== undefined) patch.websiteUrl = httpsUrl(input.websiteUrl, 'website');
    if (input.privacyUrl !== undefined) patch.privacyUrl = httpsUrl(input.privacyUrl, 'privacy policy link');
    if (input.supportEmail !== undefined) {
      const email = (input.supportEmail ?? '').trim().toLowerCase();
      if (email && !EMAIL.test(email)) throw new ZiteError('Enter a valid support email address', 'BAD_REQUEST');
      patch.supportEmail = email || null;
    }
    if (input.brandColor !== undefined) {
      if (!/^#[0-9a-fA-F]{6}$/.test(input.brandColor.trim())) throw new ZiteError('Brand color must be a hex value like #6943D0', 'BAD_REQUEST');
      patch.brandColor = input.brandColor.trim().toLowerCase();
    }
    if (input.currency !== undefined) {
      const code = input.currency.trim().toUpperCase();
      if (!(CURRENCIES as readonly string[]).includes(code)) throw new ZiteError(`Choose one of the supported currencies: ${CURRENCIES.join(', ')}`, 'BAD_REQUEST');
      patch.currency = code;
    }
    if (input.portalHeadline !== undefined) {
      const headline = input.portalHeadline.trim();
      if (!headline) throw new ZiteError('The portal needs a headline', 'BAD_REQUEST');
      patch.portalHeadline = headline;
    }
    if (input.portalIntro !== undefined) patch.portalIntro = input.portalIntro.trim();
    if (input.emailSignature !== undefined) patch.emailSignature = (input.emailSignature ?? '').replace(/\s+$/, '') || null;
    if (input.defaultRole !== undefined) patch.defaultRole = input.defaultRole;

    if (Object.keys(patch).length) await zite.settings.update({ id: settings.id, record: patch as never });
    const next = await getSettings();
    return {
      organizationName: next.organizationName,
      logoUrl: next.logoUrl,
      websiteUrl: next.websiteUrl,
      supportEmail: next.supportEmail,
      brandColor: next.brandColor,
      currency: next.currency,
      portalHeadline: next.portalHeadline,
      portalIntro: next.portalIntro,
      emailSignature: next.emailSignature,
      privacyUrl: next.privacyUrl,
      defaultRole: next.defaultRole,
      portalUrl: next.portalUrl,
    };
  },
});
