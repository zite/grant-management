/**
 * Merge tags for email templates: `{{applicant_first_name}}` and friends.
 *
 * Unknown tags render as empty rather than leaking braces into an email, and
 * the preview in Settings uses the same function the send path does.
 */

export const MERGE_TAGS: Array<{ tag: string; label: string; sample: string }> = [
  { tag: 'applicant_name', label: 'Applicant name', sample: 'Jordan Rivera' },
  { tag: 'applicant_first_name', label: 'Applicant first name', sample: 'Jordan' },
  { tag: 'applicant_email', label: 'Applicant email', sample: 'jordan@example.org' },
  { tag: 'organization_name', label: 'Your organization', sample: 'Northwind Community Foundation' },
  { tag: 'program_name', label: 'Program name', sample: 'Community Arts Grants 2027' },
  { tag: 'program_deadline', label: 'Program deadline', sample: 'March 15, 2027 at 5:00 PM UTC' },
  { tag: 'submission_title', label: 'Submission title', sample: 'Murals for Maple Street' },
  { tag: 'reference', label: 'Reference number', sample: 'ARTS-42' },
  { tag: 'award_amount', label: 'Award amount', sample: '$5,000' },
  { tag: 'task_title', label: 'Task title', sample: 'Final report' },
  { tag: 'task_due_date', label: 'Task due date', sample: 'June 30, 2027' },
  { tag: 'application_link', label: 'Link to the application', sample: 'https://portal.example.org/#/applications/…' },
  { tag: 'portal_link', label: 'Link to the portal', sample: 'https://portal.example.org' },
];

export type MergeContext = Partial<Record<(typeof MERGE_TAGS)[number]['tag'], string>>;

export function renderMerge(template: string, ctx: MergeContext) {
  return (template ?? '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, tag: string) => {
    const v = (ctx as Record<string, string | undefined>)[tag.toLowerCase()];
    return v == null ? '' : String(v);
  });
}

export const sampleMergeContext = (): MergeContext => Object.fromEntries(MERGE_TAGS.map(t => [t.tag, t.sample]));

export const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] ?? '';

export function formatDeadline(iso: string | null | undefined, timeZone?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    // dateStyle/timeStyle can't be combined with timeZoneName, so spell the parts out.
    return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timeZone || 'UTC', timeZoneName: 'short' }).format(d).replace(/, (\d{1,2}:\d{2})/, ' at $1');
  } catch {
    return d.toUTCString();
  }
}

export function formatLongDay(day: string | null | undefined) {
  if (!day) return '';
  const d = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(d);
}
