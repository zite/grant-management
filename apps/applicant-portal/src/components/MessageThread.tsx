import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { sendApplicantMessage } from 'zitejs/api';
import { cn } from '@project/components/lib/utils';
import { errorMessage } from '../lib/errors';
import { initials, mediumDateTime, timeAgo } from '../lib/format';
import { qk, type ApplicationDetail } from '../lib/queries';
import { Button, textareaClass } from './ui';

const KIND_LABEL: Record<string, string> = { Confirmation: 'Confirmation', Decision: 'Decision', Request: 'Request', Reminder: 'Reminder' };

/** The conversation with the program team. Their messages sit left, yours right, like any chat. */
export function MessageThread({ applicationId, messages, organizationName, canReply }: { applicationId: string; messages: ApplicationDetail['messages']; organizationName: string; canReply: boolean }) {
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();

  const send = useMutation({
    mutationFn: (text: string) => sendApplicantMessage({ submissionId: applicationId, body: text }),
    onSuccess: msg => {
      qc.setQueryData<ApplicationDetail>(qk.application(applicationId), prev => (prev ? { ...prev, messages: [...prev.messages, msg] } : prev));
      setBody('');
      toast.success('Message sent. The program team will reply here, and by email.');
    },
    onError: e => setProblem(errorMessage(e, "Your message didn't send. Try again.")),
  });

  const submit = () => {
    const text = body.trim();
    if (!text) {
      setProblem('Write a message before sending.');
      return;
    }
    setProblem(null);
    send.mutate(text);
  };

  return (
    <div>
      {messages.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed px-4 py-5 text-[15px] text-muted-foreground">
          <MessageSquare className="h-5 w-5 shrink-0" aria-hidden />
          No messages yet. If the program team has a question, it will appear here and in your email.
        </div>
      ) : (
        <ol className="space-y-5" aria-label="Messages">
          {messages.map(m => {
            const mine = m.direction === 'Inbound';
            return (
              <li key={m.id} className={cn('flex gap-3', mine && 'flex-row-reverse')}>
                <span
                  className={cn('mt-6 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold', mine ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground')}
                  aria-hidden
                >
                  {mine ? 'You' : initials(organizationName)}
                </span>
                <div className={cn('min-w-0 max-w-[88%] sm:max-w-[80%]', mine && 'items-end text-right')}>
                  <p className={cn('mb-1.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground', mine && 'justify-end')}>
                    <span className="font-medium text-foreground">{mine ? 'You' : organizationName}</span>
                    {m.sentAt && (
                      <time dateTime={m.sentAt} title={mediumDateTime(m.sentAt)}>
                        {timeAgo(m.sentAt)}
                      </time>
                    )}
                    {!mine && KIND_LABEL[m.kind] && <span className="rounded-full bg-muted px-2 py-px text-2xs font-medium">{KIND_LABEL[m.kind]}</span>}
                    {m.unread && <span className="rounded-full bg-primary px-2 py-px text-2xs font-semibold text-primary-foreground">New</span>}
                  </p>
                  <div
                    className={cn(
                      'rounded-xl px-4 py-3 text-left text-[15px] leading-relaxed shadow-2xs print-plain',
                      mine ? 'rounded-tr-md bg-primary/[0.08] ring-1 ring-inset ring-primary/15' : 'rounded-tl-md border bg-background',
                    )}
                  >
                    {m.subject && <p className="mb-1 font-semibold">{m.subject}</p>}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {canReply && (
        <form
          className="no-print mt-6 border-t pt-5"
          onSubmit={e => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor={id} className="text-[15px] font-medium">
            Write to the program team
          </label>
          <textarea
            id={id}
            value={body}
            onChange={e => {
              setBody(e.target.value);
              if (problem) setProblem(null);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            maxLength={10000}
            placeholder="Ask a question or share an update…"
            aria-invalid={Boolean(problem) || undefined}
            aria-describedby={problem ? `${id}-error` : `${id}-hint`}
            className={textareaClass('mt-2')}
          />
          {problem ? (
            <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-tone-danger">{problem}</p>
          ) : (
            <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted-foreground">They'll see it in their inbox. Replies arrive here and by email.</p>
          )}
          <div className="mt-3 flex justify-end">
            <Button type="submit" loading={send.isPending}>
              <Send aria-hidden /> Send message
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
