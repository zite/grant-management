/**
 * Setting up a program: its key, its slug and the pipeline it starts with.
 * Shared so the create dialog previews exactly what the server will create.
 */

export const PROGRAM_KEY_PATTERN = /^[A-Z0-9]{2,8}$/;

const STOP_WORDS = new Set(['the', 'of', 'and', 'for', 'a', 'an', 'in', 'on', 'to', 'at', 'by', 'with']);

/** "Community Arts Grants 2027" → "CAG". Letters and digits only, 2–8 characters. */
export function deriveProgramKey(name: string) {
  const words = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const meaningful = words.filter(w => !STOP_WORDS.has(w.toLowerCase()) && !/^\d+$/.test(w));
  let key = '';
  if (meaningful.length >= 2) key = meaningful.slice(0, 4).map(w => w[0]).join('');
  else if (meaningful.length === 1) key = meaningful[0].slice(0, 4);
  else key = words.join('').slice(0, 4);
  key = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (key.length < 2) key = (key + 'PRG').slice(0, 3);
  return key.slice(0, 8);
}

/** A key that isn't taken: "ARTS", then "ARTS2", "ARTS3"… staying within 8 characters. */
export function uniqueProgramKey(base: string, taken: Iterable<string>) {
  const used = new Set([...taken].map(k => k.toUpperCase()));
  const clean = (base.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'PRG').slice(0, 8);
  if (!used.has(clean) && clean.length >= 2) return clean;
  for (let n = 2; n < 1000; n++) {
    const suffix = String(n);
    const candidate = `${clean.slice(0, 8 - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `P${Date.now().toString(36).toUpperCase()}`.slice(0, 8);
}

export function programSlug(s: string) {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'program'
  );
}

export function uniqueSlug(base: string, taken: Iterable<string>) {
  const used = new Set(taken);
  const clean = programSlug(base);
  if (!used.has(clean)) return clean;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${clean.slice(0, 56)}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${clean.slice(0, 50)}-${Date.now().toString(36)}`;
}

/** The emoji a new program gets before anyone picks one. */
export const PROGRAM_TYPE_ICON: Record<string, string> = {
  Grant: '🌱',
  Scholarship: '🎓',
  Fellowship: '🧭',
  Award: '🏆',
  Residency: '🏛️',
  'Open call': '✍️',
  Other: '💡',
};

export const PROGRAM_TYPE_ABOUT: Record<string, string> = {
  Grant: 'Funding for projects and organizations',
  Scholarship: 'Awards for students and learners',
  Fellowship: 'Paid time for people to do their work',
  Award: 'Recognition, often with a prize',
  Residency: 'Time and space to create',
  'Open call': 'Submissions, proposals or entries',
  Other: 'Anything else you review and decide on',
};

export const STAGE_COLORS = ['#868e96', '#f59f00', '#7048e8', '#1c7ed6', '#0c8599', '#2f9e44', '#e8590c', '#d6336c', '#9c36b5'];

export const STAGE_KIND_DEFAULT_COLOR: Record<string, string> = { Intake: '#868e96', Review: '#7048e8', Decision: '#1c7ed6' };

/** Every new program's pipeline: somewhere to land, somewhere to be scored, somewhere to decide. */
export const DEFAULT_STAGES: Array<{ name: string; kind: 'Intake' | 'Review' | 'Decision'; color: string; description: string; usesRubric?: boolean }> = [
  { name: 'Received', kind: 'Intake', color: '#868e96', description: 'New submissions waiting for a first look.' },
  { name: 'Review', kind: 'Review', color: '#7048e8', description: 'Reviewers score each submission with the rubric.', usesRubric: true },
  { name: 'Decision', kind: 'Decision', color: '#1c7ed6', description: 'Final discussion and decisions.' },
];

export const DEFAULT_CONFIRMATION = 'Thank you for applying. We’ve emailed you a confirmation, and you can check on your application here at any time.';

/** Rubric scales people actually use. */
export const RUBRIC_SCALES: Array<{ key: string; min: number; max: number; label: string }> = [
  { key: '1-3', min: 1, max: 3, label: '1–3' },
  { key: '1-4', min: 1, max: 4, label: '1–4' },
  { key: '1-5', min: 1, max: 5, label: '1–5' },
  { key: '0-10', min: 0, max: 10, label: '0–10' },
];
