import { ImageOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { saveProgram } from 'zitejs/api';
import { Input } from '@project/components/ui/input';
import { Switch } from '@project/components/ui/switch';
import { Textarea } from '@project/components/ui/textarea';
import { longDate } from '../../../lib/format';
import type { Program } from '../../../lib/types';
import { DateTimeInput, Field, PageTitle, SaveBar, SettingsCard, SettingsRow, SettingsSection, TimeZoneNote, inputClass, textareaClass, useUnloadGuard } from '../fields';
import { MarkdownEditor } from '../MarkdownEditor';
import { useProgramDetails, useProgramMutation } from '../programData';
import { SettingsSkeleton } from './GeneralSettings';
import { useReportDirty } from './ProgramSettings';
import { useDraft } from './useDraft';

type AppDraft = {
  description: string;
  eligibility: string;
  confirmationMessage: string;
  coverImageUrl: string;
  opensAt: string | null;
  deadline: string | null;
  rolling: boolean;
  allowLate: boolean;
  maxPerApplicant: number;
};

function CoverPreview({ url }: { url: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!url.trim() || !/^https?:\/\//.test(url)) return null;
  if (failed === url) {
    return (
      <div className="flex h-24 items-center justify-center gap-2 rounded-md border border-dashed text-xs text-muted-foreground">
        <ImageOff className="h-4 w-4" /> That address didn’t load an image
      </div>
    );
  }
  return <img src={url} alt="" onError={() => setFailed(url)} className="h-28 w-full rounded-md border object-cover" />;
}

export function ApplicationSettings({ program }: { program: Program }) {
  const run = useProgramMutation();
  const { data: details } = useProgramDetails(program.id);
  const source = useMemo<AppDraft | undefined>(
    () =>
      details && {
        description: details.description,
        eligibility: details.eligibility,
        confirmationMessage: details.confirmationMessage,
        coverImageUrl: details.coverImageUrl ?? '',
        opensAt: details.opensAt,
        deadline: details.deadline,
        rolling: !details.deadline,
        allowLate: details.allowLate,
        maxPerApplicant: details.maxPerApplicant,
      },
    [details],
  );
  const { draft, dirty, set, reset, changes, commit } = useDraft(source);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  useReportDirty('application', dirty);
  useUnloadGuard(dirty);

  if (!draft || !details) return <SettingsSkeleton />;

  const errors = {
    deadline: !draft.rolling && !draft.deadline ? 'Choose a deadline, or switch on rolling applications' : draft.deadline && draft.opensAt && Date.parse(draft.deadline) <= Date.parse(draft.opensAt) ? 'The deadline has to be after the program opens' : null,
    cover: draft.coverImageUrl.trim() && !/^https:\/\/\S+$/.test(draft.coverImageUrl.trim()) ? 'Use a full image address starting with https://' : null,
    max: !Number.isInteger(draft.maxPerApplicant) || draft.maxPerApplicant < 1 || draft.maxPerApplicant > 100 ? 'Between 1 and 100' : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const deadlinePast = !draft.rolling && draft.deadline && Date.parse(draft.deadline) < Date.now();

  const save = async () => {
    setShowErrors(true);
    if (invalid) return;
    const patch = changes();
    delete patch.rolling;
    const deadline = draft.rolling ? null : draft.deadline;
    const payload: Record<string, unknown> = { ...patch };
    if (deadline !== details.deadline) payload.deadline = deadline;
    else delete payload.deadline;
    if (patch.coverImageUrl !== undefined) payload.coverImageUrl = draft.coverImageUrl.trim() || null;
    if (!Object.keys(payload).length) {
      commit();
      return;
    }
    setSaving(true);
    const res = await run(() => saveProgram({ action: 'update', id: program.id, ...payload }), { success: 'Saved the application page', error: "Couldn't save the application page" });
    setSaving(false);
    if (res) {
      commit();
      setShowErrors(false);
    }
  };

  return (
    <div>
      <PageTitle title="Application page" description="What applicants read before they apply, when the program accepts applications, and what they see once they submit." />

      <SettingsSection title="Dates" description={<TimeZoneNote />}>
        <SettingsCard>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Opens" htmlFor="ap-opens" hint={draft.opensAt ? `Applicants can start from ${longDate(draft.opensAt)}.` : 'Empty means it opens as soon as it’s published.'}>
              <DateTimeInput id="ap-opens" value={draft.opensAt} onChange={v => set({ opensAt: v })} defaultTime="09:00" aria-label="Opens" />
            </Field>
            <Field label="Deadline" htmlFor="ap-deadline" error={showErrors || draft.deadline ? errors.deadline : null} hint={draft.rolling ? 'Rolling — applications stay open until you close them.' : deadlinePast ? 'This date has passed, so the program shows as closed.' : undefined}>
              <DateTimeInput id="ap-deadline" value={draft.rolling ? null : draft.deadline} onChange={v => set({ deadline: v })} defaultTime="23:59" disabled={draft.rolling} aria-label="Deadline" />
            </Field>
          </div>
          <SettingsRow label="Rolling applications" description="No deadline. Submissions are reviewed as they arrive." htmlFor="ap-rolling">
            <Switch id="ap-rolling" checked={draft.rolling} onCheckedChange={v => set({ rolling: v, ...(v ? {} : { deadline: draft.deadline ?? details.deadline }) })} />
          </SettingsRow>
          <SettingsRow label="Allow late submissions" description="After the deadline, applicants can still submit; their submissions are marked late." htmlFor="ap-late">
            <Switch id="ap-late" checked={draft.allowLate} disabled={draft.rolling} onCheckedChange={v => set({ allowLate: v })} />
          </SettingsRow>
          <SettingsRow label="Applications per applicant" description="How many submissions one person can make to this program." htmlFor="ap-max">
            <div className="flex flex-col items-end gap-1">
              <Input
                id="ap-max"
                type="number"
                min={1}
                max={100}
                value={Number.isFinite(draft.maxPerApplicant) ? draft.maxPerApplicant : ''}
                onChange={e => set({ maxPerApplicant: e.target.value === '' ? Number.NaN : Math.round(Number(e.target.value)) })}
                className={`${inputClass} w-20 text-right tabular-nums`}
              />
              {errors.max && <span className="text-xs text-tone-danger">{errors.max}</span>}
            </div>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Description" description="The main text of the program’s page in the portal: what you fund, how decisions are made, who to ask.">
        <MarkdownEditor id="ap-description" value={draft.description} onChange={v => set({ description: v })} rows={14} maxLength={20000} placeholder={'## What we fund\n\n- …\n\n## How decisions are made\n\n…'} />
      </SettingsSection>

      <SettingsSection title="Eligibility" description="Who can apply. Shown next to the description, before anyone starts.">
        <MarkdownEditor id="ap-eligibility" value={draft.eligibility} onChange={v => set({ eligibility: v })} rows={6} maxLength={10000} placeholder={'- Nonprofits and community groups\n- Projects in …'} />
      </SettingsSection>

      <SettingsSection title="After submitting">
        <div className="grid gap-4 rounded-lg border bg-background p-4 lg:grid-cols-2">
          <Field label="Confirmation message" htmlFor="ap-confirm" hint="Shown on screen right after an applicant submits. The confirmation email is set in Emails.">
            <Textarea id="ap-confirm" value={draft.confirmationMessage} rows={4} maxLength={2000} onChange={e => set({ confirmationMessage: e.target.value })} className={textareaClass} />
          </Field>
          <Field label="Cover image" htmlFor="ap-cover" error={errors.cover} hint={errors.cover ? undefined : 'An image address for the top of the program page. Wide images work best.'}>
            <Input id="ap-cover" value={draft.coverImageUrl} onChange={e => set({ coverImageUrl: e.target.value })} placeholder="https://…" className={inputClass} />
            <CoverPreview url={draft.coverImageUrl} />
          </Field>
        </div>
      </SettingsSection>

      <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => { reset(); setShowErrors(false); }} message={invalid && showErrors ? 'Fix the highlighted fields to save' : 'You have unsaved changes'} />
    </div>
  );
}
