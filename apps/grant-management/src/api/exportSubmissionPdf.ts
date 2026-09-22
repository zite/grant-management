import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { Pdf } from 'zitejs/pdf';
import { answerToText, formatMoney, parseAnswers, parseFields, visibleFieldIds } from '@project/shared/forms/logic';
import { isInputField, type FormField } from '@project/shared/forms/types';
import { RECOMMENDATION_LABEL, parseCriteria, parseScores, scoreStats, type Recommendation } from '@project/shared/scoring';
import { assertManager, getActor } from '@project/shared/server/members';
import { getSettings } from '@project/shared/server/settings';
import { iso, num, numOrNull, ref, str } from '@project/shared/server/sql';

/**
 * A clean, printable copy of one submission, or a "board packet" of several
 * with a page break between each — what a committee reads before a meeting.
 * Staff-only content: includes reviewer names, scores and comments.
 */
const Input = z.object({ ids: z.array(z.string()).min(1, 'Choose at least one submission').max(100, 'A packet can hold up to 100 submissions') });

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const para = (s: string) => esc(s).replace(/\r\n/g, '\n').split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('');

const STATUS_LABEL: Record<string, string> = { Draft: 'Draft', Submitted: 'In review', Accepted: 'Accepted', Waitlisted: 'Waitlisted', Declined: 'Declined', Withdrawn: 'Withdrawn' };

function longDate(v: string | null) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(d);
}

const CSS = `
  @page { size: letter; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Inter, Helvetica, Arial, sans-serif; color: #1c1c22; font-size: 11pt; line-height: 1.5; margin: 0; }
  .packet { padding: 0; }
  .sub + .sub { page-break-before: always; }
  .org { display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #e4e4e9; padding-bottom: 10px; margin-bottom: 18px; color: #5b5b66; font-size: 9.5pt; }
  .org img { height: 26px; }
  .org strong { color: #1c1c22; font-size: 10.5pt; }
  .org .right { margin-left: auto; }
  .eyebrow { color: #6943d0; font-size: 9pt; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
  h1 { font-size: 20pt; line-height: 1.25; margin: 4px 0 6px; letter-spacing: -.01em; }
  h2 { font-size: 12pt; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e4e4e9; }
  h3 { font-size: 9pt; text-transform: uppercase; letter-spacing: .05em; color: #6b6b76; margin: 16px 0 6px; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 16px; background: #f6f6f8; border-radius: 8px; padding: 12px 14px; margin: 12px 0 4px; }
  .meta div span { display: block; color: #6b6b76; font-size: 8.5pt; }
  .meta div b { font-weight: 600; font-size: 10pt; }
  .qa { page-break-inside: avoid; padding: 7px 0; border-bottom: 1px solid #f0f0f3; }
  .qa .q { color: #5b5b66; font-size: 9.5pt; font-weight: 600; }
  .qa .a p { margin: 3px 0 0; }
  .qa .none { color: #9a9aa4; font-style: italic; }
  .score { display: inline-block; min-width: 34px; text-align: center; border-radius: 6px; padding: 1px 6px; font-weight: 700; background: #efeafc; color: #5835b8; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-top: 6px; }
  th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #ececf0; vertical-align: top; }
  th { color: #6b6b76; font-weight: 600; font-size: 8.5pt; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .review { page-break-inside: avoid; border: 1px solid #e4e4e9; border-radius: 8px; padding: 10px 12px; margin-top: 8px; }
  .review .head { display: flex; gap: 8px; align-items: baseline; }
  .review .head .rec { color: #5b5b66; font-size: 9.5pt; }
  .review .head .right { margin-left: auto; }
  .review p { margin: 6px 0 0; }
  .muted { color: #6b6b76; }
  .foot { margin-top: 24px; color: #9a9aa4; font-size: 8pt; }
`;

export default createEndpoint({
  description: 'Download one submission, or a board packet of several, as a PDF',
  authenticated: true,
  inputSchema: Input,
  outputSchema: z.object({ url: z.string(), filename: z.string() }),
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Choose submissions to export', 'BAD_REQUEST');
    const ids = [...new Set(parsed.data.ids)];
    const actor = await getActor(context);
    assertManager(actor);
    const settings = await getSettings();

    const [{ rows: subs }, { rows: reviewRows }] = await Promise.all([
      zite.sql({
        query: `SELECT s.*, p."name" AS "programName", p."key" AS "programKey", st."name" AS "stageName",
                  a."name" AS "applicantName", a."email" AS "applicantEmail", a."organization" AS "applicantOrganization", a."phone" AS "applicantPhone"
                FROM "Submissions" s
                LEFT JOIN "Programs" p ON p.id::text = s."programId"
                LEFT JOIN "Stages" st ON st.id::text = s."stageId"
                LEFT JOIN "Applicants" a ON a.id::text = s."applicantId"
                WHERE s.id::text = ANY($1::text[])`,
        params: [ids],
      }),
      zite.sql({
        query: `SELECT r."submissionId", r."status", r."scores", r."totalScore", r."recommendation", r."comment", r."submittedAt", r."rubricId",
                  m."name" AS "reviewerName", st."name" AS "stageName", st."position" AS "stagePosition"
                FROM "Reviews" r
                LEFT JOIN "Members" m ON m.id::text = r."reviewerId"
                LEFT JOIN "Stages" st ON st.id::text = r."stageId"
                WHERE r."submissionId" = ANY($1::text[]) AND r."status" = 'Submitted'
                ORDER BY COALESCE(st."position", 0) ASC, r."submittedAt" ASC NULLS LAST`,
        params: [ids],
      }),
    ]);
    if (!subs.length) throw new ZiteError('Those submissions no longer exist', 'NOT_FOUND');
    // Keep the order the caller chose — a packet is usually sorted by score or reference.
    const order = new Map(ids.map((id, i) => [id, i]));
    subs.sort((a, b) => (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0));

    const programIds = [...new Set(subs.map(s => String(s.programId)))];
    const [{ rows: formRows }, { rows: rubricRows }] = await Promise.all([
      zite.sql({ query: `SELECT DISTINCT ON ("programId") "programId", "fields" FROM "Forms" WHERE "programId" = ANY($1::text[]) AND "kind" = 'Application' ORDER BY "programId", created_at ASC`, params: [programIds] }),
      zite.sql({ query: `SELECT id, "criteria" FROM "Rubrics" WHERE "programId" = ANY($1::text[])`, params: [programIds] }),
    ]);
    const formByProgram = new Map<string, FormField[]>(formRows.map(f => [String(f.programId), parseFields(f.fields)]));
    const criteriaByRubric = new Map(rubricRows.map(r => [String(r.id), parseCriteria(r.criteria)]));
    const reviewsBySub = new Map<string, Array<Record<string, unknown>>>();
    for (const r of reviewRows) {
      const k = String(r.submissionId);
      if (!reviewsBySub.has(k)) reviewsBySub.set(k, []);
      reviewsBySub.get(k)!.push(r);
    }
    const currency = settings.currency || 'USD';
    const logo = settings.logoUrl && /^https:\/\//.test(settings.logoUrl) ? `<img src="${esc(settings.logoUrl)}" alt=""/>` : '';
    const printed = longDate(new Date().toISOString());

    const sections = subs.map(s => {
      const id = String(s.id);
      const reference = s.number ? `${str(s.programKey) || 'APP'}-${num(s.number)}` : 'Draft';
      const status = str(s.status) || 'Draft';
      const answers = parseAnswers(s.answers);
      const fields = formByProgram.get(String(s.programId)) ?? [];
      const visible = visibleFieldIds(fields, answers);

      const statusText = status === 'Submitted' && s.stageName ? `In review · ${esc(s.stageName)}` : esc(STATUS_LABEL[status] ?? status);
      const released = ['Accepted', 'Declined', 'Waitlisted'].includes(status) ? (s.notifiedAt ? ` · released ${longDate(iso(s.notifiedAt))}` : ' · not released') : '';
      const award = numOrNull(s.awardAmount);
      const requested = numOrNull(s.requestedAmount);
      const meta = [
        ['Applicant', esc(s.applicantName)],
        ['Organization', esc(s.applicantOrganization) || '—'],
        ['Email', esc(s.applicantEmail) || '—'],
        ['Status', `${statusText}${released}`],
        ['Submitted', longDate(iso(s.submittedAt)) || 'Not yet'],
        [award != null && status === 'Accepted' ? 'Award' : 'Requested', award != null && status === 'Accepted' ? esc(formatMoney(award, currency)) : requested != null ? esc(formatMoney(requested, currency)) : '—'],
      ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');

      // Answers, grouped under the form's own sections.
      let answerHtml = '';
      for (const f of fields) {
        if (!visible.has(f.id)) continue;
        if (f.type === 'section') {
          answerHtml += `<h3>${esc(f.label)}</h3>`;
          continue;
        }
        if (!isInputField(f)) continue;
        const text = f.type === 'file'
          ? (Array.isArray(answers[f.id]) ? (answers[f.id] as Array<{ name?: string }>).map(x => x.name ?? 'file').join(', ') : '')
          : answerToText(f, answers, { currency });
        // A packet is read on paper: unanswered optional questions are noise.
        if (!text) continue;
        answerHtml += `<div class="qa"><div class="q">${esc(f.label)}</div><div class="a">${para(text)}</div></div>`;
      }
      answerHtml = answerHtml.replace(/<h3>[^<]*<\/h3>(?=<h3>|$)/g, '');
      if (!answerHtml.includes('class="qa"')) answerHtml = '<p class="muted">No answers recorded.</p>';

      const reviews = reviewsBySub.get(id) ?? [];
      let reviewHtml = '';
      if (reviews.length) {
        const stats = scoreStats(reviews.map(r => numOrNull(r.totalScore)));
        const recs = { Yes: 0, Maybe: 0, No: 0 } as Record<string, number>;
        for (const r of reviews) if (r.recommendation && recs[String(r.recommendation)] != null) recs[String(r.recommendation)]++;
        reviewHtml += `<h2>Reviews</h2><p>Average <span class="score">${stats.mean != null ? Math.round(stats.mean) : '—'}</span> from ${reviews.length} review${reviews.length === 1 ? '' : 's'}${stats.spread != null && reviews.length > 1 ? ` · range ${Math.round(stats.min!)}–${Math.round(stats.max!)}` : ''} · ${recs.Yes} recommend, ${recs.Maybe} unsure, ${recs.No} don't recommend</p>`;

        const rubricId = ref(reviews[0].rubricId);
        const criteria = rubricId ? criteriaByRubric.get(rubricId) ?? [] : [];
        const sameRubric = reviews.every(r => ref(r.rubricId) === rubricId);
        if (criteria.length && sameRubric) {
          const head = reviews.map(r => `<th class="num">${esc(String(r.reviewerName ?? 'Reviewer').split(' ')[0])}</th>`).join('');
          const body = criteria.map(c => {
            const cells = reviews.map(r => {
              const v = parseScores(r.scores)[c.id];
              return `<td class="num">${v == null ? '—' : `${v}/${c.max}`}</td>`;
            }).join('');
            return `<tr><td>${esc(c.name)}${c.weight !== 1 ? ` <span class="muted">×${c.weight}</span>` : ''}</td>${cells}</tr>`;
          }).join('');
          const totals = reviews.map(r => `<td class="num"><b>${numOrNull(r.totalScore) != null ? Math.round(num(r.totalScore)) : '—'}</b></td>`).join('');
          reviewHtml += `<table><thead><tr><th>Criterion</th>${head}</tr></thead><tbody>${body}<tr><td><b>Total (0–100)</b></td>${totals}</tr></tbody></table>`;
        }
        reviewHtml += reviews.map(r => {
          const rec = ref(r.recommendation) as Recommendation | null;
          return `<div class="review"><div class="head"><b>${esc(r.reviewerName ?? 'Reviewer')}</b><span class="rec">${rec ? esc(RECOMMENDATION_LABEL[rec] ?? rec) : ''}${r.stageName ? ` · ${esc(r.stageName)}` : ''}</span><span class="right score">${numOrNull(r.totalScore) != null ? Math.round(num(r.totalScore)) : '—'}</span></div>${str(r.comment) ? para(String(r.comment)) : '<p class="muted">No comment.</p>'}</div>`;
        }).join('');
      }

      return `<section class="sub">
        <div class="org">${logo}<strong>${esc(settings.organizationName)}</strong><span>${esc(s.programName)}</span><span class="right">${esc(reference)} · printed ${printed}</span></div>
        <div class="eyebrow">${esc(s.programName)} · ${esc(reference)}</div>
        <h1>${esc(s.title || 'Untitled application')}</h1>
        <div class="meta">${meta}</div>
        <h2>Application</h2>
        ${answerHtml}
        ${reviewHtml}
        <div class="foot">Confidential — prepared for ${esc(settings.organizationName)} staff and committee members.</div>
      </section>`;
    });

    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${subs.length === 1 ? 'Submission' : 'Board packet'}</title><style>${CSS}</style></head><body><div class="packet">${sections.join('')}</div></body></html>`;
    const first = subs[0];
    const firstRef = first.number ? `${str(first.programKey) || 'APP'}-${num(first.number)}` : 'Draft';
    const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const filename = subs.length === 1 ? `${safe(`${firstRef} ${str(first.title) ?? ''}`)}.pdf` : `Board packet - ${subs.length} submissions.pdf`;
    const res = await Pdf.renderHtml({ html, filename });
    return { url: res.url, filename: res.filename || filename };
  },
});
