import { useContext, useEffect, useRef } from 'react';
import { UNSAFE_NavigationContext } from 'react-router-dom';
import type { Draft } from './draft';

/**
 * Nobody loses form edits by clicking away.
 *
 * The app uses <HashRouter>, where React Router's `useBlocker` isn't available,
 * so while there are unsaved changes this wraps the router's navigator: every
 * in-app navigation (links, tabs, the command palette, "G then X") asks first.
 * Closing or reloading the tab gets the browser's own prompt. The one path a
 * router can't intercept — the browser's back button — is covered by keeping
 * the draft in memory, so returning to the form brings the changes back.
 */

type Navigator = { push: (...args: unknown[]) => void; replace: (...args: unknown[]) => void };

export function useLeaveGuard(opts: {
  when: boolean;
  /** Paths that don't leave this form (switching between its own URLs). */
  allow: (pathname: string) => boolean;
  confirm: () => Promise<boolean>;
  /** Called after the person agrees to leave, before navigating. */
  onLeave: () => void;
}) {
  const { navigator } = useContext(UNSAFE_NavigationContext) as unknown as { navigator: Navigator };
  const latest = useRef(opts);
  latest.current = opts;
  const bypass = useRef(false);

  useEffect(() => {
    if (!opts.when) {
      bypass.current = false;
      return;
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    const push = navigator.push;
    const replace = navigator.replace;
    let asking = false;
    const wrap = (original: (...args: unknown[]) => void) =>
      (to: unknown, ...rest: unknown[]) => {
        const pathname = typeof to === 'string' ? to.split(/[?#]/)[0] : String((to as { pathname?: string } | null)?.pathname ?? '');
        if (bypass.current || latest.current.allow(pathname)) return original.call(navigator, to, ...rest);
        if (asking) return;
        asking = true;
        void latest.current.confirm().then(ok => {
          asking = false;
          if (!ok) return;
          bypass.current = true;
          latest.current.onLeave();
          original.call(navigator, to, ...rest);
        });
      };
    navigator.push = wrap(push);
    navigator.replace = wrap(replace);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      navigator.push = push;
      navigator.replace = replace;
    };
  }, [opts.when, navigator]);

  return bypass;
}

/** Unsaved drafts by form id, kept for the life of the tab. */
const drafts = new Map<string, { draft: Draft; stamp: string | null }>();

export const draftStore = {
  get: (formId: string) => drafts.get(formId),
  set: (formId: string, draft: Draft, stamp: string | null) => drafts.set(formId, { draft, stamp }),
  clear: (formId: string) => drafts.delete(formId),
};
