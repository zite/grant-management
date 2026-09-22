/** Brand colors that all keep white text readable (at least 4.5:1). */
export const BRAND_SWATCHES = ['#1e5c48', '#0f766e', '#0b7285', '#1864ab', '#0369a1', '#334155', '#4f46e5', '#6943d0', '#862e9c', '#c2255c', '#be123c', '#c2410c', '#a16207', '#15803d'];

export const CURRENCIES: Array<{ code: string; name: string }> = [
  { code: 'USD', name: 'US dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British pound' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'NZD', name: 'New Zealand dollar' },
  { code: 'CHF', name: 'Swiss franc' },
  { code: 'JPY', name: 'Japanese yen' },
  { code: 'INR', name: 'Indian rupee' },
  { code: 'ZAR', name: 'South African rand' },
  { code: 'MXN', name: 'Mexican peso' },
  { code: 'BRL', name: 'Brazilian real' },
];

export const HEX_RE = /^#[0-9a-f]{6}$/i;

function channel(v: number) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two hex colors. */
export function contrast(a: string, b = '#ffffff') {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const TRIGGERS = ['Submission received', 'Accepted', 'Waitlisted', 'Declined', 'Task requested', 'Draft reminder', 'Manual'] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const TRIGGER_INFO: Record<Trigger, { title: string; when: string; automatic: boolean }> = {
  'Submission received': { title: 'Submission received', when: 'Sent automatically when an applicant submits, as their confirmation and receipt.', automatic: true },
  Accepted: { title: 'Accepted', when: 'Sent when you release an acceptance decision to the applicant.', automatic: true },
  Waitlisted: { title: 'Waitlisted', when: 'Sent when you release a waitlist decision to the applicant.', automatic: true },
  Declined: { title: 'Declined', when: 'Sent when you release a decline decision to the applicant.', automatic: true },
  'Task requested': { title: 'Task requested', when: 'Sent when staff ask an applicant for more information, a report or a document.', automatic: true },
  'Draft reminder': { title: 'Draft reminder', when: 'Sent before a program’s deadline to applicants who started a draft but haven’t submitted.', automatic: true },
  Manual: { title: 'Manual', when: 'Never sent on its own — pick these when writing to applicants from the composer.', automatic: false },
};
