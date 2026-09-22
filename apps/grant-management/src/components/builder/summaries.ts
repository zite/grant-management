import { answerChoices, operatorLabel, operatorNeedsValue } from '@project/shared/forms/builder';
import { FIELD_CATALOG } from '@project/shared/forms/catalog';
import { formatMoney } from '@project/shared/forms/logic';
import { isChoiceField, type FormField } from '@project/shared/forms/types';

const quote = (s: string, n = 42) => {
  const t = s.replace(/\s+/g, ' ').trim() || 'Untitled question';
  return `“${t.length > n ? `${t.slice(0, n - 1)}…` : t}”`;
};

/** "Shows when “Which best describes you?” is not Individual artist". */
export function conditionSummary(fields: FormField[], field: FormField, currency = 'USD'): string | null {
  const c = field.showIf;
  if (!c?.fieldId) return null;
  const source = fields.find(f => f.id === c.fieldId);
  if (!source) return 'Shows when a deleted question is answered';
  let value = '';
  if (operatorNeedsValue(c.operator)) {
    if (source.type === 'yes_no') value = c.value === 'yes' ? 'Yes' : c.value === 'no' ? 'No' : '…';
    else if (isChoiceField(source)) value = source.options?.find(o => o.id === String(c.value))?.label ?? 'a removed option';
    else if (source.type === 'currency' && c.value !== '' && c.value != null) value = formatMoney(Number(c.value), currency);
    else value = c.value == null || c.value === '' ? '…' : String(c.value);
  }
  return `Shows when ${quote(source.label)} ${operatorLabel(c.operator, source.type)}${value ? ` ${value}` : ''}`;
}

export function eligibilitySummary(field: FormField): string | null {
  const values = field.eligibility?.disqualifyValues ?? [];
  if (!values.length) return null;
  const labels = answerChoices(field).filter(a => values.includes(a.id)).map(a => a.label || 'Untitled option');
  return labels.length ? `Not eligible if the answer is ${labels.join(' or ')}` : null;
}

export const typeLabel = (f: Pick<FormField, 'type'>) => FIELD_CATALOG[f.type]?.label ?? f.type;
