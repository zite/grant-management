import { formatMoney } from '@project/shared/forms/logic';
import { firstName, formatDeadline, type MergeContext } from '@project/shared/merge';
import type { SubmissionTarget } from '../../lib/app-actions';
import type { Workspace } from '../../lib/workspace';

/** The same merge context the server builds, from what the client already has — for live previews. */
export function previewContext(ws: Workspace, target: SubmissionTarget | undefined, extra: { awardAmount?: number | null } = {}): MergeContext {
  const program = target ? ws.programById.get(target.programId) : undefined;
  const portal = ws.settings.portalUrl ?? '';
  return {
    applicant_name: target?.applicantName || 'Jordan Rivera',
    applicant_first_name: firstName(target?.applicantName) || 'Jordan',
    applicant_email: target?.applicantEmail || 'jordan@example.org',
    organization_name: ws.settings.organizationName,
    program_name: program?.name ?? 'Your program',
    program_deadline: formatDeadline(program?.deadline),
    submission_title: target?.title || 'Untitled application',
    reference: target?.reference ?? '',
    award_amount: formatMoney(extra.awardAmount ?? target?.awardAmount ?? target?.requestedAmount ?? 0, ws.settings.currency),
    application_link: portal && target ? `${portal}/#/applications/${target.id}` : '',
    portal_link: portal,
  };
}
