import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * A form's local copy of server values, with dirty tracking. While there are
 * no edits it follows the server (so a save, or someone else's change, shows
 * up); once edited it holds still until saved or discarded.
 */
export function useDraft<T extends Record<string, unknown>>(source: T | undefined) {
  const [base, setBase] = useState<T | undefined>(source);
  const [draft, setDraft] = useState<T | undefined>(source);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const baseRef = useRef(base);
  baseRef.current = base;

  useEffect(() => {
    if (!source) return;
    const pristine = !baseRef.current || same(draftRef.current, baseRef.current);
    setBase(source);
    if (pristine) setDraft(source);
  }, [JSON.stringify(source ?? null)]);

  const dirty = useMemo(() => Boolean(draft && base && !same(draft, base)), [draft, base]);

  const set = useCallback((patch: Partial<T>) => setDraft(prev => (prev ? { ...prev, ...patch } : prev)), []);
  const reset = useCallback(() => setDraft(baseRef.current), []);
  /** Only the fields that differ from the server — what an update should send. */
  const changes = useCallback((): Partial<T> => {
    const out: Partial<T> = {};
    const d = draftRef.current;
    const b = baseRef.current;
    if (!d || !b) return out;
    for (const k of Object.keys(d) as Array<keyof T>) if (!same(d[k], b[k])) out[k] = d[k];
    return out;
  }, []);
  /** After a successful save, treat the draft as the new baseline until the refetch lands. */
  const commit = useCallback(() => setBase(draftRef.current), []);

  return { draft, base, dirty, set, reset, changes, commit };
}
