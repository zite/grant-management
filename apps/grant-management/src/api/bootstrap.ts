import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { parseFields } from '@project/shared/forms/logic';
import { isInputField } from '@project/shared/forms/types';
import { parseCriteria } from '@project/shared/scoring';
import { programPhase } from '@project/shared/status';
import { getActor, isManager } from '@project/shared/server/members';
import { getSettings, rememberStaffAppUrl } from '@project/shared/server/settings';
import { bool, iso, num, numOrNull, ref, str } from '@project/shared/server/sql';
import { isConfigured } from '../server/ai';
import { demoCounts } from '../server/demo';

/**
 * Everything the staff app renders names from, loaded once and indexed on the
 * client. Reviewers get a narrowed copy: the programs they review for and the
 * people on them, never templates, views or org-wide counts.
 */

const criterion = z.object({ id: z.string(), name: z.string(), description: z.string().optional(), weight: z.number(), min: z.number(), max: z.number(), levels: z.array(z.object({ score: z.number(), label: z.string() })).optional() });

export default createEndpoint({
  description: 'Load the workspace reference data for the signed-in staff member',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({
    seeded: z.boolean(),
    me: z.object({ id: z.string(), name: z.string(), email: z.string(), role: z.enum(['Admin', 'Manager', 'Reviewer']) }),
    settings: z.object({
      organizationName: z.string(),
      logoUrl: z.string().nullable(),
      websiteUrl: z.string().nullable(),
      supportEmail: z.string().nullable(),
      brandColor: z.string(),
      currency: z.string(),
      portalHeadline: z.string(),
      portalIntro: z.string(),
      emailSignature: z.string(),
      privacyUrl: z.string().nullable(),
      defaultRole: z.enum(['Manager', 'Reviewer']),
      portalUrl: z.string().nullable(),
    }),
    members: z.array(z.object({
      id: z.string(), name: z.string(), email: z.string(), role: z.string(), status: z.string(), color: z.string(),
      avatarUrl: z.string().nullable(), title: z.string().nullable(), expertise: z.string().nullable(), lastSeenAt: z.string().nullable(),
    })),
    programs: z.array(z.object({
      id: z.string(), name: z.string(), key: z.string(), slug: z.string(), type: z.string(), status: z.string(), phase: z.string(),
      summary: z.string(), opensAt: z.string().nullable(), deadline: z.string().nullable(), allowLate: z.boolean(),
      budget: z.number().nullable(), awardMin: z.number().nullable(), awardMax: z.number().nullable(),
      color: z.string(), icon: z.string(), ownerId: z.string().nullable(), blindReview: z.boolean(),
      reviewersPerSubmission: z.number(), showScoresToReviewers: z.boolean(), maxPerApplicant: z.number(),
      contactEmail: z.string().nullable(), position: z.number(), publishedAt: z.string().nullable(), createdAt: z.string().nullable(),
      counts: z.object({ drafts: z.number(), inPipeline: z.number(), accepted: z.number(), declined: z.number(), waitlisted: z.number(), withdrawn: z.number(), submitted: z.number(), unreleased: z.number() }),
      awarded: z.number(),
      applicationFormId: z.string().nullable(),
    })),
    stages: z.array(z.object({ id: z.string(), programId: z.string(), name: z.string(), kind: z.string(), position: z.number(), color: z.string(), rubricId: z.string().nullable(), description: z.string(), count: z.number() })),
    rubrics: z.array(z.object({ id: z.string(), programId: z.string(), name: z.string(), instructions: z.string(), criteria: z.array(criterion), askRecommendation: z.boolean() })),
    forms: z.array(z.object({ id: z.string(), programId: z.string(), name: z.string(), kind: z.string(), description: z.string(), questionCount: z.number(), position: z.number(), updatedAt: z.string().nullable() })),
    labels: z.array(z.object({ id: z.string(), name: z.string(), color: z.string(), programId: z.string().nullable(), description: z.string() })),
    templates: z.array(z.object({ id: z.string(), name: z.string(), subject: z.string(), body: z.string(), trigger: z.string(), programId: z.string().nullable(), enabled: z.boolean(), position: z.number() })),
    views: z.array(z.object({ id: z.string(), name: z.string(), ownerId: z.string().nullable(), scope: z.string(), programId: z.string().nullable(), config: z.string(), position: z.number() })),
    programMembers: z.array(z.object({ id: z.string(), programId: z.string(), memberId: z.string(), role: z.string() })),
    counts: z.object({ inboxUnread: z.number(), myReviewsOpen: z.number(), unreadMessages: z.number(), tasksToReview: z.number(), unreleasedDecisions: z.number() }),
    features: z.object({ ai: z.boolean() }),
    /** Admins only: what's left of the demo organization, or null once it's gone. */
    demo: z.object({ programs: z.number(), submissions: z.number(), applicants: z.number(), members: z.number() }).nullable(),
  }),
  execute: async ({ context }) => {
    const actor = await getActor(context);
    const manager = isManager(actor);
    let settings = await getSettings();
    settings = await rememberStaffAppUrl(settings);

    const [programsRes, stagesRes, rubricsRes, formsRes, labelsRes, membersRes, pmRes, countsRes] = await Promise.all([
      zite.sql({
        query: `
          SELECT p.*,
            (SELECT COUNT(*) FROM "Submissions" s WHERE s."programId" = p.id::text AND s."status" = 'Draft') AS "draftCount",
            (SELECT COUNT(*) FROM "Submissions" s WHERE s."programId" = p.id::text AND s."status" = 'Submitted') AS "pipelineCount",
            (SELECT COUNT(*) FROM "Submissions" s WHERE s."programId" = p.id::text AND s."status" = 'Accepted') AS "acceptedCount",
            (SELECT COUNT(*) FROM "Submissions" s WHERE s."programId" = p.id::text AND s."status" = 'Declined') AS "declinedCount",
            (SELECT COUNT(*) FROM "Submissions" s WHERE s."programId" = p.id::text AND s."status" = 'Waitlisted') AS "waitlistedCount",
            (SELECT COUNT(*) FROM "Submissions" s WHERE s."programId" = p.id::text AND s."status" = 'Withdrawn') AS "withdrawnCount",
            (SELECT COUNT(*) FROM "Submissions" s WHERE s."programId" = p.id::text AND s."status" IN ('Accepted', 'Declined', 'Waitlisted') AND s."notifiedAt" IS NULL) AS "unreleasedCount",
            (SELECT COALESCE(SUM(s."awardAmount"), 0) FROM "Submissions" s WHERE s."programId" = p.id::text AND s."status" = 'Accepted' AND COALESCE(s."awardStatus", '') <> 'Cancelled') AS "awardedTotal",
            (SELECT f.id::text FROM "Forms" f WHERE f."programId" = p.id::text AND f."kind" = 'Application' ORDER BY f.created_at ASC LIMIT 1) AS "applicationFormId"
          FROM "Programs" p
          ${manager ? '' : `WHERE EXISTS (SELECT 1 FROM "Reviews" r WHERE r."programId" = p.id::text AND r."reviewerId" = $1)`}
          ORDER BY COALESCE(p."position", 0) ASC, p.created_at ASC`,
        params: manager ? [] : [actor.id],
      }),
      zite.sql({
        query: `SELECT st.*, (SELECT COUNT(*) FROM "Submissions" s WHERE s."stageId" = st.id::text AND s."status" = 'Submitted') AS "submissionCount" FROM "Stages" st ORDER BY COALESCE(st."position", 0) ASC, st.created_at ASC`,
        params: [],
      }),
      zite.sql({ query: `SELECT * FROM "Rubrics" ORDER BY created_at ASC`, params: [] }),
      zite.sql({ query: `SELECT id, "programId", "name", "kind", "description", "fields", "position", updated_at FROM "Forms" ORDER BY COALESCE("position", 0) ASC, created_at ASC`, params: [] }),
      zite.sql({ query: `SELECT * FROM "Labels" ORDER BY LOWER("name") ASC`, params: [] }),
      zite.sql({ query: `SELECT * FROM "Members" ORDER BY LOWER("name") ASC`, params: [] }),
      zite.sql({ query: `SELECT * FROM "ProgramMembers"`, params: [] }),
      zite.sql({
        query: `
          SELECT
            (SELECT COUNT(*) FROM "Notifications" n WHERE n."recipientId" = $1 AND n."readAt" IS NULL AND n."archivedAt" IS NULL AND (n."snoozedUntil" IS NULL OR n."snoozedUntil" <= NOW())) AS "inboxUnread",
            (SELECT COUNT(*) FROM "Reviews" r JOIN "Submissions" s ON s.id::text = r."submissionId"
              WHERE r."reviewerId" = $1 AND r."status" IN ('Assigned', 'In progress') AND s."status" = 'Submitted' AND COALESCE(s."stageId", '') = COALESCE(r."stageId", '')) AS "myReviewsOpen",
            (SELECT COUNT(*) FROM "Messages" m WHERE m."direction" = 'Inbound' AND m."readAt" IS NULL) AS "unreadMessages",
            (SELECT COUNT(*) FROM "Tasks" t WHERE t."status" = 'Submitted') AS "tasksToReview",
            (SELECT COUNT(*) FROM "Submissions" s WHERE s."status" IN ('Accepted', 'Declined', 'Waitlisted') AND s."notifiedAt" IS NULL) AS "unreleasedDecisions",
            (SELECT COUNT(*) FROM "Programs") AS "programTotal"`,
        params: [actor.id],
      }),
    ]);

    const visiblePrograms = new Set(programsRes.rows.map(r => String(r.id)));
    const inScope = (programId: unknown) => manager || visiblePrograms.has(String(programId ?? ''));
    const c = countsRes.rows[0] ?? {};

    const programs = programsRes.rows.map(r => {
      const p = {
        id: String(r.id),
        name: str(r.name) ?? '',
        key: str(r.key) || 'APP',
        slug: str(r.slug) ?? '',
        type: str(r.type) || 'Grant',
        status: str(r.status) || 'Draft',
        summary: str(r.summary) ?? '',
        opensAt: iso(r.opensAt),
        deadline: iso(r.deadline),
        allowLate: bool(r.allowLate),
        budget: numOrNull(r.budget),
        awardMin: numOrNull(r.awardMin),
        awardMax: numOrNull(r.awardMax),
        color: str(r.color) || '#6943d0',
        icon: str(r.icon) ?? '',
        ownerId: ref(r.ownerId),
        blindReview: bool(r.blindReview),
        reviewersPerSubmission: num(r.reviewersPerSubmission),
        showScoresToReviewers: bool(r.showScoresToReviewers),
        maxPerApplicant: num(r.maxPerApplicant, 1) || 1,
        contactEmail: ref(r.contactEmail),
        position: num(r.position),
        publishedAt: iso(r.publishedAt),
        createdAt: iso(r.created_at),
        counts: {
          drafts: num(r.draftCount),
          inPipeline: num(r.pipelineCount),
          accepted: num(r.acceptedCount),
          declined: num(r.declinedCount),
          waitlisted: num(r.waitlistedCount),
          withdrawn: num(r.withdrawnCount),
          submitted: num(r.pipelineCount) + num(r.acceptedCount) + num(r.declinedCount) + num(r.waitlistedCount),
          unreleased: num(r.unreleasedCount),
        },
        awarded: num(r.awardedTotal),
        applicationFormId: ref(r.applicationFormId),
      };
      return { ...p, phase: programPhase(p) };
    });

    // Reviewers see colleagues on their own programs only.
    const colleagueIds = new Set<string>([actor.id]);
    if (!manager) {
      for (const pm of pmRes.rows) if (visiblePrograms.has(String(pm.programId))) colleagueIds.add(String(pm.memberId));
      for (const p of programs) if (p.ownerId) colleagueIds.add(p.ownerId);
    }

    return {
      seeded: Boolean(settings.seededAt) || num(c.programTotal) > 0,
      me: { id: actor.id, name: actor.name, email: actor.email, role: actor.role },
      settings: {
        organizationName: settings.organizationName,
        logoUrl: settings.logoUrl,
        websiteUrl: settings.websiteUrl,
        supportEmail: settings.supportEmail,
        brandColor: settings.brandColor,
        currency: settings.currency,
        portalHeadline: settings.portalHeadline,
        portalIntro: settings.portalIntro,
        emailSignature: settings.emailSignature,
        privacyUrl: settings.privacyUrl,
        defaultRole: settings.defaultRole,
        portalUrl: settings.portalUrl,
      },
      members: membersRes.rows
        .filter(m => manager || colleagueIds.has(String(m.id)))
        .map(m => ({
          id: String(m.id),
          name: str(m.name) ?? '',
          email: manager || String(m.id) === actor.id ? str(m.email) ?? '' : '',
          role: str(m.role) || 'Manager',
          status: str(m.status) || 'Active',
          color: str(m.color) || '#8b8d98',
          avatarUrl: ref(m.avatarUrl),
          title: ref(m.title),
          expertise: ref(m.expertise),
          lastSeenAt: iso(m.lastSeenAt),
        })),
      programs,
      stages: stagesRes.rows.filter(s => inScope(s.programId)).map(s => ({
        id: String(s.id),
        programId: String(s.programId ?? ''),
        name: str(s.name) ?? '',
        kind: str(s.kind) || 'Review',
        position: num(s.position),
        color: str(s.color) || '#8b8d98',
        rubricId: ref(s.rubricId),
        description: str(s.description) ?? '',
        count: manager ? num(s.submissionCount) : 0,
      })),
      rubrics: rubricsRes.rows.filter(r => inScope(r.programId)).map(r => ({
        id: String(r.id),
        programId: String(r.programId ?? ''),
        name: str(r.name) ?? '',
        instructions: str(r.instructions) ?? '',
        criteria: parseCriteria(r.criteria),
        askRecommendation: bool(r.askRecommendation),
      })),
      forms: manager
        ? formsRes.rows.map(f => ({
            id: String(f.id),
            programId: String(f.programId ?? ''),
            name: str(f.name) ?? '',
            kind: str(f.kind) || 'Application',
            description: str(f.description) ?? '',
            questionCount: parseFields(f.fields).filter(isInputField).length,
            position: num(f.position),
            updatedAt: iso(f.updated_at),
          }))
        : [],
      labels: labelsRes.rows.filter(l => manager && (!ref(l.programId) || inScope(l.programId))).map(l => ({
        id: String(l.id),
        name: str(l.name) ?? '',
        color: str(l.color) || '#8b8d98',
        programId: ref(l.programId),
        description: str(l.description) ?? '',
      })),
      templates: manager
        ? (await zite.sql({ query: `SELECT * FROM "EmailTemplates" ORDER BY COALESCE("position", 0) ASC, created_at ASC`, params: [] })).rows.map(t => ({
            id: String(t.id),
            name: str(t.name) ?? '',
            subject: str(t.subject) ?? '',
            body: str(t.body) ?? '',
            trigger: str(t.trigger) || 'Manual',
            programId: ref(t.programId),
            enabled: bool(t.enabled),
            position: num(t.position),
          }))
        : [],
      views: manager
        ? (await zite.sql({ query: `SELECT * FROM "Views" WHERE "scope" = 'Shared' OR "ownerId" = $1 ORDER BY COALESCE("position", 0) ASC, created_at ASC`, params: [actor.id] })).rows.map(v => ({
            id: String(v.id),
            name: str(v.name) ?? '',
            ownerId: ref(v.ownerId),
            scope: str(v.scope) || 'Personal',
            programId: ref(v.programId),
            config: str(v.config) ?? '{}',
            position: num(v.position),
          }))
        : [],
      programMembers: pmRes.rows.filter(pm => inScope(pm.programId)).map(pm => ({
        id: String(pm.id),
        programId: String(pm.programId ?? ''),
        memberId: String(pm.memberId ?? ''),
        role: str(pm.role) || 'Reviewer',
      })),
      counts: {
        inboxUnread: num(c.inboxUnread),
        myReviewsOpen: num(c.myReviewsOpen),
        unreadMessages: manager ? num(c.unreadMessages) : 0,
        tasksToReview: manager ? num(c.tasksToReview) : 0,
        unreleasedDecisions: manager ? num(c.unreleasedDecisions) : 0,
      },
      features: { ai: isConfigured() },
      demo: actor.role === 'Admin' ? await demoCounts(settings) : null,
    };
  },
});
