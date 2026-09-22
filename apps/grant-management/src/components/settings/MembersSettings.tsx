import { ChevronDown, Info, Mail, MoreHorizontal, Pencil, Search, Send, UserCheck, UserMinus, UserPlus, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { saveMember } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { Input } from '@project/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Textarea } from '@project/components/ui/textarea';
import { cn } from '@project/components/lib/utils';
import { useAppActions } from '../../lib/app-actions';
import { timeAgo } from '../../lib/format';
import type { Bootstrap, Member } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { OptionPicker, type Option } from '../pickers/OptionPicker';
import { MemberAvatar } from '../primitives/Avatar';
import { EmptyState, Glyph, IconButton, Tip } from '../primitives/bits';
import { ROLE_INFO, RoleChoice, type Role } from './RoleChoice';
import { EMAIL_RE, Field, FilterPills, Locked, SettingsCard, SettingsPageTitle, inputClass, selectItemClass, useSettingsLock, useSettingsMutation } from './ui';

type Filter = 'all' | 'Admin' | 'Manager' | 'Reviewer' | 'Invited' | 'Deactivated';
const ROLES: Role[] = ['Admin', 'Manager', 'Reviewer'];
const asRole = (r: string): Role => (r === 'Admin' || r === 'Reviewer' ? r : 'Manager');

const patchMember = (id: string, patch: Partial<Member>) => (data: Bootstrap): Bootstrap => ({ ...data, members: data.members.map(m => (m.id === id ? { ...m, ...patch } : m)) });

function StatusChip({ status }: { status: string }) {
  const cls = status === 'Invited' ? 'bg-tone-warning/[0.1] text-tone-warning' : status === 'Deactivated' ? 'bg-muted text-muted-foreground' : 'bg-tone-success/[0.1] text-tone-success';
  return <span className={cn('inline-flex h-5 items-center rounded-full px-1.5 text-2xs font-medium', cls)}>{status}</span>;
}

/** The programs whose reviewer pool someone is in, as a field-like picker. */
function ProgramsField({ value, onChange, id }: { value: string[]; onChange: (ids: string[]) => void; id?: string }) {
  const ws = useWorkspace();
  const options: Option<string>[] = ws.orderedPrograms.filter(p => p.phase !== 'archived' || value.includes(p.id)).map(p => ({ value: p.id, label: p.name, icon: <Glyph icon={p.icon} color={p.color} size={16} />, hint: p.key, keywords: [p.key] }));
  const chosen = value.map(v => ws.programById.get(v)).filter(Boolean);
  return (
    <OptionPicker
      multiple
      value={value}
      onChange={onChange}
      options={options}
      placeholder="Add to reviewer pools…"
      width={300}
      trigger={
        <button id={id} type="button" className="flex min-h-8 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-1.5 py-1 text-left text-[13px] shadow-sm transition-colors hover:bg-accent/50 data-[state=open]:ring-1 data-[state=open]:ring-ring">
          {chosen.length === 0 ? (
            <span className="px-1 text-muted-foreground">No programs</span>
          ) : (
            chosen.map(p => (
              <span key={p!.id} className="chip h-[22px] gap-1 bg-background px-1.5 text-xs">
                <Glyph icon={p!.icon} color={p!.color} size={13} />
                {p!.name}
              </span>
            ))
          )}
          <ChevronDown className="ml-auto mr-0.5 h-4 w-4 shrink-0 opacity-50" />
        </button>
      }
    />
  );
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const ws = useWorkspace();
  const run = useSettingsMutation();
  const [form, setForm] = useState({ name: '', email: '', role: ws.settings.defaultRole as Role, programIds: [] as string[], note: '' });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ name: '', email: '', role: ws.settings.defaultRole, programIds: [], note: '' });
      setTouched(false);
    }
  }, [open]);

  const existing = ws.members.find(m => m.email.toLowerCase() === form.email.trim().toLowerCase());
  const errors = {
    name: form.name.trim() ? null : 'Enter their name',
    email: !EMAIL_RE.test(form.email.trim()) ? 'Enter a valid email address' : existing ? `${existing.name} is already on the team${existing.status === 'Deactivated' ? ' (deactivated)' : ''}` : null,
  };
  const valid = !errors.name && !errors.email;
  const reviewer = form.role === 'Reviewer';

  const submit = async () => {
    setTouched(true);
    if (!valid || saving) return;
    setSaving(true);
    const name = form.name.trim();
    const res = await run(() => saveMember({ action: 'invite', name, email: form.email.trim(), role: form.role, programIds: form.programIds, note: form.note.trim() || undefined }), {
      error: "Couldn't send the invitation",
    });
    setSaving(false);
    if (!res) return;
    onOpenChange(false);
    if (res.delivery === 'Sent') {
      toast.success(`Invited ${name}`, { description: res.link ? `We emailed ${form.email.trim()} a link to ${reviewer ? 'the review portal' : 'the staff app'}.` : `We emailed ${form.email.trim()}. ${reviewer ? 'Once the portal is published, share its link with them.' : 'Share this app’s link with them to sign in.'}` });
    } else {
      toast.warning(`${name} was added, but the email didn’t send`, { description: 'Check the address, then use “Resend invitation” from their row.' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-[560px] gap-5 overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Invite a teammate</DialogTitle>
          <DialogDescription className="text-[13px]">They’ll get an email with a link to sign in. Until they do, they show as Invited.</DialogDescription>
        </DialogHeader>
        <form
          id="invite-form"
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="invite-name" error={touched ? errors.name : null}>
              <Input id="invite-name" autoFocus value={form.name} maxLength={120} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jordan Lee" className={inputClass} />
            </Field>
            <Field label="Email" htmlFor="invite-email" error={touched || existing ? errors.email : null}>
              <Input id="invite-email" type="email" value={form.email} maxLength={254} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jordan@example.org" className={inputClass} />
            </Field>
          </div>
          <Field label="Role">
            <RoleChoice value={form.role} onChange={role => setForm(f => ({ ...f, role }))} roles={ROLES} />
          </Field>
          <div className="flex gap-2.5 rounded-lg border bg-subtle px-3 py-2.5 text-[12.5px] text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {reviewer ? (
              <span>Reviewers don’t need a Zite seat. They sign in to the applicant portal with the email you invite, and only see the applications assigned to them.</span>
            ) : (
              <span>Admins and managers work in this app, so they need a seat in your Zite organization. Add them there too if they don’t have one.</span>
            )}
          </div>
          <Field label="Reviewer for" htmlFor="invite-programs" hint={reviewer ? 'They join these programs’ reviewer pools and can be assigned right away.' : 'Optional — managers can review too.'}>
            <ProgramsField id="invite-programs" value={form.programIds} onChange={programIds => setForm(f => ({ ...f, programIds }))} />
          </Field>
          <Field label="Personal note" htmlFor="invite-note" hint="Optional. Included in the invitation email.">
            <Textarea id="invite-note" value={form.note} maxLength={1000} rows={3} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Thanks for joining the arts panel this year!" className="resize-none text-[13px] md:text-[13px]" />
          </Field>
        </form>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="invite-form" size="sm" disabled={saving || (touched && !valid)}>
            <Send /> {saving ? 'Sending…' : 'Send invitation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditMemberDialog({ member, onOpenChange }: { member: Member | null; onOpenChange: (o: boolean) => void }) {
  const ws = useWorkspace();
  const run = useSettingsMutation();
  const pools = useMemo(() => (member ? ws.programMembers.filter(pm => pm.memberId === member.id && pm.role === 'Reviewer').map(pm => pm.programId) : []), [member, ws.programMembers]);
  const [form, setForm] = useState({ name: '', title: '', expertise: '', programIds: [] as string[] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (member) setForm({ name: member.name, title: member.title ?? '', expertise: member.expertise ?? '', programIds: pools });
  }, [member?.id]);

  const submit = async () => {
    if (!member || saving || !form.name.trim()) return;
    setSaving(true);
    const samePools = form.programIds.length === pools.length && form.programIds.every(id => pools.includes(id));
    const res = await run(
      () => saveMember({ action: 'update', id: member.id, name: form.name.trim(), title: form.title.trim() || null, expertise: form.expertise.trim() || null, ...(samePools ? {} : { programIds: form.programIds }) }),
      { success: `Saved ${form.name.trim()}`, error: "Couldn't save those changes", optimistic: patchMember(member.id, { name: form.name.trim(), title: form.title.trim() || null, expertise: form.expertise.trim() || null }) },
    );
    setSaving(false);
    if (res) onOpenChange(false);
  };

  return (
    <Dialog open={Boolean(member)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-5">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Edit {member?.name}</DialogTitle>
          <DialogDescription className="text-[13px]">Title and expertise show next to their name when you assign reviewers.</DialogDescription>
        </DialogHeader>
        <form id="edit-member" className="space-y-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
          <Field label="Name" htmlFor="edit-name" error={form.name.trim() ? null : 'A teammate needs a name'}>
            <Input id="edit-name" value={form.name} maxLength={120} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputClass} />
          </Field>
          <Field label="Email" htmlFor="edit-email" hint="Their email is how they sign in, so it can’t be changed.">
            <Input id="edit-email" value={member?.email ?? ''} disabled className={inputClass} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" htmlFor="edit-title">
              <Input id="edit-title" value={form.title} maxLength={120} placeholder="Community panelist" onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputClass} />
            </Field>
            <Field label="Expertise" htmlFor="edit-expertise">
              <Input id="edit-expertise" value={form.expertise} maxLength={300} placeholder="Public art, youth programs" onChange={e => setForm(f => ({ ...f, expertise: e.target.value }))} className={inputClass} />
            </Field>
          </div>
          <Field label="Reviewer for" htmlFor="edit-programs" hint="Removing a program keeps reviews they already have.">
            <ProgramsField id="edit-programs" value={form.programIds} onChange={programIds => setForm(f => ({ ...f, programIds }))} />
          </Field>
        </form>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="edit-member" size="sm" disabled={saving || !form.name.trim()}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const GRID = 'grid items-center gap-x-3 gap-y-1 grid-cols-[minmax(0,1fr)_104px_28px] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_110px_84px_28px]';

export function MembersSettings() {
  const ws = useWorkspace();
  const app = useAppActions();
  const run = useSettingsMutation();
  const lock = useSettingsLock();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);

  const activeAdmins = ws.members.filter(m => m.role === 'Admin' && m.status === 'Active');
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: ws.members.length, Admin: 0, Manager: 0, Reviewer: 0, Invited: 0, Deactivated: 0 };
    for (const m of ws.members) {
      if (m.status !== 'Deactivated') c[asRole(m.role)] += 1;
      if (m.status === 'Invited') c.Invited += 1;
      if (m.status === 'Deactivated') c.Deactivated += 1;
    }
    return c;
  }, [ws.members]);

  const pools = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const pm of ws.programMembers) {
      if (pm.role !== 'Reviewer') continue;
      if (!map.has(pm.memberId)) map.set(pm.memberId, []);
      map.get(pm.memberId)!.push(pm.programId);
    }
    return map;
  }, [ws.programMembers]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ws.members
      .filter(m => {
        if (filter === 'all') return true;
        if (filter === 'Invited' || filter === 'Deactivated') return m.status === filter;
        return m.status !== 'Deactivated' && asRole(m.role) === filter;
      })
      .filter(m => !q || [m.name, m.email, m.title, m.expertise].some(v => (v ?? '').toLowerCase().includes(q)))
      .sort((a, b) => Number(a.status === 'Deactivated') - Number(b.status === 'Deactivated') || ROLES.indexOf(asRole(a.role)) - ROLES.indexOf(asRole(b.role)) || a.name.localeCompare(b.name));
  }, [ws.members, filter, query]);

  /** Why this role can't change right now, or null. Mirrors the server's rules. */
  const roleBlock = (m: Member) => {
    if (m.id === ws.me.id) return 'You can’t change your own role. Ask another admin.';
    if (m.role === 'Admin' && m.status === 'Active' && activeAdmins.length <= 1) return `${m.name} is the only active admin. Make someone else an admin first.`;
    return null;
  };

  const changeRole = async (m: Member, role: Role) => {
    if (role === m.role) return;
    const block = roleBlock(m);
    if (block) {
      toast.error(block);
      return;
    }
    if (m.role === 'Admin' || role === 'Admin') {
      const ok = await app.confirm({
        title: role === 'Admin' ? `Make ${m.name} an admin?` : `Remove ${m.name}’s admin access?`,
        description: role === 'Admin' ? 'Admins can change organization settings, invite and deactivate people, and change anyone’s role.' : `They’ll become ${role === 'Manager' ? 'a manager' : 'a reviewer'} and lose access to organization settings and the team list.`,
        confirmLabel: role === 'Admin' ? 'Make admin' : 'Change role',
      });
      if (!ok) return;
    }
    await run(() => saveMember({ action: 'update', id: m.id, role }), {
      optimistic: patchMember(m.id, { role }),
      success: `${m.name} is now ${role === 'Admin' ? 'an admin' : role === 'Manager' ? 'a manager' : 'a reviewer'}`,
      error: "Couldn't change the role",
    });
  };

  const deactivate = async (m: Member) => {
    if (m.id === ws.me.id) {
      toast.error('You can’t deactivate yourself. Ask another admin.');
      return;
    }
    const ok = await app.confirm({
      title: `Deactivate ${m.name}?`,
      description: 'They lose access straight away and disappear from reviewer pickers. Reviews already assigned to them stay put until you reassign them, and everything they’ve written stays. You can reactivate them any time.',
      confirmLabel: 'Deactivate',
      destructive: true,
    });
    if (!ok) return;
    await run(() => saveMember({ action: 'deactivate', id: m.id }), { optimistic: patchMember(m.id, { status: 'Deactivated' }), success: `Deactivated ${m.name}`, error: "Couldn't deactivate them" });
  };

  const reactivate = (m: Member) =>
    run(() => saveMember({ action: 'reactivate', id: m.id }), { optimistic: patchMember(m.id, { status: m.lastSeenAt ? 'Active' : 'Invited' }), success: `Reactivated ${m.name}`, error: "Couldn't reactivate them" });

  const resend = (m: Member) =>
    run(() => saveMember({ action: 'resendInvite', id: m.id }), {
      success: res => (res.delivery === 'Sent' ? `Sent ${m.name} a new invitation` : null),
      error: "Couldn't resend the invitation",
    }).then(res => {
      if (res && res.delivery !== 'Sent') toast.error(`The invitation to ${m.email} didn’t send`, { description: 'Check the address is right.' });
    });

  return (
    <>
      <SettingsPageTitle
        title="Members"
        description="Everyone who works here or reviews through the portal. Deactivating someone keeps their history but removes their access."
        actions={
          <Button size="sm" onClick={() => setInviting(true)}>
            <UserPlus /> Invite
          </Button>
        }
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <FilterPills
          value={filter}
          onChange={v => setFilter(v as Filter)}
          options={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'Admin', label: 'Admins', count: counts.Admin },
            { value: 'Manager', label: 'Managers', count: counts.Manager },
            { value: 'Reviewer', label: 'Reviewers', count: counts.Reviewer },
            { value: 'Invited', label: 'Invited', count: counts.Invited },
            { value: 'Deactivated', label: 'Deactivated', count: counts.Deactivated },
          ]}
        />
        <div className="relative sm:w-52">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search people" aria-label="Search members" className={cn(inputClass, 'pl-8')} />
        </div>
      </div>

      <SettingsCard>
        <div className={cn(GRID, 'hidden h-9 bg-subtle px-4 text-xs font-medium text-muted-foreground md:grid')}>
          <span>Name</span>
          <span>Title and expertise</span>
          <span>Reviews for</span>
          <span className="pl-2">Role</span>
          <span>Last seen</span>
          <span />
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={query ? <Search /> : <Users />} title={query ? 'No one matches that search' : filter === 'Invited' ? 'No pending invitations' : filter === 'Deactivated' ? 'No one is deactivated' : 'No one here yet'} className="py-12" />
        ) : (
          rows.map(m => {
            const isMe = m.id === ws.me.id;
            const block = roleBlock(m);
            const programs = (pools.get(m.id) ?? []).map(id => ws.programById.get(id)).filter(Boolean);
            const deactivated = m.status === 'Deactivated';
            return (
              <div key={m.id} className={cn(GRID, 'px-4 py-2.5', deactivated && 'bg-subtle/40')}>
                <div className="flex min-w-0 items-center gap-3">
                  <MemberAvatar member={m} size={28} />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className={cn('truncate text-[13px] font-medium', deactivated && 'text-muted-foreground')}>{m.name}</span>
                      {isMe && <span className="shrink-0 rounded bg-muted px-1 text-2xs text-muted-foreground">you</span>}
                      {m.status !== 'Active' && <StatusChip status={m.status} />}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                  </div>
                </div>
                <div className="hidden min-w-0 md:block">
                  <div className="truncate text-[13px]">{m.title || <span className="text-muted-foreground/70">—</span>}</div>
                  {m.expertise && <div className="truncate text-xs text-muted-foreground">{m.expertise}</div>}
                </div>
                <div className="hidden min-w-0 items-center gap-1 md:flex">
                  {programs.length === 0 ? (
                    <span className="text-[13px] text-muted-foreground/70">—</span>
                  ) : (
                    <>
                      {programs.slice(0, 3).map(p => (
                        <Tip key={p!.id} label={p!.name}>
                          <span className="chip h-[22px] shrink-0 gap-1 bg-background px-1.5 text-2xs font-medium">
                            <Glyph icon={p!.icon} color={p!.color} size={12} className="text-[8px]" />
                            {p!.key}
                          </span>
                        </Tip>
                      ))}
                      {programs.length > 3 && <Tip label={programs.slice(3).map(p => p!.name).join(', ')}><span className="text-2xs tabular-nums text-muted-foreground">+{programs.length - 3}</span></Tip>}
                    </>
                  )}
                </div>
                <Locked>
                  <Select value={asRole(m.role)} onValueChange={v => void changeRole(m, v as Role)} disabled={deactivated || Boolean(lock)}>
                    <SelectTrigger aria-label={`Role for ${m.name}`} className="h-7 border-transparent bg-transparent px-2 text-[13px] shadow-none hover:bg-accent focus:ring-1 disabled:cursor-default disabled:opacity-100 data-[state=open]:bg-accent [&>svg]:disabled:hidden">
                      <SelectValue>{asRole(m.role)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent align="end" className="w-72">
                      {block && <div className="mx-1 mb-1 mt-0.5 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">{block}</div>}
                      {ROLES.map(r => (
                        <SelectItem key={r} value={r} disabled={Boolean(block) && r !== asRole(m.role)} className={cn(selectItemClass, 'py-2')}>
                          <span className="block font-medium">{r}</span>
                          <span className="block text-xs text-muted-foreground">{ROLE_INFO[r].detail}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Locked>
                <div className="hidden text-xs text-muted-foreground md:block">{m.status === 'Invited' ? 'Not yet' : m.lastSeenAt ? timeAgo(m.lastSeenAt) : '—'}</div>
                <Locked>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton aria-label={`Actions for ${m.name}`} disabled={Boolean(lock)}>
                        <MoreHorizontal />
                      </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem className="text-[13px]" onSelect={() => setEditing(m)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit details…
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className="text-[13px]">
                        <a href={`mailto:${m.email}`}><Mail className="h-3.5 w-3.5" /> Email {m.name.split(' ')[0]}</a>
                      </DropdownMenuItem>
                      {m.status === 'Invited' && (
                        <DropdownMenuItem className="text-[13px]" onSelect={() => void resend(m)}>
                          <Send className="h-3.5 w-3.5" /> Resend invitation
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      {deactivated ? (
                        <DropdownMenuItem className="text-[13px]" onSelect={() => void reactivate(m)}>
                          <UserCheck className="h-3.5 w-3.5" /> Reactivate
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          className="flex-wrap text-[13px] text-tone-danger focus:text-tone-danger"
                          disabled={isMe || (m.role === 'Admin' && m.status === 'Active' && activeAdmins.length <= 1)}
                          onSelect={() => void deactivate(m)}
                        >
                          <UserMinus className="h-3.5 w-3.5" /> Deactivate
                          {isMe ? (
                            <span className="w-full pl-6 text-2xs text-muted-foreground">You can’t deactivate yourself</span>
                          ) : m.role === 'Admin' && m.status === 'Active' && activeAdmins.length <= 1 ? (
                            <span className="w-full pl-6 text-2xs text-muted-foreground">They’re the only active admin</span>
                          ) : null}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Locked>
              </div>
            );
          })
        )}
      </SettingsCard>

      <p className="mt-3 text-xs text-muted-foreground">
        Admins and managers need a seat in your Zite organization to open this app. Volunteer reviewers don’t — they sign in to the applicant portal with the email you invite.
      </p>

      <InviteDialog open={inviting} onOpenChange={setInviting} />
      <EditMemberDialog member={editing} onOpenChange={o => !o && setEditing(null)} />
    </>
  );
}
