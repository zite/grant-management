import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@project/components/lib/utils';
import { MOD } from '../../lib/hotkeys';
import type { Member } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { MemberAvatar } from '../primitives/Avatar';
import { MENTION_RE } from './detailBits';

/**
 * The internal-note box. Typing "@" suggests staff; picking one shows
 * "@Grace Liu" in the text and is saved as `@[Grace Liu](memberId)`, which is
 * what notifies them. ⌘↵ posts.
 */

/** Stored tokens → readable text, remembering who each name refers to. */
export function fromStored(body: string) {
  const people = new Map<string, string>();
  const text = body.replace(MENTION_RE, (_, name: string, id: string) => {
    people.set(name, id);
    return `@${name}`;
  });
  return { text, people };
}

/** Readable text → stored tokens, for every picked name still present. Longest names first so "Ann Lee" beats "Ann". */
export function toStored(text: string, people: Map<string, string>) {
  let out = text;
  const names = [...people.keys()].sort((a, b) => b.length - a.length);
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(^|[^\\w\\[])@${escaped}(?![\\w])`, 'g'), (_, pre: string) => `${pre}@[${name}](${people.get(name)})`);
  }
  return out;
}

export function NoteComposer({ onSubmit, initialBody = '', placeholder = 'Leave an internal note… type @ to mention a teammate', submitLabel = 'Add note', onCancel, autoFocus, className }: {
  onSubmit: (body: string) => Promise<unknown>;
  initialBody?: string;
  placeholder?: string;
  submitLabel?: string;
  onCancel?: () => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const ws = useWorkspace();
  const initial = useMemo(() => fromStored(initialBody), [initialBody]);
  const [value, setValue] = useState(initial.text);
  const people = useRef(new Map(initial.people));
  const [busy, setBusy] = useState(false);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(320, Math.max(64, el.scrollHeight))}px`;
  }, [value]);

  const matches = useMemo(() => {
    if (!mention) return [] as Member[];
    const q = mention.query.toLowerCase();
    return ws.managers
      .filter(m => m.name.toLowerCase().includes(q) || m.email.toLowerCase().startsWith(q) || m.name.toLowerCase().split(/\s+/).some(p => p.startsWith(q)))
      .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)))
      .slice(0, 6);
  }, [mention, ws.managers]);

  const detect = (text: string, caret: number) => {
    const upto = text.slice(0, caret);
    const m = /(^|\s)@([\p{L}.'-]*(?: [\p{L}.'-]*)?)$/u.exec(upto);
    if (m && m[2].length <= 24) {
      setMention({ start: caret - m[2].length - 1, query: m[2] });
      setActive(0);
    } else setMention(null);
  };

  const choose = (m: Member) => {
    const el = area.current;
    if (!mention || !el) return;
    const caret = el.selectionStart;
    people.current.set(m.name, m.id);
    const next = `${value.slice(0, mention.start)}@${m.name} ${value.slice(caret)}`;
    setValue(next);
    setMention(null);
    const pos = mention.start + m.name.length + 2;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const submit = async () => {
    const text = value.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await onSubmit(toStored(text, people.current));
      setValue('');
      people.current = new Map();
    } catch {
      /* the caller explains the failure; keep the text so nothing is lost */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('relative rounded-lg border bg-background shadow-2xs transition-[border-color,box-shadow] focus-within:border-foreground/25 focus-within:shadow-sm', className)}>
      <textarea
        ref={area}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label="Note"
        rows={2}
        onChange={e => {
          setValue(e.target.value);
          detect(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={e => {
          if (mention && matches.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % matches.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + matches.length) % matches.length); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(matches[active]); return; }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMention(null); return; }
          }
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') {
            e.stopPropagation();
            if (onCancel) onCancel();
            else (e.target as HTMLTextAreaElement).blur();
          }
        }}
        onBlur={() => window.setTimeout(() => setMention(null), 150)}
        className="block w-full resize-none bg-transparent px-3 pt-2.5 text-[13.5px] leading-relaxed outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center justify-end gap-2 px-2 pb-2">
        <span className="mr-auto hidden pl-1 text-2xs text-muted-foreground sm:inline">{value ? `${MOD}↵ to post · only your team sees notes` : 'Only your team sees notes'}</span>
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-7 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || busy}
          className={cn('flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors', value.trim() ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground')}
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {submitLabel}
        </button>
      </div>
      {mention && matches.length > 0 && (
        <div className="absolute bottom-full left-2 z-50 mb-1 w-72 max-w-[calc(100%-1rem)] overflow-hidden rounded-lg border bg-popover p-1 shadow-lg animate-fade-in" role="listbox" aria-label="Mention a teammate">
          {matches.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={e => {
                e.preventDefault();
                choose(m);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn('flex h-8 w-full items-center gap-2 rounded-[5px] px-2 text-left text-[13px]', i === active && 'bg-accent')}
            >
              <MemberAvatar member={m} size={18} />
              <span className="shrink-0">{m.name}{m.id === ws.me.id && <span className="text-muted-foreground"> (you)</span>}</span>
              <span className="ml-auto min-w-0 truncate pl-2 text-xs text-muted-foreground">{m.title ?? m.role}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
