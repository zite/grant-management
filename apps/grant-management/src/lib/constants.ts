import type { Ordering } from './types';

export const STATUS_META: Record<string, { label: string; color: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  Draft: { label: 'Draft', color: '#8b8d98', tone: 'neutral' },
  Submitted: { label: 'In review', color: '#6943d0', tone: 'info' },
  Accepted: { label: 'Accepted', color: '#16a34a', tone: 'success' },
  Waitlisted: { label: 'Waitlisted', color: '#d97706', tone: 'warning' },
  Declined: { label: 'Declined', color: '#dc2626', tone: 'danger' },
  Withdrawn: { label: 'Withdrawn', color: '#8b8d98', tone: 'neutral' },
};

export const DECISION_STATUSES = ['Accepted', 'Waitlisted', 'Declined'] as const;
export const PIPELINE_STATUSES = ['Submitted', 'Accepted', 'Waitlisted', 'Declined', 'Withdrawn'] as const;

export const STAGE_KIND_META: Record<string, { label: string; description: string }> = {
  Intake: { label: 'Intake', description: 'New submissions being screened' },
  Review: { label: 'Review', description: 'Reviewers score with a rubric' },
  Decision: { label: 'Decision', description: 'Final discussion and decisions' },
};

export type Grouping = 'stage' | 'status' | 'program' | 'owner' | 'label' | 'review' | 'none';

export const GROUPINGS: ReadonlyArray<{ value: Grouping; label: string }> = [
  { value: 'stage', label: 'Pipeline' },
  { value: 'status', label: 'Status' },
  { value: 'program', label: 'Program' },
  { value: 'owner', label: 'Owner' },
  { value: 'review', label: 'Review progress' },
  { value: 'label', label: 'Label' },
  { value: 'none', label: 'No grouping' },
];

export const ORDERINGS: ReadonlyArray<{ value: Ordering; label: string }> = [
  { value: 'submitted_desc', label: 'Newest first' },
  { value: 'submitted_asc', label: 'Oldest first' },
  { value: 'score_desc', label: 'Highest score' },
  { value: 'score_asc', label: 'Lowest score' },
  { value: 'amount_desc', label: 'Largest request' },
  { value: 'amount_asc', label: 'Smallest request' },
  { value: 'updated_desc', label: 'Recent activity' },
  { value: 'reference_asc', label: 'Reference' },
  { value: 'title_asc', label: 'Title' },
  { value: 'applicant_asc', label: 'Applicant' },
];

export type DisplayProperty = 'reference' | 'applicant' | 'program' | 'stage' | 'score' | 'reviews' | 'amount' | 'award' | 'labels' | 'owner' | 'submitted' | 'activity' | 'signals';

export const DISPLAY_PROPERTIES: ReadonlyArray<{ key: DisplayProperty; label: string }> = [
  { key: 'reference', label: 'Reference' },
  { key: 'applicant', label: 'Applicant' },
  { key: 'program', label: 'Program' },
  { key: 'stage', label: 'Stage' },
  { key: 'score', label: 'Score' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'amount', label: 'Requested' },
  { key: 'award', label: 'Award' },
  { key: 'labels', label: 'Labels' },
  { key: 'owner', label: 'Owner' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'activity', label: 'Last activity' },
  { key: 'signals', label: 'Messages & tasks' },
];

export const LABEL_COLORS = ['#8b5cf6', '#6366f1', '#0ea5e9', '#14b8a6', '#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#64748b'];
export const PROGRAM_COLORS = ['#6943d0', '#1c7ed6', '#0c8599', '#2f9e44', '#e8590c', '#d6336c', '#9c36b5', '#f08c00', '#495057'];
export const PROGRAM_ICONS = ['🎨', '🎓', '🏘️', '🌊', '🔬', '🌱', '📚', '🎭', '🎵', '🏥', '🤝', '🌍', '💡', '🏆', '✍️', '🧭', '🏛️', '🍎', '⚡', '🧪'];
