import { Download, EyeOff, FileText, ImageIcon, Music, Video } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@project/components/lib/utils';
import { formatAddress, formatMoney, isEmptyValue, optionLabel, visibleFieldIds } from '../forms/logic';
import { isInputField, type AddressValue, type Answers, type FileValue, type FormField } from '../forms/types';
import { Markdown, fileSize } from './Markdown';

/**
 * A submitted form, read back. Used by staff on a submission, by reviewers
 * while they score, and by applicants looking at what they sent.
 *
 * Questions hidden by conditional logic are skipped (the applicant never saw
 * them), unanswered optional questions can be collapsed, and files open in a
 * new tab with images previewed inline.
 */
export function AnswersView({
  fields, answers, currency = 'USD', hideEmpty = false, hiddenFieldIds, className, dense, highlight,
}: {
  fields: FormField[];
  answers: Answers;
  currency?: string;
  hideEmpty?: boolean;
  /** Fields redacted for this viewer — shown as a quiet "hidden" row so nobody wonders where they went. */
  hiddenFieldIds?: string[];
  className?: string;
  dense?: boolean;
  /** Case-insensitive text to highlight, e.g. from a search. */
  highlight?: string;
}) {
  const visible = useMemo(() => visibleFieldIds(fields, answers), [fields, answers]);
  const hidden = new Set(hiddenFieldIds ?? []);
  const items = fields.filter(f => visible.has(f.id) || hidden.has(f.id));

  // Sections with nothing to show below them are dropped.
  const blocks: Array<{ section: FormField | null; fields: FormField[] }> = [];
  for (const f of items) {
    if (f.type === 'section') {
      blocks.push({ section: f, fields: [] });
      continue;
    }
    if (f.type === 'content') continue;
    if (!blocks.length) blocks.push({ section: null, fields: [] });
    if (hideEmpty && isEmptyValue(answers[f.id]) && !hidden.has(f.id)) continue;
    blocks[blocks.length - 1].fields.push(f);
  }

  return (
    <div className={cn('space-y-8', className)}>
      {blocks.filter(b => b.fields.length).map((b, i) => (
        <section key={b.section?.id ?? `intro-${i}`}>
          {b.section && <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{b.section.label}</h3>}
          <dl className={cn('divide-y rounded-lg border bg-background', dense && 'text-[13px]')}>
            {b.fields.map(f => (
              <div key={f.id} className={cn('grid gap-1 px-4', dense ? 'py-2.5' : 'py-3.5', f.type !== 'long_text' && f.type !== 'file' && 'sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-6')}>
                <dt className="text-[13px] font-medium leading-snug text-muted-foreground">{f.label}</dt>
                <dd className="min-w-0 text-foreground">
                  {hidden.has(f.id) ? (
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                      <EyeOff className="h-3.5 w-3.5" /> Hidden from reviewers
                    </span>
                  ) : (
                    <AnswerValueView field={f} answers={answers} currency={currency} highlight={highlight} />
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {!blocks.some(b => b.fields.length) && <p className="text-sm text-muted-foreground">No answers yet.</p>}
    </div>
  );
}

function Highlight({ text, term }: { text: string; term?: string }) {
  const q = term?.trim();
  if (!q || q.length < 2) return <>{text}</>;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
  return (
    <>
      {parts.map((p, i) => (p.toLowerCase() === q.toLowerCase() ? <mark key={i} className="rounded bg-tone-warning/25 px-0.5 text-foreground">{p}</mark> : p))}
    </>
  );
}

export function AnswerValueView({ field, answers, currency = 'USD', highlight }: { field: FormField; answers: Answers; currency?: string; highlight?: string }) {
  const v = answers[field.id];
  if (!isInputField(field)) return null;
  if (isEmptyValue(v)) return <span className="text-[13px] italic text-muted-foreground/80">No answer</span>;
  switch (field.type) {
    case 'long_text':
      return <LongText text={String(v)} highlight={highlight} />;
    case 'single_choice':
    case 'dropdown':
      return <span className="chip-soft">{optionLabel(field, String(v), answers)}</span>;
    case 'multiple_choice':
      return (
        <span className="flex flex-wrap gap-1.5">
          {(v as string[]).map(id => (
            <span key={id} className="chip-soft">{optionLabel(field, id, answers)}</span>
          ))}
        </span>
      );
    case 'yes_no':
      return <span className={cn('chip-soft', v === 'yes' ? 'text-tone-success' : 'text-muted-foreground')}>{v === 'yes' ? 'Yes' : 'No'}</span>;
    case 'currency':
      return <span className="font-medium tabular-nums">{formatMoney(Number(v), currency)}</span>;
    case 'number':
      return <span className="tabular-nums">{Number(v).toLocaleString('en-US')}</span>;
    case 'date':
      return <span>{new Date(`${String(v)}T12:00:00`).toLocaleDateString('en-US', { dateStyle: 'medium' })}</span>;
    case 'url':
      return <a href={String(v)} target="_blank" rel="noreferrer" className="break-all text-primary underline-offset-2 hover:underline">{String(v).replace(/^https?:\/\//, '')}</a>;
    case 'email':
      return <a href={`mailto:${String(v)}`} className="break-all text-primary underline-offset-2 hover:underline">{String(v)}</a>;
    case 'address':
      return <span>{formatAddress(v as AddressValue)}</span>;
    case 'file':
      return <FileList files={v as FileValue[]} />;
    default:
      return <span className="break-words"><Highlight text={String(v)} term={highlight} /></span>;
  }
}

function LongText({ text, highlight }: { text: string; highlight?: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 900;
  const shown = long && !open ? `${text.slice(0, 700).replace(/\s+\S*$/, '')}…` : text;
  return (
    <div className="mt-1">
      <div className="space-y-2.5 whitespace-pre-wrap break-words text-[14px] leading-relaxed">
        {shown.split(/\n{2,}/).map((p, i) => (
          <p key={i}><Highlight text={p} term={highlight} /></p>
        ))}
      </div>
      {long && (
        <button type="button" onClick={() => setOpen(o => !o)} className="mt-1.5 text-[13px] font-medium text-primary hover:underline">
          {open ? 'Show less' : `Show all ${text.split(/\s+/).length.toLocaleString()} words`}
        </button>
      )}
    </div>
  );
}

const isImage = (f: FileValue) => f.type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)(\?|$)/i.test(f.name) || /images\.unsplash\.com/.test(f.url);

export function FileList({ files }: { files: FileValue[] }) {
  const images = files.filter(isImage);
  const others = files.filter(f => !isImage(f));
  return (
    <div className="mt-1.5 space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((f, i) => (
            <a key={`${f.url}-${i}`} href={f.url} target="_blank" rel="noreferrer" className="group relative block h-24 w-32 overflow-hidden rounded-md border bg-muted" title={f.name}>
              <img src={f.url} alt={f.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            </a>
          ))}
        </div>
      )}
      {others.map((f, i) => {
        const Icon = f.type?.startsWith('audio/') ? Music : f.type?.startsWith('video/') ? Video : f.type?.startsWith('image/') ? ImageIcon : FileText;
        return (
          <a key={`${f.url}-${i}`} href={f.url} target="_blank" rel="noreferrer" className="group flex max-w-md items-center gap-3 rounded-md border bg-background px-3 py-2 transition-colors hover:bg-accent/60">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{f.name}</span>
              <span className="block text-xs text-muted-foreground">{fileSize(f.size)}</span>
            </span>
            <Download className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </a>
        );
      })}
    </div>
  );
}

export { Markdown };
