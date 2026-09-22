import { cloneFields } from '@project/shared/forms/catalog';
import { FIELD_TYPES, isChoiceField, type FieldType, type FormField } from '@project/shared/forms/types';

/**
 * Pure operations on a form being edited. Everything here returns new arrays
 * so the undo history can keep old drafts by reference.
 *
 * Sections own the fields that follow them up to the next section, so moving
 * a section moves that whole block.
 */

export type Draft = {
  name: string;
  description: string;
  fields: FormField[];
  titleFieldId: string | null;
  amountFieldId: string | null;
};

export type FormLike = { name: string; description: string; fields: unknown[]; titleFieldId: string | null; amountFieldId: string | null };

export const toDraft = (f: FormLike): Draft => ({
  name: f.name,
  description: f.description ?? '',
  fields: (f.fields ?? []).filter((x): x is FormField => Boolean(x && typeof x === 'object' && (FIELD_TYPES as readonly string[]).includes((x as FormField).type))),
  titleFieldId: f.titleFieldId,
  amountFieldId: f.amountFieldId,
});

export const sameDraft = (a: Draft, b: Draft) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** For a section at `index`, the index just past its last field. */
export function blockEnd(fields: FormField[], index: number) {
  let i = index + 1;
  while (i < fields.length && fields[i].type !== 'section') i++;
  return i;
}

/** The section a field belongs to, or null for fields before the first section. */
export function sectionOf(fields: FormField[], id: string): FormField | null {
  let current: FormField | null = null;
  for (const f of fields) {
    if (f.type === 'section') current = f;
    if (f.id === id) return f.type === 'section' ? f : current;
  }
  return null;
}

/** The ids of a section's fields (not including the section itself). */
export function childrenOf(fields: FormField[], sectionId: string) {
  const index = fields.findIndex(f => f.id === sectionId);
  if (index < 0) return [];
  return fields.slice(index + 1, blockEnd(fields, index)).map(f => f.id);
}

export function insertAt(fields: FormField[], index: number, added: FormField[]) {
  const i = Math.max(0, Math.min(index, fields.length));
  return [...fields.slice(0, i), ...added, ...fields.slice(i)];
}

export function updateField(fields: FormField[], id: string, patch: Partial<FormField>) {
  return fields.map(f => (f.id === id ? cleanField({ ...f, ...patch }) : f));
}

/** Drop settings that no longer apply after an edit, so the saved JSON stays honest. */
export function cleanField(f: FormField): FormField {
  const out: FormField = { ...f };
  if (!isChoiceField(out)) {
    delete out.options;
    delete out.allowOther;
  }
  if (out.type !== 'long_text') delete out.maxWords;
  if (out.type !== 'short_text' && out.type !== 'long_text') delete out.maxLength;
  if (out.type !== 'number' && out.type !== 'currency' && out.type !== 'multiple_choice') {
    delete out.min;
    delete out.max;
  }
  if (out.type !== 'file') {
    delete out.accept;
    delete out.maxFiles;
    delete out.maxSizeMb;
  }
  if (!isChoiceField(out) && out.type !== 'yes_no') delete out.eligibility;
  if (out.eligibility) {
    const valid = new Set(out.type === 'yes_no' ? ['yes', 'no'] : (out.options ?? []).map(o => o.id));
    const kept = out.eligibility.disqualifyValues.filter(v => valid.has(v));
    if (kept.length !== out.eligibility.disqualifyValues.length) out.eligibility = { ...out.eligibility, disqualifyValues: kept };
  }
  if (out.type === 'section' || out.type === 'content') {
    delete out.required;
    delete out.width;
    delete out.placeholder;
    delete out.hideFromReviewers;
  }
  return out;
}

export function removeFromDraft(draft: Draft, id: string): Draft {
  return {
    ...draft,
    fields: draft.fields.filter(f => f.id !== id),
    titleFieldId: draft.titleFieldId === id ? null : draft.titleFieldId,
    amountFieldId: draft.amountFieldId === id ? null : draft.amountFieldId,
  };
}

/** A copy placed right after the original. A section is copied with its fields. */
export function duplicateField(fields: FormField[], id: string): { fields: FormField[]; newId: string | null } {
  const index = fields.findIndex(f => f.id === id);
  if (index < 0) return { fields, newId: null };
  const end = fields[index].type === 'section' ? blockEnd(fields, index) : index + 1;
  const { fields: copies } = cloneFields(fields.slice(index, end));
  if (copies[0] && copies[0].type !== 'content' && copies[0].label) copies[0] = { ...copies[0], label: `${copies[0].label} (copy)` };
  return { fields: insertAt(fields, end, copies), newId: copies[0]?.id ?? null };
}

/** Move one field to sit at `toIndex` in the list that remains once it is taken out. */
export function moveField(fields: FormField[], id: string, toIndex: number) {
  const from = fields.findIndex(f => f.id === id);
  if (from < 0) return fields;
  const rest = fields.filter(f => f.id !== id);
  return insertAt(rest, toIndex, [fields[from]]);
}

/** Replace the whole order with `ids` (every id exactly once). */
export function reorder(fields: FormField[], ids: string[]) {
  const byId = new Map(fields.map(f => [f.id, f]));
  const out = ids.map(id => byId.get(id)).filter((f): f is FormField => Boolean(f));
  return out.length === fields.length ? out : fields;
}

/** ⌥↑ / ⌥↓: a field moves one place (crossing into the neighbouring section); a section swaps with the neighbouring section. */
export function nudge(fields: FormField[], id: string, dir: -1 | 1): FormField[] {
  const i = fields.findIndex(f => f.id === id);
  if (i < 0) return fields;
  if (fields[i].type !== 'section') {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return fields;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  }
  const end = blockEnd(fields, i);
  const block = fields.slice(i, end);
  if (dir === -1) {
    let p = i - 1;
    while (p >= 0 && fields[p].type !== 'section') p--;
    if (p < 0) return fields;
    return [...fields.slice(0, p), ...block, ...fields.slice(p, i), ...fields.slice(end)];
  }
  if (end >= fields.length) return fields;
  const end2 = blockEnd(fields, end);
  return [...fields.slice(0, i), ...fields.slice(end, end2), ...block, ...fields.slice(end2)];
}

/** Types a question can switch to without losing what applicants wrote. */
export function compatibleTypes(type: FieldType): FieldType[] {
  const families: FieldType[][] = [
    ['short_text', 'long_text', 'email', 'phone', 'url'],
    ['single_choice', 'dropdown', 'multiple_choice'],
    ['number', 'currency'],
  ];
  return families.find(f => f.includes(type)) ?? [type];
}

export function changeType(f: FormField, type: FieldType): FormField {
  const next: FormField = { ...f, type };
  if (type === 'long_text' && next.maxWords == null) next.maxWords = 300;
  if ((f.type === 'multiple_choice') !== (type === 'multiple_choice')) {
    delete next.min;
    delete next.max;
  }
  return cleanField(next);
}

export const inputCount = (fields: FormField[]) => fields.filter(f => f.type !== 'section' && f.type !== 'content').length;
