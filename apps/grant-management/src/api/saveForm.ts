import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { checkForm, starterFields, starterName, LIMITS, type FormKind, type StarterKey } from '@project/shared/forms/builder';
import { cloneFields, starterApplicationForm } from '@project/shared/forms/catalog';
import { parseFields } from '@project/shared/forms/logic';
import { assertManager, getActor } from '@project/shared/server/members';
import { iso, num, ref, str } from '@project/shared/server/sql';

/**
 * Every write the form builder makes.
 *
 *   update     name, description, questions and the title/amount mapping
 *   create     a follow-up form (a program has exactly one application form)
 *   duplicate  a copy with fresh question ids, always as a follow-up form
 *   delete     a follow-up form no task uses
 *
 * The questions are re-validated here with the same rules the builder shows
 * (`checkForm`), because `inputSchema` is not enforced by the runtime.
 */

const Input = z.object({
  action: z.enum(['update', 'create', 'duplicate', 'delete']),
  id: z.string().optional(),
  programId: z.string().optional(),
  kind: z.enum(['Application', 'Follow-up']).optional(),
  name: z.string().max(LIMITS.name, `Keep the form name under ${LIMITS.name} characters.`).optional(),
  description: z.string().max(LIMITS.description, `Keep the description under ${LIMITS.description.toLocaleString()} characters.`).optional(),
  fields: z.array(z.any()).optional(),
  titleFieldId: z.string().nullable().optional(),
  amountFieldId: z.string().nullable().optional(),
  starter: z.enum(['blank', 'agreement', 'progress', 'final']).optional(),
  /** The form's `updatedAt` when the editor loaded it; a mismatch means someone else saved in between. */
  expectedUpdatedAt: z.string().nullable().optional(),
});

const Output = z.object({
  id: z.string(), programId: z.string(), name: z.string(), kind: z.string(), description: z.string(),
  fields: z.array(z.any()), titleFieldId: z.string().nullable(), amountFieldId: z.string().nullable(), position: z.number(),
  updatedAt: z.string().nullable(), submissionCount: z.number(),
});

type FormRow = Record<string, unknown>;

async function loadRow(id: string): Promise<FormRow | undefined> {
  const { rows } = await zite.sql({ query: `SELECT * FROM "Forms" WHERE id::text = $1`, params: [id] });
  return rows[0];
}

/** The same shape `getForm` returns, so the builder can drop it straight into its cache. */
async function toOutput(f: FormRow) {
  const kind = str(f.kind) || 'Application';
  const counted = kind === 'Application'
    ? await zite.sql({ query: `SELECT COUNT(*) AS n FROM "Submissions" WHERE "programId" = $1`, params: [String(f.programId ?? '')] })
    : await zite.sql({ query: `SELECT COUNT(*) AS n FROM "Tasks" WHERE "formId" = $1`, params: [String(f.id)] });
  return {
    id: String(f.id),
    programId: String(f.programId ?? ''),
    name: str(f.name) ?? '',
    kind,
    description: str(f.description) ?? '',
    fields: parseFields(f.fields),
    titleFieldId: ref(f.titleFieldId),
    amountFieldId: ref(f.amountFieldId),
    position: num(f.position),
    updatedAt: iso(f.updated_at),
    submissionCount: num(counted.rows[0]?.n),
  };
}

function firstIssue(errors: Array<{ message: string }>) {
  const [first, ...rest] = errors;
  return rest.length ? `${first.message} (${rest.length} more ${rest.length === 1 ? 'problem' : 'problems'} to fix.)` : first.message;
}

async function nextPosition(programId: string) {
  const { rows } = await zite.sql({ query: `SELECT COALESCE(MAX("position"), 0) AS p FROM "Forms" WHERE "programId" = $1`, params: [programId] });
  return num(rows[0]?.p) + 1;
}

export default createEndpoint({
  description: 'Create, update, duplicate or delete a program form',
  authenticated: true,
  inputSchema: Input,
  outputSchema: Output,
  execute: async ({ input: raw, context }) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'That form change is malformed.', 'BAD_REQUEST');
    const input = parsed.data;
    const actor = await getActor(context);
    assertManager(actor);

    // ── create ────────────────────────────────────────────────────────────
    if (input.action === 'create') {
      if (!input.programId) throw new ZiteError('Which program is this form for?', 'BAD_REQUEST');
      const program = await zite.programs.findOne({ id: input.programId });
      if (!program) throw new ZiteError('That program no longer exists.', 'NOT_FOUND');
      if (input.kind === 'Application') {
        // Only as a recovery path: a program that somehow has no application form gets the recommended one.
        const { rows } = await zite.sql({ query: `SELECT id FROM "Forms" WHERE "programId" = $1 AND "kind" = 'Application' LIMIT 1`, params: [input.programId] });
        if (rows[0]) throw new ZiteError('Each program has one application form. Add a follow-up form instead, or edit the application form.', 'CONFLICT');
        const starter = starterApplicationForm(str(program.type) || 'Grant');
        const created = await zite.forms.create({
          record: {
            name: input.name?.trim() || 'Application',
            programId: input.programId,
            kind: 'Application',
            description: input.description?.trim() ?? '',
            fields: JSON.stringify(starter.fields),
            titleFieldId: starter.titleFieldId,
            amountFieldId: starter.amountFieldId,
            position: 0,
          },
        });
        const row = await loadRow(created.id);
        if (!row) throw new ZiteError("The form was created but couldn't be read back. Refresh to see it.", 'NOT_FOUND');
        return toOutput(row);
      }
      const starter: StarterKey = input.starter ?? 'blank';
      const name = input.name?.trim() || starterName(starter);
      const fields = input.fields ?? starterFields(starter);
      const checked = checkForm(fields, { kind: 'Follow-up' });
      if (checked.errors.length) throw new ZiteError(firstIssue(checked.errors), 'BAD_REQUEST');
      const created = await zite.forms.create({
        record: {
          name,
          programId: input.programId,
          kind: 'Follow-up',
          description: input.description?.trim() ?? '',
          fields: JSON.stringify(checked.fields),
          titleFieldId: null,
          amountFieldId: null,
          position: await nextPosition(input.programId),
        },
      });
      const row = await loadRow(created.id);
      if (!row) throw new ZiteError("The form was created but couldn't be read back. Refresh to see it.", 'NOT_FOUND');
      return toOutput(row);
    }

    if (!input.id) throw new ZiteError('Which form?', 'BAD_REQUEST');
    const existing = await loadRow(input.id);
    if (!existing) throw new ZiteError('That form no longer exists. It may have been deleted.', 'NOT_FOUND');
    const kind = (str(existing.kind) || 'Application') as FormKind;
    const programId = String(existing.programId ?? '');

    // ── duplicate ─────────────────────────────────────────────────────────
    if (input.action === 'duplicate') {
      const { fields } = cloneFields(parseFields(existing.fields));
      const checked = checkForm(fields, { kind: 'Follow-up' });
      // A copy of a form that was valid stays valid; anything that isn't is repaired by dropping broken references.
      const created = await zite.forms.create({
        record: {
          name: (input.name?.trim() || `${str(existing.name) || 'Form'} (copy)`).slice(0, LIMITS.name),
          programId,
          kind: 'Follow-up',
          description: str(existing.description) ?? '',
          fields: JSON.stringify(checked.errors.length ? fields : checked.fields),
          titleFieldId: null,
          amountFieldId: null,
          position: await nextPosition(programId),
        },
      });
      const row = await loadRow(created.id);
      if (!row) throw new ZiteError("The copy was created but couldn't be read back. Refresh to see it.", 'NOT_FOUND');
      return toOutput(row);
    }

    // ── delete ────────────────────────────────────────────────────────────
    if (input.action === 'delete') {
      if (kind === 'Application') throw new ZiteError("A program's application form can't be deleted. Edit its questions instead.", 'CONFLICT');
      const { rows } = await zite.sql({ query: `SELECT COUNT(*) AS n FROM "Tasks" WHERE "formId" = $1`, params: [input.id] });
      const used = num(rows[0]?.n);
      if (used > 0) {
        throw new ZiteError(
          `${used} ${used === 1 ? 'task uses' : 'tasks use'} “${str(existing.name) || 'this form'}”, so it can't be deleted — their answers depend on its questions. You can still edit it, or duplicate it to start a new version.`,
          'CONFLICT',
        );
      }
      const out = await toOutput(existing);
      await zite.forms.delete({ id: input.id });
      return out;
    }

    // ── update ────────────────────────────────────────────────────────────
    const currentStamp = iso(existing.updated_at);
    if (input.expectedUpdatedAt && currentStamp && input.expectedUpdatedAt !== currentStamp) {
      throw new ZiteError('Someone else saved changes to this form after you opened it.', 'CONFLICT');
    }
    if (input.kind && input.kind !== kind) throw new ZiteError("A form's kind can't be changed.", 'BAD_REQUEST');

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new ZiteError('Give the form a name.', 'BAD_REQUEST');
      patch.name = name;
    }
    if (input.description !== undefined) patch.description = input.description.trim();

    const touchesStructure = input.fields !== undefined || input.titleFieldId !== undefined || input.amountFieldId !== undefined;
    if (touchesStructure) {
      const fields = input.fields ?? parseFields(existing.fields);
      const titleFieldId = input.titleFieldId !== undefined ? input.titleFieldId : ref(existing.titleFieldId);
      const amountFieldId = input.amountFieldId !== undefined ? input.amountFieldId : ref(existing.amountFieldId);
      const checked = checkForm(fields, { kind, titleFieldId, amountFieldId });
      if (checked.errors.length) throw new ZiteError(firstIssue(checked.errors), 'BAD_REQUEST');
      patch.fields = JSON.stringify(checked.fields);
      patch.titleFieldId = checked.titleFieldId;
      patch.amountFieldId = checked.amountFieldId;
    }

    if (Object.keys(patch).length) await zite.forms.update({ id: input.id, record: patch as never });
    const row = await loadRow(input.id);
    return toOutput(row ?? existing);
  },
});
