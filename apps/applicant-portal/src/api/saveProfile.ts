import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getApplicant } from '@project/shared/server/applicants';
import { parseInput } from '../server/portal';

const Input = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(120, 'Keep your name under 120 characters.'),
  phone: z.string().trim().max(40, 'Keep the phone number under 40 characters.').default(''),
  organization: z.string().trim().max(200, 'Keep the organization name under 200 characters.').default(''),
  location: z.string().trim().max(200, 'Keep the location under 200 characters.').default(''),
  website: z.string().trim().max(500, 'Keep the website address under 500 characters.').default(''),
});

/** The applicant's own contact details. Email comes from their sign-in and can't be changed here. */
export default createEndpoint({
  description: 'Update your contact details',
  authenticated: true,
  inputSchema: Input,
  execute: async ({ input: raw, context }) => {
    const input = parseInput(Input, raw);
    const applicant = await getApplicant(context);
    if (input.phone) {
      const digits = input.phone.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) throw new ZiteError('Enter a valid phone number, or leave it blank.', 'BAD_REQUEST');
    }
    let website = input.website;
    if (website) {
      if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
      try {
        if (!new URL(website).hostname.includes('.')) throw new Error('bad');
      } catch {
        throw new ZiteError('Enter a full web address, like example.org, or leave it blank.', 'BAD_REQUEST');
      }
    }
    const record = { name: input.name, phone: input.phone || null, organization: input.organization || null, location: input.location || null, website: website || null };
    await zite.applicants.update({ id: applicant.id, record });
    return { id: applicant.id, email: applicant.email, name: input.name, phone: input.phone, organization: input.organization, location: input.location, website };
  },
});
