import { useCallback, useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';

function systemDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && systemDark());
  document.documentElement.classList.toggle('dark', dark);
  return dark ? 'dark' : 'light';
}

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem('grants:theme');
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));

  useEffect(() => {
    setResolved(apply(pref));
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(apply('system'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  // Keep every hook instance (sidebar, palette, settings) in sync.
  useEffect(() => {
    const onStorage = () => setPrefState(readPref());
    window.addEventListener('grants:theme', onStorage);
    return () => window.removeEventListener('grants:theme', onStorage);
  }, []);

  const setPref = useCallback((next: ThemePref) => {
    try {
      localStorage.setItem('grants:theme', next);
    } catch {
      /* ignore */
    }
    setPrefState(next);
    window.dispatchEvent(new Event('grants:theme'));
  }, []);

  const toggle = useCallback(() => setPref(resolved === 'dark' ? 'light' : 'dark'), [resolved, setPref]);

  return { pref, resolved, setPref, toggle };
}
