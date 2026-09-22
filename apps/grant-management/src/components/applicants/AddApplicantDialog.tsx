import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { saveApplicant } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Input } from '@project/components/ui/input';
import { errorMessage } from '../../lib/errors';
import { qk } from '../../lib/queries';
import { EMAIL_RE } from './applicantData';

function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string | null; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium">{label}</label>
      {children}
      {error ? <p className="text-xs text-tone-danger">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function AddApplicantDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', organization: '', phone: '' });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm({ name: '', email: '', organization: '', phone: '' });
      setTouched(false);
      setServerError(null);
    }
  }, [open]);

  const nameError = !form.name.trim() ? 'Enter their name' : null;
  const emailError = !EMAIL_RE.test(form.email.trim()) ? 'Enter a valid email address' : null;

  const submit = async () => {
    setTouched(true);
    if (nameError || emailError || saving) return;
    setSaving(true);
    setServerError(null);
    try {
      const res = await saveApplicant({ action: 'create', name: form.name.trim(), email: form.email.trim(), organization: form.organization.trim() || null, phone: form.phone.trim() || null });
      await qc.invalidateQueries({ queryKey: qk.applicantsRoot });
      toast.success(`Added ${form.name.trim()}`);
      onOpenChange(false);
      navigate(`/applicants/${res.id}`);
    } catch (e) {
      setServerError(errorMessage(e, "Couldn't add the applicant"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-5">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Add an applicant</DialogTitle>
          <DialogDescription className="text-[13px]">
            For someone applying on paper or by email. When they sign in to the portal with this address, they’ll see everything filed for them.
          </DialogDescription>
        </DialogHeader>
        <form
          id="add-applicant"
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Name" htmlFor="applicant-name" error={touched ? nameError : null}>
            <Input id="applicant-name" autoFocus value={form.name} maxLength={160} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jordan Rivera" className="h-8 text-[13px] md:text-[13px]" />
          </Field>
          <Field label="Email" htmlFor="applicant-email" error={(touched && emailError) || serverError}>
            <Input id="applicant-email" type="email" value={form.email} maxLength={254} onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setServerError(null); }} placeholder="jordan@example.org" className="h-8 text-[13px] md:text-[13px]" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Organization" htmlFor="applicant-org" hint="Optional">
              <Input id="applicant-org" value={form.organization} maxLength={200} onChange={e => setForm(f => ({ ...f, organization: e.target.value }))} className="h-8 text-[13px] md:text-[13px]" />
            </Field>
            <Field label="Phone" htmlFor="applicant-phone" hint="Optional">
              <Input id="applicant-phone" type="tel" value={form.phone} maxLength={60} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="h-8 text-[13px] md:text-[13px]" />
            </Field>
          </div>
        </form>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="add-applicant" size="sm" disabled={saving}>
            {saving ? 'Adding…' : 'Add applicant'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
