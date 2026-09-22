import { useQueryClient } from '@tanstack/react-query';
import { Keyboard, Laptop, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { saveMember } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { cn } from '@project/components/lib/utils';
import { useAppActions } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import { MOD } from '../../lib/hotkeys';
import { qk } from '../../lib/queries';
import { useTheme, type ThemePref } from '../../lib/theme';
import type { Bootstrap } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Avatar } from '../primitives/Avatar';
import { Kbd } from '../primitives/bits';
import { ROLE_INFO } from './RoleChoice';
import { Field, SaveBar, SettingsCard, SettingsPageTitle, SettingsRow, SettingsSection, inputClass, useDraft } from './ui';

const THEMES: Array<{ value: ThemePref; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Laptop },
];

/** A tiny drawing of the app in each theme, pinned to that theme regardless of the current one. */
function ThemeSwatch({ tone }: { tone: 'light' | 'dark' }) {
  const c = tone === 'light'
    ? { canvas: '#f4f4f5', panel: '#ffffff', line: '#e4e4e7', ink: '#27272a', soft: '#a1a1aa' }
    : { canvas: '#0e0e10', panel: '#18181b', line: '#27272a', ink: '#e4e4e7', soft: '#52525b' };
  return (
    <div className="absolute inset-0 flex gap-1.5 p-1.5" style={{ background: c.canvas }}>
      <div className="flex w-[28%] flex-col gap-1.5 px-1 pt-1.5">
        <div className="h-1.5 w-4/5 rounded-full" style={{ background: c.ink, opacity: 0.35 }} />
        <div className="h-1.5 w-3/5 rounded-full" style={{ background: c.soft, opacity: 0.5 }} />
        <div className="h-1.5 w-2/3 rounded-full" style={{ background: c.soft, opacity: 0.5 }} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 rounded-[5px] p-2" style={{ background: c.panel, border: `1px solid ${c.line}` }}>
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#6943d0]" />
          <div className="h-1.5 w-1/2 rounded-full" style={{ background: c.ink, opacity: 0.4 }} />
        </div>
        <div className="h-1.5 w-5/6 rounded-full" style={{ background: c.soft, opacity: 0.45 }} />
        <div className="h-1.5 w-2/3 rounded-full" style={{ background: c.soft, opacity: 0.45 }} />
        <div className="mt-auto h-2.5 w-1/3 rounded-sm bg-[#6943d0]" />
      </div>
    </div>
  );
}

export function ProfileSettings() {
  const ws = useWorkspace();
  const app = useAppActions();
  const qc = useQueryClient();
  const { pref, resolved, setPref } = useTheme();
  const member = ws.memberById.get(ws.me.id);
  const role = ws.me.role;
  const { draft, set, reset, dirty } = useDraft({ name: member?.name ?? ws.me.name, title: member?.title ?? '', expertise: member?.expertise ?? '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!draft.name.trim() || saving) return;
    setSaving(true);
    const patch = { name: draft.name.trim(), title: draft.title.trim() || null, expertise: draft.expertise.trim() || null };
    try {
      await saveMember({ action: 'updateProfile', ...patch });
      qc.setQueryData<Bootstrap>(qk.bootstrap, old =>
        old ? { ...old, me: { ...old.me, name: patch.name }, members: old.members.map(m => (m.id === ws.me.id ? { ...m, ...patch } : m)) } : old,
      );
      void qc.invalidateQueries({ queryKey: qk.bootstrap });
      toast.success('Profile updated');
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't update your profile"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsPageTitle title="Profile" description="How you appear to your team, and how this app looks on this device." />

      <SettingsSection title="You">
        <SettingsCard>
          <form
            id="profile-form"
            className="flex flex-col gap-5 p-4 sm:flex-row"
            onSubmit={e => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="flex items-center gap-3 sm:w-40 sm:shrink-0 sm:flex-col sm:items-start">
              <Avatar name={draft.name.trim() || ws.me.name} src={member?.avatarUrl} color={member?.color} size={56} />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium">{draft.name.trim() || ws.me.name}</div>
                <div className="truncate text-xs text-muted-foreground">{draft.title.trim() || 'No title'}</div>
              </div>
            </div>
            <div className="grid flex-1 content-start gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="profile-name" error={draft.name.trim() ? null : 'Your name can’t be empty'}>
                <Input id="profile-name" value={draft.name} maxLength={120} autoComplete="name" onChange={e => set({ name: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Title" htmlFor="profile-title">
                <Input id="profile-title" value={draft.title} maxLength={120} placeholder="Program officer" onChange={e => set({ title: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Expertise" htmlFor="profile-expertise" className="sm:col-span-2" hint={role === 'Reviewer' ? 'Helps managers match you with the right applications.' : 'Shown when your team picks reviewers.'}>
                <Input id="profile-expertise" value={draft.expertise} maxLength={300} placeholder="Public art, youth programs, budgets" onChange={e => set({ expertise: e.target.value })} className={inputClass} />
              </Field>
            </div>
          </form>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Account">
        <SettingsCard>
          <SettingsRow label="Email" description="Comes from how you sign in, so it can’t be changed here.">
            <span className="truncate text-[13px] text-muted-foreground">{ws.me.email}</span>
          </SettingsRow>
          <SettingsRow label="Role" description={ROLE_INFO[role].detail}>
            <span className="rounded-md bg-muted px-2 py-0.5 text-[12.5px] font-medium">{role}</span>
          </SettingsRow>
        </SettingsCard>
        <p className="mt-2 px-1 text-xs text-muted-foreground">{role === 'Admin' ? 'Another admin can change your role.' : 'Ask an admin if you need a different role.'}</p>
      </SettingsSection>

      <SettingsSection title="Appearance" description={`Choose how this app looks on this device.${pref === 'system' ? ` Following your system — currently ${resolved}.` : ''}`}>
        <div className="grid grid-cols-3 gap-3 sm:gap-4" role="radiogroup" aria-label="Theme">
          {THEMES.map(t => {
            const on = pref === t.value;
            return (
              <button key={t.value} type="button" role="radio" aria-checked={on} onClick={() => setPref(t.value)} className="group min-w-0 text-left outline-none">
                <div className={cn('relative h-[72px] overflow-hidden rounded-lg border transition-[box-shadow,border-color] sm:h-[92px]', on ? 'border-transparent ring-2 ring-primary ring-offset-2 ring-offset-background' : 'group-hover:border-foreground/25 group-focus-visible:ring-2 group-focus-visible:ring-ring')}>
                  {t.value === 'system' ? (
                    <>
                      <div className="absolute inset-0" style={{ clipPath: 'polygon(0 0, 62% 0, 38% 100%, 0 100%)' }}><ThemeSwatch tone="light" /></div>
                      <div className="absolute inset-0" style={{ clipPath: 'polygon(62% 0, 100% 0, 100% 100%, 38% 100%)' }}><ThemeSwatch tone="dark" /></div>
                    </>
                  ) : (
                    <ThemeSwatch tone={t.value} />
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2 text-[13px]">
                  <t.icon className={cn('h-3.5 w-3.5', on ? 'text-primary' : 'text-muted-foreground')} />
                  <span className={cn('truncate', on && 'font-medium')}>{t.label}</span>
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">Switch any time with <Kbd>{MOD}</Kbd><Kbd>⇧</Kbd><Kbd>L</Kbd></p>
      </SettingsSection>

      <SettingsSection title="Keyboard">
        <SettingsCard>
          <SettingsRow label="Keyboard shortcuts" description={<>Almost everything has one. Press <Kbd>?</Kbd> anywhere to see them.</>}>
            <Button variant="outline" size="sm" onClick={() => app.openShortcuts()}>
              <Keyboard /> View shortcuts
            </Button>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SaveBar dirty={dirty} saving={saving} disabled={!draft.name.trim()} onSave={() => void save()} onDiscard={reset} />
    </>
  );
}
