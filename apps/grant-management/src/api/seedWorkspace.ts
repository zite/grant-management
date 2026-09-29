import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { starterApplicationForm } from '@project/shared/forms/catalog';
import type { Answers, FileValue, FormField } from '@project/shared/forms/types';
import { renderMerge } from '@project/shared/merge';
import { defaultCriteria, totalScore, type RubricCriterion } from '@project/shared/scoring';
import type { ActivityInput } from '@project/shared/server/activity';
import { logActivity } from '@project/shared/server/activity';
import { buildMergeContext } from '@project/shared/server/email';
import { assertAdmin, colorFor, getActor } from '@project/shared/server/members';
import { DEFAULTS, getSettings, type OrgSettings } from '@project/shared/server/settings';
import { chunked } from '@project/shared/server/sql';
import { APPLICANTS, ARTS, DEMO_ORG, LABELS, MEMBERS, NRF, RESIDENCY, SAMPLE_PDF, SCHOLARSHIP, TEMPLATES, img, type ArtsSeed } from '../seed/content';
import {
  AGREEMENT_FORM, ARTS_FORM, ARTS_RUBRIC, INTERVIEW_RUBRIC, NRF_FORM, NRF_RUBRIC, REFLECTION_FORM, REPORT_FORM,
  RESIDENCY_FORM, RESIDENCY_RUBRIC, SCHOLARSHIP_FORM, SCHOLARSHIP_RUBRIC,
} from '../seed/forms';
import { sampleStatus } from '../server/demo';

/**
 * Load the sample organization into an empty workspace. An admin runs it from
 * Settings → General; nothing calls it on its own.
 *
 * It refuses when the sample is already loaded or the workspace has real
 * content (see `sampleStatus`), so a second call never builds a second copy.
 * Whoever runs it becomes "me": owner of the open arts program, a panel
 * reviewer with work due, and the recipient of a live inbox, so the sample
 * shows every queue with something in it.
 *
 * The default email templates already exist (they are installed with the
 * Settings row) and are reused here. Organization details are only filled in
 * where they still hold their defaults.
 *
 * Every timestamp is an offset from now, so a template installed months from
 * today still has a deadline coming up and reviews due this week.
 */

const DAY = 86_400_000;

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default createEndpoint({
  description: 'Load the sample organization into an empty workspace',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ programs: z.number(), submissions: z.number() }),
  execute: async ({ context }) => {
    const actor = await getActor(context);
    assertAdmin(actor);
    const settings = await getSettings();
    const status = await sampleStatus(settings);
    if (!status.canLoad) throw new ZiteError(status.reason ?? 'Sample data can’t be loaded right now', 'CONFLICT');
    // Claim the seed before doing any work, so a second tab is refused while this one runs.
    await zite.settings.update({ id: settings.id, record: { seededAt: new Date().toISOString() } });

    const now = Date.now();
    const rand = prng(20270315);
    const at = (daysFromNow: number, hourUtc?: number) => {
      const d = new Date(now + daysFromNow * DAY);
      if (hourUtc != null) d.setUTCHours(hourUtc, 0, 0, 0);
      return d.toISOString();
    };
    const ago = (days: number) => at(-days);
    const dayStr = (daysFromNow: number) => new Date(now + daysFromNow * DAY).toISOString().slice(0, 10);
    const plus = (iso: string, days: number) => new Date(Math.min(Date.parse(iso) + days * DAY, now - 60_000)).toISOString();
    const pdf = (name: string): FileValue => ({ url: SAMPLE_PDF, name, size: 13264 + Math.floor(rand() * 400000), type: 'application/pdf' });
    const photo = (id: string, name: string): FileValue => ({ url: img(id), name, size: 240000 + Math.floor(rand() * 900000), type: 'image/jpeg' });

    // ── Organization ────────────────────────────────────────────────────────
    // Only details nobody has set yet take the demo's; removing the sample puts those back.
    const unset: Record<keyof typeof DEMO_ORG, boolean> = {
      organizationName: settings.organizationName === DEFAULTS.organizationName,
      supportEmail: !settings.supportEmail,
      websiteUrl: !settings.websiteUrl,
      portalHeadline: settings.portalHeadline === DEFAULTS.portalHeadline,
      portalIntro: settings.portalIntro === DEFAULTS.portalIntro,
      emailSignature: !settings.emailSignature.trim(),
    };
    const org = Object.fromEntries(Object.entries(DEMO_ORG).filter(([k]) => unset[k as keyof typeof DEMO_ORG])) as Partial<typeof DEMO_ORG>;
    if (Object.keys(org).length) await zite.settings.update({ id: settings.id, record: org });
    const orgSettings: OrgSettings = { ...settings, ...org };

    // ── People ──────────────────────────────────────────────────────────────
    const createdMembers = await zite.members.bulkCreate({
      records: MEMBERS.map(m => ({
        name: m.name,
        email: m.email,
        role: m.role,
        status: m.status ?? 'Active',
        color: colorFor(m.email),
        avatarUrl: null,
        title: m.title,
        expertise: m.expertise,
        invitedAt: ago(m.status === 'Invited' ? 2 : 120),
        lastSeenAt: m.status === 'Invited' ? null : ago(rand() * 4),
      })),
    });
    const M: Record<string, string> = { me: actor.id };
    MEMBERS.forEach((m, i) => (M[m.key] = createdMembers.records[i].id));
    const bias: Record<string, number> = { me: 0.01, ...Object.fromEntries(MEMBERS.map(m => [m.key, m.bias])) };
    const nameOf: Record<string, string> = { me: actor.name, ...Object.fromEntries(MEMBERS.map(m => [m.key, m.name])) };

    const createdApplicants = await zite.applicants.bulkCreate({
      records: APPLICANTS.map(a => ({
        name: a.name,
        email: a.email,
        phone: a.phone,
        organization: a.organization || null,
        location: a.location,
        website: a.website || null,
        notes: null,
        joinedAt: null,
        lastActiveAt: null,
      })),
    });
    const APP: Record<string, { id: string; name: string; email: string; organization: string; phone: string; website: string; location: string }> = {};
    APPLICANTS.forEach((a, i) => (APP[a.key] = { ...a, id: createdApplicants.records[i].id }));

    // ── Programs ────────────────────────────────────────────────────────────
    const contact = 'grants@riverbend.example.org';
    const programDefs = [
      {
        k: 'ARTS', name: 'Community Arts Grants 2027', slug: 'community-arts-grants-2027', type: 'Grant', status: 'Published', color: '#e8590c', icon: '🎨', owner: 'me',
        opensAt: at(-40, 14), deadline: at(12, 23), publishedAt: ago(42), budget: 150000, awardMin: 500, awardMax: 10000, reviewers: 3, blind: false, showScores: true,
        summary: 'Grants of $500 to $10,000 for artists, arts nonprofits and community groups bringing free public art to Riverbend, Alder County and Marsh County.',
        description: 'Community Arts Grants support projects that bring the arts to people where they already are — parks, libraries, bus stops and kitchen tables.\n\n## What we fund\n\n- New work created with and for a community\n- Free or pay-what-you-can performances, exhibitions and workshops\n- Projects that reach neighbors with less access to the arts\n\n## How decisions are made\n\nA panel of community members and working artists reviews every eligible application against four criteria: artistic merit, community engagement, feasibility and budget. We announce decisions within eight weeks of the deadline.\n\n## Questions?\n\nWe hold drop-in office hours every Thursday from 3 to 5 PM, or email us any time.',
        eligibility: '- Individual artists, nonprofits and community groups\n- Projects that take place in Riverbend, Alder County or Marsh County\n- One application per applicant each cycle\n- For-profit businesses are not eligible',
      },
      {
        k: 'SCHOL', name: 'Emerging Leaders Scholarship', slug: 'emerging-leaders-scholarship', type: 'Scholarship', status: 'Published', color: '#1c7ed6', icon: '🎓', owner: 'elena',
        opensAt: at(-75, 14), deadline: at(-10, 23), publishedAt: ago(76), budget: 25000, awardMin: 5000, awardMax: 5000, reviewers: 3, blind: true, showScores: false,
        summary: 'Renewable $5,000 scholarships for students from the Riverbend region who lead and serve their communities.',
        description: 'The Emerging Leaders Scholarship backs students who have already made a difference close to home.\n\n## The award\n\n- $5,000 a year, renewable for up to four years\n- A mentor from the foundation’s alumni network\n- An invitation to our annual leadership retreat\n\n## Selection\n\nA committee reads every application without names or contact details. Finalists are invited to a 20-minute video interview.',
        eligibility: '- Enrolled full-time at an accredited college or university in the coming year\n- Have lived in the Riverbend region for at least two years\n- Any field of study',
      },
      {
        k: 'NRF', name: 'Neighborhood Resilience Fund', slug: 'neighborhood-resilience-fund', type: 'Grant', status: 'Published', color: '#2f9e44', icon: '🏘️', owner: 'marcus',
        opensAt: at(-200, 14), deadline: null, publishedAt: ago(201), budget: 40000, awardMin: 250, awardMax: 2500, reviewers: 2, blind: false, showScores: true,
        summary: 'Small grants of $250 to $2,500 for groups of neighbors preparing for storms, floods and heat. Reviewed every two weeks.',
        description: 'Resilient neighborhoods are built by neighbors. This fund helps block clubs, associations, schools and small nonprofits prepare together.\n\n## Examples of what we fund\n\n- Shared tools and emergency supplies\n- Check-in networks for elderly or isolated neighbors\n- Shade trees, rain gardens and cooling spaces\n- Training in first aid, radio or preparedness\n\nApplications are reviewed every two weeks, and most groups hear back within a month.',
        eligibility: '- Neighborhood associations, block clubs, schools, PTAs and nonprofits\n- Projects in the city of Riverbend\n- Individuals can partner with a group to apply',
      },
      {
        k: 'RES', name: 'River Valley Artist Residency 2026', slug: 'river-valley-artist-residency-2026', type: 'Residency', status: 'Published', color: '#9c36b5', icon: '🌊', owner: 'priya',
        opensAt: at(-270, 14), deadline: at(-200, 23), publishedAt: ago(272), budget: 18000, awardMin: 6000, awardMax: 6000, reviewers: 3, blind: false, showScores: true,
        summary: 'Eight-week residencies with a $6,000 stipend and a studio at the old ferry house on the river.',
        description: 'Three artists each year spend eight weeks at the old ferry house, a studio and apartment on the riverbank.\n\n## What’s included\n\n- A $6,000 stipend, paid in two installments\n- Private studio and living space\n- A public presentation at the end of the residency',
        eligibility: '- Artists working in any discipline\n- Living anywhere — you don’t need to be local\n- Available for one of three eight-week sessions',
      },
      {
        k: 'STEM', name: 'Youth STEM Innovation Award', slug: 'youth-stem-innovation-award', type: 'Award', status: 'Draft', color: '#0c8599', icon: '🔬', owner: 'me',
        opensAt: at(21, 14), deadline: at(80, 23), publishedAt: null, budget: 10000, awardMin: 1000, awardMax: 2500, reviewers: 2, blind: true, showScores: false,
        summary: 'Recognizing high school students whose science and engineering projects solve a problem in their own community.',
        description: 'The Youth STEM Innovation Award celebrates students who turn curiosity into something useful for their neighbors.\n\n## Awards\n\n- One $2,500 grand prize\n- Up to five $1,000 awards\n- Every finalist presents at the Riverbend Science Night',
        eligibility: '- High school students in the Riverbend region\n- Individual or team projects (up to three students)',
      },
    ];
    const P: Record<string, string> = {};
    for (const [i, p] of programDefs.entries()) {
      const created = await zite.programs.create({
        record: {
          name: p.name, key: p.k, slug: p.slug, type: p.type, status: p.status, summary: p.summary, description: p.description, eligibility: p.eligibility,
          opensAt: p.opensAt, deadline: p.deadline, allowLate: false, budget: p.budget, awardMin: p.awardMin, awardMax: p.awardMax,
          color: p.color, icon: p.icon, coverImageUrl: null, ownerId: M[p.owner], blindReview: p.blind, reviewersPerSubmission: p.reviewers,
          showScoresToReviewers: p.showScores, maxPerApplicant: 1,
          confirmationMessage: 'Thank you for applying. We’ve emailed you a confirmation, and you can check on your application here at any time.',
          contactEmail: contact, submissionCounter: 0, position: i, publishedAt: p.publishedAt,
        },
      });
      P[p.k] = created.id;
    }

    // ── Rubrics, stages, forms ──────────────────────────────────────────────
    const rubric = async (programKey: string, name: string, criteria: RubricCriterion[], instructions: string) =>
      (await zite.rubrics.create({ record: { name, programId: P[programKey], instructions, criteria: JSON.stringify(criteria), askRecommendation: true } })).id;
    const R = {
      arts: await rubric('ARTS', 'Panel scorecard', ARTS_RUBRIC, 'Read the whole application before scoring. Score each criterion on its own terms, and leave a comment the panel chair can read aloud.'),
      schol: await rubric('SCHOL', 'Committee scorecard', SCHOLARSHIP_RUBRIC, 'Applications are anonymized. Please do not try to identify applicants. Weigh leadership and essays twice as heavily as grades.'),
      interview: await rubric('SCHOL', 'Interview scorecard', INTERVIEW_RUBRIC, 'Score immediately after each interview, before talking with the other interviewer.'),
      nrf: await rubric('NRF', 'Staff review', NRF_RUBRIC, 'A quick check: will neighbors benefit, and can this group do it?'),
      res: await rubric('RES', 'Residency panel', RESIDENCY_RUBRIC, ''),
      stem: await rubric('STEM', 'Judging rubric', defaultCriteria(), ''),
    };

    const stageDefs: Record<string, Array<{ key: string; name: string; kind: string; color: string; rubric?: string; description?: string }>> = {
      ARTS: [
        { key: 'received', name: 'Received', kind: 'Intake', color: '#868e96', description: 'New submissions waiting for a first look.' },
        { key: 'screen', name: 'Eligibility screen', kind: 'Intake', color: '#f59f00', description: 'Staff confirm eligibility and completeness.' },
        { key: 'panel', name: 'Panel review', kind: 'Review', color: '#7048e8', rubric: R.arts, description: 'Three community panelists score each application.' },
        { key: 'final', name: 'Final decision', kind: 'Decision', color: '#1c7ed6', description: 'Staff recommend and the board approves.' },
      ],
      SCHOL: [
        { key: 'received', name: 'Received', kind: 'Intake', color: '#868e96' },
        { key: 'committee', name: 'Committee review', kind: 'Review', color: '#7048e8', rubric: R.schol },
        { key: 'interviews', name: 'Interviews', kind: 'Review', color: '#d6336c', rubric: R.interview },
        { key: 'final', name: 'Final selection', kind: 'Decision', color: '#1c7ed6' },
      ],
      NRF: [
        { key: 'new', name: 'New', kind: 'Intake', color: '#868e96' },
        { key: 'review', name: 'Staff review', kind: 'Review', color: '#7048e8', rubric: R.nrf },
        { key: 'decision', name: 'Decision', kind: 'Decision', color: '#1c7ed6' },
      ],
      RES: [
        { key: 'received', name: 'Received', kind: 'Intake', color: '#868e96' },
        { key: 'panel', name: 'Panel review', kind: 'Review', color: '#7048e8', rubric: R.res },
        { key: 'final', name: 'Final decision', kind: 'Decision', color: '#1c7ed6' },
      ],
      STEM: [
        { key: 'received', name: 'Received', kind: 'Intake', color: '#868e96' },
        { key: 'judging', name: 'Judging', kind: 'Review', color: '#7048e8', rubric: R.stem },
        { key: 'finalists', name: 'Finalists', kind: 'Decision', color: '#1c7ed6' },
      ],
    };
    const S: Record<string, Record<string, string>> = {};
    for (const [programKey, defs] of Object.entries(stageDefs)) {
      const created = await zite.stages.bulkCreate({
        records: defs.map((d, i) => ({ name: d.name, programId: P[programKey], kind: d.kind, position: i, color: d.color, rubricId: d.rubric ?? null, description: d.description ?? null })),
      });
      S[programKey] = Object.fromEntries(defs.map((d, i) => [d.key, created.records[i].id]));
    }

    const form = async (programKey: string, name: string, kind: string, fields: FormField[], opts: { title?: string; amount?: string; description?: string; position?: number } = {}) =>
      (await zite.forms.create({
        record: { name, programId: P[programKey], kind, description: opts.description ?? null, fields: JSON.stringify(fields), titleFieldId: opts.title ?? null, amountFieldId: opts.amount ?? null, position: opts.position ?? 0 },
      })).id;
    const stemStarter = starterApplicationForm('Award');
    const F = {
      arts: await form('ARTS', 'Application', 'Application', ARTS_FORM, { title: 'f_title', amount: 'f_amount', description: 'Most people finish in about 45 minutes. Your answers save automatically.' }),
      schol: await form('SCHOL', 'Application', 'Application', SCHOLARSHIP_FORM, { title: 'f_field', description: 'Have your transcript ready as a PDF before you start.' }),
      nrf: await form('NRF', 'Application', 'Application', NRF_FORM, { title: 'f_title', amount: 'f_amount', description: 'A short form — most groups finish in 15 minutes.' }),
      res: await form('RES', 'Application', 'Application', RESIDENCY_FORM, { title: 'f_title' }),
      stem: await form('STEM', 'Application', 'Application', stemStarter.fields, { title: stemStarter.titleFieldId, amount: stemStarter.amountFieldId ?? undefined }),
      agreement: await form('NRF', 'Grant agreement & payment details', 'Follow-up', AGREEMENT_FORM, { position: 1 }),
      report: await form('NRF', 'Final report', 'Follow-up', REPORT_FORM, { position: 2 }),
      reflection: await form('RES', 'Final reflection', 'Follow-up', REFLECTION_FORM, { position: 1 }),
    };

    const pool: Array<[string, string, string]> = [
      ['ARTS', 'marcus', 'Manager'], ['ARTS', 'priya', 'Manager'],
      ['ARTS', 'me', 'Reviewer'], ['ARTS', 'grace', 'Reviewer'], ['ARTS', 'samuel', 'Reviewer'], ['ARTS', 'hannah', 'Reviewer'], ['ARTS', 'omar', 'Reviewer'], ['ARTS', 'lucia', 'Reviewer'], ['ARTS', 'nadia', 'Reviewer'],
      ['SCHOL', 'elena', 'Manager'], ['SCHOL', 'ben', 'Reviewer'], ['SCHOL', 'hannah', 'Reviewer'], ['SCHOL', 'omar', 'Reviewer'], ['SCHOL', 'elena', 'Reviewer'], ['SCHOL', 'priya', 'Reviewer'],
      ['NRF', 'me', 'Manager'], ['NRF', 'tom', 'Manager'], ['NRF', 'marcus', 'Reviewer'], ['NRF', 'lucia', 'Reviewer'],
      ['RES', 'priya', 'Reviewer'], ['RES', 'grace', 'Reviewer'], ['RES', 'samuel', 'Reviewer'],
      ['STEM', 'ben', 'Reviewer'],
    ];
    await zite.programMembers.bulkCreate({
      records: pool.map(([pk, mk, role]) => ({ name: `${pk} · ${nameOf[mk]}`, programId: P[pk], memberId: M[mk], role })),
    });

    // Organization-wide labels outlive a removal, so loading the sample again reuses them by name.
    const { rows: existingLabels } = await zite.sql({ query: `SELECT id::text AS id, "name" FROM "Labels" WHERE COALESCE("programId", '') = '' ORDER BY created_at DESC`, params: [] });
    const labelId = new Map(existingLabels.map(r => [String(r.name).toLowerCase(), String(r.id)] as const));
    const newLabels = LABELS.filter(l => !labelId.has(l.key.toLowerCase()));
    if (newLabels.length) {
      const created = await zite.labels.bulkCreate({ records: newLabels.map(l => ({ name: l.key, color: l.color, programId: null, description: l.description })) });
      newLabels.forEach((l, i) => labelId.set(l.key.toLowerCase(), created.records[i].id));
    }
    const LBL: Record<string, string> = Object.fromEntries(LABELS.map(l => [l.key, labelId.get(l.key.toLowerCase())!]));

    // The default templates are the workspace's own; the sample links its messages to them where they still exist.
    const { rows: templateRows } = await zite.sql({ query: `SELECT id::text AS id, "name", "trigger" FROM "EmailTemplates" WHERE COALESCE("programId", '') = '' ORDER BY COALESCE("position", 0) ASC, created_at ASC`, params: [] });
    const T: Record<string, string | null> = {};
    for (const t of TEMPLATES.filter(t => !t.program)) {
      const match = templateRows.find(r => r.name === t.name) ?? (t.trigger !== 'Manual' ? templateRows.find(r => r.trigger === t.trigger) : undefined);
      T[t.name] = match ? String(match.id) : null;
    }
    const programTemplates = TEMPLATES.filter(t => t.program);
    const createdTemplates = await zite.emailTemplates.bulkCreate({
      records: programTemplates.map((t, i) => ({ name: t.name, subject: t.subject, body: t.body, trigger: t.trigger, programId: P[t.program!], enabled: t.enabled, position: templateRows.length + i })),
    });
    programTemplates.forEach((t, i) => (T[t.name] = createdTemplates.records[i].id));
    const templateBy = (name: string) => TEMPLATES.find(t => t.name === name)!;

    // ── Submissions ─────────────────────────────────────────────────────────
    type Plan = {
      programKey: string;
      applicantKey: string;
      title: string;
      answers: Answers;
      status: string;
      stageKey: string;
      startedAt: string;
      submittedAt: string | null;
      stageEnteredAt: string | null;
      decidedAt?: string | null;
      notifiedAt?: string | null;
      withdrawnAt?: string | null;
      decisionReason?: string | null;
      decisionNote?: string | null;
      requestedAmount?: number | null;
      awardAmount?: number | null;
      awardStatus?: string | null;
      awardStart?: string | null;
      awardEnd?: string | null;
      owner?: string | null;
      labels?: string[];
      quality: number;
      stagePath: string[];
      decidedBy?: string;
    };
    const plans: Plan[] = [];

    const artsAnswers = (s: ArtsSeed): Answers => {
      const a = APP[s.applicant];
      const answers: Answers = {
        f_applicant_type: s.type === 'o_business' ? 'o_collective' : s.type,
        f_in_area: 'yes',
        f_name: a.name,
        f_email: a.email,
        f_phone: a.phone,
      };
      if (a.website) answers.f_website = a.website;
      if (s.type !== 'o_individual' && a.organization) answers.f_org = a.organization;
      if (s.bio) answers.f_bio = s.bio;
      if (s.title) answers.f_title = s.title;
      answers.f_discipline = s.discipline;
      if (s.amount) answers.f_amount = s.amount;
      if (s.stage !== 'draft') {
        answers.f_start = dayStr(40 + Math.floor(rand() * 30));
        answers.f_end = dayStr(120 + Math.floor(rand() * 90));
      }
      if (s.description) answers.f_description = s.description;
      if (s.community) answers.f_community = s.community;
      if (s.venues.length) answers.f_venues = s.venues;
      if (s.stage !== 'draft') answers.f_budget = [{ ...pdf(`${s.title.replace(/[^A-Za-z0-9]+/g, '-')}-budget.pdf`), type: 'application/pdf' }];
      if (s.budgetNote) answers.f_budget_note = s.budgetNote;
      if (s.samples?.length) answers.f_samples = s.samples.map((id, i) => photo(id, `work-sample-${i + 1}.jpg`));
      return answers;
    };

    for (const s of ARTS) {
      const submittedAt = s.stage === 'draft' ? null : ago(s.daysAgo);
      const startedAt = submittedAt ? plus(ago(s.daysAgo + 3 + rand() * 9), 0) : ago(s.daysAgo);
      const path = { received: ['received'], screen: ['received', 'screen'], panel: ['received', 'screen', 'panel'], final: ['received', 'screen', 'panel', 'final'], declined: ['received', 'screen'], draft: [] }[s.stage];
      const entered = { received: 0, screen: 1, panel: 3, final: Math.min(18, s.daysAgo - 1), declined: 1, draft: 0 }[s.stage];
      plans.push({
        programKey: 'ARTS', applicantKey: s.applicant, title: s.title, answers: artsAnswers(s), quality: s.quality,
        status: s.stage === 'draft' ? 'Draft' : s.stage === 'declined' ? 'Declined' : 'Submitted',
        stageKey: path.length ? path[path.length - 1] : '', stagePath: path,
        startedAt, submittedAt, stageEnteredAt: submittedAt ? plus(submittedAt, entered) : null,
        requestedAmount: s.amount || null,
        decidedAt: s.stage === 'declined' ? plus(submittedAt!, 2) : null,
        notifiedAt: s.stage === 'declined' ? plus(submittedAt!, 2.2) : null,
        decisionReason: s.stage === 'declined' ? 'Not eligible' : null,
        decisionNote: s.stage === 'declined' ? 'Ink & Axle is registered as an LLC. Referred them to the Creative Economy loan program.' : null,
        decidedBy: 'marcus',
        owner: s.stage === 'final' ? 'me' : s.stage === 'panel' && s.applicant === 'framebyframe' ? 'marcus' : s.stage === 'screen' ? 'marcus' : null,
        labels: s.labels,
      });
    }

    for (const s of SCHOLARSHIP) {
      const a = APP[s.applicant];
      const submittedAt = ago(10 + s.daysAgo);
      const answers: Answers = {
        f_enrolled: 'yes',
        f_resident: s.stage === 'ineligible' ? 'no' : 'yes',
        f_name: a.name, f_email: a.email, f_phone: a.phone,
        f_school: s.school, f_level: s.level, f_gpa: s.gpa, f_field: s.field, f_first_gen: s.firstGen ? 'yes' : 'no',
        f_goals: s.goals, f_leadership: s.leadership,
        f_transcript: [pdf('unofficial-transcript.pdf')],
      };
      if (s.need) answers.f_need = s.need;
      if (s.quality > 0.75) answers.f_letter = [pdf('recommendation-letter.pdf')];
      const decided = s.stage === 'accepted' || s.stage === 'waitlisted' || s.stage === 'declined';
      const path =
        s.stage === 'committee' || s.stage === 'withdrawn' ? ['received', 'committee']
        : s.stage === 'interviews' ? ['received', 'committee', 'interviews']
        : decided ? ['received', 'committee', 'interviews', 'final']
        : ['received'];
      plans.push({
        programKey: 'SCHOL', applicantKey: s.applicant, title: s.field, answers, quality: s.quality,
        status: s.stage === 'accepted' ? 'Accepted' : s.stage === 'waitlisted' ? 'Waitlisted' : s.stage === 'declined' || s.stage === 'ineligible' ? 'Declined' : s.stage === 'withdrawn' ? 'Withdrawn' : 'Submitted',
        stageKey: path[path.length - 1], stagePath: path,
        startedAt: ago(10 + s.daysAgo + 6 + rand() * 20), submittedAt,
        stageEnteredAt: s.stage === 'committee' || s.stage === 'withdrawn' ? ago(8) : s.stage === 'interviews' ? ago(5) : decided ? ago(2) : submittedAt,
        decidedAt: decided ? ago(1) : s.stage === 'ineligible' ? ago(9) : null,
        notifiedAt: s.stage === 'ineligible' ? ago(9) : null,
        withdrawnAt: s.stage === 'withdrawn' ? ago(6) : null,
        decisionReason: s.stage === 'ineligible' ? 'Not eligible' : s.stage === 'declined' ? 'Scored below funded range' : null,
        decisionNote: s.stage === 'ineligible' ? 'Moved to the region 14 months ago — below the two-year residency requirement.' : null,
        awardAmount: s.stage === 'accepted' ? 5000 : null,
        awardStatus: s.stage === 'accepted' ? 'Pending' : null,
        decidedBy: 'elena',
        owner: decided || s.stage === 'interviews' ? 'elena' : null,
      });
    }

    for (const s of NRF) {
      const a = APP[s.applicant];
      const submittedAt = ago(s.daysAgo);
      const answers: Answers = {
        f_group_type: s.group, f_org: a.organization, f_name: a.name, f_email: a.email, f_phone: a.phone,
        f_neighborhood: s.neighborhood, f_title: s.title, f_amount: s.amount, f_when: dayStr(-s.daysAgo + 45),
        f_description: s.description, f_volunteers: s.volunteers,
      };
      if (s.quality > 0.7) answers.f_budget = [pdf('budget.pdf')];
      const accepted = s.stage === 'accepted_active' || s.stage === 'accepted_complete';
      const decided = accepted || s.stage === 'declined';
      const path = s.stage === 'new' ? ['new'] : s.stage === 'review' ? ['new', 'review'] : ['new', 'review', 'decision'];
      const decidedAt = decided ? plus(submittedAt, 12) : null;
      plans.push({
        programKey: 'NRF', applicantKey: s.applicant, title: s.title, answers, quality: s.quality,
        status: accepted ? 'Accepted' : s.stage === 'declined' ? 'Declined' : 'Submitted',
        stageKey: path[path.length - 1], stagePath: path, startedAt: plus(ago(s.daysAgo + 2), 0), submittedAt,
        stageEnteredAt: s.stage === 'new' ? submittedAt : s.stage === 'review' ? plus(submittedAt, 1) : plus(submittedAt, 11),
        decidedAt, notifiedAt: decidedAt ? plus(decidedAt, 0.5) : null,
        decisionReason: s.stage === 'declined' ? (s.quality < 0.45 ? 'Outside program focus' : 'Scored below funded range') : null,
        requestedAmount: s.amount, awardAmount: s.award ?? null,
        awardStatus: s.stage === 'accepted_complete' ? 'Completed' : s.stage === 'accepted_active' ? 'Active' : null,
        awardStart: accepted ? dayStr(-s.daysAgo + 14) : null,
        awardEnd: accepted ? dayStr(-s.daysAgo + 14 + 180) : null,
        decidedBy: 'marcus', owner: 'marcus', labels: s.labels,
      });
    }

    for (const s of RESIDENCY) {
      const a = APP[s.applicant];
      const submittedAt = ago(205 + rand() * 40);
      const answers: Answers = {
        f_name: a.name, f_email: a.email, f_discipline: s.discipline, f_bio: s.bio, f_title: s.title, f_proposal: s.proposal, f_session: s.session,
        f_samples: [pdf('portfolio.pdf')],
      };
      if (a.website) answers.f_website = a.website;
      if (s.accepted) answers.f_why = 'The river has shaped every project I have made, and I have never had the time to stay with it through a full season.';
      plans.push({
        programKey: 'RES', applicantKey: s.applicant, title: s.title, answers, quality: s.quality,
        status: s.accepted ? 'Accepted' : 'Declined', stageKey: 'final', stagePath: ['received', 'panel', 'final'],
        startedAt: plus(submittedAt, -5), submittedAt, stageEnteredAt: ago(165), decidedAt: ago(160), notifiedAt: ago(158),
        decisionReason: s.accepted ? null : 'Scored below funded range', awardAmount: s.accepted ? 6000 : null,
        awardStatus: s.accepted ? (s.session === 'p_fall' ? 'Active' : 'Completed') : null,
        awardStart: s.accepted ? dayStr(s.session === 'p_spring' ? -150 : s.session === 'p_summer' ? -90 : -12) : null,
        awardEnd: s.accepted ? dayStr(s.session === 'p_spring' ? -94 : s.session === 'p_summer' ? -34 : 44) : null,
        decidedBy: 'priya', owner: 'priya',
      });
    }

    // Numbers follow submission order within each program, as they would have been assigned.
    const numberOf = new Map<Plan, number>();
    for (const programKey of Object.keys(P)) {
      plans
        .filter(p => p.programKey === programKey && p.submittedAt)
        .sort((a, b) => Date.parse(a.submittedAt!) - Date.parse(b.submittedAt!))
        .forEach((p, i) => numberOf.set(p, i + 1));
    }

    const SUB = new Map<Plan, string>();
    await chunked(plans, async batch => {
      const created = await zite.submissions.bulkCreate({
        records: batch.map(p => {
          const lastActivity = [p.notifiedAt, p.decidedAt, p.withdrawnAt, p.stageEnteredAt, p.submittedAt, p.startedAt].filter(Boolean).sort().pop() ?? p.startedAt;
          return {
            title: p.title || null,
            number: numberOf.get(p) ?? null,
            programId: P[p.programKey],
            applicantId: APP[p.applicantKey].id,
            stageId: p.stageKey ? S[p.programKey][p.stageKey] : null,
            ownerId: p.owner ? M[p.owner] : null,
            status: p.status,
            answers: JSON.stringify(p.answers),
            requestedAmount: p.requestedAmount ?? null,
            awardAmount: p.awardAmount ?? null,
            awardStatus: p.awardStatus ?? null,
            awardStartDate: p.awardStart ?? null,
            awardEndDate: p.awardEnd ?? null,
            decisionReason: p.decisionReason ?? null,
            decisionNote: p.decisionNote ?? null,
            startedAt: p.startedAt,
            lastSavedAt: p.submittedAt ?? plus(p.startedAt, 0.4),
            submittedAt: p.submittedAt,
            stageEnteredAt: p.stageEnteredAt,
            decidedAt: p.decidedAt ?? null,
            decidedById: p.decidedAt ? M[p.decidedBy ?? 'marcus'] : null,
            notifiedAt: p.notifiedAt ?? null,
            withdrawnAt: p.withdrawnAt ?? null,
            lastActivityAt: lastActivity,
            remindedAt: null,
          };
        }),
      });
      batch.forEach((p, i) => SUB.set(p, created.records[i].id));
    });
    for (const [programKey, id] of Object.entries(P)) {
      const count = plans.filter(p => p.programKey === programKey && p.submittedAt).length;
      await zite.programs.update({ id, record: { submissionCounter: count } });
    }
    const planFor = (programKey: string, applicantKey: string) => plans.find(p => p.programKey === programKey && p.applicantKey === applicantKey)!;
    const subId = (programKey: string, applicantKey: string) => SUB.get(planFor(programKey, applicantKey))!;

    const labelRows = plans.flatMap(p => (p.labels ?? []).map(l => ({ name: `${p.programKey} · ${l}`, submissionId: SUB.get(p)!, labelId: LBL[l] })));
    if (labelRows.length) await zite.submissionLabels.bulkCreate({ records: labelRows });

    const activity: ActivityInput[] = [];
    for (const p of plans) {
      const sid = SUB.get(p)!;
      const common = { submissionId: sid, programId: P[p.programKey], applicantId: APP[p.applicantKey].id };
      activity.push({ ...common, type: 'started', actorType: 'Applicant', actorId: APP[p.applicantKey].id, occurredAt: p.startedAt });
      if (!p.submittedAt) continue;
      activity.push({ ...common, type: 'submitted', actorType: 'Applicant', actorId: APP[p.applicantKey].id, occurredAt: p.submittedAt });
      const span = Math.max(0.01, (Date.parse(p.stageEnteredAt ?? p.submittedAt) - Date.parse(p.submittedAt)) / DAY);
      p.stagePath.slice(1).forEach((key, i, rest) => {
        const when = i === rest.length - 1 ? p.stageEnteredAt! : plus(p.submittedAt!, (span * (i + 1)) / rest.length);
        activity.push({ ...common, type: 'stage_changed', actorType: 'Member', actorId: M[p.owner ?? p.decidedBy ?? 'marcus'], data: { from: S[p.programKey][p.stagePath[i]], to: S[p.programKey][key] }, occurredAt: when });
      });
      if (p.owner) activity.push({ ...common, type: 'owner_changed', actorType: 'Member', actorId: M[p.decidedBy ?? 'marcus'], data: { from: null, to: M[p.owner] }, occurredAt: plus(p.submittedAt, 0.5) });
      if (p.decidedAt) activity.push({ ...common, type: 'decision', actorType: 'Member', actorId: M[p.decidedBy ?? 'marcus'], data: { decision: p.status, reason: p.decisionReason ?? null, awardAmount: p.awardAmount ?? null }, occurredAt: p.decidedAt });
      if (p.notifiedAt) activity.push({ ...common, type: 'decision_released', actorType: 'Member', actorId: M[p.decidedBy ?? 'marcus'], data: { decision: p.status }, occurredAt: p.notifiedAt });
      if (p.withdrawnAt) activity.push({ ...common, type: 'withdrawn', actorType: 'Applicant', actorId: APP[p.applicantKey].id, data: { reason: 'Accepted another scholarship' }, occurredAt: p.withdrawnAt });
    }

    // ── Reviews ─────────────────────────────────────────────────────────────
    type ReviewPlan = { plan: Plan; stageKey: string; reviewer: string; status: 'Assigned' | 'In progress' | 'Submitted'; rubric: RubricCriterion[]; rubricId: string; due?: string; skew?: number; submittedDaysAgo?: number };
    const reviewPlans: ReviewPlan[] = [];
    const artsPanel: Array<[string, Array<[string, ReviewPlan['status'], Partial<ReviewPlan>?]>]> = [
      ['rosa', [['me', 'Submitted'], ['grace', 'Submitted', { submittedDaysAgo: 0.1 }], ['omar', 'Submitted']]],
      ['amara', [['me', 'Submitted'], ['samuel', 'Submitted'], ['hannah', 'In progress']]],
      ['brassroots', [['grace', 'Submitted'], ['samuel', 'Submitted'], ['lucia', 'Submitted']]],
      ['theo', [['me', 'In progress'], ['omar', 'Submitted', { skew: -0.22 }], ['grace', 'Submitted', { skew: 0.2 }]]],
      ['quilters', [['hannah', 'Submitted'], ['lucia', 'Submitted'], ['samuel', 'Assigned']]],
      ['framebyframe', [['me', 'Assigned', { due: dayStr(1) }], ['grace', 'Submitted'], ['lucia', 'In progress']]],
      ['jada', [['omar', 'Submitted'], ['hannah', 'Assigned'], ['samuel', 'Submitted']]],
      ['libraryfriends', [['me', 'Assigned', { due: dayStr(-1) }], ['lucia', 'Submitted'], ['hannah', 'Submitted']]],
      ['miguel', [['omar', 'Submitted'], ['grace', 'Assigned'], ['samuel', 'Assigned']]],
      ['openhands', [['grace', 'Submitted'], ['hannah', 'Submitted'], ['omar', 'Submitted']]],
      ['northgatesingers', [['samuel', 'Submitted'], ['lucia', 'Submitted'], ['me', 'Submitted']]],
    ];
    for (const [applicantKey, assignments] of artsPanel) {
      for (const [reviewer, status, extra] of assignments) {
        reviewPlans.push({ plan: planFor('ARTS', applicantKey), stageKey: 'panel', reviewer, status, rubric: ARTS_RUBRIC, rubricId: R.arts, ...extra });
      }
    }
    const committee = ['ben', 'hannah', 'omar'];
    for (const p of plans.filter(p => p.programKey === 'SCHOL' && p.stagePath.includes('committee'))) {
      const inCommittee = p.stageKey === 'committee' && p.status === 'Submitted';
      committee.forEach((reviewer, i) => {
        const status = inCommittee ? (['Submitted', 'Submitted', 'In progress', 'Assigned'] as const)[Math.floor(rand() * 4)] : 'Submitted';
        if (p.status === 'Withdrawn' && status !== 'Submitted') return;
        reviewPlans.push({ plan: p, stageKey: 'committee', reviewer, status: i === 0 && inCommittee ? 'Submitted' : status, rubric: SCHOLARSHIP_RUBRIC, rubricId: R.schol });
      });
      if (p.stagePath.includes('interviews')) {
        const interviewing = p.stageKey === 'interviews';
        (['elena', 'priya'] as const).forEach((reviewer, i) => {
          reviewPlans.push({ plan: p, stageKey: 'interviews', reviewer, status: interviewing && i === 1 && rand() < 0.6 ? 'Assigned' : 'Submitted', rubric: INTERVIEW_RUBRIC, rubricId: R.interview });
        });
      }
    }
    for (const p of plans.filter(p => p.programKey === 'NRF' && p.stagePath.includes('review'))) {
      const reviewing = p.stageKey === 'review';
      (['marcus', 'lucia'] as const).forEach((reviewer, i) => {
        reviewPlans.push({ plan: p, stageKey: 'review', reviewer, status: reviewing && i === 1 && p.applicantKey !== 'n_raingardens' ? 'Assigned' : 'Submitted', rubric: NRF_RUBRIC, rubricId: R.nrf });
      });
    }
    for (const p of plans.filter(p => p.programKey === 'RES')) {
      for (const reviewer of ['priya', 'grace', 'samuel']) reviewPlans.push({ plan: p, stageKey: 'panel', reviewer, status: 'Submitted', rubric: RESIDENCY_RUBRIC, rubricId: R.res });
    }

    const COMMENTS = {
      Yes: [
        'Clear, specific and grounded in real relationships with the people it serves. I would fund this in full.',
        'One of the strongest in my batch. The plan is realistic and the need is obvious.',
        'Thoughtful and well prepared. The budget is tight but honest.',
        'Exactly the kind of work this program exists for.',
      ],
      Maybe: [
        'A good idea, but the outreach plan is thin — I’m not sure who will actually show up.',
        'Promising. I’d like to see a more detailed timeline before committing the full amount.',
        'Solid overall. The budget has a few lines I couldn’t match to activities.',
        'Worth funding if there’s room, perhaps at a reduced amount.',
      ],
      No: [
        'The proposal doesn’t say enough about the community it would serve.',
        'Feels unfinished — several key questions are answered in a sentence.',
        'I couldn’t see how the budget connects to the activities described.',
      ],
    } as const;

    const reviewRecords = reviewPlans.map(rp => {
      const p = rp.plan;
      const sid = SUB.get(p)!;
      const stageEntered = p.stageKey === rp.stageKey ? p.stageEnteredAt! : plus(p.submittedAt!, rp.stageKey === 'interviews' ? 6 : 3);
      const assignedAt = plus(stageEntered, 0.05);
      const scores: Record<string, number> = {};
      const q = p.quality + (bias[rp.reviewer] ?? 0) + (rp.skew ?? 0);
      for (const c of rp.rubric) {
        const noise = (rand() - 0.5) * 0.24;
        scores[c.id] = Math.max(c.min, Math.min(c.max, Math.round((q + noise) * c.max)));
      }
      const partial = rp.status === 'In progress' ? Object.fromEntries(Object.entries(scores).slice(0, Math.ceil(rp.rubric.length / 2))) : rp.status === 'Submitted' ? scores : {};
      const total = rp.status === 'Submitted' ? totalScore(rp.rubric, scores) : null;
      const recommendation = rp.status === 'Submitted' ? (total! >= 76 ? 'Yes' : total! >= 58 ? 'Maybe' : 'No') : null;
      const pool = recommendation ? COMMENTS[recommendation as keyof typeof COMMENTS] : [];
      const submittedAt = rp.status === 'Submitted' ? (rp.submittedDaysAgo != null ? ago(rp.submittedDaysAgo) : plus(assignedAt, 1 + rand() * 9)) : null;
      return {
        rp,
        record: {
          name: `${p.programKey}-${numberOf.get(p)} · ${nameOf[rp.reviewer]}`,
          submissionId: sid,
          reviewerId: M[rp.reviewer],
          stageId: S[p.programKey][rp.stageKey],
          rubricId: rp.rubricId,
          programId: P[p.programKey],
          status: rp.status,
          scores: Object.keys(partial).length ? JSON.stringify(partial) : null,
          totalScore: total,
          recommendation,
          comment: recommendation ? pool[Math.floor(rand() * pool.length)] : null,
          applicantFeedback: null,
          recusalReason: null,
          dueDate: rp.due ?? new Date(Date.parse(assignedAt) + 14 * DAY).toISOString().slice(0, 10),
          assignedAt,
          assignedById: M[p.owner ?? p.decidedBy ?? 'marcus'],
          startedAt: rp.status === 'Assigned' ? null : plus(assignedAt, 0.5),
          submittedAt,
          remindedAt: null,
        },
      };
    });
    await chunked(reviewRecords, async batch => {
      await zite.reviews.bulkCreate({ records: batch.map(b => b.record) });
    });
    for (const { rp, record } of reviewRecords) {
      const common = { submissionId: record.submissionId, programId: record.programId, applicantId: APP[rp.plan.applicantKey].id };
      activity.push({ ...common, type: 'reviewer_assigned', actorType: 'Member', actorId: record.assignedById, data: { reviewerId: record.reviewerId, stageId: record.stageId }, occurredAt: record.assignedAt });
      if (record.submittedAt) activity.push({ ...common, type: 'review_submitted', actorType: 'Member', actorId: record.reviewerId, data: { score: record.totalScore, recommendation: record.recommendation }, occurredAt: record.submittedAt });
    }

    // ── Messages ────────────────────────────────────────────────────────────
    const messageRows: Array<Record<string, unknown>> = [];
    const programMeta = (k: string) => {
      const d = programDefs.find(x => x.k === k)!;
      return { name: d.name, key: d.k, deadline: d.deadline };
    };
    const merged = (templateName: string, p: Plan, extra: { award?: number | null; taskTitle?: string; taskDue?: string } = {}) => {
      const t = templateBy(templateName);
      const ctx = buildMergeContext({
        settings: orgSettings,
        applicant: APP[p.applicantKey],
        program: programMeta(p.programKey),
        submission: { id: SUB.get(p)!, title: p.title, number: numberOf.get(p) ?? null, awardAmount: extra.award ?? p.awardAmount ?? null },
        task: extra.taskTitle ? { title: extra.taskTitle, dueDate: extra.taskDue ?? null } : null,
      });
      return { subject: renderMerge(t.subject, ctx), body: renderMerge(t.body, ctx), templateId: T[templateName] };
    };
    const msg = (p: Plan, m: { subject: string; body: string; direction: 'Outbound' | 'Inbound'; kind: string; sender?: string | null; sentAt: string; read?: boolean; templateId?: string | null }) => {
      messageRows.push({
        subject: m.subject,
        body: m.body,
        submissionId: SUB.get(p)!,
        applicantId: APP[p.applicantKey].id,
        senderId: m.sender ? M[m.sender] : null,
        direction: m.direction,
        kind: m.kind,
        delivery: m.direction === 'Outbound' ? 'Sent' : 'Portal only',
        templateId: m.templateId ?? null,
        sentAt: m.sentAt,
        readAt: m.read === false ? null : plus(m.sentAt, 0.2),
      });
    };
    for (const p of plans.filter(p => p.submittedAt)) {
      const t = merged('Submission received', p);
      msg(p, { ...t, direction: 'Outbound', kind: 'Confirmation', sentAt: plus(p.submittedAt!, 0.001) });
      if (p.notifiedAt) {
        const name = p.status === 'Accepted' ? 'Congratulations' : p.status === 'Waitlisted' ? 'Waitlist' : 'Not selected';
        const d = merged(name, p);
        msg(p, { ...d, direction: 'Outbound', kind: 'Decision', sender: p.decidedBy, sentAt: p.notifiedAt });
        activity.push({ type: 'message_sent', submissionId: SUB.get(p)!, programId: P[p.programKey], applicantId: APP[p.applicantKey].id, actorType: 'Member', actorId: M[p.decidedBy ?? 'marcus'], data: { subject: d.subject, kind: 'Decision' }, occurredAt: p.notifiedAt });
      }
    }
    const film = planFor('ARTS', 'framebyframe');
    msg(film, {
      subject: 'A question about your budget — ARTS-' + numberOf.get(film), direction: 'Outbound', kind: 'Request', sender: 'marcus', sentAt: ago(4),
      body: `Hi Andre,\n\nThank you for your application for Youth Film Lab. As the panel reviews it, could you break down the student stipend line? We'd like to see how the $9,600 is split between stipends, snacks and transportation.\n\nYou can upload a revised budget in the portal.\n\nThanks,\nMarcus`,
    });
    msg(film, {
      subject: 'Re: A question about your budget', direction: 'Inbound', kind: 'Message', sentAt: ago(0.12), read: false,
      body: 'Hi Marcus — thanks for asking. I uploaded a revised budget just now. The stipends are $600 for each of 16 students ($9,600); snacks and bus passes are covered by our school district partner, so they aren’t in this request. Happy to jump on a call if that’s easier.\n\nAndre',
    });
    const rosa = planFor('ARTS', 'rosa');
    msg(rosa, { subject: 'Wall agreements', direction: 'Inbound', kind: 'Message', sentAt: ago(10), body: 'Hello — do you need signed agreements from the building owners before a decision, or only if we are funded?' });
    msg(rosa, { subject: 'Re: Wall agreements', direction: 'Outbound', kind: 'Message', sender: 'me', sentAt: ago(9.6), body: `Hi Rosa,\n\nOnly if you're funded — but if you already have any, feel free to share them. It helps the panel see the project is ready to go.\n\n${actor.name}` });
    const trees = planFor('NRF', 'n_trees');
    msg(trees, { subject: 'Planting in October?', direction: 'Inbound', kind: 'Message', sentAt: ago(55), body: 'Our arborist says October is better for planting than August. Is it okay to shift the schedule?' });
    msg(trees, { subject: 'Re: Planting in October?', direction: 'Outbound', kind: 'Message', sender: 'marcus', sentAt: ago(54), body: 'Hi Beth — absolutely. Just note the new dates in your final report. Thanks for checking!\n\nMarcus' });
    for (const p of plans.filter(p => p.programKey === 'SCHOL' && p.stagePath.includes('interviews'))) {
      const t = templateBy('Interview invitation');
      const ctx = buildMergeContext({ settings: orgSettings, applicant: APP[p.applicantKey], program: programMeta('SCHOL'), submission: { id: SUB.get(p)!, title: p.title, number: numberOf.get(p) ?? null } });
      msg(p, { subject: renderMerge(t.subject, ctx), body: renderMerge(t.body, ctx), direction: 'Outbound', kind: 'Message', sender: 'elena', sentAt: ago(7), templateId: T['Interview invitation'] });
    }
    const andre = planFor('SCHOL', 's_andre');
    msg(andre, { subject: 'Withdrawing my application', direction: 'Inbound', kind: 'Message', sentAt: ago(6), body: 'I was offered a full scholarship through my university, so I would like to withdraw so this can go to someone else. Thank you for the opportunity.' });

    await chunked(messageRows, async batch => {
      await zite.messages.bulkCreate({ records: batch as never });
    });

    // ── Tasks ───────────────────────────────────────────────────────────────
    type TaskPlan = { plan: Plan; title: string; formId: string | null; instructions: string; status: 'Open' | 'Submitted' | 'Approved' | 'Returned'; requestedAt: string; due: string; submittedAt?: string; reviewedAt?: string; answers?: Answers; by: string };
    const taskPlans: TaskPlan[] = [];
    const agreementAnswers = (p: Plan): Answers => ({
      f_signer: APP[p.applicantKey].name, f_signer_title: 'Coordinator', f_agree: 'yes', f_payee: APP[p.applicantKey].organization || APP[p.applicantKey].name, f_payment_method: rand() > 0.4 ? 'm_ach' : 'm_check', f_w9: [pdf('w9.pdf')],
    });
    for (const p of plans.filter(p => p.programKey === 'NRF' && p.status === 'Accepted')) {
      const decided = p.notifiedAt!;
      const agreementStatus = p.applicantKey === 'n_blockparty' ? 'Submitted' : p.applicantKey === 'n_fridge' ? 'Open' : 'Approved';
      taskPlans.push({
        plan: p, title: 'Grant agreement & payment details', formId: F.agreement, by: 'marcus',
        instructions: 'Please confirm who will sign for your group, how you would like to be paid, and upload a W-9.',
        status: agreementStatus, requestedAt: plus(decided, 0.1), due: agreementStatus === 'Open' ? dayStr(5) : new Date(Date.parse(decided) + 14 * DAY).toISOString().slice(0, 10),
        submittedAt: agreementStatus === 'Open' ? undefined : agreementStatus === 'Submitted' ? ago(1) : plus(decided, 3), reviewedAt: agreementStatus === 'Approved' ? plus(decided, 4) : undefined,
        answers: agreementStatus === 'Open' ? undefined : agreementAnswers(p),
      });
      if (p.awardStatus === 'Completed' || p.applicantKey === 'n_cooling' || p.applicantKey === 'n_trees') {
        const complete = p.awardStatus === 'Completed';
        taskPlans.push({
          plan: p, title: 'Final report', formId: F.report, by: 'marcus',
          instructions: 'Tell us how the project went. Photos are welcome.',
          status: complete ? 'Approved' : 'Open', requestedAt: plus(decided, 1), due: complete ? dayStr(-20) : p.applicantKey === 'n_cooling' ? dayStr(-3) : dayStr(40),
          submittedAt: complete ? ago(30) : undefined, reviewedAt: complete ? ago(28) : undefined,
          answers: complete ? { f_outcomes: 'We did everything we set out to do, and more neighbors got involved than we expected. Several told us they finally feel ready for the next big storm.', f_people: 180 + Math.floor(rand() * 200), f_spent: p.awardAmount ?? 0, f_lessons: 'Start recruiting volunteers earlier, and translate flyers into Spanish from day one.', f_photos: [photo('photo-1559027615-cd4628902d4a', 'volunteers.jpg')] } : undefined,
        });
      }
    }
    for (const p of plans.filter(p => p.programKey === 'RES' && p.status === 'Accepted')) {
      const status = p.applicantKey === 'amara' ? 'Approved' : p.applicantKey === 'r_jonas' ? 'Submitted' : 'Open';
      taskPlans.push({
        plan: p, title: 'Final reflection', formId: F.reflection, by: 'priya',
        instructions: 'A short reflection on your residency, for our records and — with your permission — our annual report.',
        status, requestedAt: ago(150), due: status === 'Open' ? dayStr(45) : dayStr(-10),
        submittedAt: status === 'Open' ? undefined : status === 'Submitted' ? ago(3) : ago(40), reviewedAt: status === 'Approved' ? ago(38) : undefined,
        answers: status === 'Open' ? undefined : { f_reflection: 'The residency gave me the one thing I never have: unbroken time with a single place. I finished a draft of the whole project and have a publisher interested in the next stage.', f_public: 'yes', f_images: [photo('photo-1500534314209-a25ddb2bd429', 'studio.jpg')] },
      });
    }
    taskPlans.push({
      plan: film, title: 'Upload a revised budget', formId: null, by: 'marcus',
      instructions: 'Please upload a budget that breaks the student stipend line into stipends, snacks and transportation.',
      status: 'Submitted', requestedAt: ago(4), due: dayStr(3), submittedAt: ago(0.12),
      answers: { response: 'Revised budget attached. Snacks and bus passes are covered by our district partner, so the full line is stipends.', files: [pdf('youth-film-lab-revised-budget.pdf')] } as unknown as Answers,
    });
    await zite.tasks.bulkCreate({
      records: taskPlans.map(t => ({
        title: t.title,
        submissionId: SUB.get(t.plan)!,
        applicantId: APP[t.plan.applicantKey].id,
        programId: P[t.plan.programKey],
        formId: t.formId,
        instructions: t.instructions,
        dueDate: t.due,
        status: t.status,
        answers: t.answers ? JSON.stringify(t.answers) : null,
        requestedById: M[t.by],
        requestedAt: t.requestedAt,
        submittedAt: t.submittedAt ?? null,
        reviewedAt: t.reviewedAt ?? null,
        reviewedById: t.reviewedAt ? M[t.by] : null,
        reviewNote: null,
        remindedAt: null,
      })),
    });
    for (const t of taskPlans) {
      const common = { submissionId: SUB.get(t.plan)!, programId: P[t.plan.programKey], applicantId: APP[t.plan.applicantKey].id };
      activity.push({ ...common, type: 'task_requested', actorType: 'Member', actorId: M[t.by], data: { title: t.title }, occurredAt: t.requestedAt });
      if (t.submittedAt) activity.push({ ...common, type: 'task_submitted', actorType: 'Applicant', actorId: APP[t.plan.applicantKey].id, data: { title: t.title }, occurredAt: t.submittedAt });
      if (t.reviewedAt) activity.push({ ...common, type: 'task_approved', actorType: 'Member', actorId: M[t.by], data: { title: t.title }, occurredAt: t.reviewedAt });
    }

    // ── Payments ────────────────────────────────────────────────────────────
    const payments: Array<{ plan: Plan; name: string; amount: number; due: string; paid: string | null; status: string; method: string; reference: string }> = [];
    for (const p of plans.filter(p => p.programKey === 'NRF' && p.status === 'Accepted')) {
      const start = p.awardStart!;
      const offset = (Date.parse(`${start}T12:00:00Z`) - now) / DAY;
      if (p.applicantKey === 'n_trees') {
        payments.push({ plan: p, name: 'Installment 1 of 2', amount: 1250, due: dayStr(offset), paid: dayStr(offset + 2), status: 'Paid', method: 'ACH', reference: 'ACH-22871' });
        payments.push({ plan: p, name: 'Installment 2 of 2', amount: 1250, due: dayStr(20), paid: null, status: 'Scheduled', method: 'ACH', reference: '' });
      } else if (p.applicantKey === 'n_blockparty' || p.applicantKey === 'n_fridge') {
        payments.push({ plan: p, name: 'Full award', amount: p.awardAmount!, due: dayStr(p.applicantKey === 'n_fridge' ? 10 : 4), paid: null, status: 'On hold', method: 'Check', reference: '' });
      } else {
        payments.push({ plan: p, name: 'Full award', amount: p.awardAmount!, due: dayStr(offset), paid: dayStr(offset + 3), status: 'Paid', method: rand() > 0.5 ? 'ACH' : 'Check', reference: `CHK-${4400 + Math.floor(rand() * 500)}` });
      }
    }
    for (const p of plans.filter(p => p.programKey === 'RES' && p.status === 'Accepted')) {
      const start = (Date.parse(`${p.awardStart}T12:00:00Z`) - now) / DAY;
      const end = (Date.parse(`${p.awardEnd}T12:00:00Z`) - now) / DAY;
      payments.push({ plan: p, name: 'Stipend, first half', amount: 3000, due: dayStr(start), paid: dayStr(start), status: 'Paid', method: 'ACH', reference: `ACH-${31000 + Math.floor(rand() * 900)}` });
      const secondPaid = end < 0;
      payments.push({ plan: p, name: 'Stipend, second half', amount: 3000, due: dayStr(end), paid: secondPaid ? dayStr(end + 1) : null, status: secondPaid ? 'Paid' : 'Scheduled', method: 'ACH', reference: secondPaid ? `ACH-${32000 + Math.floor(rand() * 900)}` : '' });
    }
    await zite.payments.bulkCreate({
      records: payments.map(pay => ({
        name: pay.name, submissionId: SUB.get(pay.plan)!, programId: P[pay.plan.programKey], amount: pay.amount, dueDate: pay.due, paidDate: pay.paid,
        status: pay.status, method: pay.method, reference: pay.reference || null,
        notes: pay.status === 'On hold' ? 'Waiting on the signed grant agreement.' : null, recordedById: M.tom,
      })),
    });
    for (const pay of payments.filter(x => x.status === 'Paid')) {
      activity.push({ type: 'payment_recorded', submissionId: SUB.get(pay.plan)!, programId: P[pay.plan.programKey], applicantId: APP[pay.plan.applicantKey].id, actorType: 'Member', actorId: M.tom, data: { amount: pay.amount, status: 'Paid', name: pay.name }, occurredAt: `${pay.paid}T16:00:00.000Z` });
    }

    // ── Notes ───────────────────────────────────────────────────────────────
    const theo = planFor('ARTS', 'theo');
    const mention = (key: string) => `@[${nameOf[key]}](${M[key]})`;
    await zite.notes.bulkCreate({
      records: [
        { body: `${mention('me')} Omar and Grace are more than 30 points apart on this one. Can you take a look before the panel meets?`, submissionId: SUB.get(theo)!, applicantId: null, authorId: M.marcus, postedAt: ago(1), editedAt: null },
        { body: 'The stipend line looks high next to the equipment budget. I’ve asked them to break it down.', submissionId: SUB.get(film)!, applicantId: null, authorId: M.marcus, postedAt: ago(4), editedAt: null },
        { body: 'Visited the studio last week. The kiln room is a great setup, and both recovery houses have already signed on.', submissionId: subId('ARTS', 'openhands'), applicantId: null, authorId: M.priya, postedAt: ago(3), editedAt: null },
        { body: `Spoke with Rosa — the merchants have signed wall agreements for three of the five walls. ${mention('marcus')} FYI for the budget conversation.`, submissionId: SUB.get(rosa)!, applicantId: null, authorId: actor.id, postedAt: ago(9), editedAt: null },
        { body: 'Excellent interview. Both of us scored her at the top of the pool.', submissionId: subId('SCHOL', 's_zara'), applicantId: null, authorId: M.elena, postedAt: ago(4), editedAt: null },
        { body: 'First installment sent by ACH, reference 22871.', submissionId: SUB.get(trees)!, applicantId: null, authorId: M.tom, postedAt: ago(60), editedAt: null },
        { body: 'Holding payment until the agreement comes back signed.', submissionId: subId('NRF', 'n_blockparty'), applicantId: null, authorId: M.tom, postedAt: ago(20), editedAt: null },
      ],
    });

    await logActivity(activity);

    // ── Inbox ───────────────────────────────────────────────────────────────
    const n = (x: { type: string; title: string; body?: string; recipient: string; actor?: string | null; actorType?: string; sub?: string | null; program?: string | null; when: string; read?: boolean; link?: string }) => ({
      title: x.title, body: x.body ?? null, type: x.type, recipientId: M[x.recipient], actorId: x.actor ? M[x.actor] ?? x.actor : null, actorType: x.actorType ?? 'Member',
      submissionId: x.sub ?? null, programId: x.program ?? null, link: x.link ?? null, occurredAt: x.when, readAt: x.read ? plus(x.when, 0.1) : null, archivedAt: null, snoozedUntil: null,
    });
    const lanterns = planFor('ARTS', 'kenji');
    const blockParty = planFor('NRF', 'n_blockparty');
    await zite.notifications.bulkCreate({
      records: [
        n({ type: 'submission_received', title: 'New submission: Lanterns on the Levee', body: 'Riverlight Collective · $10,000 requested', recipient: 'me', actor: APP.kenji.id, actorType: 'Applicant', sub: SUB.get(lanterns)!, program: P.ARTS, when: ago(0.2) }),
        n({ type: 'applicant_message', title: 'Andre Wallace replied: Re: A question about your budget', body: 'Hi Marcus — thanks for asking. I uploaded a revised budget just now…', recipient: 'me', actor: APP.framebyframe.id, actorType: 'Applicant', sub: SUB.get(film)!, program: P.ARTS, when: ago(0.12) }),
        n({ type: 'review_submitted', title: 'Grace Liu reviewed Murals for Maple Street', body: 'Score and recommendation are in', recipient: 'me', actor: 'grace', sub: SUB.get(rosa)!, program: P.ARTS, when: ago(0.1) }),
        n({ type: 'mention', title: 'Marcus Chen mentioned you on Shadow Puppets of the Mill District', body: '@' + actor.name + ' Omar and Grace are more than 30 points apart on this one…', recipient: 'me', actor: 'marcus', sub: SUB.get(theo)!, program: P.ARTS, when: ago(1) }),
        n({ type: 'task_submitted', title: 'Old Town 400 Block Club completed Grant agreement & payment details', body: 'Ready for your approval', recipient: 'me', actor: APP.n_blockparty.id, actorType: 'Applicant', sub: SUB.get(blockParty)!, program: P.NRF, when: ago(1) }),
        n({ type: 'review_due', title: 'Review due tomorrow: Youth Film Lab', recipient: 'me', actorType: 'System', sub: SUB.get(film)!, program: P.ARTS, when: ago(0.3), link: '/reviews' }),
        n({ type: 'decision_made', title: '5 decisions in Emerging Leaders Scholarship are ready to release', body: 'Elena Vasquez finished final selection', recipient: 'me', actor: 'elena', program: P.SCHOL, when: ago(0.8), read: true }),
        n({ type: 'submission_received', title: 'New submission: Marsh County Folk Dance Revival', body: 'Marsh Folk Dancers · $5,000 requested', recipient: 'me', actor: APP.svetlana.id, actorType: 'Applicant', sub: subId('ARTS', 'svetlana'), program: P.ARTS, when: ago(1), read: true }),
        n({ type: 'review_assigned', title: '4 new reviews in Community Arts Grants 2027', body: 'Due within two weeks', recipient: 'me', actor: 'marcus', program: P.ARTS, when: ago(6), read: true, link: '/reviews' }),
        n({ type: 'submission_received', title: 'New submission: Wildfire Chipping Day', body: 'South Hills Firewise Committee · $1,900 requested', recipient: 'marcus', actorType: 'Applicant', sub: subId('NRF', 'n_chipping'), program: P.NRF, when: ago(1) }),
      ],
    });

    // ── Saved views ─────────────────────────────────────────────────────────
    const view = (name: string, scope: string, owner: string | null, config: Record<string, unknown>, position: number) => ({ name, scope, ownerId: owner ? M[owner] : null, programId: null, config: JSON.stringify(config), position });
    await zite.views.bulkCreate({
      records: [
        view('Needs reviewers', 'Shared', 'marcus', { filters: { statuses: ['Submitted'], reviewState: 'unassigned', stageKinds: ['Review'] }, options: { layout: 'list', grouping: 'program', ordering: 'submitted_asc' } }, 0),
        view('Reviewers disagree', 'Shared', 'marcus', { filters: { reviewState: 'disagreement', statuses: ['Submitted'] }, options: { layout: 'list', grouping: 'program', ordering: 'score_desc' } }, 1),
        view('Top scores', 'Shared', 'priya', { filters: { statuses: ['Submitted'], scoreMin: 80 }, options: { layout: 'table', grouping: 'none', ordering: 'score_desc' } }, 2),
        view('Decisions to release', 'Shared', 'elena', { filters: { release: 'unreleased' }, options: { layout: 'list', grouping: 'program', ordering: 'score_desc' } }, 3),
        view('My submissions', 'Personal', 'me', { filters: { ownerIds: ['__me__'] }, options: { layout: 'list', grouping: 'stage', ordering: 'updated_desc' } }, 4),
      ],
    });

    return { programs: programDefs.length, submissions: plans.length };
  },
});
