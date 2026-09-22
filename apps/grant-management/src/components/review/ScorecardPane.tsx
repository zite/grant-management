import { ArrowRight, Check, ChevronDown, ChevronRight, Loader2, Lock, RotateCcw, Sparkles, UserX, Users } from 'lucide-react';
import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { toast } from 'sonner';
import { aiDraftApplicantFeedback } from 'zitejs/api';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { cn } from '@project/components/lib/utils';
import { missingCriteria, scoreStats, type Recommendation, type RubricCriterion, type Scores } from '@project/shared/scoring';
import { Markdown } from '@project/shared/ui/Markdown';
import { ScorecardInput, ScoreTotal } from '@project/shared/ui/ScorecardInput';
import { errorMessage } from '../../lib/errors';
import { shortDate } from '../../lib/format';
import { MOD } from '../../lib/hotkeys';
import type { ReviewDetail } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Avatar } from '../primitives/Avatar';
import { ScorePill } from '../primitives/icons';
import { Kbd, Tip } from '../primitives/bits';
import { RecommendationLabel } from './ReviewQueueRow';
import type { Draft } from './reviewModel';
import { SaveIndicator } from './SaveIndicator';
import { criterionRows, focusElement, recommendationButtons } from './scorecardFocus';
import type { SaveStatus } from './useReviewDraft';

export type ScorecardMode = 'edit' | 'submitted' | 'recused' | 'locked';

function useStoredFlag(key: string, initial: boolean) {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? initial : v === '1';
    } catch {
      return initial;
    }
  });
  const set = (next: boolean) => {
    setValue(next);
    try {
      localStorage.setItem(key, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  return [value, set] as const;
}

/** What still stands between the reviewer and Submit, in words. */
export function remainingLabel(criteria: RubricCriterion[], scores: Scores, needsRecommendation: boolean) {
  const missing = missingCriteria(criteria, scores);
  const parts: string[] = [];
  if (missing.length === 1) parts.push(`score ${missing[0].name}`);
  else if (missing.length > 1) parts.push(`score ${missing.length} more criteria`);
  if (needsRecommendation) parts.push('choose a recommendation');
  if (!parts.length) return null;
  const text = parts.join(' and ');
  return text[0].toUpperCase() + text.slice(1);
}

const autosize = { fieldSizing: 'content' } as CSSProperties;

export function ScorecardPane({
  detail, draft, update, mode, attempted, submitting, reopening, saveStatus, lastSavedAt, saveError, onRetrySave, onSubmit, onRecuse, onReopen, onNext,
  flush, scorecardRef, notesRef, stacked, footerRef,
}: {
  detail: ReviewDetail;
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  mode: ScorecardMode;
  attempted: boolean;
  submitting: boolean;
  reopening: boolean;
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  saveError: string | null;
  onRetrySave: () => void;
  onSubmit: () => void;
  onRecuse: () => void;
  onReopen: () => void;
  onNext: (() => void) | null;
  flush: () => Promise<boolean>;
  scorecardRef: RefObject<HTMLDivElement>;
  notesRef: RefObject<HTMLTextAreaElement>;
  stacked: boolean;
  footerRef?: RefObject<HTMLDivElement>;
}) {
  const { rubric, review } = detail;
  const criteria = rubric.criteria as RubricCriterion[];
  const editable = mode === 'edit' && !submitting;
  const [instructionsOpen, setInstructionsOpen] = useStoredFlag('grants:review:instructions-open', true);
  const lastKey = useRef<string | null>(null);

  const missing = attempted && mode === 'edit' ? missingCriteria(criteria, draft.scores) : [];
  const recMissing = attempted && mode === 'edit' && rubric.askRecommendation && !draft.recommendation;
  const remaining = remainingLabel(criteria, draft.scores, rubric.askRecommendation && !draft.recommendation);
  const scopeId = `scorecard-${review.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const scorecardErrors: Record<string, string> = {
    ...Object.fromEntries(missing.map(c => [c.id, 'Score this before you submit'])),
    ...(recMissing ? { recommendation: 'Choose a recommendation before you submit' } : {}),
  };

  const onScoresChange = (next: Scores, criterionId: string) => {
    update({ scores: next });
    // A digit on the last criterion moves on to the recommendation, then to notes — the whole card by keyboard.
    const wasDigit = lastKey.current != null && /^[0-9]$/.test(lastKey.current);
    const last = criteria[criteria.length - 1];
    if (wasDigit && last?.id === criterionId && next[criterionId] != null) {
      window.setTimeout(() => {
        const rec = recommendationButtons(scorecardRef.current);
        if (rec.length) focusElement(rec.find(b => b.getAttribute('aria-checked') === 'true') ?? rec[0]);
        else focusElement(notesRef.current);
      }, 0);
    }
  };

  const onRecommendation = (r: Recommendation | null) => {
    update({ recommendation: r });
    if (lastKey.current === 'Enter' || lastKey.current === ' ') window.setTimeout(() => focusElement(notesRef.current), 0);
  };

  const onWrapKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!target.closest('[role="radiogroup"][aria-label="Recommendation"]')) return;
    const buttons = recommendationButtons(scorecardRef.current);
    const i = buttons.indexOf(target as HTMLButtonElement);
    if (i < 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      buttons[(i + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const rows = criterionRows(scorecardRef.current);
      focusElement(rows[rows.length - 1]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusElement(notesRef.current);
    }
  };

  const mine = review.totalScore;
  const peers = detail.peers ?? [];
  const panel = scoreStats([mine, ...peers.map(p => p.totalScore)]);

  return (
    <div className={cn('flex min-h-0 flex-col', !stacked && 'h-full')}>
      <div className={cn('space-y-5 px-4 py-5 sm:px-5', !stacked && 'min-h-0 flex-1 overflow-y-auto')}>
        {mode === 'locked' && (
          <Banner tone="warning" icon={<Lock />} title="This review is closed">
            {review.lockedReason ?? 'Reviews for this application are closed.'}
            {review.status === 'Submitted' && ' Your submitted scores are kept.'}
          </Banner>
        )}
        {mode === 'submitted' && (
          <Banner
            tone="success"
            icon={<Check />}
            title={`Submitted${review.submittedAt ? ` ${shortDate(review.submittedAt)}` : ''}`}
            action={
              <button type="button" onClick={onReopen} disabled={reopening} className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border bg-background px-2.5 text-[12.5px] font-medium shadow-2xs hover:bg-accent disabled:opacity-60">
                {reopening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Reopen to edit
              </button>
            }
          >
            Thanks — the program team has your scores.
          </Banner>
        )}
        {mode === 'recused' && (
          <Banner
            tone="neutral"
            icon={<UserX />}
            title="You recused yourself"
            action={
              review.locked ? null : (
                <button type="button" onClick={onReopen} disabled={reopening} className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border bg-background px-2.5 text-[12.5px] font-medium shadow-2xs hover:bg-accent disabled:opacity-60">
                  {reopening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Reopen
                </button>
              )
            }
          >
            {review.recusalReason ? <span className="italic">“{review.recusalReason}”</span> : 'You stepped back from this application.'} The program's managers were told, so they can ask someone else.
          </Banner>
        )}

        <section>
          <div className="flex items-center justify-between gap-2">
            <h2 className="truncate text-[13.5px] font-semibold">{rubric.name}</h2>
            {rubric.instructions.trim() && (
              <button type="button" onClick={() => setInstructionsOpen(!instructionsOpen)} aria-expanded={instructionsOpen} className="flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                Instructions <ChevronRight className={cn('h-3 w-3 transition-transform', instructionsOpen && 'rotate-90')} />
              </button>
            )}
          </div>
          {instructionsOpen && rubric.instructions.trim() && (
            <div className="mt-1.5 rounded-md bg-subtle px-3 py-2 text-[12.5px] leading-relaxed text-muted-foreground animate-fade-in">
              <Markdown compact>{rubric.instructions}</Markdown>
            </div>
          )}
          {criteria.length === 0 && (
            <p className="mt-1.5 text-[12.5px] text-muted-foreground">This stage has no scoring criteria — share your recommendation and notes.</p>
          )}
        </section>

        <div
          id={scopeId}
          ref={scorecardRef}
          onKeyDownCapture={e => (lastKey.current = e.key)}
          onPointerDownCapture={() => (lastKey.current = null)}
          onKeyDown={onWrapKeyDown}
          className={cn(mode !== 'edit' && 'opacity-[0.92]')}
        >
          <ScorecardInput
            errors={scorecardErrors}
            criteria={criteria}
            scores={draft.scores}
            onChange={onScoresChange}
            recommendation={draft.recommendation}
            onRecommendation={onRecommendation}
            askRecommendation={rubric.askRecommendation}
            disabled={!editable}
          />
          {editable && !stacked && criteria.length > 0 && <ReviewKeyHints min={Math.min(...criteria.map(c => c.min))} max={Math.min(9, Math.max(...criteria.map(c => c.max)))} className="mt-2.5 justify-center" />}
        </div>

        <section className="space-y-1.5">
          <label htmlFor="review-notes" className="flex items-baseline justify-between gap-2">
            <span className="text-[13.5px] font-medium">Notes for the committee</span>
            <span className="text-xs text-muted-foreground">Never shown to the applicant</span>
          </label>
          <textarea
            id="review-notes"
            ref={notesRef}
            value={draft.comment}
            onChange={e => update({ comment: e.target.value })}
            onKeyDown={e => e.key === 'Escape' && e.currentTarget.blur()}
            readOnly={!editable}
            maxLength={20000}
            placeholder={editable ? 'What stood out? Strengths, concerns, questions for the panel…' : 'No notes.'}
            style={autosize}
            className="block max-h-[50vh] min-h-[104px] w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-[13px] leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/30 read-only:bg-subtle read-only:text-foreground/90"
          />
        </section>

        <FeedbackSection reviewId={review.id} value={draft.applicantFeedback} onChange={v => update({ applicantFeedback: v })} editable={editable} hasMaterial={Boolean(draft.comment.trim()) || Object.values(draft.scores).some(v => v != null)} flush={flush} />

        {mode === 'submitted' && peers.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-[13.5px] font-medium"><Users className="h-3.5 w-3.5 text-muted-foreground" /> Other reviewers</h3>
              {panel.mean != null && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Panel average <ScorePill score={panel.mean} spread={panel.spread} count={panel.count} />
                </span>
              )}
            </div>
            <div className="divide-y rounded-lg border">
              {peers.map((p, i) => (
                <div key={`${p.reviewerName}-${i}`} className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Avatar name={p.reviewerName} color="#8b8d98" size={20} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{p.reviewerName}</span>
                    <RecommendationLabel value={p.recommendation} />
                    <ScorePill score={p.totalScore} />
                  </div>
                  {p.comment.trim() && <p className="mt-1.5 whitespace-pre-wrap break-words pl-7 text-[12.5px] leading-relaxed text-muted-foreground">{p.comment}</p>}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <div ref={footerRef} className={cn('shrink-0 border-t bg-background px-4 py-3 sm:px-5', stacked && 'pb-6')}>
        <div className="flex items-center justify-between gap-3">
          <ScoreTotal criteria={criteria} scores={draft.scores} />
          {mode === 'edit' ? (
            <SaveIndicator status={saveStatus} lastSavedAt={lastSavedAt} error={saveError} onRetry={onRetrySave} />
          ) : mode === 'submitted' && review.totalScore != null ? (
            <RecommendationLabel value={review.recommendation} />
          ) : null}
        </div>
        {mode === 'edit' ? (
          <>
            <div className="mt-2.5 flex items-center gap-2">
              <button type="button" onClick={onRecuse} disabled={submitting} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50">
                <UserX className="h-3.5 w-3.5" /> Recuse
              </button>
              <Tip label={remaining ? `${remaining} first` : 'Submit and go to your next review'} keys={[MOD, '↵']} side="top">
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={submitting}
                  className={cn('ml-auto inline-flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:opacity-70', remaining && 'bg-primary/85')}
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Submit review
                  <span className="hidden items-center gap-0.5 text-[11px] text-primary-foreground/75 sm:inline-flex">{MOD}↵</span>
                </button>
              </Tip>
            </div>
            {remaining && (
              <p className={cn('mt-2 text-xs', attempted ? 'text-tone-danger' : 'text-muted-foreground')} aria-live="polite">
                {attempted ? `${remaining} to submit.` : `To submit: ${remaining.toLowerCase()}.`}
              </p>
            )}
          </>
        ) : onNext ? (
          <div className="mt-2.5 flex items-center">
            <Tip label="Next review" keys={['⇧', 'J']} side="top">
              <button type="button" onClick={onNext} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-[13px] font-medium shadow-2xs hover:bg-accent">
                Next review <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </Tip>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Banner({ tone, icon, title, children, action }: { tone: 'warning' | 'success' | 'neutral'; icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  const toneClass = {
    warning: 'border-tone-warning/30 bg-tone-warning/[0.07] [&_.banner-icon]:text-tone-warning',
    success: 'border-tone-success/30 bg-tone-success/[0.07] [&_.banner-icon]:text-tone-success',
    neutral: 'border-border bg-subtle [&_.banner-icon]:text-muted-foreground',
  }[tone];
  return (
    <div className={cn('rounded-lg border px-3 py-2.5 animate-fade-up', toneClass)} role="status">
      <div className="flex min-h-7 items-center gap-2.5">
        <span className="banner-icon shrink-0 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{title}</span>
        {action}
      </div>
      {children && <div className="mt-1 pl-[26px] text-[12.5px] leading-snug text-muted-foreground">{children}</div>}
    </div>
  );
}

const TONE_KEY = 'grants:review:feedback-tone';

function FeedbackSection({ reviewId, value, onChange, editable, hasMaterial, flush }: { reviewId: string; value: string; onChange: (v: string) => void; editable: boolean; hasMaterial: boolean; flush: () => Promise<boolean> }) {
  const ws = useWorkspace();
  const [openPref, setOpenPref] = useStoredFlag('grants:review:feedback-open', false);
  const [open, setOpenState] = useState(() => openPref || Boolean(value.trim()));
  const setOpen = (next: boolean) => {
    setOpenState(next);
    setOpenPref(next);
  };
  const [tone, setToneState] = useState<'encouraging' | 'direct'>(() => {
    try {
      return localStorage.getItem(TONE_KEY) === 'direct' ? 'direct' : 'encouraging';
    } catch {
      return 'encouraging';
    }
  });
  const [drafting, setDrafting] = useState(false);
  const setTone = (t: 'encouraging' | 'direct') => {
    setToneState(t);
    try {
      localStorage.setItem(TONE_KEY, t);
    } catch {
      /* ignore */
    }
  };

  const draftIt = async (withTone = tone) => {
    if (drafting) return;
    setDrafting(true);
    try {
      await flush();
      const res = await aiDraftApplicantFeedback({ reviewId, tone: withTone });
      if (!res.available) {
        toast.message("AI drafting isn't connected in this workspace", { description: 'You can still write feedback yourself.' });
        return;
      }
      const previous = value;
      onChange(res.feedback);
      toast.success('Drafted from your notes — read it over and make it yours', previous.trim() ? { action: { label: 'Undo', onClick: () => onChange(previous) } } : undefined);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't draft feedback"));
    } finally {
      setDrafting(false);
    }
  };

  if (!editable && !value.trim()) return null;

  return (
    <section className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-accent/50', open && 'rounded-b-none border-b')}
      >
        <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
        <span className="text-[13.5px] font-medium">Feedback for the applicant</span>
        <span className="ml-auto text-xs text-muted-foreground">{value.trim() ? `${value.trim().split(/\s+/).length} words` : 'Optional'}</span>
      </button>
      {open && (
        <div className="space-y-2 p-3 animate-fade-in">
          <p className="text-xs leading-snug text-muted-foreground">This may be shared with the applicant when a decision is sent. Keep it constructive and about the application, not the person.</p>
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && e.currentTarget.blur()}
            readOnly={!editable || drafting}
            maxLength={5000}
            aria-label="Feedback for the applicant"
            placeholder="What worked well, and what would make a future application stronger?"
            style={autosize}
            className="block max-h-[40vh] min-h-[88px] w-full resize-none rounded-md border bg-background px-3 py-2 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground focus:border-foreground/30 read-only:bg-subtle"
          />
          {editable && ws.features.ai && (
            <div className="flex items-center gap-2">
              <div className="inline-flex h-7 items-stretch overflow-hidden rounded-md border bg-background shadow-2xs">
                <Tip label={hasMaterial ? `Write a ${tone} first draft from your scores and notes` : 'Score or add notes first'}>
                  <button type="button" onClick={() => draftIt()} disabled={drafting || !hasMaterial} className="inline-flex items-center gap-1.5 px-2.5 text-[12.5px] font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50">
                    {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-tone-accent" />}
                    {drafting ? 'Drafting…' : 'Draft from my notes'}
                  </button>
                </Tip>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label="Choose a tone" disabled={drafting} className="flex items-center border-l px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-60">
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Tone</DropdownMenuLabel>
                    {([
                      ['encouraging', 'Encouraging', 'Leads with strengths; gaps as next steps'],
                      ['direct', 'Direct', 'Clear about what fell short, still kind'],
                    ] as const).map(([id, label, hint]) => (
                      <DropdownMenuItem key={id} className="items-start text-[13px]" onSelect={() => setTone(id)}>
                        <Check className={cn('mt-0.5 h-3.5 w-3.5', tone === id ? 'opacity-100' : 'opacity-0')} />
                        <span>
                          <span className="block">{label}</span>
                          <span className="block text-xs text-muted-foreground">{hint}</span>
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <span className="text-xs capitalize text-muted-foreground">{tone}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function ReviewKeyHints({ min, max, className }: { min: number; max: number; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground', className)}>
      <span className="flex items-center gap-1"><Kbd>{min}</Kbd>–<Kbd>{max}</Kbd> score</span>
      <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> criterion</span>
      <span className="flex items-center gap-1"><Kbd>{MOD}</Kbd><Kbd>↵</Kbd> submit</span>
    </div>
  );
}
