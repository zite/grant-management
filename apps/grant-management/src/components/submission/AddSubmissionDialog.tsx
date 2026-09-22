import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronDown, FilePlus2, Loader2, PencilLine, Search, Send, UserPlus, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { createSubmission } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Textarea } from '@project/components/ui/textarea';
import { cn } from '@project/components/lib/utils';
import { currencySymbol } from '@project/shared/ui/FormRenderer';
import { useAppActions } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import { shortDate, todayString } from '../../lib/format';
import { MOD, useHotkeys } from '../../lib/hotkeys';
import { refreshEverythingSoon } from '../../lib/mutations';
import { useSearch } from '../../lib/queries';
import { useWorkspace } from '../../lib/workspace';
import { Avatar } from '../primitives/Avatar';
import { Glyph, Kbd } from '../primitives/bits';
import { StageGlyph } from '../primitives/icons';
import { DatePicker, ProgramPicker } from '../pickers/pickers';

type Existing = { id: string; name: string; email: string; organization: string; submissions: number };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const input = 'h-9 w-full rounded-md border border-input bg-background px-3 text-[13px] outline-none transition-colors placeholder:text-muted-foreground focus:border-primary';

/**
 * Staff entering an application that arrived on paper or by email — or
 * starting one for an applicant to finish in the portal.
 */
export function AddSubmissionDialog({ open, onOpenChange, programId }: { open: boolean; onOpenChange: (o: boolean) => void; programId?: string }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const defaultProgram = () => {
    const candidates = [programId, app.contextProgramId].filter(Boolean) as string[];
    const found = candidates.find(id => ws.programById.get(id) && ws.programById.get(id)!.phase !== 'archived');
    return found ?? ws.orderedPrograms.find(p => p.phase === 'open' || p.phase === 'closing')?.id ?? ws.orderedPrograms.find(p => p.phase !== 'archived')?.id ?? null;
  };

  const [program, setProgram] = useState<string | null>(null);
  const [programOpen, setProgramOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Existing | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'Submitted' | 'Draft'>('Submitted');
  const [receivedOn, setReceivedOn] = useState<string | null>(todayString());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProgram(defaultProgram());
    setQuery('');
    setPicked(null);
    setIsNew(false);
    setName('');
    setEmail('');
    setOrganization('');
    setPhone('');
    setTitle('');
    setAmount('');
    setStatus('Submitted');
    setReceivedOn(todayString());
    setNote('');
    setTried(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: results, isFetching } = useSearch(open && !picked && !isNew ? query : '');
  const people = results?.applicants ?? [];
  const p = program ? ws.programById.get(program) : undefined;
  const firstStage = program ? ws.stagesFor(program)[0] : undefined;

  const applicantEmail = picked ? picked.email : email.trim();
  const emailValid = EMAIL_RE.test(applicantEmail);
  const amountValue = amount.trim() === '' ? null : Number(amount.replace(/[^0-9.]/g, ''));
  const problems = useMemo(() => {
    const out: string[] = [];
    if (!program) out.push('Choose a program');
    if (!picked && !isNew) out.push('Choose the applicant, or add someone new');
    if (isNew && !emailValid) out.push('Enter a valid email for the applicant');
    if (amountValue != null && !Number.isFinite(amountValue)) out.push('Enter the amount as a number');
    return out;
  }, [program, picked, isNew, emailValid, amountValue]);

  const startNew = (prefill: string) => {
    setIsNew(true);
    if (EMAIL_RE.test(prefill.trim())) setEmail(prefill.trim());
    else if (prefill.trim()) setName(prefill.trim());
  };

  const submit = async () => {
    setTried(true);
    if (problems.length || busy) return;
    setBusy(true);
    try {
      const res = await createSubmission({
        programId: program!,
        applicant: picked ? { email: picked.email } : { email: email.trim(), name: name.trim() || undefined, organization: organization.trim() || undefined, phone: phone.trim() || undefined },
        title: title.trim() || undefined,
        requestedAmount: amountValue,
        status,
        receivedOn: status === 'Submitted' ? receivedOn : null,
        note: note.trim() || undefined,
      });
      refreshEverythingSoon(qc, 200);
      onOpenChange(false);
      if (res.status === 'Draft') {
        toast.success('Draft started — it’s waiting in their portal');
        app.openPeek(res.id);
      } else {
        toast.success(`Created ${res.reference}${res.assigned ? ` · assigned ${res.assigned} reviewer${res.assigned === 1 ? '' : 's'}` : ''}`);
        navigate(`/submission/${res.reference}`);
      }
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't create the submission"));
    } finally {
      setBusy(false);
    }
  };

  useHotkeys({ 'mod+enter': submit }, { enabled: open, allowInOverlay: true, allowInInputs: ['mod+enter'] });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-xl flex-col gap-0 p-0">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle className="flex items-center gap-2 text-[15px]"><FilePlus2 className="h-4 w-4 text-muted-foreground" /> Add a submission</DialogTitle>
          <DialogDescription className="text-[13px]">For applications that arrived on paper or by email. You can fill in the answers on the next screen.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5">
          <Field label="Program">
            <ProgramPicker
              open={programOpen}
              onOpenChange={setProgramOpen}
              value={program}
              onChange={v => setProgram(v)}
              trigger={
                <button type="button" className={cn(input, 'flex items-center gap-2 text-left', !program && tried && 'border-tone-danger')}>
                  {p ? <Glyph icon={p.icon} color={p.color} size={18} /> : null}
                  <span className={cn('min-w-0 flex-1 truncate', !p && 'text-muted-foreground')}>{p?.name ?? 'Choose a program'}</span>
                  {p && <span className="text-xs text-muted-foreground">{p.key}</span>}
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              }
            />
          </Field>

          <Field label="Applicant">
            {picked ? (
              <div className="flex items-center gap-2.5 rounded-md border bg-subtle px-3 py-2">
                <Avatar name={picked.name} color="#0369a1" size={26} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{picked.name || picked.email}</div>
                  <div className="truncate text-xs text-muted-foreground">{[picked.email, picked.organization].filter(Boolean).join(' · ')}{picked.submissions ? ` · ${picked.submissions} application${picked.submissions === 1 ? '' : 's'}` : ''}</div>
                </div>
                <button type="button" onClick={() => setPicked(null)} className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">Change</button>
              </div>
            ) : isNew ? (
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><UserPlus className="h-3.5 w-3.5" /> New applicant</span>
                  <button type="button" onClick={() => setIsNew(false)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"><Search className="h-3 w-3" /> Search instead</button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Full name" aria-label="Applicant name" className={input} />
                  <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email (required)" aria-label="Applicant email" aria-invalid={tried && !emailValid} className={cn(input, tried && !emailValid && 'border-tone-danger')} />
                  <input value={organization} onChange={e => setOrganization(e.target.value)} placeholder="Organization (optional)" aria-label="Organization" className={input} />
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone (optional)" aria-label="Phone" className={input} />
                </div>
                <p className="text-xs text-muted-foreground">If this email already belongs to an applicant, the submission is added to their account.</p>
              </div>
            ) : (
              <div className={cn('rounded-md border', tried && 'border-tone-danger')}>
                <div className="flex items-center gap-2 px-3">
                  <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <input
                    autoFocus
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search applicants by name, email or organization"
                    aria-label="Search applicants"
                    className="h-9 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
                  />
                  {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  {query && <button type="button" aria-label="Clear" onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
                </div>
                <div className="max-h-52 overflow-y-auto border-t p-1">
                  {query.trim() && people.map(a => (
                    <button key={a.id} type="button" onClick={() => setPicked(a)} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-accent">
                      <Avatar name={a.name} color="#0369a1" size={22} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">{a.name || a.email}</span>
                        <span className="block truncate text-xs text-muted-foreground">{[a.email, a.organization].filter(Boolean).join(' · ')}</span>
                      </span>
                      {a.submissions > 0 && <span className="shrink-0 text-2xs text-muted-foreground">{a.submissions} app{a.submissions === 1 ? '' : 's'}</span>}
                    </button>
                  ))}
                  {query.trim() && !isFetching && people.length === 0 && <div className="px-2 py-2 text-xs text-muted-foreground">No applicant matches “{query.trim()}”.</div>}
                  <button type="button" onClick={() => startNew(query)} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-primary hover:bg-accent">
                    <UserPlus className="h-3.5 w-3.5" /> {query.trim() ? `Add “${query.trim()}” as a new applicant` : 'Someone new'}
                  </button>
                </div>
              </div>
            )}
          </Field>

          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <Field label="Title">
              <input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Murals for Maple Street" className={input} />
            </Field>
            <Field label="Requested amount">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">{currencySymbol(ws.settings.currency)}</span>
                <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0" className={cn(input, 'pl-7 tabular-nums')} />
              </div>
            </Field>
          </div>

          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Where it starts">
            {([
              ['Submitted', 'Put straight into review', firstStage ? `Numbered and placed in ${firstStage.name}` : 'Numbered and added to the pipeline', Send],
              ['Draft', 'Start a draft they finish', `${picked?.name?.split(' ')[0] || name.trim().split(' ')[0] || 'The applicant'} completes it in the portal`, PencilLine],
            ] as const).map(([value, label, hint, Icon]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={status === value}
                onClick={() => setStatus(value)}
                className={cn('rounded-lg border px-3 py-2.5 text-left transition-colors', status === value ? 'border-primary/60 bg-primary/[0.05] ring-1 ring-primary/30' : 'hover:bg-accent')}
              >
                <div className="flex items-center gap-1.5 text-[13px] font-medium"><Icon className="h-3.5 w-3.5 text-muted-foreground" /> {label}</div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  {value === 'Submitted' && firstStage && <StageGlyph kind={firstStage.kind} color={firstStage.color} size={11} />}
                  {hint}
                </div>
              </button>
            ))}
          </div>

          {status === 'Submitted' && (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[13px]">Received</div>
                <div className="text-xs text-muted-foreground">Counts as the submission date, so a postmarked application isn’t marked late.</div>
              </div>
              <DatePicker
                value={receivedOn}
                onChange={v => setReceivedOn(v ?? todayString())}
                presets={false}
                trigger={
                  <button type="button" className="ghost-chip h-8 shrink-0 gap-1.5 border-border">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" /> {receivedOn === todayString() ? 'Today' : shortDate(receivedOn)}
                  </button>
                }
              />
            </div>
          )}

          <Field label="Internal note (optional)">
            <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Where it came from, anything the team should know. Applicants never see notes." className="min-h-[64px] text-[13px]" />
          </Field>

          {tried && problems.length > 0 && <p className="text-[12.5px] text-tone-danger">{problems[0]}.</p>}
        </div>

        <DialogFooter className="items-center border-t px-5 py-3">
          <span className="mr-auto hidden items-center gap-1 text-2xs text-muted-foreground sm:flex"><Kbd>{MOD}</Kbd><Kbd>↵</Kbd> to create</span>
          <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" className="h-8 text-[13px]" disabled={busy} onClick={submit}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {status === 'Draft' ? 'Start draft' : 'Create submission'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
