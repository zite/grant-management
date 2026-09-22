/**
 * Lifecycle rules shared by staff, reviewers and applicants.
 *
 * A submission has a STATUS (where it is in its life: draft, in the pipeline,
 * decided, withdrawn) and, while in the pipeline, a STAGE (the program's own
 * steps). Decisions are recorded privately first and only become visible to
 * the applicant once they are released (`notifiedAt`).
 */

export type SubmissionStatus = 'Draft' | 'Submitted' | 'Accepted' | 'Declined' | 'Waitlisted' | 'Withdrawn';
export const SUBMISSION_STATUSES: SubmissionStatus[] = ['Draft', 'Submitted', 'Accepted', 'Declined', 'Waitlisted', 'Withdrawn'];
export const DECISIONS = ['Accepted', 'Waitlisted', 'Declined'] as const;
export type Decision = (typeof DECISIONS)[number];
export const isDecision = (s: string | null | undefined): s is Decision => s === 'Accepted' || s === 'Declined' || s === 'Waitlisted';

export type StageKind = 'Intake' | 'Review' | 'Decision';
export const STAGE_KINDS: StageKind[] = ['Intake', 'Review', 'Decision'];

export type ProgramType = 'Grant' | 'Scholarship' | 'Fellowship' | 'Award' | 'Residency' | 'Open call' | 'Other';
export const PROGRAM_TYPES: ProgramType[] = ['Grant', 'Scholarship', 'Fellowship', 'Award', 'Residency', 'Open call', 'Other'];

export type AwardStatus = 'Pending' | 'Active' | 'Completed' | 'Cancelled';
export const AWARD_STATUSES: AwardStatus[] = ['Pending', 'Active', 'Completed', 'Cancelled'];

export type PaymentStatus = 'Scheduled' | 'Paid' | 'On hold' | 'Cancelled';
export const PAYMENT_STATUSES: PaymentStatus[] = ['Scheduled', 'Paid', 'On hold', 'Cancelled'];
export const PAYMENT_METHODS = ['ACH', 'Check', 'Wire', 'Card', 'Other'] as const;

export type TaskStatus = 'Open' | 'Submitted' | 'Approved' | 'Returned';

export const DECLINE_REASONS = ['Not eligible', 'Incomplete application', 'Outside program focus', 'Scored below funded range', 'Budget exhausted', 'Duplicate submission', 'Other'];

export type ProgramPhase = 'draft' | 'scheduled' | 'open' | 'closing' | 'closed' | 'archived';

const DAY = 86_400_000;

/**
 * Where a program is in its cycle. Open/closed is derived from dates rather
 * than stored, so a deadline passing needs no job to "close" anything.
 */
export function programPhase(p: { status?: string | null; opensAt?: string | null; deadline?: string | null }, now = Date.now()): ProgramPhase {
  if (p.status === 'Archived') return 'archived';
  if (p.status !== 'Published') return 'draft';
  const opens = p.opensAt ? Date.parse(p.opensAt) : NaN;
  const deadline = p.deadline ? Date.parse(p.deadline) : NaN;
  if (Number.isFinite(opens) && opens > now) return 'scheduled';
  if (Number.isFinite(deadline) && deadline <= now) return 'closed';
  if (Number.isFinite(deadline) && deadline - now < 7 * DAY) return 'closing';
  return 'open';
}

export const PHASE_LABEL: Record<ProgramPhase, string> = {
  draft: 'Draft',
  scheduled: 'Opens soon',
  open: 'Open',
  closing: 'Closing soon',
  closed: 'Closed',
  archived: 'Archived',
};

/** Can an applicant start or submit right now? Late submissions are allowed only when the program says so. */
export function acceptingSubmissions(p: { status?: string | null; opensAt?: string | null; deadline?: string | null; allowLate?: boolean | null }, now = Date.now()) {
  const phase = programPhase(p, now);
  if (phase === 'open' || phase === 'closing') return true;
  return phase === 'closed' && Boolean(p.allowLate);
}

export function isLate(p: { deadline?: string | null }, at: string | number = Date.now()) {
  const deadline = p.deadline ? Date.parse(p.deadline) : NaN;
  const t = typeof at === 'number' ? at : Date.parse(at);
  return Number.isFinite(deadline) && t > deadline;
}

export function reference(programKey: string | null | undefined, number: number | null | undefined) {
  if (!number) return programKey ? `${programKey}-draft` : 'Draft';
  return `${programKey || 'APP'}-${number}`;
}

export type Tone = 'neutral' | 'info' | 'accent' | 'success' | 'warning' | 'danger';

export const STATUS_TONE: Record<SubmissionStatus, Tone> = {
  Draft: 'neutral',
  Submitted: 'info',
  Accepted: 'success',
  Declined: 'danger',
  Waitlisted: 'warning',
  Withdrawn: 'neutral',
};

export type ApplicantFacingStatus = { key: string; label: string; tone: Tone; description: string };

/** What an applicant sees. Internal stage names and unreleased decisions never leak. */
export function applicantStatus(s: { status?: string | null; notifiedAt?: string | null; stageKind?: string | null }): ApplicantFacingStatus {
  const released = Boolean(s.notifiedAt);
  switch (s.status) {
    case 'Draft':
      return { key: 'draft', label: 'Draft', tone: 'neutral', description: "You haven't submitted this application yet." };
    case 'Withdrawn':
      return { key: 'withdrawn', label: 'Withdrawn', tone: 'neutral', description: 'You withdrew this application.' };
    case 'Accepted':
      if (released) return { key: 'accepted', label: 'Accepted', tone: 'success', description: 'Congratulations — your application was selected.' };
      break;
    case 'Declined':
      if (released) return { key: 'declined', label: 'Not selected', tone: 'neutral', description: 'Your application was not selected this time.' };
      break;
    case 'Waitlisted':
      if (released) return { key: 'waitlisted', label: 'Waitlisted', tone: 'warning', description: "You're on the waitlist. We'll be in touch if a place opens up." };
      break;
  }
  if (s.stageKind === 'Review' || s.stageKind === 'Decision' || isDecision(s.status)) {
    return { key: 'review', label: 'Under review', tone: 'info', description: 'Your application is being reviewed.' };
  }
  return { key: 'received', label: 'Received', tone: 'info', description: 'We received your application.' };
}
