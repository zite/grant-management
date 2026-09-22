import { Bold, Heading2, Italic, Link2, List, ListOrdered } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { cn } from '@project/components/lib/utils';
import { Markdown } from '@project/shared/ui/Markdown';
import { Tip } from '../primitives/bits';

type Wrap = { before: string; after?: string; line?: boolean; placeholder: string };

const ACTIONS: Array<{ key: string; label: string; icon: ReactNode; keys?: string[]; wrap: Wrap }> = [
  { key: 'bold', label: 'Bold', icon: <Bold />, keys: ['⌘', 'B'], wrap: { before: '**', after: '**', placeholder: 'bold text' } },
  { key: 'italic', label: 'Italic', icon: <Italic />, keys: ['⌘', 'I'], wrap: { before: '_', after: '_', placeholder: 'emphasis' } },
  { key: 'heading', label: 'Heading', icon: <Heading2 />, wrap: { before: '## ', line: true, placeholder: 'Heading' } },
  { key: 'list', label: 'Bulleted list', icon: <List />, wrap: { before: '- ', line: true, placeholder: 'List item' } },
  { key: 'ordered', label: 'Numbered list', icon: <ListOrdered />, wrap: { before: '1. ', line: true, placeholder: 'List item' } },
  { key: 'link', label: 'Link', icon: <Link2 />, keys: ['⌘', 'K'], wrap: { before: '[', after: '](https://)', placeholder: 'link text' } },
];

/**
 * Markdown with a formatting bar and a live preview rendered by the same
 * component the portal uses, so what you see is what applicants get. Side by
 * side on wide screens; Write and Preview tabs on narrow ones.
 */
export function MarkdownEditor({ id, value, onChange, placeholder, rows = 12, maxLength, previewEmpty = 'Nothing to preview yet.' }: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  previewEmpty?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<'write' | 'preview'>('write');

  const apply = (w: Wrap) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end) || w.placeholder;
    let next: string;
    let selStart: number;
    let selEnd: number;
    if (w.line) {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const lines = (value.slice(start, end) || w.placeholder).split('\n').map((l, i) => (w.before === '1. ' ? `${i + 1}. ` : w.before) + l.replace(/^(#{1,6} |- |\d+\. )/, ''));
      const block = lines.join('\n');
      const prefix = value.slice(0, start === end ? lineStart : start);
      const needsBreak = prefix && !prefix.endsWith('\n') ? '\n' : '';
      const rest = value.slice(start === end ? start : end);
      const insertAt = start === end ? lineStart : start;
      if (start === end && value.slice(lineStart, start).trim()) {
        // Cursor inside a line with text: turn that whole line into the block.
        const lineEnd = value.indexOf('\n', start) === -1 ? value.length : value.indexOf('\n', start);
        const line = value.slice(lineStart, lineEnd).replace(/^(#{1,6} |- |\d+\. )/, '');
        next = `${value.slice(0, lineStart)}${w.before}${line}${value.slice(lineEnd)}`;
        selStart = lineStart + w.before.length;
        selEnd = selStart + line.length;
      } else {
        next = `${value.slice(0, insertAt)}${needsBreak}${block}${rest}`;
        selStart = insertAt + needsBreak.length + w.before.length;
        selEnd = insertAt + needsBreak.length + block.length;
      }
    } else {
      next = `${value.slice(0, start)}${w.before}${selected}${w.after ?? ''}${value.slice(end)}`;
      selStart = start + w.before.length;
      selEnd = selStart + selected.length;
    }
    if (maxLength && next.length > maxLength) return;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  };

  const toolbar = (
    <div className="flex h-9 items-center gap-0.5 border-b px-1.5">
      {ACTIONS.map(a => (
        <Tip key={a.key} label={a.label} keys={a.keys}>
          <button
            type="button"
            aria-label={a.label}
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              setTab('write');
              apply(a.wrap);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:h-3.5 [&_svg]:w-3.5"
          >
            {a.icon}
          </button>
        </Tip>
      ))}
      <div className="ml-auto flex items-center gap-0.5 lg:hidden" role="tablist">
        {(['write', 'preview'] as const).map(t => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn('h-6 rounded-md px-2 text-xs capitalize', tab === t ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            {t}
          </button>
        ))}
      </div>
      <span className="ml-auto hidden text-2xs text-muted-foreground lg:inline">Markdown</span>
    </div>
  );

  return (
    <div className="overflow-hidden rounded-lg border border-input bg-background shadow-xs focus-within:ring-1 focus-within:ring-ring">
      {toolbar}
      <div className="grid lg:grid-cols-2">
        <textarea
          id={id}
          ref={ref}
          value={value}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
            const k = e.key.toLowerCase();
            const hit = k === 'b' ? ACTIONS[0] : k === 'i' ? ACTIONS[1] : k === 'k' ? ACTIONS[5] : null;
            if (hit) {
              e.preventDefault();
              e.stopPropagation();
              apply(hit.wrap);
            }
          }}
          className={cn(
            'block w-full resize-y bg-transparent px-3 py-2.5 font-mono text-[12.5px] leading-[1.6] outline-none placeholder:font-sans placeholder:text-muted-foreground lg:border-r',
            tab === 'preview' && 'hidden lg:block',
          )}
        />
        <div className={cn('min-h-[120px] overflow-y-auto bg-subtle/60 px-4 py-3 lg:block', tab === 'write' && 'hidden')} style={{ maxHeight: rows * 26 + 40 }}>
          <div className="mb-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">Preview</div>
          {value.trim() ? <Markdown className="text-[13px]">{value}</Markdown> : <p className="text-[13px] text-muted-foreground">{previewEmpty}</p>}
        </div>
      </div>
    </div>
  );
}
