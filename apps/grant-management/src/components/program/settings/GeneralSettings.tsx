import { AlertTriangle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { saveProgram } from 'zitejs/api';
import { Input } from '@project/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Textarea } from '@project/components/ui/textarea';
import { cn } from '@project/components/lib/utils';
import { PROGRAM_KEY_PATTERN, PROGRAM_TYPE_ABOUT } from '@project/shared/programSetup';
import { PROGRAM_TYPES } from '@project/shared/status';
import { currencySymbol } from '@project/shared/ui/FormRenderer';
import { PROGRAM_COLORS, PROGRAM_ICONS } from '../../../lib/constants';
import { plural } from '../../../lib/format';
import type { Program } from '../../../lib/types';
import { useWorkspace } from '../../../lib/workspace';
import { MemberAvatar } from '../../primitives/Avatar';
import { Glyph } from '../../primitives/bits';
import { Field, IconColorPopover, MoneyInput, PageTitle, SaveBar, SettingsSection, inputClass, selectItemClass, selectTriggerClass, textareaClass, useUnloadGuard } from '../fields';
import { totalSubmissions } from '../ProgramActions';
import { useProgramDetails, useProgramMutation } from '../programData';
import { useReportDirty } from './ProgramSettings';
import { useDraft } from './useDraft';

type GeneralDraft = {
  name: string;
  key: string;
  type: string;
  summary: string;
  ownerId: string | null;
  icon: string;
  color: string;
  budget: number | null;
  awardMin: number | null;
  awardMax: number | null;
  contactEmail: string;
};

export function SettingsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-6 w-48" />
      <div className="skeleton h-4 w-80" />
      <div className="skeleton mt-6 h-[220px] w-full rounded-lg" />
      <div className="skeleton h-[160px] w-full rounded-lg" />
    </div>
  );
}

export function GeneralSettings({ program }: { program: Program }) {
  const ws = useWorkspace();
  const run = useProgramMutation();
  const { data: details } = useProgramDetails(program.id);
  const source = useMemo<GeneralDraft | undefined>(
    () =>
      details && {
        name: details.name,
        key: details.key,
        type: details.type,
        summary: details.summary,
        ownerId: details.ownerId,
        icon: details.icon,
        color: details.color,
        budget: details.budget,
        awardMin: details.awardMin,
        awardMax: details.awardMax,
        contactEmail: details.contactEmail ?? '',
      },
    [details],
  );
  const { draft, dirty, set, reset, changes, commit } = useDraft(source);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  useReportDirty('general', dirty);
  useUnloadGuard(dirty);

  if (!draft || !details) return <SettingsSkeleton />;

  const keyTaken = ws.programByKey.get(draft.key);
  const errors = {
    name: !draft.name.trim() ? 'Name the program' : null,
    key: !PROGRAM_KEY_PATTERN.test(draft.key) ? 'Use 2–8 letters or digits' : keyTaken && keyTaken.id !== program.id ? `${keyTaken.name} already uses ${draft.key}` : null,
    award: draft.awardMin != null && draft.awardMax != null && draft.awardMin > draft.awardMax ? 'The smallest award can’t be larger than the largest' : null,
    email: draft.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contactEmail.trim()) ? 'Use a valid email address' : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const total = totalSubmissions(program);
  const keyChanged = draft.key !== details.key;
  const symbol = currencySymbol(ws.settings.currency);
  const owners = ws.managers;

  const save = async () => {
    setShowErrors(true);
    if (invalid) return;
    const patch = changes();
    if (!Object.keys(patch).length) return;
    setSaving(true);
    const res = await run(
      () =>
        saveProgram({
          action: 'update',
          id: program.id,
          ...patch,
          ...(patch.name !== undefined ? { name: draft.name.trim() } : {}),
          ...(patch.contactEmail !== undefined ? { contactEmail: draft.contactEmail.trim() || null } : {}),
          ...(patch.summary !== undefined ? { summary: draft.summary.trim() || null } : {}),
        }),
      { success: 'Saved general settings', error: "Couldn't save the program", submissions: keyChanged },
    );
    setSaving(false);
    if (res) {
      commit();
      setShowErrors(false);
    }
  };

  const err = (k: keyof typeof errors) => (showErrors || k === 'key' || k === 'award' ? errors[k] : null);

  return (
    <div>
      <PageTitle title="General" description="What the program is called, how its references look, who owns it and how much it can award." />

      <SettingsSection title="Identity">
        <div className="space-y-4 rounded-lg border bg-background p-4">
          <div className="flex items-end gap-3">
            <Field label="Icon" className="shrink-0">
              <IconColorPopover icon={draft.icon} color={draft.color} icons={PROGRAM_ICONS} colors={PROGRAM_COLORS} onChange={next => set(next)}>
                <button type="button" aria-label="Change icon and colour" className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background shadow-xs hover:bg-accent">
                  <Glyph icon={draft.icon} color={draft.color} size={22} />
                </button>
              </IconColorPopover>
            </Field>
            <Field label="Name" htmlFor="pg-name" error={err('name')} className="flex-1">
              <Input id="pg-name" value={draft.name} maxLength={120} onChange={e => set({ name: e.target.value })} className={inputClass} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
            <Field label="Key" htmlFor="pg-key" error={err('key')} hint={!keyChanged ? `References like ${draft.key}-12` : undefined}>
              <Input
                id="pg-key"
                value={draft.key}
                maxLength={8}
                onChange={e => set({ key: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) })}
                className={cn(inputClass, 'font-mono uppercase tracking-wide')}
              />
            </Field>
            <Field label="Type" htmlFor="pg-type" hint={PROGRAM_TYPE_ABOUT[draft.type]}>
              <Select value={draft.type} onValueChange={v => set({ type: v })}>
                <SelectTrigger id="pg-type" className={selectTriggerClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROGRAM_TYPES.map(t => (
                    <SelectItem key={t} value={t} className={selectItemClass}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {keyChanged && total > 0 && !errors.key && (
            <div className="flex gap-2 rounded-md border border-tone-warning/30 bg-tone-warning/[0.06] px-3 py-2 text-xs">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-tone-warning" />
              <span>
                {plural(total, 'submission')} will change reference from <span className="font-mono">{details.key}-1</span> to <span className="font-mono">{draft.key}-1</span> and so on — in lists, the portal and future emails. Links people saved with the old reference will stop working, and emails already sent keep the old one.
              </span>
            </div>
          )}

          <Field label="Summary" htmlFor="pg-summary" hint={`${draft.summary.length}/300 · Shown on program cards and at the top of the portal page.`}>
            <Textarea id="pg-summary" value={draft.summary} maxLength={300} rows={2} onChange={e => set({ summary: e.target.value })} className={textareaClass} placeholder="One or two sentences on what this program funds and who it’s for." />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection title="Ownership" description="The owner hears about new submissions and is the default contact for the team.">
        <div className="grid gap-4 rounded-lg border bg-background p-4 sm:grid-cols-2">
          <Field label="Owner" htmlFor="pg-owner">
            <Select value={draft.ownerId ?? '__none__'} onValueChange={v => set({ ownerId: v === '__none__' ? null : v })}>
              <SelectTrigger id="pg-owner" className={cn(selectTriggerClass, '[&>span]:flex [&>span]:items-center [&>span]:gap-2')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className={selectItemClass}>
                  No owner — admins are notified
                </SelectItem>
                {owners.map(m => (
                  <SelectItem key={m.id} value={m.id} className={selectItemClass}>
                    <span className="flex items-center gap-2">
                      <MemberAvatar member={m} size={16} /> {m.id === ws.me.id ? `${m.name} (you)` : m.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Contact email" htmlFor="pg-contact" error={err('email')} hint="Shown to applicants with questions.">
            <Input id="pg-contact" type="email" value={draft.contactEmail} onChange={e => set({ contactEmail: e.target.value })} placeholder={ws.settings.supportEmail ?? 'grants@example.org'} className={inputClass} />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection title="Budget and awards" description="The budget is what the overview measures awards against. The award range is shown to applicants.">
        <div className="grid gap-4 rounded-lg border bg-background p-4 sm:grid-cols-3">
          <Field label="Total budget" htmlFor="pg-budget" hint="Leave empty if there isn’t one.">
            <MoneyInput id="pg-budget" value={draft.budget} onChange={v => set({ budget: v })} symbol={symbol} placeholder="150,000" />
          </Field>
          <Field label="Smallest award" htmlFor="pg-min" error={errors.award}>
            <MoneyInput id="pg-min" value={draft.awardMin} onChange={v => set({ awardMin: v })} symbol={symbol} placeholder="500" />
          </Field>
          <Field label="Largest award" htmlFor="pg-max">
            <MoneyInput id="pg-max" value={draft.awardMax} onChange={v => set({ awardMax: v })} symbol={symbol} placeholder="10,000" />
          </Field>
        </div>
      </SettingsSection>

      <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => { reset(); setShowErrors(false); }} message={invalid && showErrors ? 'Fix the highlighted fields to save' : 'You have unsaved changes'} />
    </div>
  );
}
