import { opts, newField } from './catalog';
import { newId } from './logic';
import {
  FIELD_TYPES,
  FILE_KINDS,
  isChoiceField,
  isInputField,
  type ConditionOperator,
  type FieldType,
  type FormField,
} from './types';

/**
 * The form builder's rules, shared by the builder UI (instant feedback before
 * saving) and `saveForm` (the check that counts). Pure — no zod, no React —
 * so both sides run exactly the same code.
 */

export const MAX_FIELDS = 300;
export const MAX_FORM_JSON = 400_000;
export const MAX_OPTIONS = 500;
export const FIELD_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const LIMITS = {
  name: 120,
  description: 5000,
  label: 500,
  help: 10000,
  placeholder: 200,
  optionLabel: 300,
  eligibilityMessage: 500,
  maxLength: 20000,
  maxWords: 10000,
  maxFiles: 20,
  maxSizeMb: 100,
  number: 1e12,
};

export type FormKind = 'Application' | 'Follow-up';

// ── Conditions ────────────────────────────────────────────────────────────

export const OPERATOR_LABEL: Record<ConditionOperator, string> = {
  equals: 'is',
  not_equals: 'is not',
  includes: 'includes',
  is_set: 'is answered',
  is_empty: 'is not answered',
  gt: 'is more than',
  lt: 'is less than',
};

/** Wording that reads right for the source question's type. */
export function operatorLabel(op: ConditionOperator, sourceType: FieldType) {
  if (sourceType === 'multiple_choice' && op === 'not_equals') return "doesn't include";
  if (sourceType === 'file' && op === 'is_set') return 'has a file';
  if (sourceType === 'file' && op === 'is_empty') return 'has no file';
  return OPERATOR_LABEL[op];
}

/** Operators that make sense for a question of this type. */
export function operatorsFor(type: FieldType): ConditionOperator[] {
  switch (type) {
    case 'single_choice':
    case 'dropdown':
      return ['equals', 'not_equals', 'is_set', 'is_empty'];
    case 'multiple_choice':
      return ['includes', 'not_equals', 'is_set', 'is_empty'];
    case 'yes_no':
      return ['equals', 'is_set', 'is_empty'];
    case 'number':
    case 'currency':
      return ['gt', 'lt', 'equals', 'not_equals', 'is_set', 'is_empty'];
    case 'short_text':
    case 'email':
    case 'phone':
    case 'url':
      return ['equals', 'not_equals', 'is_set', 'is_empty'];
    default:
      // Long text, dates, files and addresses compare poorly — only presence is reliable.
      return ['is_set', 'is_empty'];
  }
}

export const operatorNeedsValue = (op: ConditionOperator) => op !== 'is_set' && op !== 'is_empty';

/** Questions a condition may point at: inputs that come before the question. */
export function conditionSources(fields: FormField[], fieldId: string) {
  const index = fields.findIndex(f => f.id === fieldId);
  return (index < 0 ? [] : fields.slice(0, index)).filter(isInputField);
}

export const canHaveEligibility = (f: Pick<FormField, 'type'>) => isChoiceField(f) || f.type === 'yes_no';

/** The answers a screening question can disqualify, as ids. */
export function answerChoices(f: FormField): Array<{ id: string; label: string }> {
  if (f.type === 'yes_no') return [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }];
  return (f.options ?? []).map(o => ({ id: o.id, label: o.label }));
}

/** Why a condition can't work any more, or null. */
export function conditionProblem(fields: FormField[], field: FormField): string | null {
  const c = field.showIf;
  if (!c || !c.fieldId) return null;
  const index = fields.findIndex(f => f.id === field.id);
  const sourceIndex = fields.findIndex(f => f.id === c.fieldId);
  if (sourceIndex < 0) return 'It depends on a question that was deleted.';
  const source = fields[sourceIndex];
  if (!isInputField(source)) return 'It depends on a section or text block, which has no answer.';
  if (index >= 0 && sourceIndex >= index) return 'It depends on a question that now comes after it.';
  if (!operatorsFor(source.type).includes(c.operator)) return `“${short(source.label)}” can't be compared that way any more.`;
  if (operatorNeedsValue(c.operator)) {
    if (source.type === 'yes_no') {
      if (c.value !== 'yes' && c.value !== 'no') return 'Choose yes or no for the condition.';
    } else if (isChoiceField(source)) {
      if (!source.options?.some(o => o.id === String(c.value ?? ''))) return 'The option it checks for was removed.';
    } else if (source.type === 'number' || source.type === 'currency') {
      if (c.value === '' || c.value == null || !Number.isFinite(Number(c.value))) return 'Enter a number for the condition.';
    } else if (c.value == null || String(c.value).trim() === '') {
      return 'Enter the answer the condition checks for.';
    }
  }
  return null;
}

/**
 * Remove conditions that can no longer work (their question was deleted, moved
 * below, or lost the option they check), and screening answers that no longer
 * exist. Returns the questions that changed so the builder can say so.
 */
export function repairReferences(fields: FormField[]) {
  const stripped: Array<{ id: string; label: string; reason: string }> = [];
  const out = fields.map(f => {
    let next = f;
    const problem = conditionProblem(fields, f);
    if (problem) {
      stripped.push({ id: f.id, label: f.label, reason: problem });
      next = { ...next, showIf: null };
    }
    if (next.eligibility) {
      if (!canHaveEligibility(next)) next = { ...next, eligibility: null };
      else {
        const valid = new Set(answerChoices(next).map(a => a.id));
        const kept = (next.eligibility!.disqualifyValues ?? []).filter(v => valid.has(v));
        if (kept.length !== next.eligibility!.disqualifyValues.length) next = { ...next, eligibility: kept.length ? { ...next.eligibility!, disqualifyValues: kept } : null };
      }
    }
    return next;
  });
  return { fields: out, stripped };
}

// ── Validation ────────────────────────────────────────────────────────────

export type Issue = { fieldId: string | null; message: string };

const short = (s: string | undefined | null, n = 48) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** How an issue names a question: its label, or its position among its own kind when it has none. */
export function describeField(f: Pick<FormField, 'label' | 'type'>, ordinal: number) {
  const label = short(f.label);
  if (label) return `“${label}”`;
  if (f.type === 'section') return `Section ${ordinal}`;
  if (f.type === 'content') return `Text block ${ordinal}`;
  return `Question ${ordinal}`;
}

/** 1-based positions counted separately for questions, sections and text blocks, as a person would count them. */
function ordinals(items: unknown[]) {
  const counts = { section: 0, content: 0, input: 0 };
  return items.map(item => {
    const type = (item && typeof item === 'object' ? (item as { type?: string }).type : '') ?? '';
    const key = type === 'section' ? 'section' : type === 'content' ? 'content' : 'input';
    counts[key] += 1;
    return counts[key];
  });
}

const isInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v);
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const present = (v: unknown) => v !== undefined && v !== null;

export const TITLE_TYPES: FieldType[] = ['short_text'];
export const AMOUNT_TYPES: FieldType[] = ['currency', 'number'];

/**
 * Coerce whatever a client sent into clean fields, and list what is wrong.
 * `errors` block a save; `warnings` are worth knowing but allowed.
 */
export function checkForm(raw: unknown, opts: { kind: FormKind; titleFieldId?: string | null; amountFieldId?: string | null }) {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err = (fieldId: string | null, message: string) => errors.push({ fieldId, message });
  const warn = (fieldId: string | null, message: string) => warnings.push({ fieldId, message });

  if (!Array.isArray(raw)) {
    err(null, 'The form’s questions are missing or malformed.');
    return { fields: [] as FormField[], titleFieldId: null, amountFieldId: null, errors, warnings };
  }
  if (raw.length > MAX_FIELDS) err(null, `A form can have up to ${MAX_FIELDS} questions, sections and text blocks. This one has ${raw.length}.`);
  let size = 0;
  try {
    size = JSON.stringify(raw).length;
  } catch {
    size = Infinity;
  }
  if (size > MAX_FORM_JSON) err(null, 'This form is too large to save. Shorten long help text or remove some options.');
  if (errors.length) return { fields: [] as FormField[], titleFieldId: null, amountFieldId: null, errors, warnings };

  const seen = new Set<string>();
  const fields: FormField[] = [];
  const position = ordinals(raw);

  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      err(null, `Item ${index + 1} on the form isn't a valid question.`);
      return;
    }
    const r = item as Record<string, unknown>;
    const type = r.type as FieldType;
    const n = position[index];
    const name = describeField({ label: typeof r.label === 'string' ? r.label : '', type }, n);
    if (typeof r.id !== 'string' || !FIELD_ID_RE.test(r.id)) {
      err(null, `${name} has an invalid id.`);
      return;
    }
    const id = r.id;
    if (seen.has(id)) {
      err(id, `${name} has the same id as another question.`);
      return;
    }
    seen.add(id);
    if (!(FIELD_TYPES as readonly string[]).includes(type)) {
      err(id, `${name} has an unknown question type.`);
      return;
    }

    const f: FormField = { id, type, label: typeof r.label === 'string' ? r.label.replace(/ /g, '') : '' };
    const input = isInputField(f);

    if (f.label.length > LIMITS.label) err(id, `${name}: keep the label under ${LIMITS.label} characters.`);
    if (input && !f.label.trim()) err(id, `Question ${n} needs a label.`);
    if (type === 'section' && !f.label.trim()) err(id, `Section ${n} needs a heading.`);

    if (present(r.help)) {
      if (typeof r.help !== 'string') err(id, `${name} has invalid help text.`);
      else if (r.help.length > LIMITS.help) err(id, `${name}: keep the help text under ${LIMITS.help.toLocaleString()} characters.`);
      else if (r.help.trim()) f.help = r.help;
    }
    if (type === 'content' && !f.help?.trim() && !f.label.trim()) err(id, `Text block ${n} is empty. Add some text or remove it.`);

    if (input) {
      f.required = r.required === true;
      if (present(r.placeholder) && typeof r.placeholder === 'string' && r.placeholder.trim()) {
        if (r.placeholder.length > LIMITS.placeholder) err(id, `${name}: keep the placeholder under ${LIMITS.placeholder} characters.`);
        else f.placeholder = r.placeholder;
      }
      if (r.width === 'half') f.width = 'half';
      if (r.hideFromReviewers === true) f.hideFromReviewers = true;
    }

    // Choice options
    if (isChoiceField(f)) {
      const list = Array.isArray(r.options) ? r.options : [];
      if (!list.length) err(id, `${name} needs at least one option.`);
      if (list.length > MAX_OPTIONS) err(id, `${name} has more than ${MAX_OPTIONS} options.`);
      const optionIds = new Set<string>();
      const labels = new Map<string, number>();
      f.options = [];
      list.slice(0, MAX_OPTIONS).forEach((o, oi) => {
        const oo = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>;
        const oid = typeof oo.id === 'string' ? oo.id : '';
        const olabel = typeof oo.label === 'string' ? oo.label : '';
        if (!FIELD_ID_RE.test(oid)) return err(id, `${name}: option ${oi + 1} has an invalid id.`);
        if (optionIds.has(oid)) return err(id, `${name}: two options share an id.`);
        optionIds.add(oid);
        if (!olabel.trim()) err(id, `${name}: option ${oi + 1} needs a label.`);
        if (olabel.length > LIMITS.optionLabel) err(id, `${name}: keep option labels under ${LIMITS.optionLabel} characters.`);
        const key = olabel.trim().toLowerCase();
        if (key) labels.set(key, (labels.get(key) ?? 0) + 1);
        f.options!.push({ id: oid, label: olabel });
      });
      const dupes = [...labels.entries()].filter(([, n]) => n > 1).map(([l]) => l);
      if (dupes.length) warn(id, `${name} has duplicate options (${dupes.map(d => `“${short(d, 24)}”`).join(', ')}). Applicants won't be able to tell them apart.`);
      if (r.allowOther === true) f.allowOther = true;
    }

    // Numeric limits
    const num = (key: 'min' | 'max') => {
      const v = r[key];
      if (!present(v) || v === '') return null;
      return v as number;
    };
    if (type === 'number' || type === 'currency') {
      const min = num('min');
      const max = num('max');
      for (const [k, v] of [['minimum', min], ['maximum', max]] as const) {
        if (v !== null && (!isNum(v) || Math.abs(v) > LIMITS.number)) err(id, `${name}: the ${k} must be a number.`);
      }
      if (isNum(min)) f.min = min;
      if (isNum(max)) f.max = max;
      if (isNum(min) && isNum(max) && min! > max!) err(id, `${name}: the minimum is larger than the maximum.`);
    }
    if (type === 'multiple_choice') {
      const min = num('min');
      const max = num('max');
      const count = (f.options?.length ?? 0) + (f.allowOther ? 1 : 0);
      if (min !== null && (!isInt(min) || min < 0)) err(id, `${name}: the minimum number of choices must be a whole number.`);
      if (max !== null && (!isInt(max) || max < 1)) err(id, `${name}: the maximum number of choices must be at least 1.`);
      if (isInt(min) && min! > count) err(id, `${name} asks for at least ${min} choices but only has ${count} options.`);
      if (isInt(min) && isInt(max) && min! > max!) err(id, `${name}: the minimum number of choices is larger than the maximum.`);
      if (isInt(min) && min! > 0) f.min = min;
      if (isInt(max) && max! >= 1) f.max = max;
    }
    if (type === 'short_text' || type === 'long_text') {
      const v = r.maxLength;
      if (present(v) && v !== '') {
        if (!isInt(v) || (v as number) < 1 || (v as number) > LIMITS.maxLength) err(id, `${name}: the character limit must be between 1 and ${LIMITS.maxLength.toLocaleString()}.`);
        else f.maxLength = v as number;
      }
    }
    if (type === 'long_text') {
      const v = r.maxWords;
      if (present(v) && v !== '') {
        if (!isInt(v) || (v as number) < 1 || (v as number) > LIMITS.maxWords) err(id, `${name}: the word limit must be between 1 and ${LIMITS.maxWords.toLocaleString()}.`);
        else f.maxWords = v as number;
      }
    }
    if (type === 'file') {
      const accept = Array.isArray(r.accept) ? r.accept : [];
      const bad = accept.filter(k => typeof k !== 'string' || !FILE_KINDS[k]);
      if (bad.length) err(id, `${name} allows a file type that doesn't exist.`);
      f.accept = [...new Set(accept.filter(k => typeof k === 'string' && FILE_KINDS[k]) as string[])];
      const files = r.maxFiles;
      if (present(files) && files !== '') {
        if (!isInt(files) || (files as number) < 1 || (files as number) > LIMITS.maxFiles) err(id, `${name}: allow between 1 and ${LIMITS.maxFiles} files.`);
        else f.maxFiles = files as number;
      }
      const mb = r.maxSizeMb;
      if (present(mb) && mb !== '') {
        if (!isNum(mb) || (mb as number) <= 0 || (mb as number) > LIMITS.maxSizeMb) err(id, `${name}: the size limit must be between 1 and ${LIMITS.maxSizeMb} MB.`);
        else f.maxSizeMb = mb as number;
      }
    }

    // Conditions (checked against earlier fields once everything is parsed)
    if (present(r.showIf)) {
      const c = r.showIf as Record<string, unknown>;
      if (typeof c !== 'object' || typeof c.fieldId !== 'string' || typeof c.operator !== 'string') err(id, `${name} has an invalid condition.`);
      else {
        const value = c.value;
        f.showIf = {
          fieldId: c.fieldId,
          operator: c.operator as ConditionOperator,
          ...(value === undefined || value === null ? {} : { value: typeof value === 'number' ? value : String(value).slice(0, 500) }),
        };
      }
    }

    // Eligibility
    if (present(r.eligibility)) {
      const e = r.eligibility as Record<string, unknown>;
      if (!canHaveEligibility(f)) err(id, `${name} can't screen applicants — only choice and yes/no questions can.`);
      else if (typeof e !== 'object' || !Array.isArray(e.disqualifyValues)) err(id, `${name} has an invalid eligibility rule.`);
      else {
        const values = [...new Set((e.disqualifyValues as unknown[]).map(String))];
        const message = typeof e.message === 'string' ? e.message : '';
        if (message.length > LIMITS.eligibilityMessage) err(id, `${name}: keep the eligibility message under ${LIMITS.eligibilityMessage} characters.`);
        if (values.length) f.eligibility = { disqualifyValues: values, ...(message.trim() ? { message } : {}) };
      }
    }

    fields.push(f);
  });

  // Cross-field checks
  const fieldPosition = ordinals(fields);
  const byId = new Map(fields.map((f, i) => [f.id, { f, i: fieldPosition[i] }]));
  fields.forEach((f, index) => {
    const name = describeField(f, fieldPosition[index]);
    if (f.showIf) {
      const problem = conditionProblem(fields, f);
      if (problem) err(f.id, `${name} has a condition that can't work. ${problem}`);
    }
    if (f.eligibility) {
      const valid = new Set(answerChoices(f).map(a => a.id));
      if (f.eligibility.disqualifyValues.some(v => !valid.has(v))) err(f.id, `${name} screens out an answer that isn't one of its options.`);
      else if (valid.size > 0 && f.eligibility.disqualifyValues.length >= valid.size && !f.allowOther) err(f.id, `Every answer to ${name} disqualifies applicants. Leave at least one eligible answer.`);
      else if (!f.eligibility.message?.trim()) warn(f.id, `${name} screens applicants out without explaining why. Add a message so they know what happened.`);
      if (!f.required) warn(f.id, `${name} screens applicants but isn't required, so it can be skipped.`);
    }
  });

  // Mapping
  let titleFieldId: string | null = null;
  let amountFieldId: string | null = null;
  if (opts.kind === 'Application') {
    if (opts.titleFieldId) {
      const hit = byId.get(opts.titleFieldId);
      if (!hit) err(null, 'The question used as the submission title was removed. Choose another one.');
      else if (!TITLE_TYPES.includes(hit.f.type)) err(hit.f.id, `${describeField(hit.f, hit.i)} can't be the submission title — use a short answer question.`);
      else {
        titleFieldId = hit.f.id;
        if (hit.f.showIf) warn(hit.f.id, `${describeField(hit.f, hit.i)} is the submission title but only shows sometimes, so some submissions will be untitled.`);
        else if (!hit.f.required) warn(hit.f.id, `${describeField(hit.f, hit.i)} is the submission title but isn't required.`);
      }
    } else if (fields.some(f => f.type === 'short_text')) {
      warn(null, 'No question is used as the submission title, so submissions will be listed by applicant name.');
    }
    if (opts.amountFieldId) {
      const hit = byId.get(opts.amountFieldId);
      if (!hit) err(null, 'The question used as the requested amount was removed. Choose another one.');
      else if (!AMOUNT_TYPES.includes(hit.f.type)) err(hit.f.id, `${describeField(hit.f, hit.i)} can't be the requested amount — use an amount or number question.`);
      else amountFieldId = hit.f.id;
    }
  }

  return { fields, titleFieldId, amountFieldId, errors, warnings };
}

// ── Follow-up starters ────────────────────────────────────────────────────

export type StarterKey = 'blank' | 'agreement' | 'progress' | 'final';

export const STARTERS: Array<{ key: StarterKey; name: string; description: string }> = [
  { key: 'blank', name: 'Blank form', description: 'Start from nothing.' },
  { key: 'agreement', name: 'Grant agreement & payment details', description: 'Signature, payment method and a W-9.' },
  { key: 'progress', name: 'Progress report', description: 'A mid-grant check-in on status and spending.' },
  { key: 'final', name: 'Final report', description: 'Outcomes, spending and stories to share.' },
];

/** Fresh fields for a follow-up starter, with new ids every time. */
export function starterFields(key: StarterKey): FormField[] {
  if (key === 'agreement') {
    const method = newField('single_choice', { label: 'How would you like to be paid?', required: true, options: opts('Direct deposit (ACH)', 'Paper check') });
    const [ach, check] = method.options!;
    return [
      newField('content', { help: 'Congratulations on your award! Review the grant terms, sign on behalf of your organization, and tell us how to send the funds.' }),
      newField('section', { label: 'Agreement' }),
      newField('yes_no', { label: 'I have read and agree to the grant terms.', required: true, eligibility: { disqualifyValues: ['no'], message: 'We can only release funds once the grant terms are accepted. Contact us if you have questions about them.' } }),
      newField('short_text', { label: 'Name of the person signing', required: true, width: 'half' }),
      newField('short_text', { label: 'Title or role', width: 'half' }),
      newField('date', { label: 'Date signed', required: true, width: 'half' }),
      newField('section', { label: 'Payment' }),
      newField('short_text', { label: 'Payee name', help: 'Exactly as it should appear on the payment.', required: true }),
      method,
      newField('file', { label: 'Bank letter or voided check', help: 'So we can confirm your account details.', required: true, accept: ['pdf', 'image'], maxFiles: 1, maxSizeMb: 10, showIf: { fieldId: method.id, operator: 'equals', value: ach.id } }),
      newField('address', { label: 'Mailing address for the check', required: true, showIf: { fieldId: method.id, operator: 'equals', value: check.id } }),
      newField('file', { label: 'W-9', help: 'A signed W-9 for the payee.', required: true, accept: ['pdf'], maxFiles: 1, maxSizeMb: 10 }),
    ];
  }
  if (key === 'progress') {
    const track = newField('single_choice', { label: 'Is the project on track?', required: true, options: opts('On track', 'A little behind', 'Significantly behind') });
    return [
      newField('content', { help: 'A quick check-in halfway through your grant. Short answers are fine.' }),
      newField('long_text', { label: 'What have you accomplished so far?', required: true, maxWords: 300 }),
      track,
      newField('long_text', { label: 'What has changed, and how are you adapting?', required: true, maxWords: 250, showIf: { fieldId: track.id, operator: 'not_equals', value: track.options![0].id } }),
      newField('currency', { label: 'Grant funds spent so far', min: 0, width: 'half' }),
      newField('number', { label: 'People reached so far', min: 0, width: 'half' }),
      newField('file', { label: 'Photos or materials', help: 'Optional. Up to five files.', accept: ['image', 'pdf'], maxFiles: 5, maxSizeMb: 20 }),
    ];
  }
  if (key === 'final') {
    const share = newField('yes_no', { label: 'May we share your story and photos publicly?', required: true });
    return [
      newField('content', { help: 'Tell us how the project went. We want to learn, not to grade.' }),
      newField('section', { label: 'Outcomes' }),
      newField('long_text', { label: 'What happened, and what changed because of it?', required: true, maxWords: 400 }),
      newField('number', { label: 'About how many people took part or benefited?', min: 0, width: 'half' }),
      newField('currency', { label: 'Total grant funds spent', required: true, min: 0, width: 'half' }),
      newField('long_text', { label: 'What would you do differently next time?', maxWords: 250 }),
      newField('section', { label: 'Documents' }),
      newField('file', { label: 'Final budget report', help: 'Planned versus actual spending.', required: true, accept: ['pdf', 'spreadsheet'], maxFiles: 1, maxSizeMb: 20 }),
      share,
      newField('file', { label: 'Photos', help: 'Up to five images we can use.', accept: ['image'], maxFiles: 5, maxSizeMb: 20, showIf: { fieldId: share.id, operator: 'equals', value: 'yes' } }),
    ];
  }
  return [];
}

export const starterName = (key: StarterKey) => (key === 'blank' ? 'Untitled form' : STARTERS.find(s => s.key === key)!.name);

/** A new option id that doesn't collide with the field's others. */
export const newOptionId = () => newId('o');
