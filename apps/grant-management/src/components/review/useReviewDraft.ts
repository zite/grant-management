import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { saveReview } from 'zitejs/api';
import { errorMessage } from '../../lib/errors';
import { qk } from '../../lib/queries';
import type { ReviewDetail } from '../../lib/types';
import { draftFrom, sameDraft, type Draft } from './reviewModel';

/**
 * The scorecard's local draft and its autosave.
 *
 * Local state is the source of truth while someone scores: every change bumps
 * a version, a debounced save sends the latest snapshot, and saves run one
 * after another so an older snapshot can never land after a newer one. Until a
 * change is confirmed saved it is also kept in localStorage, so a crash, a
 * closed laptop or a dropped connection never costs a reviewer their notes —
 * the draft comes back the next time they open the review.
 */

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 800;
const RETRY_MS = [4000, 10000, 30000];
const backupKey = (id: string) => `grants:review-draft:${id}`;

type Backup = { base: Draft; draft: Draft; at: number };

function readBackup(id: string): Backup | null {
  try {
    const raw = localStorage.getItem(backupKey(id));
    return raw ? (JSON.parse(raw) as Backup) : null;
  } catch {
    return null;
  }
}
function writeBackup(id: string, base: Draft, draft: Draft) {
  try {
    localStorage.setItem(backupKey(id), JSON.stringify({ base, draft, at: Date.now() } satisfies Backup));
  } catch {
    /* storage full or blocked — the server save still runs */
  }
}
function clearBackup(id: string) {
  try {
    localStorage.removeItem(backupKey(id));
  } catch {
    /* ignore */
  }
}

const isConflict = (e: unknown) => /\((409|404)\)|not found|reopen this review|decision has been made|moved to another stage|withdrew/i.test(String((e as Error)?.message ?? ''));

export function useReviewDraft(detail: ReviewDetail, editable: boolean) {
  const qc = useQueryClient();
  const id = detail.review.id;

  const [draft, setDraftState] = useState<Draft>(() => draftFrom(detail));
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const draftRef = useRef(draft);
  const baseRef = useRef<Draft>(draftFrom(detail)); // what the server has
  const version = useRef(0);
  const savedVersion = useRef(0);
  const running = useRef(0);
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const timer = useRef<number | null>(null);
  const retryTimer = useRef<number | null>(null);
  const retries = useRef(0);
  const editableRef = useRef(editable);
  editableRef.current = editable;

  const isDirty = useCallback(() => version.current !== savedVersion.current, []);

  const clearTimers = () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (retryTimer.current) window.clearTimeout(retryTimer.current);
    timer.current = null;
    retryTimer.current = null;
  };

  const step = useCallback(async (): Promise<boolean> => {
    if (!isDirty()) return true;
    if (!editableRef.current) return false;
    const v = version.current;
    const snapshot = draftRef.current;
    running.current += 1;
    setStatus('saving');
    try {
      const res = await saveReview({
        id,
        action: 'save',
        scores: snapshot.scores,
        comment: snapshot.comment,
        applicantFeedback: snapshot.applicantFeedback,
        recommendation: snapshot.recommendation,
      });
      savedVersion.current = Math.max(savedVersion.current, v);
      baseRef.current = snapshot;
      retries.current = 0;
      qc.setQueryData(qk.review(id), (old: ReviewDetail | undefined) =>
        old ? { ...old, review: { ...old.review, ...snapshot, status: res.status, totalScore: res.totalScore } } : old,
      );
      if (isDirty()) writeBackup(id, snapshot, draftRef.current);
      else clearBackup(id);
      setLastSavedAt(Date.now());
      setError(null);
      setStatus(isDirty() ? 'pending' : 'saved');
      void qc.invalidateQueries({ queryKey: qk.myReviewsRoot });
      return true;
    } catch (e) {
      setError(errorMessage(e, "Couldn't save your changes"));
      setStatus('error');
      if (isConflict(e)) {
        // The review was closed or finished elsewhere: retrying can't help, the fresh copy explains why.
        void qc.invalidateQueries({ queryKey: qk.review(id) });
      } else if (retries.current < RETRY_MS.length) {
        const wait = RETRY_MS[retries.current];
        retries.current += 1;
        if (retryTimer.current) window.clearTimeout(retryTimer.current);
        retryTimer.current = window.setTimeout(() => void save(), wait);
      }
      return false;
    } finally {
      running.current -= 1;
    }
  }, [id, qc, isDirty]);

  /** Queue a save of whatever is current. Saves are serialised; each sends the latest snapshot. */
  const save = useCallback((): Promise<boolean> => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const next = chain.current.then(step, step);
    chain.current = next;
    return next;
  }, [step]);

  /** Save now and wait until everything typed so far is on the server. */
  const flush = useCallback(async (): Promise<boolean> => {
    for (let i = 0; i < 3; i++) {
      const ok = await save();
      if (!ok) return false;
      if (!isDirty()) return true;
    }
    return !isDirty();
  }, [save, isDirty]);

  const update = useCallback(
    (patch: Partial<Draft>) => {
      if (!editableRef.current) return;
      const next = { ...draftRef.current, ...patch };
      draftRef.current = next;
      setDraftState(next);
      version.current += 1;
      writeBackup(id, baseRef.current, next);
      setStatus('pending');
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void save(), DEBOUNCE_MS);
    },
    [id, save],
  );

  /** After a submit or recusal the server holds the draft; nothing is left to autosave. */
  const markSaved = useCallback(() => {
    clearTimers();
    savedVersion.current = version.current;
    baseRef.current = draftRef.current;
    clearBackup(id);
    setStatus('saved');
    setError(null);
    setLastSavedAt(Date.now());
  }, [id]);

  /** Stop the debounce so a submit can take over, and wait for any save already on the wire. */
  const settle = useCallback(async () => {
    clearTimers();
    await chain.current;
  }, []);

  // A fresh server copy (another tab, a reopen, a background refetch) replaces the draft only when nothing local is pending.
  useEffect(() => {
    const server = draftFrom(detail);
    if (isDirty() || running.current > 0) return;
    baseRef.current = server;
    if (!sameDraft(server, draftRef.current)) {
      draftRef.current = server;
      setDraftState(server);
    }
  }, [detail, isDirty]);

  // Bring back changes that never reached the server — but only if the server hasn't moved on since.
  const checkedBackup = useRef<string | null>(null);
  useEffect(() => {
    if (checkedBackup.current === id) return; // effects run twice in StrictMode; restore once
    checkedBackup.current = id;
    const backup = readBackup(id);
    if (!backup) return;
    const server = draftFrom(detail);
    if (!editable || !sameDraft(backup.base, server) || sameDraft(backup.draft, server)) {
      clearBackup(id);
      return;
    }
    draftRef.current = backup.draft;
    setDraftState(backup.draft);
    version.current += 1;
    toast.message('Restored changes that hadn’t saved yet', { description: 'Saving them now.' });
    void save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty()) return;
      void save();
      e.preventDefault();
      e.returnValue = '';
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && isDirty()) void save();
    };
    const onOnline = () => {
      if (isDirty()) {
        retries.current = 0;
        void save();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('online', onOnline);
      // Leaving by any route (sidebar, palette, back button): send what's pending. The request outlives the component.
      clearTimers();
      if (isDirty()) void save();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return { draft, update, status, error, lastSavedAt, save, flush, settle, markSaved, isDirty };
}
