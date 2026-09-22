/**
 * The form model shared by the builder, the applicant portal, reviewers and
 * every endpoint that reads or writes answers.
 *
 * A form is an ordered list of fields stored as JSON on the `Forms` row.
 * `section` fields split it into steps; `content` fields are static copy.
 * Field ids are stable for the life of the form — answers are keyed by them,
 * so relabelling a question never orphans what applicants already wrote.
 */

export const FIELD_TYPES = [
  'section',
  'content',
  'short_text',
  'long_text',
  'email',
  'phone',
  'url',
  'number',
  'currency',
  'date',
  'single_choice',
  'multiple_choice',
  'dropdown',
  'yes_no',
  'file',
  'address',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export type ChoiceOption = { id: string; label: string };

export type ConditionOperator = 'equals' | 'not_equals' | 'includes' | 'is_set' | 'is_empty' | 'gt' | 'lt';

/** Show this field only when another field's answer matches. */
export type Condition = {
  fieldId: string;
  operator: ConditionOperator;
  /** An option id for choice fields, 'yes'/'no' for yes/no, a number or text otherwise. */
  value?: string | number | null;
};

/** Answers that make an applicant ineligible, checked before and during the application. */
export type EligibilityRule = {
  disqualifyValues: string[];
  message?: string;
};

export type FormField = {
  id: string;
  type: FieldType;
  label: string;
  help?: string;
  placeholder?: string;
  required?: boolean;
  /** Choice fields. */
  options?: ChoiceOption[];
  /** Adds an "Other" option with a free-text box. */
  allowOther?: boolean;
  /** Number/currency bounds, or min/max selections for multiple choice. */
  min?: number | null;
  max?: number | null;
  /** Character limit for text fields. */
  maxLength?: number | null;
  /** Word limit for long text. */
  maxWords?: number | null;
  /** File fields: allowed kinds (see FILE_KINDS). Empty means any. */
  accept?: string[];
  maxFiles?: number | null;
  maxSizeMb?: number | null;
  showIf?: Condition | null;
  eligibility?: EligibilityRule | null;
  /** Personal details reviewers never see (names, contact details, demographics). */
  hideFromReviewers?: boolean;
  width?: 'full' | 'half';
};

export type FileValue = { url: string; name: string; size: number; type: string };

export type AddressValue = {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
};

export type AnswerValue = string | number | boolean | string[] | FileValue[] | AddressValue | null;

/** Keyed by field id. A chosen "Other" stores `OTHER` and its text under `${id}__other`. */
export type Answers = Record<string, AnswerValue>;

export const OTHER = '__other__';
export const otherKey = (fieldId: string) => `${fieldId}__other`;

export const INPUT_TYPES: FieldType[] = FIELD_TYPES.filter(t => t !== 'section' && t !== 'content');

export const isInputField = (f: Pick<FormField, 'type'>) => f.type !== 'section' && f.type !== 'content';
export const isChoiceField = (f: Pick<FormField, 'type'>) =>
  f.type === 'single_choice' || f.type === 'multiple_choice' || f.type === 'dropdown';

/** File kinds a builder can allow, with the extensions and MIME prefixes each admits. */
export const FILE_KINDS: Record<string, { label: string; extensions: string[]; mime: string[] }> = {
  pdf: { label: 'PDF', extensions: ['pdf'], mime: ['application/pdf'] },
  document: {
    label: 'Documents',
    extensions: ['doc', 'docx', 'odt', 'rtf', 'txt', 'pages'],
    mime: ['application/msword', 'application/vnd.openxmlformats-officedocument', 'application/vnd.oasis.opendocument', 'text/plain', 'application/rtf'],
  },
  spreadsheet: {
    label: 'Spreadsheets',
    extensions: ['xls', 'xlsx', 'csv', 'ods', 'numbers'],
    mime: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml', 'text/csv', 'application/vnd.oasis.opendocument.spreadsheet'],
  },
  image: { label: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'svg'], mime: ['image/'] },
  audio: { label: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg'], mime: ['audio/'] },
  video: { label: 'Video', extensions: ['mp4', 'mov', 'webm', 'm4v'], mime: ['video/'] },
};

export type FormDefinition = {
  fields: FormField[];
  titleFieldId?: string | null;
  amountFieldId?: string | null;
};
