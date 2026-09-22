import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { saveProfile } from 'zitejs/api';
import { SignInPrompt } from '../components/SignInPrompt';
import { Alert, Button, Card, Container, FieldRow, PageSkeleton, inputClass } from '../components/ui';
import { useSession } from '../lib/auth';
import { errorMessage } from '../lib/errors';
import { qk, useMe } from '../lib/queries';
import { useDocumentTitle } from '../lib/useDocumentTitle';

type Draft = { name: string; phone: string; organization: string; location: string; website: string };

function validate(d: Draft): Partial<Record<keyof Draft, string>> {
  const e: Partial<Record<keyof Draft, string>> = {};
  if (!d.name.trim()) e.name = 'Enter your name.';
  if (d.phone.trim()) {
    const digits = d.phone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) e.phone = 'Enter a phone number with 7 to 15 digits, or leave it blank.';
  }
  if (d.website.trim()) {
    const v = /^https?:\/\//i.test(d.website.trim()) ? d.website.trim() : `https://${d.website.trim()}`;
    try {
      if (!new URL(v).hostname.includes('.')) e.website = 'Enter a full web address, like example.org.';
    } catch {
      e.website = 'Enter a full web address, like example.org.';
    }
  }
  return e;
}

/** Contact details we use to reach you about applications. Email comes from your sign-in. */
export function ProfilePage() {
  const { user, isLoading } = useSession();
  const me = useMe();
  const qc = useQueryClient();
  useDocumentTitle('Profile');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (me.data && !draft) {
      const p = me.data.profile;
      setDraft({ name: p.name ?? '', phone: p.phone ?? '', organization: p.organization ?? '', location: p.location ?? '', website: p.website ?? '' });
    }
  }, [me.data, draft]);

  const save = useMutation({
    mutationFn: (d: Draft) => saveProfile(d),
    onSuccess: saved => {
      qc.invalidateQueries({ queryKey: qk.me });
      setDraft({ name: saved.name, phone: saved.phone, organization: saved.organization, location: saved.location, website: saved.website });
      setAttempted(false);
      toast.success('Profile saved.');
    },
  });

  if (isLoading) return <PageSkeleton variant="form" />;
  if (!user) return <SignInPrompt title="Sign in to see your profile" hashPath="/profile" />;
  if (me.isPending || !draft) {
    if (me.isError) {
      return (
        <Container size="narrow" className="py-10">
          <Alert tone="danger" title="Your profile didn't load" action={<Button variant="secondary" size="sm" onClick={() => me.refetch()}>Try again</Button>}>
            {errorMessage(me.error, 'Check your connection and try again.')}
          </Alert>
        </Container>
      );
    }
    return <PageSkeleton variant="form" />;
  }

  const errors = attempted ? validate(draft) : {};
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value });
  const profile = me.data!.profile;
  const dirty = draft.name !== profile.name || draft.phone !== profile.phone || draft.organization !== profile.organization || draft.location !== profile.location || draft.website !== profile.website;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    const problems = validate(draft);
    const first = (Object.keys(problems) as Array<keyof Draft>)[0];
    if (first) {
      document.getElementById(`profile-${first}`)?.focus();
      return;
    }
    save.mutate(draft);
  };

  const aria = (k: keyof Draft) => ({ 'aria-invalid': Boolean(errors[k]) || undefined, 'aria-describedby': errors[k] ? `profile-${k}-error` : undefined });

  return (
    <div className="pb-16">
      <div className="border-b bg-background">
        <Container size="narrow" className="py-8 sm:py-10">
          <h1 className="font-serif text-3xl font-semibold">Profile</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">How program teams can reach you. We use these details only for your applications.</p>
        </Container>
      </div>
      <Container size="narrow" className="pt-8">
        <Card className="p-5 sm:p-8">
          <form noValidate onSubmit={submit} className="space-y-6">
            <div>
              <p className="text-[15px] font-medium">Email</p>
              <p className="mt-2 flex items-center gap-2 rounded-lg border bg-muted px-3 py-2.5 text-[15px] text-muted-foreground">
                <Mail className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{user.email}</span>
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">This is the email you sign in with, so it can't be changed here.</p>
            </div>
            <FieldRow id="profile-name" label="Full name" error={errors.name}>
              <input id="profile-name" autoComplete="name" className={inputClass()} value={draft.name} onChange={set('name')} maxLength={120} {...aria('name')} />
            </FieldRow>
            <div className="grid gap-6 sm:grid-cols-2">
              <FieldRow id="profile-phone" label="Phone" optional error={errors.phone}>
                <input id="profile-phone" type="tel" inputMode="tel" autoComplete="tel" className={inputClass()} value={draft.phone} onChange={set('phone')} maxLength={40} {...aria('phone')} />
              </FieldRow>
              <FieldRow id="profile-location" label="City and region" optional>
                <input id="profile-location" autoComplete="address-level2" className={inputClass()} value={draft.location} onChange={set('location')} maxLength={200} />
              </FieldRow>
            </div>
            <FieldRow id="profile-organization" label="Organization" optional hint="If you apply on behalf of a nonprofit, school or group.">
              <input id="profile-organization" autoComplete="organization" className={inputClass()} value={draft.organization} onChange={set('organization')} maxLength={200} aria-describedby="profile-organization-hint" />
            </FieldRow>
            <FieldRow id="profile-website" label="Website" optional error={errors.website}>
              <input id="profile-website" type="url" inputMode="url" autoComplete="url" placeholder="example.org" className={inputClass()} value={draft.website} onChange={set('website')} maxLength={500} {...aria('website')} />
            </FieldRow>
            {save.isError && (
              <Alert tone="danger" title="Your profile wasn't saved">
                {errorMessage(save.error, 'Check your connection and try again.')}
              </Alert>
            )}
            <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-end">
              {dirty && (
                <Button variant="ghost" onClick={() => { setDraft({ name: profile.name, phone: profile.phone, organization: profile.organization, location: profile.location, website: profile.website }); setAttempted(false); }}>
                  Discard changes
                </Button>
              )}
              <Button type="submit" size="lg" loading={save.isPending} disabled={!dirty && !save.isError}>
                Save profile
              </Button>
            </div>
          </form>
        </Card>
        <p className="mt-4 text-sm text-muted-foreground">New applications fill in these details for you. Applications you've already submitted keep the details you gave at the time.</p>
      </Container>
    </div>
  );
}
