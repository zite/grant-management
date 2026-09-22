import type { FormField } from '@project/shared/forms/types';
import type { RubricCriterion } from '@project/shared/scoring';

/**
 * The demo organization's forms and rubrics. Field and option ids are
 * readable on purpose: the seeded answers in content.ts refer to them.
 */

const o = (id: string, label: string) => ({ id, label });
const PDF = 'pdf';

export const ARTS_FORM: FormField[] = [
  { id: 's_elig', type: 'section', label: 'Eligibility', help: 'Two quick questions to make sure this program is the right fit.' },
  {
    id: 'f_applicant_type', type: 'single_choice', label: 'Which best describes you?', required: true,
    options: [o('o_individual', 'Individual artist'), o('o_nonprofit', 'Nonprofit arts organization'), o('o_collective', 'Artist collective or community group'), o('o_business', 'For-profit business')],
    eligibility: { disqualifyValues: ['o_business'], message: 'Community Arts Grants fund individual artists, nonprofits and community groups. Businesses can apply to our Creative Economy loans instead.' },
  },
  {
    id: 'f_in_area', type: 'yes_no', label: 'Will the project take place in the Riverbend service area?', required: true,
    help: 'Riverbend, Alder County and Marsh County.',
    eligibility: { disqualifyValues: ['no'], message: 'This program funds projects in Riverbend, Alder County and Marsh County only.' },
  },
  { id: 's_about', type: 'section', label: 'About you', help: 'Reviewers never see your name or contact details.' },
  { id: 'f_name', type: 'short_text', label: 'Full name', required: true, hideFromReviewers: true, width: 'half' },
  { id: 'f_email', type: 'email', label: 'Email', required: true, hideFromReviewers: true, width: 'half' },
  { id: 'f_phone', type: 'phone', label: 'Phone', hideFromReviewers: true, width: 'half' },
  { id: 'f_website', type: 'url', label: 'Website or portfolio', width: 'half' },
  {
    id: 'f_org', type: 'short_text', label: 'Organization or collective name', required: true,
    showIf: { fieldId: 'f_applicant_type', operator: 'not_equals', value: 'o_individual' },
  },
  { id: 'f_bio', type: 'long_text', label: 'Artist or organization bio', required: true, maxWords: 200 },
  { id: 's_project', type: 'section', label: 'Your project' },
  { id: 'f_title', type: 'short_text', label: 'Project title', required: true, maxLength: 120 },
  {
    id: 'f_discipline', type: 'dropdown', label: 'Discipline', required: true, width: 'half',
    options: [o('d_visual', 'Visual arts'), o('d_music', 'Music'), o('d_theater', 'Theater'), o('d_dance', 'Dance'), o('d_literary', 'Literary arts'), o('d_film', 'Film and media'), o('d_folk', 'Folk and traditional arts'), o('d_multi', 'Multidisciplinary')],
  },
  { id: 'f_amount', type: 'currency', label: 'Amount requested', required: true, min: 500, max: 10000, width: 'half', help: 'Between $500 and $10,000.' },
  { id: 'f_start', type: 'date', label: 'Project start date', width: 'half' },
  { id: 'f_end', type: 'date', label: 'Project end date', width: 'half' },
  { id: 'f_description', type: 'long_text', label: 'Describe your project.', required: true, maxWords: 500, help: 'What will you make or present, and why does it matter now?' },
  { id: 'f_community', type: 'long_text', label: 'Who will experience this work, and how will you reach them?', required: true, maxWords: 300 },
  {
    id: 'f_venues', type: 'multiple_choice', label: 'Where will the public encounter the work?', required: true, allowOther: true,
    options: [o('v_outdoor', 'Outdoors or public space'), o('v_library', 'Library or school'), o('v_gallery', 'Gallery or theater'), o('v_online', 'Online'), o('v_center', 'Community center')],
  },
  { id: 's_budget', type: 'section', label: 'Budget and samples' },
  { id: 'f_budget', type: 'file', label: 'Project budget', required: true, accept: [PDF, 'spreadsheet'], maxFiles: 1, maxSizeMb: 20, help: 'Use our budget template or your own.' },
  { id: 'f_budget_note', type: 'long_text', label: 'Budget narrative', maxWords: 250 },
  { id: 'f_samples', type: 'file', label: 'Work samples', accept: [PDF, 'image', 'video', 'audio'], maxFiles: 5, maxSizeMb: 20, help: 'Up to five images, recordings or documents.' },
];

export const SCHOLARSHIP_FORM: FormField[] = [
  { id: 's_elig', type: 'section', label: 'Eligibility' },
  { id: 'f_enrolled', type: 'yes_no', label: 'Will you be enrolled full-time at an accredited college or university next fall?', required: true, eligibility: { disqualifyValues: ['no'], message: 'The scholarship supports full-time students in the coming academic year.' } },
  { id: 'f_resident', type: 'yes_no', label: 'Have you lived in the Riverbend region for at least two years?', required: true, eligibility: { disqualifyValues: ['no'], message: 'Applicants must have lived in the Riverbend region for at least two years.' } },
  { id: 's_about', type: 'section', label: 'About you', help: 'The selection committee reviews applications without names or contact details.' },
  { id: 'f_name', type: 'short_text', label: 'Full name', required: true, hideFromReviewers: true, width: 'half' },
  { id: 'f_email', type: 'email', label: 'Email', required: true, hideFromReviewers: true, width: 'half' },
  { id: 'f_phone', type: 'phone', label: 'Phone', hideFromReviewers: true, width: 'half' },
  { id: 'f_school', type: 'short_text', label: 'College or university', required: true, width: 'half' },
  { id: 'f_level', type: 'dropdown', label: 'Year in school next fall', required: true, width: 'half', options: [o('l_first', 'First year'), o('l_second', 'Second year'), o('l_third', 'Third year'), o('l_fourth', 'Fourth year'), o('l_grad', 'Graduate student')] },
  { id: 'f_gpa', type: 'number', label: 'Cumulative GPA', min: 0, max: 4, width: 'half' },
  { id: 'f_field', type: 'short_text', label: 'Intended field of study', required: true },
  { id: 'f_first_gen', type: 'yes_no', label: 'Will you be the first in your family to earn a four-year degree?', hideFromReviewers: true },
  { id: 's_essays', type: 'section', label: 'Essays' },
  { id: 'f_goals', type: 'long_text', label: 'What do you hope to study, and what will you do with it?', required: true, maxWords: 500 },
  { id: 'f_leadership', type: 'long_text', label: 'Tell us about a time you led or served your community.', required: true, maxWords: 400 },
  { id: 'f_need', type: 'long_text', label: 'Is there anything about your circumstances you would like the committee to know?', maxWords: 250 },
  { id: 's_docs', type: 'section', label: 'Documents' },
  { id: 'f_transcript', type: 'file', label: 'Unofficial transcript', required: true, accept: [PDF], maxFiles: 1, maxSizeMb: 20 },
  { id: 'f_letter', type: 'file', label: 'Letter of recommendation', accept: [PDF, 'document'], maxFiles: 2, maxSizeMb: 20, help: 'Optional. A teacher, coach, employer or mentor.' },
];

export const NRF_FORM: FormField[] = [
  { id: 's_elig', type: 'section', label: 'Eligibility' },
  {
    id: 'f_group_type', type: 'single_choice', label: 'Who is applying?', required: true,
    options: [o('g_association', 'Neighborhood association'), o('g_resident', 'Block club or resident group'), o('g_nonprofit', 'Nonprofit organization'), o('g_school', 'School or PTA'), o('g_individual', 'An individual')],
    eligibility: { disqualifyValues: ['g_individual'], message: 'The fund supports groups of neighbors. Individuals are welcome to partner with a block club or association and apply together.' },
  },
  { id: 's_contact', type: 'section', label: 'Contact' },
  { id: 'f_org', type: 'short_text', label: 'Group name', required: true },
  { id: 'f_name', type: 'short_text', label: 'Contact name', required: true, width: 'half' },
  { id: 'f_email', type: 'email', label: 'Email', required: true, width: 'half' },
  { id: 'f_phone', type: 'phone', label: 'Phone', width: 'half' },
  {
    id: 'f_neighborhood', type: 'dropdown', label: 'Neighborhood', required: true, width: 'half',
    options: [o('n_eastside', 'Eastside'), o('n_mill', 'Mill District'), o('n_northgate', 'Northgate'), o('n_oldtown', 'Old Town'), o('n_riverside', 'Riverside'), o('n_southhills', 'South Hills'), o('n_westend', 'West End')],
  },
  { id: 's_project', type: 'section', label: 'Project' },
  { id: 'f_title', type: 'short_text', label: 'Project name', required: true },
  { id: 'f_amount', type: 'currency', label: 'Amount requested', required: true, min: 250, max: 2500, width: 'half' },
  { id: 'f_when', type: 'date', label: 'When will it happen?', width: 'half' },
  { id: 'f_description', type: 'long_text', label: 'What will you do, and how will it make your neighborhood more resilient?', required: true, maxWords: 300 },
  { id: 'f_volunteers', type: 'number', label: 'How many volunteers will take part?', min: 0, width: 'half' },
  { id: 'f_budget', type: 'file', label: 'Simple budget', accept: [PDF, 'spreadsheet', 'image'], maxFiles: 1, maxSizeMb: 20, help: 'A photo of a handwritten list is fine.' },
];

export const RESIDENCY_FORM: FormField[] = [
  { id: 's_about', type: 'section', label: 'About you' },
  { id: 'f_name', type: 'short_text', label: 'Full name', required: true, hideFromReviewers: true, width: 'half' },
  { id: 'f_email', type: 'email', label: 'Email', required: true, hideFromReviewers: true, width: 'half' },
  { id: 'f_website', type: 'url', label: 'Website or portfolio', width: 'half' },
  { id: 'f_discipline', type: 'dropdown', label: 'Discipline', required: true, width: 'half', options: [o('d_visual', 'Visual arts'), o('d_writing', 'Writing'), o('d_music', 'Music and sound'), o('d_performance', 'Performance'), o('d_media', 'Film and media')] },
  { id: 'f_bio', type: 'long_text', label: 'Short bio', required: true, maxWords: 200 },
  { id: 's_proposal', type: 'section', label: 'Proposal' },
  { id: 'f_title', type: 'short_text', label: 'Proposal title', required: true },
  { id: 'f_proposal', type: 'long_text', label: 'What would you work on during the residency?', required: true, maxWords: 600 },
  { id: 'f_why', type: 'long_text', label: 'Why the river valley, and why now?', maxWords: 300 },
  { id: 'f_session', type: 'single_choice', label: 'Preferred session', required: true, options: [o('p_spring', 'Spring (April–May)'), o('p_summer', 'Summer (June–July)'), o('p_fall', 'Fall (September–October)')] },
  { id: 'f_samples', type: 'file', label: 'Work samples', required: true, accept: [PDF, 'image', 'video', 'audio'], maxFiles: 5, maxSizeMb: 20 },
];

export const AGREEMENT_FORM: FormField[] = [
  { id: 'c_intro', type: 'content', label: '', help: 'Congratulations on your award. Please review the grant terms, confirm your payment details and upload a W-9 so we can release funds.' },
  { id: 'f_signer', type: 'short_text', label: 'Name of the person signing for your group', required: true, width: 'half' },
  { id: 'f_signer_title', type: 'short_text', label: 'Title or role', width: 'half' },
  { id: 'f_agree', type: 'yes_no', label: 'I have read and agree to the grant terms.', required: true },
  { id: 'f_payee', type: 'short_text', label: 'Payee name (as it should appear on the payment)', required: true },
  { id: 'f_payment_method', type: 'single_choice', label: 'Payment method', required: true, options: [o('m_ach', 'Direct deposit (ACH)'), o('m_check', 'Paper check')] },
  { id: 'f_w9', type: 'file', label: 'W-9', required: true, accept: [PDF], maxFiles: 1, maxSizeMb: 10 },
];

export const REPORT_FORM: FormField[] = [
  { id: 'c_intro', type: 'content', label: '', help: 'Tell us how the project went. Short answers are fine — we want to learn, not to grade.' },
  { id: 'f_outcomes', type: 'long_text', label: 'What happened, and what changed because of it?', required: true, maxWords: 400 },
  { id: 'f_people', type: 'number', label: 'About how many people took part or benefited?', min: 0, width: 'half' },
  { id: 'f_spent', type: 'currency', label: 'Total grant funds spent', min: 0, width: 'half' },
  { id: 'f_lessons', type: 'long_text', label: 'What would you do differently next time?', maxWords: 250 },
  { id: 'f_photos', type: 'file', label: 'Photos', accept: ['image'], maxFiles: 5, maxSizeMb: 20 },
];

export const REFLECTION_FORM: FormField[] = [
  { id: 'f_reflection', type: 'long_text', label: 'Reflect on your residency. What did you make, and where is the work going next?', required: true, maxWords: 500 },
  { id: 'f_public', type: 'yes_no', label: 'May we share excerpts and images in our annual report?', required: true },
  { id: 'f_images', type: 'file', label: 'Documentation', accept: ['image', PDF, 'video'], maxFiles: 5, maxSizeMb: 20 },
];

const L5 = (a: string, b: string, c: string, d: string, e: string) => [
  { score: 1, label: a },
  { score: 2, label: b },
  { score: 3, label: c },
  { score: 4, label: d },
  { score: 5, label: e },
];

export const ARTS_RUBRIC: RubricCriterion[] = [
  { id: 'c_merit', name: 'Artistic merit', description: 'Originality, craft and a clear artistic vision.', weight: 2, min: 1, max: 5, levels: L5('Unclear', 'Developing', 'Solid', 'Strong', 'Exceptional') },
  { id: 'c_community', name: 'Community engagement', description: 'Reaches people who have less access to the arts, with a credible plan to do it.', weight: 2, min: 1, max: 5, levels: L5('Minimal', 'Limited', 'Adequate', 'Strong', 'Deeply rooted') },
  { id: 'c_feasibility', name: 'Feasibility', description: 'Timeline, partners and experience make success likely.', weight: 1, min: 1, max: 5, levels: L5('Unlikely', 'Doubtful', 'Plausible', 'Likely', 'Very likely') },
  { id: 'c_budget', name: 'Budget', description: 'Costs are reasonable, complete and tied to the work.', weight: 1, min: 1, max: 5, levels: L5('Unclear', 'Gaps', 'Reasonable', 'Clear', 'Exemplary') },
];

export const SCHOLARSHIP_RUBRIC: RubricCriterion[] = [
  { id: 'c_academics', name: 'Academic preparation', description: 'Transcript and coursework show readiness for the intended program.', weight: 1, min: 1, max: 5, levels: L5('Weak', 'Fair', 'Good', 'Strong', 'Outstanding') },
  { id: 'c_leadership', name: 'Leadership and service', description: 'Initiative taken for others, with evidence of impact.', weight: 2, min: 1, max: 5, levels: L5('Weak', 'Fair', 'Good', 'Strong', 'Outstanding') },
  { id: 'c_essay', name: 'Goals and essays', description: 'Clear, specific goals and thoughtful writing.', weight: 2, min: 1, max: 5, levels: L5('Weak', 'Fair', 'Good', 'Strong', 'Outstanding') },
  { id: 'c_need', name: 'Potential impact of the award', description: 'How much this scholarship changes what is possible.', weight: 1, min: 1, max: 5, levels: L5('Low', 'Some', 'Moderate', 'High', 'Transformative') },
];

export const INTERVIEW_RUBRIC: RubricCriterion[] = [
  { id: 'c_communication', name: 'Communication', description: 'Listens well and explains ideas clearly.', weight: 1, min: 1, max: 5 },
  { id: 'c_clarity', name: 'Clarity of purpose', description: 'Knows what they want to do and why.', weight: 1, min: 1, max: 5 },
  { id: 'c_character', name: 'Character and resilience', description: 'Evidence of perseverance and care for others.', weight: 1, min: 1, max: 5 },
];

export const NRF_RUBRIC: RubricCriterion[] = [
  { id: 'c_benefit', name: 'Neighborhood benefit', description: 'Neighbors will be safer, more connected or better prepared.', weight: 2, min: 1, max: 5 },
  { id: 'c_readiness', name: 'Readiness', description: 'The group can carry this out within the next six months.', weight: 1, min: 1, max: 5 },
];

export const RESIDENCY_RUBRIC: RubricCriterion[] = [
  { id: 'c_vision', name: 'Artistic vision', weight: 2, min: 1, max: 5, description: 'A compelling, original direction for the work.' },
  { id: 'c_place', name: 'Connection to place', weight: 1, min: 1, max: 5, description: 'The residency setting matters to the project.' },
  { id: 'c_readiness', name: 'Readiness', weight: 1, min: 1, max: 5, description: 'The artist is ready to make the most of the time.' },
];
