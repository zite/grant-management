import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { addDays, addHours, differenceInCalendarDays, format, isToday, isTomorrow, isYesterday, nextMonday, parseISO, set, startOfMonth, startOfWeek, subWeeks } from 'date-fns';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { listNotifications, updateNotifications, type ListNotificationsOutputType } from 'zitejs/api';
import { errorMessage } from '../../lib/errors';
import { refreshSoon } from '../../lib/mutations';
import { qk } from '../../lib/queries';
import type { Bootstrap } from '../../lib/types';

export type InboxItem = ListNotificationsOutputType['notifications'][number];
export type InboxList = ListNotificationsOutputType;
export type InboxTab = 'inbox' | 'unread' | 'snoozed' | 'archived';
/** The lists actually fetched; Unread is the inbox filtered on the client so read items don't vanish mid-triage. */
export type InboxSource = 'inbox' | 'snoozed' | 'archived';

export const inboxKey = (source: InboxSource) => [...qk.notificationsRoot, source] as const;
export const sourceFor = (tab: InboxTab): InboxSource => (tab === 'unread' ? 'inbox' : tab);

export function useNotifications(source: InboxSource) {
  return useQuery({
    queryKey: inboxKey(source),
    queryFn: () => listNotifications({ filter: source }),
    refetchInterval: 60_000,
    staleTime: 15_000,
  });
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export type InboxGroup = { label: string; items: InboxItem[] };

function pastLabel(iso: string | null, now: Date) {
  if (!iso) return 'Older';
  const d = parseISO(iso);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  if (d >= weekStart) return 'Earlier this week';
  if (d >= subWeeks(weekStart, 1)) return 'Last week';
  if (d >= startOfMonth(now)) return 'Earlier this month';
  return 'Older';
}

function wakeLabel(iso: string | null) {
  if (!iso) return 'Later';
  const d = parseISO(iso);
  if (isToday(d)) return 'Back later today';
  if (isTomorrow(d)) return 'Back tomorrow';
  if (differenceInCalendarDays(d, new Date()) < 7) return 'Back this week';
  return 'Back later';
}

export function groupItems(items: InboxItem[], tab: InboxTab): InboxGroup[] {
  const now = new Date();
  const groups: InboxGroup[] = [];
  for (const n of items) {
    const label = tab === 'snoozed' ? wakeLabel(n.snoozedUntil) : tab === 'archived' ? pastLabel(n.archivedAt, now) : pastLabel(n.sortAt, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Snooze presets
// ---------------------------------------------------------------------------

export type SnoozeOption = { key: string; label: string; hint: string; until: Date };

export function snoozeOptions(now = new Date()): SnoozeOption[] {
  const nineAm = (d: Date) => set(d, { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 });
  const hour = addHours(now, 1);
  const tomorrow = nineAm(addDays(now, 1));
  const monday = nineAm(nextMonday(now));
  return [
    { key: 'hour', label: 'In 1 hour', hint: format(hour, 'h:mm a'), until: hour },
    { key: 'tomorrow', label: 'Tomorrow', hint: format(tomorrow, 'EEE h:mm a'), until: tomorrow },
    { key: 'monday', label: 'Next Monday', hint: format(monday, 'MMM d, h:mm a'), until: monday },
  ];
}

export function untilLabel(iso: string | null | undefined) {
  if (!iso) return '';
  const d = parseISO(iso);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isTomorrow(d)) return `Tomorrow, ${format(d, 'h:mm a')}`;
  return format(d, differenceInCalendarDays(d, new Date()) < 7 ? 'EEEE, h:mm a' : 'MMM d, h:mm a');
}

// ---------------------------------------------------------------------------
// Optimistic writes
// ---------------------------------------------------------------------------

const isLive = (n: InboxItem) => !n.archivedAt && (!n.snoozedUntil || Date.parse(n.snoozedUntil) <= Date.now());
const bySortDesc = (a: InboxItem, b: InboxItem) => (b.sortAt ?? '').localeCompare(a.sortAt ?? '');

type Snapshot = Array<[readonly unknown[], unknown]>;

function snapshot(qc: QueryClient): Snapshot {
  return [...qc.getQueriesData({ queryKey: qk.notificationsRoot }), [qk.bootstrap, qc.getQueryData(qk.bootstrap)]];
}

function restore(qc: QueryClient, snap: Snapshot) {
  for (const [key, data] of snap) qc.setQueryData(key, data);
}

function patchList(qc: QueryClient, source: InboxSource, fn: (items: InboxItem[]) => InboxItem[]) {
  qc.setQueryData<InboxList>(inboxKey(source), old => (old ? { ...old, notifications: fn(old.notifications) } : old));
}

/** Counts shown on the tabs and the sidebar badge move with every optimistic write. */
function shiftCounts(qc: QueryClient, delta: { inbox?: number; unread?: number; snoozed?: number }) {
  const clamp = (n: number) => Math.max(0, n);
  qc.setQueriesData<InboxList>({ queryKey: qk.notificationsRoot }, old =>
    old?.counts
      ? { ...old, counts: { inbox: clamp(old.counts.inbox + (delta.inbox ?? 0)), unread: clamp(old.counts.unread + (delta.unread ?? 0)), snoozed: clamp(old.counts.snoozed + (delta.snoozed ?? 0)) } }
      : old,
  );
  if (delta.unread) {
    qc.setQueryData<Bootstrap>(qk.bootstrap, old => (old ? { ...old, counts: { ...old.counts, inboxUnread: clamp(old.counts.inboxUnread + delta.unread!) } } : old));
  }
}

/** Keep the sidebar badge honest when a poll finds new notifications. */
export function syncUnreadBadge(qc: QueryClient, unread: number) {
  const boot = qc.getQueryData<Bootstrap>(qk.bootstrap);
  if (boot && boot.counts.inboxUnread !== unread) qc.setQueryData<Bootstrap>(qk.bootstrap, { ...boot, counts: { ...boot.counts, inboxUnread: unread } });
}

export function useInboxActions() {
  const qc = useQueryClient();

  const run = useCallback(
    async (apply: () => void, request: () => Promise<unknown>, failure: string) => {
      await qc.cancelQueries({ queryKey: qk.notificationsRoot });
      const snap = snapshot(qc);
      apply();
      try {
        await request();
        refreshSoon(qc, [qk.notificationsRoot], 2500);
        return true;
      } catch (e) {
        restore(qc, snap);
        toast.error(errorMessage(e, failure));
        return false;
      }
    },
    [qc],
  );

  const setRead = useCallback(
    (items: InboxItem[], read: boolean) => {
      const targets = items.filter(n => Boolean(n.readAt) !== read);
      if (!targets.length) return Promise.resolve(true);
      const ids = new Set(targets.map(n => n.id));
      const at = read ? new Date().toISOString() : null;
      const liveChanged = targets.filter(isLive).length;
      return run(
        () => {
          for (const source of ['inbox', 'snoozed', 'archived'] as const) patchList(qc, source, list => list.map(n => (ids.has(n.id) ? { ...n, readAt: at } : n)));
          shiftCounts(qc, { unread: read ? -liveChanged : liveChanged });
        },
        () => updateNotifications({ action: read ? 'read' : 'unread', ids: [...ids] }),
        read ? "Couldn't mark that as read" : "Couldn't mark that as unread",
      );
    },
    [qc, run],
  );

  const unarchive = useCallback(
    (items: InboxItem[], opts: { quiet?: boolean } = {}) => {
      if (!items.length) return Promise.resolve(true);
      const ids = new Set(items.map(n => n.id));
      const back = items.map(n => ({ ...n, archivedAt: null, snoozedUntil: null }));
      const unread = back.filter(n => !n.readAt).length;
      return run(
        () => {
          patchList(qc, 'archived', list => list.filter(n => !ids.has(n.id)));
          patchList(qc, 'inbox', list => [...list.filter(n => !ids.has(n.id)), ...back].sort(bySortDesc));
          shiftCounts(qc, { inbox: back.length, unread });
        },
        () => updateNotifications({ action: 'unarchive', ids: [...ids] }),
        "Couldn't move that back to your inbox",
      ).then(ok => {
        if (ok && !opts.quiet) toast.success(items.length === 1 ? 'Moved back to your inbox' : `Moved ${items.length} back to your inbox`);
        return ok;
      });
    },
    [qc, run],
  );

  const archive = useCallback(
    (items: InboxItem[], opts: { message?: string } = {}) => {
      if (!items.length) return Promise.resolve(true);
      const ids = new Set(items.map(n => n.id));
      const live = items.filter(isLive);
      const snoozed = items.filter(n => !n.archivedAt && !isLive(n));
      const archivedAt = new Date().toISOString();
      return run(
        () => {
          patchList(qc, 'inbox', list => list.filter(n => !ids.has(n.id)));
          patchList(qc, 'snoozed', list => list.filter(n => !ids.has(n.id)));
          qc.setQueryData<InboxList>(inboxKey('archived'), old =>
            old ? { ...old, notifications: [...items.map(n => ({ ...n, archivedAt, snoozedUntil: null })), ...old.notifications.filter(n => !ids.has(n.id))] } : old,
          );
          shiftCounts(qc, { inbox: -live.length, unread: -live.filter(n => !n.readAt).length, snoozed: -snoozed.length });
        },
        () => updateNotifications({ action: 'archive', ids: [...ids] }),
        "Couldn't archive that",
      ).then(ok => {
        if (ok) {
          toast.success(opts.message ?? (items.length === 1 ? 'Archived' : `Archived ${items.length} notifications`), {
            action: { label: 'Undo', onClick: () => void unarchive(items.map(n => ({ ...n, snoozedUntil: null })), { quiet: true }) },
          });
        }
        return ok;
      });
    },
    [qc, run, unarchive],
  );

  const unsnooze = useCallback(
    (items: InboxItem[], opts: { quiet?: boolean } = {}) => {
      if (!items.length) return Promise.resolve(true);
      const ids = new Set(items.map(n => n.id));
      // Woken by hand, it returns to where it was; only a snooze that runs out resurfaces at the top.
      const back = items.map(n => ({ ...n, snoozedUntil: null }));
      return run(
        () => {
          patchList(qc, 'snoozed', list => list.filter(n => !ids.has(n.id)));
          patchList(qc, 'inbox', list => [...list.filter(n => !ids.has(n.id)), ...back].sort(bySortDesc));
          shiftCounts(qc, { inbox: back.length, unread: back.filter(n => !n.readAt).length, snoozed: -back.length });
        },
        () => updateNotifications({ action: 'unsnooze', ids: [...ids] }),
        "Couldn't unsnooze that",
      ).then(ok => {
        if (ok && !opts.quiet) toast.success('Back in your inbox');
        return ok;
      });
    },
    [qc, run],
  );

  const snooze = useCallback(
    (items: InboxItem[], option: SnoozeOption) => {
      if (!items.length) return Promise.resolve(true);
      const ids = new Set(items.map(n => n.id));
      const until = option.until.toISOString();
      const wasLive = items.filter(isLive);
      const moved = items.map(n => ({ ...n, snoozedUntil: until }));
      return run(
        () => {
          patchList(qc, 'inbox', list => list.filter(n => !ids.has(n.id)));
          qc.setQueryData<InboxList>(inboxKey('snoozed'), old =>
            old ? { ...old, notifications: [...old.notifications.filter(n => !ids.has(n.id)), ...moved].sort((a, b) => (a.snoozedUntil ?? '').localeCompare(b.snoozedUntil ?? '')) } : old,
          );
          shiftCounts(qc, { inbox: -wasLive.length, unread: -wasLive.filter(n => !n.readAt).length, snoozed: wasLive.length });
        },
        () => updateNotifications({ action: 'snooze', ids: [...ids], until }),
        "Couldn't snooze that",
      ).then(ok => {
        if (ok) {
          toast.success(`Snoozed until ${untilLabel(until)}`, {
            action: { label: 'Undo', onClick: () => void unsnooze(moved.map(n => ({ ...n, snoozedUntil: null })), { quiet: true }) },
          });
        }
        return ok;
      });
    },
    [qc, run, unsnooze],
  );

  const markAllRead = useCallback(() => {
    const list = qc.getQueryData<InboxList>(inboxKey('inbox'));
    const unread = list?.counts.unread ?? 0;
    const at = new Date().toISOString();
    return run(
      () => {
        patchList(qc, 'inbox', items => items.map(n => (n.readAt ? n : { ...n, readAt: at })));
        shiftCounts(qc, { unread: -unread });
      },
      () => updateNotifications({ action: 'read', all: true }),
      "Couldn't mark everything as read",
    ).then(ok => {
      if (ok) toast.success('Marked everything as read');
      return ok;
    });
  }, [qc, run]);

  const archiveAllRead = useCallback(() => {
    const list = qc.getQueryData<InboxList>(inboxKey('inbox'));
    const read = (list?.notifications ?? []).filter(n => n.readAt);
    if (!read.length) {
      toast('Nothing read to archive', { description: 'Items you have read will be swept into Archived.' });
      return Promise.resolve(false);
    }
    const ids = new Set(read.map(n => n.id));
    return run(
      () => {
        patchList(qc, 'inbox', items => items.filter(n => !ids.has(n.id)));
        shiftCounts(qc, { inbox: -read.length });
      },
      () => updateNotifications({ action: 'archive', all: true }),
      "Couldn't archive what you've read",
    ).then(ok => {
      if (ok) {
        toast.success(`Archived ${read.length} read notification${read.length === 1 ? '' : 's'}`, {
          action: { label: 'Undo', onClick: () => void unarchive(read, { quiet: true }) },
        });
      }
      return ok;
    });
  }, [qc, run, unarchive]);

  return useMemo(() => ({ setRead, archive, unarchive, snooze, unsnooze, markAllRead, archiveAllRead }), [setRead, archive, unarchive, snooze, unsnooze, markAllRead, archiveAllRead]);
}
