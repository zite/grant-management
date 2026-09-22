import { useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { cn } from '@project/components/lib/utils';
import { errorMessage } from '../../lib/errors';
import { qk } from '../../lib/queries';
import type { Bootstrap } from '../../lib/types';

type RunOptions<T> = {
  success?: string | ((res: T) => string | null);
  error: string;
  /** Written into the bootstrap cache before the request leaves; rolled back if it fails. */
  optimistic?: (data: Bootstrap) => Bootstrap;
  alsoInvalidate?: Array<readonly unknown[]>;
};

/**
 * Every settings write: an optional optimistic cache write, the call, a toast
 * either way, then a bootstrap refetch so pickers and the sidebar re-render
 * from the server's truth.
 */
export function useSettingsMutation() {
  const qc = useQueryClient();
  return useCallback(
    async <T,>(request: () => Promise<T>, opts: RunOptions<T>): Promise<T | undefined> => {
      let previous: Bootstrap | undefined;
      if (opts.optimistic) {
        await qc.cancelQueries({ queryKey: qk.bootstrap });
        previous = qc.getQueryData<Bootstrap>(qk.bootstrap);
        if (previous) qc.setQueryData<Bootstrap>(qk.bootstrap, opts.optimistic(previous));
      }
      try {
        const res = await request();
        const message = typeof opts.success === 'function' ? opts.success(res) : opts.success;
        if (message) toast.success(message);
        return res;
      } catch (e) {
        if (previous) qc.setQueryData(qk.bootstrap, previous);
        toast.error(errorMessage(e, opts.error));
        return undefined;
      } finally {
        for (const key of opts.alsoInvalidate ?? []) void qc.invalidateQueries({ queryKey: key });
        await qc.invalidateQueries({ queryKey: qk.bootstrap });
      }
    },
    [qc],
  );
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/** Why the current section is read-only for the viewer, or null when they can edit it. */
export const SettingsLockContext = createContext<string | null>(null);
export const useSettingsLock = () => useContext(SettingsLockContext);

/** Disables every control inside when the section is locked. The server refuses these writes anyway; this says so first. */
export function Locked({ children, className }: { children: ReactNode; className?: string }) {
  const lock = useSettingsLock();
  if (!lock) return <>{children}</>;
  return (
    <fieldset disabled className={cn('min-w-0', className)}>
      {children}
    </fieldset>
  );
}

export function LockBanner({ message }: { message: string }) {
  return (
    <div className="mb-6 flex items-start gap-2 rounded-lg border bg-subtle px-3 py-2.5 text-[13px] text-muted-foreground">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function SettingsPageTitle({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
      <div className="min-w-0 flex-1">
        <h2 className="text-[20px] font-semibold tracking-[-0.01em]">{title}</h2>
        {description && <p className="mt-1 max-w-[580px] text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {actions && (
        <Locked>
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        </Locked>
      )}
    </div>
  );
}

export function SettingsSection({ title, description, actions, children, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('mb-10 last:mb-0', className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('divide-y overflow-hidden rounded-lg border bg-background', className)}>{children}</div>;
}

/** Label and explanation on the left, the control on the right; stacks on a phone. */
export function SettingsRow({ label, description, htmlFor, children, className, stacked }: { label: ReactNode; description?: ReactNode; htmlFor?: string; children?: ReactNode; className?: string; stacked?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-2.5 px-4 py-3.5', !stacked && 'sm:flex-row sm:items-center sm:justify-between sm:gap-6', className)}>
      <div className="min-w-0 sm:max-w-[300px]">
        <label htmlFor={htmlFor} className="block text-[13px] font-medium">{label}</label>
        {description && <div className="mt-0.5 text-[12.5px] text-muted-foreground">{description}</div>}
      </div>
      {children && <div className={cn('min-w-0', stacked ? 'w-full' : 'flex shrink-0 items-center gap-2 sm:w-[320px] sm:justify-end')}>{children}</div>}
    </div>
  );
}

export function Field({ label, htmlFor, hint, error, children, className }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium">{label}</label>
      {children}
      {error ? <p className="text-xs text-tone-danger">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export const inputClass = 'h-8 text-[13px] md:text-[13px]';
export const selectTriggerClass = 'h-8 text-[13px]';
export const selectItemClass = 'text-[13px]';

/** Pills that filter a list, each with its count. */
export function FilterPills({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string; count?: number }> }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none" role="tablist">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] transition-colors',
            value === o.value ? 'border-border bg-accent font-medium text-foreground' : 'border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          )}
        >
          {o.label}
          {o.count != null && <span className="tabular-nums text-muted-foreground">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forms with a save bar
// ---------------------------------------------------------------------------

/**
 * A draft of some saved values. Edits stay local until saved; a change saved
 * elsewhere is adopted only while there are no unsaved edits here.
 */
export function useDraft<T extends Record<string, unknown>>(base: T) {
  const [draft, setDraft] = useState<T>(base);
  const baseKey = JSON.stringify(base);
  const lastBase = useRef(baseKey);
  const dirty = JSON.stringify(draft) !== baseKey;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (lastBase.current !== baseKey) {
      const wasClean = JSON.stringify(draft) === lastBase.current;
      lastBase.current = baseKey;
      if (wasClean) setDraft(base);
    }
  }, [baseKey]);
  const set = useCallback((patch: Partial<T>) => setDraft(d => ({ ...d, ...patch })), []);
  const reset = useCallback(() => setDraft(JSON.parse(baseKey) as T), [baseKey]);
  const changed = (Object.keys(base) as Array<keyof T>).filter(k => JSON.stringify(draft[k]) !== JSON.stringify(base[k]));
  return { draft, set, reset, dirty, changed, setDraft };
}

export function SaveBar({ dirty, saving, onSave, onDiscard, disabled, message = 'You have unsaved changes' }: { dirty: boolean; saving: boolean; onSave: () => void; onDiscard: () => void; disabled?: boolean; message?: string }) {
  const lock = useSettingsLock();
  useEffect(() => {
    if (!dirty) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'Enter')) {
        e.preventDefault();
        if (!disabled && !saving) onSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, disabled, saving, onSave]);
  if (lock || !dirty) return null;
  return (
    <div className="sticky bottom-4 z-20 mt-8 animate-fade-up">
      <div className="flex items-center gap-3 rounded-lg border bg-popover px-4 py-2.5 shadow-lg">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-tone-warning" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px]">{message}</span>
        <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>Discard</Button>
        <Button size="sm" onClick={onSave} disabled={saving || disabled}>{saving ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </div>
  );
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** "example.org" → "https://example.org"; returns an error message for anything that still isn't a web address. */
export function normalizeUrl(value: string): { url: string; error: string | null } {
  const t = value.trim();
  if (!t) return { url: '', error: null };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'https:') return { url: t, error: 'Use a secure https:// address' };
    if (!u.hostname.includes('.')) return { url: t, error: 'Enter a full address, like example.org' };
    return { url: withScheme, error: null };
  } catch {
    return { url: t, error: 'Enter a full address, like example.org' };
  }
}
