import { otherKey, type Answers } from '@project/shared/forms/types';

/**
 * Apply one field's change on top of the LATEST answers.
 *
 * FormRenderer hands back a whole answers object built from the answers it
 * rendered with. An upload that finishes after the applicant typed somewhere
 * else would therefore put back the old answers and erase the typing. Taking
 * only the changed field (and its "Other" text) from it avoids that.
 */
export function mergeFieldChange(latest: Answers, next: Answers, fieldId: string): Answers {
  const out: Answers = { ...latest };
  for (const key of [fieldId, otherKey(fieldId)]) {
    if (key in next && next[key] !== undefined) out[key] = next[key];
    else delete out[key];
  }
  return out;
}
