import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCheck, FileText, Loader2, Mail, Send } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { markMessagesRead, sendMessage } from 'zitejs/api';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { Switch } from '@project/components/ui/switch';
import { cn } from '@project/components/lib/utils';
import { errorMessage } from '../../lib/errors';
import { MOD } from '../../lib/hotkeys';
import { patchSubmissionCaches } from '../../lib/mutations';
import { qk } from '../../lib/queries';
import type { Bootstrap, Message, SubmissionDetail } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Avatar, MemberAvatar } from '../primitives/Avatar';
import { Kbd, Tip } from '../primitives/bits';
import { dateTime } from '../../lib/format';
import { RelTime, ToneChip, useDetailCache, type Tone } from './detailBits';

const KIND_TONE: Record<string, Tone> = { Confirmation: 'neutral', Decision: 'accent', Request: 'warning', Reminder: 'info' };

/**
 * The applicant conversation: everything the portal shows them, plus what
 * they sent back. Opening it marks their messages read for the whole team.
 */
export function MessagesTab({ detail }: { detail: SubmissionDetail }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const { patch } = useDetailCache(detail.submission.id);
  const { submission, messages } = detail;
  // Remember what was unread on arrival, so "New" markers survive the read receipt.
  const [unreadOnOpen] = useState(() => new Set(messages.filter(m => m.direction === 'Inbound' && !m.readAt).map(m => m.id)));
  const endRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const marked = useRef<string | null>(null);

  // Land on the first message nobody has read yet.
  useEffect(() => {
    if (!unreadOnOpen.size) return;
    const first = messages.find(m => unreadOnOpen.has(m.id));
    if (first) requestAnimationFrame(() => listRef.current?.querySelector(`[data-message-id="${first.id}"]`)?.scrollIntoView({ block: 'center' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (marked.current === submission.id) return;
    if (!messages.some(m => m.direction === 'Inbound' && !m.readAt) && submission.unreadMessages === 0) return;
    marked.current = submission.id;
    const now = new Date().toISOString();
    patch(d => ({ ...d, messages: d.messages.map(m => (m.direction === 'Inbound' && !m.readAt ? { ...m, readAt: now } : m)) }));
    const count = submission.unreadMessages;
    patchSubmissionCaches(qc, new Set([submission.id]), s => ({ ...s, unreadMessages: 0 }));
    qc.setQueryData<Bootstrap>(qk.bootstrap, old => (old ? { ...old, counts: { ...old.counts, unreadMessages: Math.max(0, old.counts.unreadMessages - count) } } : old));
    markMessagesRead({ submissionId: submission.id })
      .then(() => qc.invalidateQueries({ queryKey: qk.bootstrap }))
      .catch(() => qc.invalidateQueries({ queryKey: qk.submissionRoot }));
    // Only on opening the tab for this submission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission.id]);

  // Reply to what the applicant last wrote; failing that, the last conversation a person started — never an automatic email.
  const newestFirst = [...messages].reverse();
  const lastSubject = (newestFirst.find(m => m.direction === 'Inbound' && m.subject) ?? newestFirst.find(m => m.kind === 'Message' && m.subject))?.subject ?? '';

  return (
    <div className="animate-fade-in">
      {messages.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-10 text-center">
          <Mail className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-[13.5px] font-medium">No messages yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">Messages you send appear in {detail.applicant?.name?.split(' ')[0] || 'the applicant'}’s portal, and by email if you choose. Their replies land here.</p>
        </div>
      ) : (
        <ol ref={listRef} className="space-y-3">
          {messages.map(m => (
            <MessageItem key={m.id} message={m} detail={detail} isNew={unreadOnOpen.has(m.id)} />
          ))}
        </ol>
      )}
      <div ref={endRef} />
      {submission.applicantId ? (
        <Composer detail={detail} lastSubject={lastSubject} onSent={() => requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }))} />
      ) : (
        <p className="mt-4 text-[13px] text-muted-foreground">This submission has no applicant to message.</p>
      )}
      <p className="mt-2 text-2xs text-muted-foreground">{ws.settings.supportEmail ? `Email replies go to ${ws.settings.supportEmail}.` : 'Applicants reply in the portal.'}</p>
    </div>
  );
}

function MessageItem({ message: m, detail, isNew }: { message: Message; detail: SubmissionDetail; isNew: boolean }) {
  const ws = useWorkspace();
  const [expanded, setExpanded] = useState(false);
  const inbound = m.direction === 'Inbound';
  const sender = !inbound && m.senderId ? ws.memberById.get(m.senderId) : undefined;
  const applicantName = detail.applicant?.name || detail.submission.applicantName || 'Applicant';
  const name = inbound ? applicantName : sender?.name ?? ws.settings.organizationName;
  const long = m.body.length > 700;
  const body = long && !expanded ? `${m.body.slice(0, 560).replace(/\s+\S*$/, '')}…` : m.body;

  return (
    <li data-message-id={m.id} className={cn('overflow-hidden rounded-lg border bg-card shadow-2xs', inbound ? 'border-l-[3px] border-l-tone-info sm:mr-10' : 'sm:ml-10', isNew && 'ring-1 ring-tone-info/30')}>
      <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 px-3.5 pt-2.5', inbound && 'bg-tone-info/[0.03]')}>
        {inbound ? <Avatar name={applicantName} color="#0369a1" size={20} /> : sender ? <MemberAvatar member={sender} size={20} /> : <img src="/favicon.svg" alt="" className="h-5 w-5 rounded" />}
        <span className="text-[13px] font-medium">{name}</span>
        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
          {inbound ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
          {inbound ? 'from the applicant' : sender ? `to ${applicantName.split(' ')[0]}` : 'automatic'}
        </span>
        {m.kind !== 'Message' && <ToneChip tone={KIND_TONE[m.kind] ?? 'neutral'}>{m.kind}</ToneChip>}
        {isNew && <ToneChip tone="info">New</ToneChip>}
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {m.delivery === 'Failed' ? (
            <span className="flex items-center gap-1 text-tone-danger"><AlertTriangle className="h-3 w-3" /> Email failed · in portal</span>
          ) : !inbound && m.delivery === 'Portal only' ? (
            <span>Portal only</span>
          ) : !inbound && m.readAt ? (
            <Tip label={`Opened in the portal ${dateTime(m.readAt)}`}>
              <span className="flex items-center gap-0.5"><CheckCheck className="h-3 w-3" /> Seen ·</span>
            </Tip>
          ) : null}
          <RelTime iso={m.sentAt} />
        </span>
      </div>
      <div className="px-3.5 pb-3 pt-1.5">
        {m.subject && <div className="text-[13.5px] font-medium">{m.subject}</div>}
        <div className="mt-1 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-foreground/90">{body}</div>
        {long && (
          <button type="button" onClick={() => setExpanded(e => !e)} className="mt-1 text-xs font-medium text-primary hover:underline">
            {expanded ? 'Show less' : 'Show the whole message'}
          </button>
        )}
      </div>
    </li>
  );
}

function Composer({ detail, lastSubject, onSent }: { detail: SubmissionDetail; lastSubject: string; onSent: () => void }) {
  const ws = useWorkspace();
  const { refresh } = useDetailCache(detail.submission.id);
  const reSubject = lastSubject ? `Re: ${lastSubject.replace(/^(re:\s*)+/i, '')}` : `About ${detail.submission.reference === 'Draft' ? 'your application' : detail.submission.reference}`;
  const [subject, setSubject] = useState(reSubject);
  const [body, setBody] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [email, setEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const touchedSubject = useRef(false);
  const templates = useMemo(() => ws.templates.filter(t => !t.programId || t.programId === detail.submission.programId), [ws.templates, detail.submission.programId]);

  useEffect(() => {
    if (!touchedSubject.current) setSubject(reSubject);
  }, [reSubject]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(360, Math.max(focused || body ? 96 : 44, el.scrollHeight))}px`;
  }, [body, focused]);

  const send = async () => {
    if (!subject.trim() || !body.trim() || busy) return;
    setBusy(true);
    try {
      const res = await sendMessage({ submissionIds: [detail.submission.id], subject: subject.trim(), body, templateId, sendEmail: email, kind: 'Message' });
      toast.success(res.failed ? 'Saved in the portal, but the email didn’t go through' : res.sent ? `Emailed ${detail.applicant?.name?.split(' ')[0] || 'the applicant'}` : 'Posted to their portal');
      setBody('');
      setTemplateId(null);
      touchedSubject.current = false;
      refresh({ delay: 400 });
      onSent();
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't send the message"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-lg border bg-background shadow-2xs transition-[border-color,box-shadow] focus-within:border-foreground/25 focus-within:shadow-sm">
      <input
        value={subject}
        onChange={e => {
          touchedSubject.current = true;
          setSubject(e.target.value);
        }}
        aria-label="Subject"
        placeholder="Subject"
        className="h-9 w-full border-b bg-transparent px-3 text-[13px] font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground"
      />
      <textarea
        ref={bodyRef}
        value={body}
        onChange={e => setBody(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            send();
          }
        }}
        aria-label="Message"
        placeholder={`Write to ${detail.applicant?.name?.split(' ')[0] || 'the applicant'}… merge tags like {{applicant_first_name}} work`}
        className="block w-full resize-none bg-transparent px-3 py-2.5 text-[13.5px] leading-relaxed outline-none placeholder:text-muted-foreground"
      />
      <div className="flex flex-wrap items-center gap-2 border-t px-2 py-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="ghost-chip h-7 max-w-[220px] text-xs text-muted-foreground hover:text-foreground">
              <FileText className="h-3.5 w-3.5" />
              <span className="truncate">{templateId ? ws.templateById.get(templateId)?.name ?? 'Template' : 'Template'}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel className="text-2xs text-muted-foreground">Start from a template</DropdownMenuLabel>
            {templates.map(t => (
              <DropdownMenuItem
                key={t.id}
                className="flex-col items-start gap-0 text-[13px]"
                onSelect={() => {
                  setTemplateId(t.id);
                  touchedSubject.current = true;
                  setSubject(t.subject);
                  setBody(t.body);
                  requestAnimationFrame(() => bodyRef.current?.focus());
                }}
              >
                <span>{t.name}</span>
                <span className="text-xs text-muted-foreground">{t.trigger === 'Manual' ? 'Manual' : `Used for: ${t.trigger}`}</span>
              </DropdownMenuItem>
            ))}
            {templates.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground">No templates yet — add them in Settings.</div>}
            {templateId && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-[13px]" onSelect={() => { setTemplateId(null); setBody(''); touchedSubject.current = false; setSubject(reSubject); }}>
                  Clear template
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 text-xs text-muted-foreground">
          <Switch checked={email} onCheckedChange={setEmail} className="scale-90" aria-label="Also send by email" />
          {email ? (detail.applicant?.email ? 'Also email' : 'No email on file') : 'Portal only'}
        </label>
        <span className="ml-auto hidden items-center gap-1 text-2xs text-muted-foreground sm:flex"><Kbd>{MOD}</Kbd><Kbd>↵</Kbd></span>
        <button
          type="button"
          onClick={send}
          disabled={busy || !subject.trim() || !body.trim()}
          className={cn('flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors', subject.trim() && body.trim() ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground')}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send
        </button>
      </div>
    </div>
  );
}
