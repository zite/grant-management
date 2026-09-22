import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getSettings, rememberPortalUrl } from '@project/shared/server/settings';
import { toPublicProgram } from '../server/portal';

/**
 * The public front page: the organization's branding and every published
 * program. Deliberately shallow — no counts, budgets or owners, since anyone
 * on the internet can call it.
 */
export default createEndpoint({
  description: "The portal's branding and published programs",
  authenticated: false,
  inputSchema: z.object({}),
  execute: async () => {
    const settings = await rememberPortalUrl(await getSettings());
    const { rows } = await zite.sql({
      query: `
        SELECT id, "name", "key", "slug", "type", "status", "summary", "color", "icon", "coverImageUrl", "opensAt", "deadline", "allowLate", "awardMin", "awardMax"
        FROM "Programs"
        WHERE "status" = 'Published'
        ORDER BY COALESCE("position", 0) ASC, created_at ASC
        LIMIT 200`,
      params: [],
    });
    return {
      settings: {
        organizationName: settings.organizationName,
        logoUrl: settings.logoUrl && /^https:\/\//i.test(settings.logoUrl) ? settings.logoUrl : null,
        brandColor: settings.brandColor,
        portalHeadline: settings.portalHeadline,
        portalIntro: settings.portalIntro,
        supportEmail: settings.supportEmail,
        websiteUrl: settings.websiteUrl,
        privacyUrl: settings.privacyUrl,
        currency: settings.currency,
      },
      programs: rows.map(toPublicProgram),
    };
  },
});
