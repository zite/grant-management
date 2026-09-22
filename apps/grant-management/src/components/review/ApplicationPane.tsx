import { ChevronDown, ChevronUp, EyeOff, MapPin, Search, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { cn } from '@project/components/lib/utils';
import { formatMoney } from '@project/shared/forms/logic';
import type { Answers, FormField } from '@project/shared/forms/types';
import { AnswersView } from '@project/shared/ui/AnswersView';
import { longDate } from '../../lib/format';
import type { ReviewDetail } from '../../lib/types';
import { Avatar } from '../primitives/Avatar';
import { IconButton, Kbd, Tip } from '../primitives/bits';
import { countMatches, readingMinutes } from './reviewModel';

type TocItem = { key: string; label: string; el: HTMLElement };

const ACTIVE_MARK = ['ring-2', 'ring-tone-warning', 'bg-tone-warning/50'];

/**
 * The application being scored, laid out for reading: who and what up top,
 * then the answers with a sticky section index that follows the scroll and a
 * find-in-answers that highlights every match and steps through them.
 */
export function ApplicationPane({
  detail, scrollRef, searchOpen, onSearchOpenChange, searchInputRef,
}: {
  detail: ReviewDetail;
  /** The element that scrolls this pane — its own column on desktop, the whole page when stacked. */
  scrollRef: RefObject<HTMLDivElement>;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  searchInputRef: RefObject<HTMLInputElement>;
}) {
  const { submission: sub, program } = detail;
  const fields = detail.fields as FormField[];
  const answers = detail.answers as Answers;
  const answersRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [matchIndex, setMatchIndex] = useState(0);
  const minutes = useMemo(() => readingMinutes(fields, answers), [fields, answers]);
  const totalMatches = useMemo(() => countMatches(fields, answers, term), [fields, answers, term]);

  // The index is read from what AnswersView actually rendered, so it can never list a section that isn't there.
  useLayoutEffect(() => {
    const root = answersRef.current;
    if (!root) return;
    const sections = [...root.querySelectorAll<HTMLElement>('section')];
    setToc(sections.map((el, i) => ({ key: `s${i}`, label: el.querySelector('h3')?.textContent?.trim() || 'Application', el })));
  }, [fields, answers]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || toc.length === 0) return;
    const onScroll = () => {
      const top = container.getBoundingClientRect().top + (barRef.current?.offsetHeight ?? 40) + 24;
      let current = toc[0].key;
      for (const item of toc) {
        if (item.el.getBoundingClientRect().top <= top) current = item.key;
      }
      // At the very bottom the last short section can never reach the top; count it as read.
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 4) {
        const last = toc[toc.length - 1];
        if (last.el.getBoundingClientRect().top < container.getBoundingClientRect().bottom) current = last.key;
      }
      setActive(prev => (prev === current ? prev : current));
    };
    onScroll();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [toc, scrollRef]);

  const scrollToEl = (el: Element, center = false) => {
    const container = scrollRef.current;
    if (!container) return;
    const c = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const offset = center ? c.height / 2 - r.height / 2 : (barRef.current?.offsetHeight ?? 40) + 16;
    container.scrollTo({ top: container.scrollTop + r.top - c.top - offset, behavior: 'smooth' });
  };

  // Debounce typing into the highlight so long answers don't re-render per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setTerm(query.trim()), 120);
    return () => window.clearTimeout(t);
  }, [query]);
  useEffect(() => {
    if (!searchOpen) {
      setQuery('');
      setTerm('');
    }
  }, [searchOpen]);

  useEffect(() => {
    const marks = answersRef.current ? [...answersRef.current.querySelectorAll('mark')] : [];
    setMatchCount(marks.length);
    setMatchIndex(0);
    if (marks[0]) scrollToEl(marks[0], true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  useEffect(() => {
    const marks = answersRef.current ? [...answersRef.current.querySelectorAll('mark')] : [];
    marks.forEach((m, i) => (i === matchIndex ? m.classList.add(...ACTIVE_MARK) : m.classList.remove(...ACTIVE_MARK)));
  }, [matchIndex, matchCount, term]);

  const step = (dir: 1 | -1) => {
    const marks = answersRef.current ? [...answersRef.current.querySelectorAll('mark')] : [];
    if (!marks.length) return;
    const next = (matchIndex + dir + marks.length) % marks.length;
    setMatchIndex(next);
    scrollToEl(marks[next], true);
  };

  const hidden = totalMatches - matchCount;

  return (
    <div className="min-w-0">
      <div ref={barRef} className="sticky top-0 z-10 flex h-10 items-center gap-2 border-b bg-background px-3 sm:px-5">
        {searchOpen ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 animate-fade-in">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={searchInputRef}
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  onSearchOpenChange(false);
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  step(e.shiftKey ? -1 : 1);
                }
              }}
              placeholder="Find in answers…"
              aria-label="Find in answers"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            />
            {term.length >= 2 && (
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground" aria-live="polite">
                {matchCount ? `${matchIndex + 1} of ${matchCount}` : hidden > 0 ? '' : 'No matches'}
                {hidden > 0 && <span className="ml-1.5 text-faint">{matchCount ? '· ' : ''}{hidden} in collapsed answers</span>}
              </span>
            )}
            <Tip label="Previous match" keys={['⇧', '↵']}>
              <IconButton size="sm" aria-label="Previous match" disabled={matchCount < 2} onClick={() => step(-1)}><ChevronUp /></IconButton>
            </Tip>
            <Tip label="Next match" keys={['↵']}>
              <IconButton size="sm" aria-label="Next match" disabled={matchCount < 2} onClick={() => step(1)}><ChevronDown /></IconButton>
            </Tip>
            <Tip label="Close" keys={['Esc']}>
              <IconButton size="sm" aria-label="Close search" onClick={() => onSearchOpenChange(false)}><X /></IconButton>
            </Tip>
          </div>
        ) : (
          <>
            <nav aria-label="Sections" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-none">
              {toc.map(item => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => scrollToEl(item.el)}
                  aria-current={active === item.key ? 'true' : undefined}
                  className={cn(
                    'h-7 shrink-0 rounded-md px-2 text-[12.5px] transition-colors',
                    active === item.key ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </nav>
            <Tip label="Find in answers" keys={['/']}>
              <IconButton aria-label="Find in answers" onClick={() => onSearchOpenChange(true)}><Search /></IconButton>
            </Tip>
          </>
        )}
      </div>

      <article className="mx-auto max-w-[760px] px-4 pb-16 pt-6 sm:px-8 sm:pt-8">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular-nums">{sub.reference}</span>
          {sub.submittedAt && <><span aria-hidden>·</span><span>Submitted {longDate(sub.submittedAt)}</span></>}
          <span aria-hidden>·</span>
          <span>{minutes} min read</span>
        </div>
        <h1 className="mt-1.5 text-[22px] font-semibold leading-tight tracking-tight">{sub.title}</h1>

        <div className="mt-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          {program.blindReview ? (
            <div className="flex items-start gap-3 rounded-lg border border-dashed bg-subtle px-3.5 py-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><EyeOff className="h-4 w-4" /></span>
              <div className="min-w-0">
                <div className="text-[13px] font-medium">Identity hidden — blind review</div>
                <p className="text-xs leading-snug text-muted-foreground">Score the application on its merits. Names and contact details are hidden from every reviewer on this panel.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border bg-subtle px-3.5 py-3">
              <Avatar name={sub.applicantOrganization || sub.applicantName} color="#8b8d98" size={32} />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium">{sub.applicantOrganization || sub.applicantName || 'Applicant'}</div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {sub.applicantOrganization && sub.applicantName && <span className="truncate">{sub.applicantName}</span>}
                  {sub.applicantLocation && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{sub.applicantLocation}</span></span>}
                </div>
              </div>
            </div>
          )}
          {sub.requestedAmount != null && (
            <div className="flex flex-col justify-center rounded-lg border bg-subtle px-3.5 py-2.5 sm:min-w-[140px]">
              <span className="text-xs text-muted-foreground">Requested</span>
              <span className="text-[16px] font-semibold tabular-nums">{formatMoney(sub.requestedAmount, program.currency)}</span>
            </div>
          )}
        </div>

        <div ref={answersRef} className="mt-8">
          <AnswersView fields={fields} answers={answers} currency={program.currency} highlight={searchOpen ? term : undefined} />
        </div>
        {!searchOpen && (
          <p className="mt-10 hidden items-center justify-center gap-1.5 text-xs text-muted-foreground md:flex">
            <Kbd>/</Kbd> find in answers
          </p>
        )}
      </article>
    </div>
  );
}
