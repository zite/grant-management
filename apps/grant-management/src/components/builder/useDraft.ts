import { useCallback, useMemo, useReducer, useRef } from 'react';
import { sameDraft, type Draft } from './draft';

/**
 * The form being edited, with undo. `base` is what the server has; the form is
 * dirty when the draft differs from it. Typing into one input coalesces into a
 * single undo step, so ⌘Z undoes a whole label rather than a letter.
 */

type State = {
  base: Draft | null;
  draft: Draft | null;
  past: Draft[];
  future: Draft[];
  lastKey: string | null;
  lastAt: number;
};

type Action =
  | { type: 'load'; draft: Draft; restored?: Draft | null }
  | { type: 'commit'; next: Draft; key?: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'discard' }
  | { type: 'saved'; draft: Draft; keepDraft?: boolean };

const HISTORY = 200;
const COALESCE_MS = 1200;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'load':
      return { base: action.draft, draft: action.restored ?? action.draft, past: [], future: [], lastKey: null, lastAt: 0 };
    case 'commit': {
      if (!state.draft || action.next === state.draft) return state;
      const now = Date.now();
      const coalesce = Boolean(action.key) && action.key === state.lastKey && now - state.lastAt < COALESCE_MS;
      return {
        ...state,
        draft: action.next,
        past: coalesce ? state.past : [...state.past, state.draft].slice(-HISTORY),
        future: [],
        lastKey: action.key ?? null,
        lastAt: now,
      };
    }
    case 'undo': {
      if (!state.draft || !state.past.length) return state;
      const prev = state.past[state.past.length - 1];
      return { ...state, draft: prev, past: state.past.slice(0, -1), future: [state.draft, ...state.future], lastKey: null };
    }
    case 'redo': {
      if (!state.draft || !state.future.length) return state;
      const [next, ...rest] = state.future;
      return { ...state, draft: next, past: [...state.past, state.draft], future: rest, lastKey: null };
    }
    case 'discard':
      return state.base ? { ...state, draft: state.base, past: state.draft ? [...state.past, state.draft] : state.past, future: [], lastKey: null } : state;
    case 'saved':
      // Keep history so an accidental save can still be undone back into an unsaved edit.
      // Edits typed while the save was in flight stay in the draft (and keep it dirty).
      return action.keepDraft ? { ...state, base: action.draft } : { ...state, base: action.draft, draft: action.draft, lastKey: null };
    default:
      return state;
  }
}

export function useDraft() {
  const [state, dispatch] = useReducer(reducer, { base: null, draft: null, past: [], future: [], lastKey: null, lastAt: 0 });
  // The newest draft, ahead of React's render, so two edits in one tick both land.
  const latest = useRef<Draft | null>(null);
  latest.current = state.draft;
  const dirty = useMemo(() => Boolean(state.base && state.draft && !sameDraft(state.base, state.draft)), [state.base, state.draft]);
  const load = useCallback((draft: Draft, restored?: Draft | null) => dispatch({ type: 'load', draft, restored }), []);
  const commit = useCallback((next: Draft | ((d: Draft) => Draft), key?: string) => {
    const current = latest.current;
    if (!current) return;
    const value = typeof next === 'function' ? next(current) : next;
    latest.current = value;
    dispatch({ type: 'commit', next: value, key });
  }, []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  const discard = useCallback(() => dispatch({ type: 'discard' }), []);
  const saved = useCallback((draft: Draft, keepDraft = false) => dispatch({ type: 'saved', draft, keepDraft }), []);
  return { latest, base: state.base, draft: state.draft, dirty, canUndo: state.past.length > 0, canRedo: state.future.length > 0, load, commit, undo, redo, discard, saved };
}
