import {
  FILE_KINDS,
  OTHER,
  isChoiceField,
  isInputField,
  otherKey,
  type AddressValue,
  type AnswerValue,
  type Answers,
  type FileValue,
  type FormField,
} from './types';

/**
 * Pure form logic, run identically in the browser (instant feedback) and in
 * endpoints (the only check that counts — `inputSchema` is not enforced by the
 * runtime, so every write re-validates here).
 */

const MAX_TEXT = 20000;

/** Parse the JSON stored on a Forms row, tolerating anything malformed. */
export function parseFields(raw: unknown): FormField[] {
  if (Array.isArray(raw)) return raw as FormField[];
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as FormField[]) : Array.isArray(v?.fields) ? (v.fields as FormField[]) : [];
  } catch {
    return [];
  }
}

export function parseAnswers(raw: unknown): Answers {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Answers;
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Answers) : {};
  } catch {
    return {};
  }
}

export function newId(prefix = 'f') {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${prefix}_${s}`;
}

export function isEmptyValue(v: AnswerValue | undefined): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.values(v as AddressValue).every(x => !x || !String(x).trim());
  return false;
}

export function wordCount(text: string) {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Does a condition hold for these answers? A condition on a hidden field is false. */
export function conditionHolds(field: FormField, answers: Answers, byId: Map<string, FormField>, visible: Set<string>): boolean {
  const c = field.showIf;
  if (!c || !c.fieldId) return true;
  const source = byId.get(c.fieldId);
  if (!source || !visible.has(source.id)) return false;
  const v = answers[c.fieldId];
  switch (c.operator) {
    case 'is_set':
      return !isEmptyValue(v);
    case 'is_empty':
      return isEmptyValue(v);
    case 'includes':
      return Array.isArray(v) ? (v as unknown[]).map(String).includes(String(c.value ?? '')) : String(v ?? '') === String(c.value ?? '');
    case 'not_equals':
      return Array.isArray(v) ? !(v as unknown[]).map(String).includes(String(c.value ?? '')) : String(v ?? '') !== String(c.value ?? '');
    case 'gt':
      return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) > Number(c.value) : false;
    case 'lt':
      return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) < Number(c.value) : false;
    case 'equals':
    default:
      return Array.isArray(v) ? (v as unknown[]).map(String).includes(String(c.value ?? '')) : String(v ?? '') === String(c.value ?? '');
  }
}

/**
 * Ids of the fields currently shown. Conditions only look backwards, so one
 * pass in order resolves chains (A shows B, B shows C). A section hidden by a
 * condition hides everything until the next section.
 */
export function visibleFieldIds(fields: FormField[], answers: Answers): Set<string> {
  const byId = new Map(fields.map(f => [f.id, f]));
  const visible = new Set<string>();
  let sectionHidden = false;
  for (const f of fields) {
    if (f.type === 'section') {
      sectionHidden = !conditionHolds(f, answers, byId, visible);
      if (!sectionHidden) visible.add(f.id);
      continue;
    }
    if (sectionHidden) continue;
    if (conditionHolds(f, answers, byId, visible)) visible.add(f.id);
  }
  return visible;
}

export type Step = { id: string; title: string; help?: string; fields: FormField[] };

/** Split a form into steps at each visible section. Fields before the first section form an untitled step. */
export function formSteps(fields: FormField[], answers: Answers, opts: { includeHidden?: boolean } = {}): Step[] {
  const visible = opts.includeHidden ? new Set(fields.map(f => f.id)) : visibleFieldIds(fields, answers);
  const steps: Step[] = [];
  let current: Step | null = null;
  let skipping = false;
  for (const f of fields) {
    if (f.type === 'section') {
      skipping = !visible.has(f.id);
      current = skipping ? null : { id: f.id, title: f.label || 'Untitled section', help: f.help, fields: [] };
      if (current) steps.push(current);
      continue;
    }
    if (skipping || !visible.has(f.id)) continue;
    // Only fields that precede every section reach here without a step.
    if (!current) {
      current = { id: '__intro', title: '', fields: [] };
      steps.push(current);
    }
    current.fields.push(f);
  }
  return steps.filter(s => s.fields.length > 0);
}

function fileMatchesKinds(file: FileValue, kinds: string[] | undefined) {
  if (!kinds || kinds.length === 0) return true;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return kinds.some(k => {
    const kind = FILE_KINDS[k];
    if (!kind) return false;
    return kind.extensions.includes(ext) || kind.mime.some(m => (file.type || '').startsWith(m));
  });
}

export function acceptAttribute(kinds: string[] | undefined) {
  if (!kinds || kinds.length === 0) return undefined;
  return kinds.flatMap(k => FILE_KINDS[k]?.extensions.map(e => `.${e}`) ?? []).join(',');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A single field's problem, or null. `value` is the field's answer; `answers` supplies the "Other" text. */
export function validateField(field: FormField, answers: Answers): string | null {
  if (!isInputField(field)) return null;
  const v = answers[field.id];
  const empty = isEmptyValue(v);
  if (empty) return field.required ? requiredMessage(field) : null;

  switch (field.type) {
    case 'short_text':
    case 'long_text': {
      const s = String(v);
      if (field.maxLength && s.length > field.maxLength) return `Keep this under ${field.maxLength.toLocaleString()} characters (currently ${s.length.toLocaleString()}).`;
      if (field.type === 'long_text' && field.maxWords) {
        const n = wordCount(s);
        if (n > field.maxWords) return `Keep this under ${field.maxWords.toLocaleString()} words (currently ${n.toLocaleString()}).`;
      }
      return null;
    }
    case 'email':
      return EMAIL_RE.test(String(v).trim()) ? null : 'Enter a valid email address, like name@example.org.';
    case 'url': {
      const s = String(v).trim();
      const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
      try {
        const u = new URL(withScheme);
        return u.hostname.includes('.') ? null : 'Enter a full web address, like example.org.';
      } catch {
        return 'Enter a full web address, like example.org.';
      }
    }
    case 'phone': {
      const digits = String(v).replace(/\D/g, '');
      return digits.length >= 7 && digits.length <= 15 ? null : 'Enter a valid phone number.';
    }
    case 'number':
    case 'currency': {
      const n = Number(v);
      if (!Number.isFinite(n)) return 'Enter a number.';
      if (field.min != null && n < field.min) return `Enter ${field.type === 'currency' ? 'an amount' : 'a number'} of at least ${field.min.toLocaleString()}.`;
      if (field.max != null && n > field.max) return `Enter ${field.type === 'currency' ? 'an amount' : 'a number'} no more than ${field.max.toLocaleString()}.`;
      return null;
    }
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? null : 'Enter a date.';
    case 'single_choice':
    case 'dropdown': {
      const s = String(v);
      if (s === OTHER) return isEmptyValue(answers[otherKey(field.id)]) ? 'Tell us what "Other" means here.' : null;
      return field.options?.some(o => o.id === s) ? null : 'Choose one of the options.';
    }
    case 'multiple_choice': {
      const arr = Array.isArray(v) ? (v as string[]) : [];
      if (field.min != null && arr.length < field.min) return `Choose at least ${field.min}.`;
      if (field.max != null && arr.length > field.max) return `Choose no more than ${field.max}.`;
      if (arr.includes(OTHER) && isEmptyValue(answers[otherKey(field.id)])) return 'Tell us what "Other" means here.';
      return null;
    }
    case 'yes_no':
      return v === 'yes' || v === 'no' ? null : 'Choose yes or no.';
    case 'file': {
      const files = Array.isArray(v) ? (v as FileValue[]) : [];
      if (field.maxFiles && files.length > field.maxFiles) return `Upload no more than ${field.maxFiles} file${field.maxFiles === 1 ? '' : 's'}.`;
      const wrongType = files.find(f => !fileMatchesKinds(f, field.accept));
      if (wrongType) return `${wrongType.name} isn't an accepted file type.`;
      const tooBig = field.maxSizeMb ? files.find(f => f.size > field.maxSizeMb! * 1024 * 1024) : undefined;
      if (tooBig) return `${tooBig.name} is larger than ${field.maxSizeMb} MB.`;
      return null;
    }
    case 'address': {
      const a = v as AddressValue;
      if (field.required && (!a.line1?.trim() || !a.city?.trim() || !a.country?.trim())) return 'Enter the street, city and country.';
      return null;
    }
    default:
      return null;
  }
}

function requiredMessage(field: FormField) {
  if (field.type === 'file') return 'Upload a file to continue.';
  if (isChoiceField(field) || field.type === 'yes_no') return 'Choose an option to continue.';
  return 'This question is required.';
}

/** Every visible field's problem, keyed by field id. Hidden fields are never required. */
export function validateAnswers(fields: FormField[], answers: Answers, onlyFieldIds?: Set<string>): Record<string, string> {
  const visible = visibleFieldIds(fields, answers);
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (!visible.has(f.id)) continue;
    if (onlyFieldIds && !onlyFieldIds.has(f.id)) continue;
    const e = validateField(f, answers);
    if (e) errors[f.id] = e;
  }
  return errors;
}

export type EligibilityResult = { eligible: boolean; reasons: Array<{ fieldId: string; message: string }> };

/** Only answered, visible eligibility questions can disqualify. */
export function checkEligibility(fields: FormField[], answers: Answers): EligibilityResult {
  const visible = visibleFieldIds(fields, answers);
  const reasons: EligibilityResult['reasons'] = [];
  for (const f of fields) {
    if (!f.eligibility?.disqualifyValues?.length || !visible.has(f.id)) continue;
    const v = answers[f.id];
    if (isEmptyValue(v)) continue;
    const chosen = Array.isArray(v) ? (v as string[]).map(String) : [String(v)];
    if (chosen.some(c => f.eligibility!.disqualifyValues.includes(c))) {
      reasons.push({ fieldId: f.id, message: f.eligibility.message?.trim() || "Based on this answer, you aren't eligible for this program." });
    }
  }
  return { eligible: reasons.length === 0, reasons };
}

export const eligibilityFields = (fields: FormField[]) => fields.filter(f => f.eligibility?.disqualifyValues?.length);

function cleanText(v: unknown, max = MAX_TEXT) {
  return String(v ?? '').replace(/ /g, '').slice(0, max);
}

function cleanFile(raw: unknown): FileValue | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const url = String(r.url ?? '');
  if (!/^https:\/\//i.test(url)) return null;
  return {
    url: url.slice(0, 2000),
    name: cleanText(r.name || url.split('/').pop() || 'file', 240),
    size: Math.max(0, Number(r.size) || 0),
    type: cleanText(r.type, 120),
  };
}

/**
 * Keep only answers to fields on this form, coerced to each field's shape.
 * Anything else a client sends is dropped. Values for hidden fields are kept
 * while drafting (a toggled condition shouldn't destroy work) and dropped on
 * submit with `dropHidden`.
 */
export function sanitizeAnswers(fields: FormField[], raw: unknown, opts: { dropHidden?: boolean } = {}): Answers {
  const input = parseAnswers(raw);
  const out: Answers = {};
  for (const f of fields) {
    if (!isInputField(f)) continue;
    const v = input[f.id];
    if (v === undefined || v === null) continue;
    switch (f.type) {
      case 'short_text':
      case 'email':
      case 'phone':
      case 'url':
        out[f.id] = cleanText(v, f.maxLength ? Math.max(f.maxLength * 2, 500) : 2000).trim();
        break;
      case 'long_text':
        out[f.id] = cleanText(v);
        break;
      case 'number':
      case 'currency': {
        if (typeof v === 'string' && v.trim() === '') break;
        const n = Number(typeof v === 'string' ? v.replace(/[,$\s]/g, '') : v);
        if (Number.isFinite(n)) out[f.id] = f.type === 'currency' ? Math.round(n * 100) / 100 : n;
        break;
      }
      case 'date':
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) out[f.id] = v.slice(0, 10);
        break;
      case 'single_choice':
      case 'dropdown': {
        const s = String(v);
        if (s === OTHER && f.allowOther) {
          out[f.id] = OTHER;
          out[otherKey(f.id)] = cleanText(input[otherKey(f.id)], 500).trim();
        } else if (f.options?.some(o => o.id === s)) out[f.id] = s;
        break;
      }
      case 'multiple_choice': {
        const arr = (Array.isArray(v) ? v : [v]).map(String);
        const ok = arr.filter((s, i) => arr.indexOf(s) === i && ((s === OTHER && f.allowOther) || f.options?.some(o => o.id === s)));
        out[f.id] = ok;
        if (ok.includes(OTHER)) out[otherKey(f.id)] = cleanText(input[otherKey(f.id)], 500).trim();
        break;
      }
      case 'yes_no':
        if (v === 'yes' || v === 'no') out[f.id] = v;
        else if (v === true) out[f.id] = 'yes';
        else if (v === false) out[f.id] = 'no';
        break;
      case 'file': {
        const files = (Array.isArray(v) ? v : []).map(cleanFile).filter(Boolean) as FileValue[];
        out[f.id] = files.slice(0, Math.max(1, f.maxFiles ?? 10));
        break;
      }
      case 'address': {
        if (typeof v !== 'object' || Array.isArray(v)) break;
        const a = v as Record<string, unknown>;
        out[f.id] = {
          line1: cleanText(a.line1, 200).trim(),
          line2: cleanText(a.line2, 200).trim(),
          city: cleanText(a.city, 120).trim(),
          region: cleanText(a.region, 120).trim(),
          postalCode: cleanText(a.postalCode, 40).trim(),
          country: cleanText(a.country, 120).trim(),
        };
        break;
      }
    }
  }
  if (opts.dropHidden) {
    const visible = visibleFieldIds(fields, out);
    for (const f of fields) {
      if (!visible.has(f.id)) {
        delete out[f.id];
        delete out[otherKey(f.id)];
      }
    }
  }
  return out;
}

export function optionLabel(field: FormField, id: string, answers?: Answers) {
  if (id === OTHER) {
    const text = answers ? String(answers[otherKey(field.id)] ?? '').trim() : '';
    return text ? `Other: ${text}` : 'Other';
  }
  return field.options?.find(o => o.id === id)?.label ?? id;
}

export function formatAddress(a: AddressValue | null | undefined) {
  if (!a) return '';
  return [a.line1, a.line2, [a.city, a.region].filter(Boolean).join(', '), a.postalCode, a.country].filter(x => x && String(x).trim()).join(', ');
}

/** An answer as plain text — for CSV exports, PDFs, merge tags and AI prompts. */
export function answerToText(field: FormField, answers: Answers, opts: { currency?: string } = {}): string {
  const v = answers[field.id];
  if (isEmptyValue(v)) return '';
  switch (field.type) {
    case 'single_choice':
    case 'dropdown':
      return optionLabel(field, String(v), answers);
    case 'multiple_choice':
      return (Array.isArray(v) ? (v as string[]) : []).map(id => optionLabel(field, id, answers)).join('; ');
    case 'yes_no':
      return v === 'yes' ? 'Yes' : 'No';
    case 'currency':
      return formatMoney(Number(v), opts.currency);
    case 'number':
      return Number(v).toLocaleString('en-US');
    case 'file':
      return (Array.isArray(v) ? (v as FileValue[]) : []).map(f => `${f.name} (${f.url})`).join('; ');
    case 'address':
      return formatAddress(v as AddressValue);
    default:
      return String(v);
  }
}

export function formatMoney(n: number | null | undefined, currency = 'USD', opts: { compact?: boolean } = {}) {
  if (n == null || !Number.isFinite(n)) return '';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: opts.compact || Number.isInteger(n) ? 0 : 2,
      minimumFractionDigits: 0,
      ...(opts.compact && Math.abs(n) >= 10000 ? { notation: 'compact' as const, maximumFractionDigits: 1 } : {}),
    }).format(n);
  } catch {
    return `$${Math.round(n).toLocaleString('en-US')}`;
  }
}

/** The submission's title and requested amount, read from the fields the form maps them to. */
export function deriveSummary(fields: FormField[], answers: Answers, map: { titleFieldId?: string | null; amountFieldId?: string | null }) {
  const titleField = map.titleFieldId ? fields.find(f => f.id === map.titleFieldId) : undefined;
  const amountField = map.amountFieldId ? fields.find(f => f.id === map.amountFieldId) : undefined;
  const title = titleField ? answerToText(titleField, answers).trim().slice(0, 200) : '';
  const rawAmount = amountField ? answers[amountField.id] : null;
  const amount = rawAmount == null || rawAmount === '' ? null : Number(rawAmount);
  return { title, amount: amount != null && Number.isFinite(amount) ? amount : null };
}

/** How much of a form is filled in, for progress bars. Counts visible required questions, or all visible questions when none are required. */
export function completion(fields: FormField[], answers: Answers) {
  const visible = visibleFieldIds(fields, answers);
  const inputs = fields.filter(f => isInputField(f) && visible.has(f.id));
  const required = inputs.filter(f => f.required);
  const basis = required.length ? required : inputs;
  const done = basis.filter(f => !isEmptyValue(answers[f.id])).length;
  return { done, total: basis.length, ratio: basis.length ? done / basis.length : 1 };
}

/** Strip answers reviewers must not see. With blind review, identity fields go too. */
export function redactForReviewers(fields: FormField[], answers: Answers) {
  const hidden = new Set(fields.filter(f => f.hideFromReviewers).map(f => f.id));
  const visibleFields = fields.filter(f => !hidden.has(f.id));
  const out: Answers = {};
  for (const [k, v] of Object.entries(answers)) {
    const base = k.endsWith('__other') ? k.slice(0, -'__other'.length) : k;
    if (!hidden.has(base)) out[k] = v;
  }
  return { fields: visibleFields, answers: out };
}
