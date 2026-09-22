import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { formatMoney } from '@project/shared/forms/logic';
import { renderMerge, sampleMergeContext } from '@project/shared/merge';
import { sendEmail } from '@project/shared/server/email';
import { assertManager, getActor } from '@project/shared/server/members';
import { getSettings, portalLink } from '@project/shared/server/settings';

/**
 * Send a template, filled with sample data, to the person editing it — so
 * they see exactly what an applicant would: the same layout, reply-to, logo,
 * portal button and signature the real send path uses.
 */

const Input = z.object({
  subject: z.string().max(200),
  body: z.string().max(20000),
});

export default createEndpoint({
  description: 'Email a sample of a template to yourself',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ delivery: z.enum(['Sent', 'Failed']), to: z.string() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError('The subject or message is too long to send', 'BAD_REQUEST');
    const { subject, body } = parsed.data;
    if (!subject.trim() || !body.trim()) throw new ZiteError('Add a subject and a message before sending a test', 'BAD_REQUEST');
    const actor = await getActor(context);
    assertManager(actor);
    const settings = await getSettings();

    const portal = portalLink(settings);
    const ctx = {
      ...sampleMergeContext(),
      organization_name: settings.organizationName,
      award_amount: formatMoney(5000, settings.currency),
      ...(portal ? { portal_link: portal, application_link: portalLink(settings, '/applications') } : {}),
    };
    const link = portalLink(settings, '/applications');
    const delivery = await sendEmail({
      to: actor.email,
      subject: `[Test] ${renderMerge(subject, ctx)}`,
      text: renderMerge(body, ctx),
      settings,
      button: link ? { label: 'View in the portal', href: link } : null,
    });
    return { delivery, to: actor.email };
  },
});
