import { newId } from './logic';
import type { ChoiceOption, FieldType, FormField } from './types';

/** What the builder shows for each field type. `icon` names a lucide-react icon, resolved in the UI. */
export const FIELD_CATALOG: Record<FieldType, { label: string; description: string; icon: string; group: 'Layout' | 'Text' | 'Choice' | 'Numbers & dates' | 'Files & contact' }> = {
  section: { label: 'Section', description: 'Starts a new step with a heading', icon: 'SeparatorHorizontal', group: 'Layout' },
  content: { label: 'Text block', description: 'Instructions or context, no answer', icon: 'AlignLeft', group: 'Layout' },
  short_text: { label: 'Short answer', description: 'A single line of text', icon: 'Type', group: 'Text' },
  long_text: { label: 'Long answer', description: 'Paragraphs, with word limits', icon: 'Pilcrow', group: 'Text' },
  email: { label: 'Email', description: 'A validated email address', icon: 'AtSign', group: 'Files & contact' },
  phone: { label: 'Phone', description: 'A phone number', icon: 'Phone', group: 'Files & contact' },
  url: { label: 'Website', description: 'A link to a site or document', icon: 'Link', group: 'Files & contact' },
  number: { label: 'Number', description: 'A whole or decimal number', icon: 'Hash', group: 'Numbers & dates' },
  currency: { label: 'Amount', description: 'A money amount', icon: 'CircleDollarSign', group: 'Numbers & dates' },
  date: { label: 'Date', description: 'A calendar date', icon: 'CalendarDays', group: 'Numbers & dates' },
  single_choice: { label: 'Single choice', description: 'Pick one from a list', icon: 'CircleDot', group: 'Choice' },
  multiple_choice: { label: 'Checkboxes', description: 'Pick any from a list', icon: 'ListChecks', group: 'Choice' },
  dropdown: { label: 'Dropdown', description: 'Pick one from a long list', icon: 'ChevronDownSquare', group: 'Choice' },
  yes_no: { label: 'Yes / No', description: 'A simple yes or no', icon: 'ToggleRight', group: 'Choice' },
  file: { label: 'File upload', description: 'Documents, images or media', icon: 'Paperclip', group: 'Files & contact' },
  address: { label: 'Address', description: 'Street, city, region and country', icon: 'MapPin', group: 'Files & contact' },
};

export const opts = (...labels: string[]): ChoiceOption[] => labels.map(label => ({ id: newId('o'), label }));

export function newField(type: FieldType, patch: Partial<FormField> = {}): FormField {
  const base: FormField = { id: newId('f'), type, label: '', required: false };
  switch (type) {
    case 'section':
      return { ...base, label: 'New section', ...patch };
    case 'content':
      return { ...base, label: '', help: 'Add instructions or context for applicants.', ...patch };
    case 'single_choice':
    case 'dropdown':
    case 'multiple_choice':
      return { ...base, label: 'Untitled question', options: opts('Option 1', 'Option 2'), ...patch };
    case 'long_text':
      return { ...base, label: 'Untitled question', maxWords: 300, ...patch };
    case 'file':
      return { ...base, label: 'Upload a file', accept: ['pdf', 'document'], maxFiles: 1, maxSizeMb: 20, ...patch };
    default:
      return { ...base, label: 'Untitled question', ...patch };
  }
}

/** A copy with fresh ids, remapping conditions that point inside the copied set. */
export function cloneFields(fields: FormField[]): { fields: FormField[]; idMap: Map<string, string> } {
  const idMap = new Map<string, string>();
  for (const f of fields) idMap.set(f.id, newId('f'));
  const out = fields.map(f => {
    const optionMap = new Map<string, string>();
    const options = f.options?.map(o => {
      const id = newId('o');
      optionMap.set(o.id, id);
      return { ...o, id };
    });
    return {
      ...f,
      id: idMap.get(f.id)!,
      options,
      showIf: f.showIf ? { ...f.showIf, fieldId: idMap.get(f.showIf.fieldId) ?? f.showIf.fieldId } : f.showIf,
      eligibility: f.eligibility ? { ...f.eligibility, disqualifyValues: f.eligibility.disqualifyValues.map(v => optionMap.get(v) ?? v) } : f.eligibility,
      _optionMap: optionMap,
    };
  });
  // Conditions compare against option ids of the source field, which also changed.
  const byNewId = new Map(out.map(f => [f.id, f]));
  const result = out.map(f => {
    const { _optionMap, ...rest } = f as FormField & { _optionMap: Map<string, string> };
    if (rest.showIf?.value != null) {
      const source = byNewId.get(rest.showIf.fieldId) as (FormField & { _optionMap?: Map<string, string> }) | undefined;
      const mapped = source?._optionMap?.get(String(rest.showIf.value));
      if (mapped) rest.showIf = { ...rest.showIf, value: mapped };
    }
    return rest as FormField;
  });
  return { fields: result, idMap };
}

/** A sensible first application form for a new program, so nobody starts from a blank page. */
export function starterApplicationForm(programType: string): { fields: FormField[]; titleFieldId: string; amountFieldId: string | null } {
  const contactName = newField('short_text', { label: 'Full name', required: true, hideFromReviewers: true, width: 'half' });
  const contactEmail = newField('email', { label: 'Email', required: true, hideFromReviewers: true, width: 'half' });
  const phone = newField('phone', { label: 'Phone', hideFromReviewers: true, width: 'half' });
  const location = newField('short_text', { label: 'City and region', width: 'half' });

  if (programType === 'Scholarship') {
    const title = newField('short_text', { label: 'Intended field of study', required: true });
    const fields: FormField[] = [
      newField('section', { label: 'About you', help: 'We use these details to contact you about your application.' }),
      contactName,
      contactEmail,
      phone,
      location,
      newField('dropdown', { label: 'Current education level', required: true, options: opts('High school senior', 'Undergraduate', 'Graduate', 'Returning adult learner') }),
      newField('yes_no', { label: 'Are you enrolled or accepted at an accredited institution for the coming year?', required: true }),
      newField('section', { label: 'Your goals' }),
      title,
      newField('long_text', { label: 'Tell us about your educational and career goals.', required: true, maxWords: 500 }),
      newField('long_text', { label: 'Describe a challenge you have overcome and what you learned.', required: true, maxWords: 400 }),
      newField('section', { label: 'Documents' }),
      newField('file', { label: 'Transcript', required: true, accept: ['pdf'], maxFiles: 1, maxSizeMb: 20 }),
      newField('file', { label: 'Letter of recommendation', accept: ['pdf', 'document'], maxFiles: 2, maxSizeMb: 20 }),
    ];
    return { fields, titleFieldId: title.id, amountFieldId: null };
  }

  if (programType === 'Fellowship' || programType === 'Residency' || programType === 'Award' || programType === 'Open call') {
    const title = newField('short_text', { label: 'Project or proposal title', required: true });
    const fields: FormField[] = [
      newField('section', { label: 'About you' }),
      contactName,
      contactEmail,
      location,
      newField('url', { label: 'Website or portfolio', width: 'half' }),
      newField('long_text', { label: 'Short bio', required: true, maxWords: 200 }),
      newField('section', { label: 'Your proposal' }),
      title,
      newField('long_text', { label: 'Describe what you would work on.', required: true, maxWords: 600 }),
      newField('long_text', { label: 'Why is now the right time for this work?', maxWords: 300 }),
      newField('file', { label: 'Work samples', help: 'Up to five files.', accept: ['pdf', 'image', 'video', 'audio'], maxFiles: 5, maxSizeMb: 20 }),
    ];
    return { fields, titleFieldId: title.id, amountFieldId: null };
  }

  // Grants and everything else.
  const title = newField('short_text', { label: 'Project title', required: true });
  const amount = newField('currency', { label: 'Amount requested', required: true, min: 0, width: 'half' });
  const org = newField('short_text', { label: 'Organization name', required: true, width: 'half' });
  const fields: FormField[] = [
    newField('section', { label: 'Eligibility', help: 'A few quick questions to confirm this program is a fit.' }),
    (() => {
      const f = newField('single_choice', { label: 'What kind of organization are you applying as?', required: true, options: opts('Registered nonprofit', 'Community group', 'Individual', 'For-profit business') });
      f.eligibility = { disqualifyValues: [f.options![3].id], message: 'This program funds nonprofits, community groups and individuals only.' };
      return f;
    })(),
    newField('section', { label: 'Organization' }),
    org,
    newField('url', { label: 'Website', width: 'half' }),
    contactName,
    contactEmail,
    newField('number', { label: 'Annual operating budget', min: 0, width: 'half' }),
    location,
    newField('long_text', { label: 'Mission statement', required: true, maxWords: 150 }),
    newField('section', { label: 'Project' }),
    title,
    amount,
    newField('date', { label: 'Project start date', width: 'half' }),
    newField('long_text', { label: 'Describe the project and who it serves.', required: true, maxWords: 500 }),
    newField('long_text', { label: 'How will you measure success?', required: true, maxWords: 300 }),
    newField('section', { label: 'Budget' }),
    newField('file', { label: 'Project budget', required: true, accept: ['pdf', 'spreadsheet'], maxFiles: 1, maxSizeMb: 20 }),
    newField('long_text', { label: 'Budget narrative', maxWords: 250 }),
  ];
  return { fields, titleFieldId: title.id, amountFieldId: amount.id };
}
