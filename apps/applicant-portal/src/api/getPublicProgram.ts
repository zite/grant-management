import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { parseFields } from '@project/shared/forms/logic';
import { applicationForm } from '@project/shared/server/pipeline';
import { num, ref, str } from '@project/shared/server/sql';
import { loadPublishedProgram, parseInput, toPublicProgram } from '../server/portal';

const Input = z.object({ slug: z.string().trim().min(1).max(200) });

/**
 * One program's public page, with its application form so the page can say
 * what an applicant will need and run the eligibility check before they
 * commit. The form is what every applicant sees anyway; answers never are.
 */
export default createEndpoint({
  description: "A published program's public details and application form",
  authenticated: false,
  inputSchema: Input,
  execute: async ({ input: raw }) => {
    const { slug } = parseInput(Input, raw);
    const row = await loadPublishedProgram({ slug });
    const form = await applicationForm(String(row.id));
    return {
      program: {
        ...toPublicProgram(row),
        description: str(row.description) ?? '',
        eligibility: str(row.eligibility) ?? '',
        contactEmail: ref(row.contactEmail),
        maxPerApplicant: num(row.maxPerApplicant, 1) || 1,
      },
      form: form ? { fields: parseFields(form.fieldsJson), description: form.description } : null,
    };
  },
});
