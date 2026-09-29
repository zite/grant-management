import { useQueryClient } from '@tanstack/react-query';
import { ImageUp, Loader2, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { clearDemoData, saveSettings, seedWorkspace } from 'zitejs/api';
import { uploadFile } from 'zitejs/upload';
import { formatMoney } from '@project/shared/forms/logic';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Textarea } from '@project/components/ui/textarea';
import { useAppActions } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import { qk } from '../../lib/queries';
import type { Bootstrap } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { CURRENCIES } from './constants';
import { RoleChoice } from './RoleChoice';
import {
  EMAIL_RE, Field, Locked, SaveBar, SettingsCard, SettingsPageTitle, SettingsRow, SettingsSection, inputClass, normalizeUrl, selectItemClass, selectTriggerClass, useDraft, useSettingsLock,
} from './ui';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function LogoField() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const lock = useSettingsLock();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [broken, setBroken] = useState<string | null>(null);
  const logo = ws.settings.logoUrl;

  const save = async (logoUrl: string | null, kind: 'upload' | 'remove') => {
    const res = await saveSettings({ logoUrl });
    qc.setQueryData<Bootstrap>(qk.bootstrap, old => (old ? { ...old, settings: { ...old.settings, logoUrl: res.logoUrl } } : old));
    void qc.invalidateQueries({ queryKey: qk.bootstrap });
    toast.success(kind === 'upload' ? 'Logo updated' : 'Logo removed');
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|svg\+xml|webp|gif)$/.test(file.type)) {
      toast.error('Choose a PNG, JPG, SVG or WebP image');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('That image is over 2 MB — try a smaller version');
      return;
    }
    setBusy('upload');
    try {
      const { fileUrl } = await uploadFile({ data: file, filename: file.name });
      await save(fileUrl, 'upload');
      setBroken(null);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't upload the logo"));
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  };

  const showImage = logo && broken !== logo;
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-subtle">
        {showImage ? (
          <img src={logo} alt="Organization logo" className="h-full w-full object-contain" onError={() => setBroken(logo)} />
        ) : (
          <span className="text-[15px] font-semibold text-muted-foreground">{ws.settings.organizationName.trim().charAt(0).toUpperCase() || 'M'}</span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" className="hidden" onChange={e => void onFile(e.target.files?.[0])} />
          <Button type="button" size="sm" variant="outline" disabled={Boolean(busy) || Boolean(lock)} onClick={() => input.current?.click()}>
            {busy === 'upload' ? <Loader2 className="animate-spin" /> : <ImageUp />} {logo ? 'Replace' : 'Upload logo'}
          </Button>
          {logo && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              disabled={Boolean(busy) || Boolean(lock)}
              onClick={async () => {
                setBusy('remove');
                try {
                  await save(null, 'remove');
                } catch (e) {
                  toast.error(errorMessage(e, "Couldn't remove the logo"));
                } finally {
                  setBusy(null);
                }
              }}
            >
              <Trash2 /> Remove
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {logo && broken === logo ? 'The saved logo couldn’t be displayed — upload it again.' : 'Square works best, at least 128 × 128. PNG, JPG, SVG or WebP up to 2 MB.'}
        </p>
      </div>
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The way out of the demo: everything the seed made goes, anything created before or since stays. */
function DemoDataSection({ demo }: { demo: NonNullable<Bootstrap['demo']> }) {
  const qc = useQueryClient();
  const app = useAppActions();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const parts = [plural(demo.programs, 'program'), plural(demo.submissions, 'submission'), plural(demo.applicants, 'applicant'), plural(demo.members, 'demo teammate')];

  const run = async () => {
    const ok = await app.confirm({
      title: 'Remove the demo data?',
      description: `This permanently deletes ${parts.join(', ')}, with their reviews, messages, payments and history. Programs, applicants and people you’ve added yourself stay, as do the email templates and labels. Organization details still showing the demo’s are reset.`,
      confirmLabel: 'Remove demo data',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const pending = toast.loading('Removing the demo…', { description: 'This takes a few seconds.' });
    try {
      const res = await clearDemoData({});
      toast.success('Demo data removed', { id: pending, description: `${res.removed.toLocaleString()} records deleted. Your workspace is ready for your first program.` });
      await qc.invalidateQueries({ queryKey: qk.bootstrap });
      qc.removeQueries({ predicate: q => q.queryKey[0] !== qk.bootstrap[0] });
      navigate('/programs');
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't finish removing the demo"), { id: pending, description: 'Anything already removed stays removed. Run it again to finish.' });
      void qc.invalidateQueries();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection title="Demo data" description="The sample foundation loaded from this page. Remove it when you’re ready to run your own programs.">
      <SettingsCard>
        <SettingsRow label="Riverbend Community Foundation" description={`${parts.join(' · ')}`}>
          <Button type="button" size="sm" variant="outline" className="text-tone-danger hover:text-tone-danger" disabled={busy} onClick={() => void run()}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} Remove demo data…
          </Button>
        </SettingsRow>
      </SettingsCard>
    </SettingsSection>
  );
}

/**
 * Loading the sample by hand. Only offered to admins while no sample is loaded
 * and the workspace has no programs or submissions; the server enforces the same rule.
 */
function SampleDataSection() {
  const qc = useQueryClient();
  const app = useAppActions();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const ok = await app.confirm({
      title: 'Load sample data?',
      description: 'This adds Riverbend Community Foundation, a fictional funder with five programs, 68 submissions, and the reviews, messages, payments and teammates that go with them. Organization details you haven’t set yet take the sample’s. You can remove all of it later from this page.',
      confirmLabel: 'Load sample data',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await seedWorkspace({});
      await qc.invalidateQueries();
      toast.success('Sample data loaded', { description: `${res.submissions} submissions across ${res.programs} programs.` });
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't load the sample data"));
      void qc.invalidateQueries();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-12 border-t pt-5">
      <h3 className="text-[13px] font-medium">Sample data</h3>
      <p className="mt-0.5 text-[13px] text-muted-foreground">Fill this empty workspace with a fictional foundation to see how programs, reviews and awards fit together.</p>
      <Button type="button" size="sm" variant="outline" className="mt-3" disabled={busy} onClick={() => void run()}>
        {busy && <Loader2 className="animate-spin" />} {busy ? 'Loading sample data…' : 'Load sample data…'}
      </Button>
    </section>
  );
}

export function GeneralSettings() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const lock = useSettingsLock();
  const s = ws.settings;
  const { draft, set, reset, dirty, changed } = useDraft({
    organizationName: s.organizationName,
    websiteUrl: s.websiteUrl ?? '',
    supportEmail: s.supportEmail ?? '',
    currency: s.currency,
    emailSignature: s.emailSignature,
    defaultRole: s.defaultRole,
  });
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const website = normalizeUrl(draft.websiteUrl);
  const errors = {
    organizationName: draft.organizationName.trim() ? null : 'Your organization needs a name',
    websiteUrl: website.error,
    supportEmail: draft.supportEmail.trim() && !EMAIL_RE.test(draft.supportEmail.trim()) ? 'Enter a valid email address' : null,
  };
  const invalid = Object.values(errors).some(Boolean);

  const save = async () => {
    setTouched(true);
    if (invalid || saving) return;
    setSaving(true);
    const patch: Parameters<typeof saveSettings>[0] = {};
    for (const key of changed) {
      if (key === 'websiteUrl') patch.websiteUrl = website.url || null;
      else if (key === 'supportEmail') patch.supportEmail = draft.supportEmail.trim() || null;
      else if (key === 'organizationName') patch.organizationName = draft.organizationName.trim();
      else if (key === 'emailSignature') patch.emailSignature = draft.emailSignature;
      else if (key === 'currency') patch.currency = draft.currency;
      else if (key === 'defaultRole') patch.defaultRole = draft.defaultRole;
    }
    try {
      const next = await saveSettings(patch);
      qc.setQueryData<Bootstrap>(qk.bootstrap, old => (old ? { ...old, settings: { ...old.settings, ...next } } : old));
      void qc.invalidateQueries({ queryKey: qk.bootstrap });
      setTouched(false);
      toast.success('Settings saved');
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't save your settings"));
    } finally {
      setSaving(false);
    }
  };

  const example = formatMoney(12500, draft.currency);

  return (
    <>
      <SettingsPageTitle title="General" description="Your organization’s name and branding, where replies go, the currency amounts are shown in, and how new teammates join." />
      <Locked>
        <SettingsSection title="Organization">
          <SettingsCard>
            <SettingsRow label="Name" htmlFor="org-name" description="Shown across the staff app, the applicant portal and every email.">
              <div className="w-full">
                <Input id="org-name" value={draft.organizationName} maxLength={120} onChange={e => set({ organizationName: e.target.value })} className={inputClass} />
                {errors.organizationName && <p className="mt-1 text-xs text-tone-danger">{errors.organizationName}</p>}
              </div>
            </SettingsRow>
            <SettingsRow label="Logo" description="Appears in the sidebar, at the top of the portal and in email headers." stacked>
              <LogoField />
            </SettingsRow>
            <SettingsRow label="Website" htmlFor="org-website" description="Linked from the applicant portal.">
              <div className="w-full">
                <Input
                  id="org-website"
                  value={draft.websiteUrl}
                  inputMode="url"
                  placeholder="riverbend.org"
                  onChange={e => set({ websiteUrl: e.target.value })}
                  onBlur={() => website.url && !website.error && website.url !== draft.websiteUrl && set({ websiteUrl: website.url })}
                  className={inputClass}
                />
                {(touched || draft.websiteUrl.length > 4) && errors.websiteUrl && <p className="mt-1 text-xs text-tone-danger">{errors.websiteUrl}</p>}
              </div>
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>

        <SettingsSection title="Email" description="How messages to applicants and reviewers are signed, and where their replies land.">
          <SettingsCard>
            <SettingsRow label="Support email" htmlFor="org-support" description="Used as the reply-to address, so replies to any email this app sends reach your team.">
              <div className="w-full">
                <Input id="org-support" type="email" value={draft.supportEmail} placeholder="grants@example.org" onChange={e => set({ supportEmail: e.target.value })} className={inputClass} />
                {(touched || draft.supportEmail.includes('@')) && errors.supportEmail && <p className="mt-1 text-xs text-tone-danger">{errors.supportEmail}</p>}
              </div>
            </SettingsRow>
            <SettingsRow label="Email signature" htmlFor="org-signature" description="Added below a divider at the end of every email to applicants." stacked>
              <Textarea
                id="org-signature"
                value={draft.emailSignature}
                maxLength={1000}
                rows={4}
                placeholder={'Riverbend Community Foundation\n214 Water Street, Riverbend'}
                onChange={e => set({ emailSignature: e.target.value })}
                className="resize-y text-[13px] leading-relaxed md:text-[13px]"
              />
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>

        <SettingsSection title="Money">
          <SettingsCard>
            <SettingsRow label="Currency" htmlFor="org-currency" description={<>Requests, awards, budgets and payments are shown in this currency — for example <span className="font-medium text-foreground tabular-nums">{example}</span>. Amounts aren’t converted.</>}>
              <Select value={draft.currency} onValueChange={v => set({ currency: v })}>
                <SelectTrigger id="org-currency" className={selectTriggerClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => (
                    <SelectItem key={c.code} value={c.code} className={selectItemClass}>
                      <span className="inline-block w-10 font-medium tabular-nums">{c.code}</span>
                      <span className="text-muted-foreground">{c.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>

        <SettingsSection title="New teammates" description="When someone in your Zite organization opens this app without an invitation, they join with this role. Invitations always use the role you choose.">
          <Field label="Default role">
            <RoleChoice value={draft.defaultRole} onChange={r => r !== 'Admin' && set({ defaultRole: r })} roles={['Manager', 'Reviewer']} disabled={Boolean(lock)} name="Default role" />
          </Field>
        </SettingsSection>
      </Locked>
      {ws.isAdmin && ws.demo && <DemoDataSection demo={ws.demo} />}
      {ws.isAdmin && !ws.demo && ws.canLoadSample && <SampleDataSection />}
      <SaveBar dirty={dirty} saving={saving} disabled={invalid} onSave={() => void save()} onDiscard={() => { reset(); setTouched(false); }} />
    </>
  );
}
