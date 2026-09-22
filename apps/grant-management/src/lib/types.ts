import type {
  BootstrapOutputType,
  GetSubmissionOutputType,
  ListMyReviewsOutputType,
  ListSubmissionsInputType,
  ListSubmissionsOutputType,
  GetReviewOutputType,
} from 'zitejs/api';

/**
 * Types derived from endpoint schemas, so the client can never drift from
 * what the server actually returns.
 */

export type Bootstrap = BootstrapOutputType;
export type Me = Bootstrap['me'];
export type OrgSettings = Bootstrap['settings'];
export type Member = Bootstrap['members'][number];
export type Program = Bootstrap['programs'][number];
export type Stage = Bootstrap['stages'][number];
export type Rubric = Bootstrap['rubrics'][number];
export type FormMeta = Bootstrap['forms'][number];
export type Label = Bootstrap['labels'][number];
export type EmailTemplate = Bootstrap['templates'][number];
export type SavedView = Bootstrap['views'][number];
export type ProgramMember = Bootstrap['programMembers'][number];

export type SubmissionList = ListSubmissionsOutputType;
export type Submission = SubmissionList['submissions'][number];
export type SubmissionFilters = NonNullable<ListSubmissionsInputType['filters']>;
export type Ordering = NonNullable<ListSubmissionsInputType['ordering']>;

export type SubmissionDetail = GetSubmissionOutputType;
export type Review = SubmissionDetail['reviews'][number];
export type Note = SubmissionDetail['notes'][number];
export type Message = SubmissionDetail['messages'][number];
export type Task = SubmissionDetail['tasks'][number];
export type Payment = SubmissionDetail['payments'][number];
export type Attachment = SubmissionDetail['attachments'][number];
export type ActivityEntry = SubmissionDetail['activity'][number];
export type Applicant = NonNullable<SubmissionDetail['applicant']>;

export type ReviewQueueItem = ListMyReviewsOutputType['reviews'][number];
export type ReviewDetail = GetReviewOutputType;

export type SubmissionPatch = {
  stageId?: string;
  ownerId?: string | null;
  title?: string;
  requestedAmount?: number | null;
  awardAmount?: number | null;
  awardStatus?: 'Pending' | 'Active' | 'Completed' | 'Cancelled' | null;
  awardStartDate?: string | null;
  awardEndDate?: string | null;
  decisionReason?: string | null;
  decisionNote?: string | null;
  status?: 'Submitted' | 'Withdrawn';
};
