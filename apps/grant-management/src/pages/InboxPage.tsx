import { useQueryClient } from '@tanstack/react-query';
import { AlarmClock, Archive, CheckCheck, Inbox, Keyboard, MoreHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@project/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle } from '@project/components/ui/sheet';
import { cn } from '@project/components/lib/utils';
import { EmptyPreview, InboxPreview } from '../components/inbox/InboxPreview';
import { InboxRow, type RowActions } from '../components/inbox/InboxRow';
import { groupItems, sourceFor, syncUnreadBadge, useInboxActions, useNotifications, type InboxItem, type InboxTab, type SnoozeOption } from '../components/inbox/inboxData';
import { destinationFor } from '../components/inbox/inboxMeta';
import { EmptyState, IconButton, Kbd } from '../components/primitives/bits';
import { PageHeader, useDocumentTitle } from '../components/shell/PageHeader';
import { useAppActions } from '../lib/app-actions';
import { hasOpenOverlay, shouldIgnore, useHotkeys } from '../lib/hotkeys';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useWorkspace } from '../lib/workspace';

const TAB_KEY = 'grants:inbox:tab';
const TABS: InboxTab[] = ['inbox', 'unread', 'snoozed', 'archived'];

function readTab(): InboxTab {
  try {
    const v = localStorage.getItem(TAB_KEY) as InboxTab | null;
    return v && TABS.includes(v) ? v : 'inbox';
  } catch {
    return 'inbox';
  }
}

/**
 * Inbox keys run in the capture phase so they win over shortcuts registered by
 * whatever is rendered in the preview (a submission's own S for "stage", say).
 * A "G then …" navigation still belongs to the shell.
 */
function useInboxKeys(handlers: Record<string, (e: KeyboardEvent) => void>) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    let lastG = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (shouldIgnore(e) || hasOpenOverlay()) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === 'g') {
        lastG = Date.now();
        return;
      }
      if (Date.now() - lastG < 1200) {
        lastG = 0;
        return;
      }
      const combo = `${e.shiftKey && key.length === 1 ? 'shift+' : ''}${key}`;
      const handler = ref.current[combo];
      if (!handler) return;
      const target = e.target as HTMLElement | null;
      // Enter on a focused button or link means that control, not "open".
      if (key === 'Enter' && target?.closest?.('button, a, [role="button"], [role="menuitem"]')) return;
      // Arrow keys inside the preview scroll it rather than moving through the list.
      if ((key.startsWith('Arrow') || key === 'Enter') && target?.closest?.('[data-inbox-preview]')) return;
      e.preventDefault();
      e.stopPropagation();
      handler(e);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}

export function InboxPage() {
  const ws = useWorkspace();
  const app = useAppActions();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const desktop = useMediaQuery('(min-width: 1024px)');
  const [tab, setTabState] = useState<InboxTab>(readTab);
  const { data, isPending, isError, refetch } = useNotifications(sourceFor(tab));
  const actions = useInboxActions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null);
  // Read while looking at Unread: they stay listed (not bold) until you leave the tab.
  const [sticky, setSticky] = useState<Set<string>>(() => new Set());
  const markTimer = useRef<number | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);

  const unreadCount = data?.counts.unread ?? ws.counts.inboxUnread;
  useDocumentTitle(unreadCount ? `Inbox (${unreadCount})` : 'Inbox');

  useEffect(() => {
    if (data) syncUnreadBadge(qc, data.counts.unread);
  }, [data, qc]);

  useEffect(() => () => window.clearTimeout(markTimer.current), []);

  const setTab = (next: InboxTab) => {
    setTabState(next);
    setSelectedId(null);
    setSticky(new Set());
    setSheetOpen(false);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const items = useMemo(() => {
    const all = data?.notifications ?? [];
    return tab === 'unread' ? all.filter(n => !n.readAt || sticky.has(n.id)) : all;
  }, [data, tab, sticky]);
  const groups = useMemo(() => groupItems(items, tab), [items, tab]);
  const selected = items.find(n => n.id === selectedId) ?? null;

  const latest = useRef({ items, selected, tab, desktop });
  latest.current = { items, selected, tab, desktop };

  // A notification that vanished (archived elsewhere, snoozed from the preview) takes the selection with it.
  useEffect(() => {
    if (selectedId && data && !items.some(n => n.id === selectedId)) {
      setSelectedId(null);
      setSheetOpen(false);
    }
  }, [items, selectedId, data]);

  const scrollTo = (id: string) => {
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-inbox-id="${id}"]`)?.scrollIntoView({ block: 'nearest' }));
  };

  const select = useCallback(
    (item: InboxItem, how: 'click' | 'key') => {
      setSelectedId(item.id);
      if (latest.current.tab === 'unread') setSticky(s => (s.has(item.id) ? s : new Set(s).add(item.id)));
      window.clearTimeout(markTimer.current);
      if (!item.readAt) {
        const mark = () => {
          const current = latest.current.items.find(n => n.id === item.id);
          if (current && !current.readAt) actions.setRead([current], true);
        };
        // Clicking opens it; skimming past with J and K only counts once you pause on it.
        if (how === 'click') mark();
        else markTimer.current = window.setTimeout(mark, 450);
      }
      if (how === 'click' && !latest.current.desktop) setSheetOpen(true);
      scrollTo(item.id);
    },
    [actions],
  );

  const onRowSelect = useCallback((item: InboxItem) => select(item, 'click'), [select]);

  /** After an item leaves the list, keep the keyboard where it was: the next one down, or the one above. */
  const selectNeighbour = useCallback(
    (item: InboxItem) => {
      const { items: list, selected: current, desktop: wide } = latest.current;
      if (current?.id !== item.id) return;
      const i = list.findIndex(n => n.id === item.id);
      const next = list[i + 1] ?? list[i - 1];
      if (next && wide) select(next, 'key');
      else {
        setSelectedId(null);
        setSheetOpen(false);
      }
    },
    [select],
  );

  const rowActions = useMemo<RowActions>(
    () => ({
      toggleRead: item => void actions.setRead([item], !item.readAt),
      archive: item => {
        selectNeighbour(item);
        if (item.archivedAt) void actions.unarchive([item]);
        else void actions.archive([item]);
      },
      snooze: (item: InboxItem, option: SnoozeOption) => {
        selectNeighbour(item);
        void actions.snooze([item], option);
      },
      unsnooze: item => {
        selectNeighbour(item);
        void actions.unsnooze([item]);
      },
    }),
    [actions, selectNeighbour],
  );

  const open = useCallback(
    (item: InboxItem) => {
      const dest = destinationFor(item, ws);
      if (!dest) return;
      if (!item.readAt) void actions.setRead([item], true);
      if (dest.kind === 'route') navigate(dest.to);
      else app.openPeek(dest.id);
    },
    [ws, actions, navigate, app],
  );

  const move = (delta: number) => {
    const { items: list, selected: current } = latest.current;
    if (!list.length) return;
    const i = current ? list.indexOf(current) : -1;
    const nextIndex = i < 0 ? (delta > 0 ? 0 : list.length - 1) : Math.max(0, Math.min(list.length - 1, i + delta));
    if (list[nextIndex] && list[nextIndex].id !== current?.id) select(list[nextIndex], 'key');
  };

  useInboxKeys({
    j: () => move(1),
    ArrowDown: () => move(1),
    k: () => move(-1),
    ArrowUp: () => move(-1),
    Enter: () => latest.current.selected && open(latest.current.selected),
    ArrowRight: () => latest.current.selected && open(latest.current.selected),
    e: () => latest.current.selected && rowActions.archive(latest.current.selected),
    u: () => latest.current.selected && rowActions.toggleRead(latest.current.selected),
    s: () => {
      const current = latest.current.selected;
      if (current && latest.current.tab !== 'archived') setSnoozeFor(current.id);
    },
    'shift+e': () => {
      if (latest.current.tab === 'archived') return;
      void actions.archiveAllRead();
    },
  });

  useHotkeys({ esc: () => latest.current.selected && latest.current.desktop && setSelectedId(null) });

  const tabs: Array<{ value: InboxTab; label: string; count?: number }> = [
    { value: 'inbox', label: 'Inbox', count: data?.counts.inbox },
    { value: 'unread', label: 'Unread', count: data?.counts.unread },
    { value: 'snoozed', label: 'Snoozed', count: data?.counts.snoozed },
    { value: 'archived', label: 'Archived' },
  ];

  const preview = selected ? (
    <InboxPreview
      key={selected.id}
      item={selected}
      ws={ws}
      tab={tab}
      actions={rowActions}
      onOpen={open}
      onBack={desktop ? undefined : () => setSheetOpen(false)}
      onClosePreview={() => (desktop ? setSelectedId(null) : setSheetOpen(false))}
    />
  ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={<Inbox />}
        title="Inbox"
        actions={
          <>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-[12.5px] text-muted-foreground hover:text-foreground" disabled={!unreadCount} onClick={() => void actions.markAllRead()}>
              <CheckCheck className="!size-3.5" /> <span className="hidden sm:inline">Mark all read</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton aria-label="Inbox actions">
                  <MoreHorizontal />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem className="text-[13px]" disabled={!unreadCount} onSelect={() => void actions.markAllRead()}>
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all as read
                </DropdownMenuItem>
                <DropdownMenuItem className="text-[13px]" disabled={tab === 'archived'} onSelect={() => void actions.archiveAllRead()}>
                  <Archive className="h-3.5 w-3.5" /> Archive all read
                  <span className="ml-auto flex gap-0.5"><Kbd>⇧</Kbd><Kbd>E</Kbd></span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-[13px]" onSelect={() => app.openShortcuts()}>
                  <Keyboard className="h-3.5 w-3.5" /> Keyboard shortcuts
                  <span className="ml-auto"><Kbd>?</Kbd></span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex w-full min-w-0 flex-col lg:w-[400px] lg:shrink-0 lg:border-r">
          <div className="flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b px-2 scrollbar-none" role="tablist" aria-label="Inbox filters">
            {tabs.map(t => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                onClick={() => setTab(t.value)}
                className={cn(
                  'flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] transition-colors',
                  tab === t.value ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                {t.label}
                {t.count ? <span className="tabular-nums text-muted-foreground">{t.count}</span> : null}
              </button>
            ))}
          </div>
          <div ref={listRef} aria-label="Notifications" className="min-h-0 flex-1 overflow-y-auto">
            {isPending ? (
              <div className="space-y-px pt-1">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex gap-3 px-5 py-3">
                    <div className="skeleton h-7 w-7 rounded-full" />
                    <div className="flex-1 space-y-2 pt-0.5">
                      <div className="skeleton h-3" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
                      <div className="skeleton h-2.5" style={{ width: `${35 + ((i * 29) % 40)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : isError ? (
              <EmptyState
                icon={<Inbox />}
                title="Your inbox didn’t load"
                description="Check your connection and try again."
                action={<Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>}
              />
            ) : items.length === 0 ? (
              <div className="lg:hidden">
                <EmptyState
                  icon={tab === 'snoozed' ? <AlarmClock /> : tab === 'archived' ? <Archive /> : <CheckCheck />}
                  title={tab === 'snoozed' ? 'Nothing snoozed' : tab === 'archived' ? 'Nothing archived yet' : 'You’re all caught up'}
                  description={tab === 'inbox' || tab === 'unread' ? 'New submissions, messages, mentions and review updates will show up here.' : undefined}
                />
              </div>
            ) : (
              groups.map(g => (
                <section key={g.label} aria-label={g.label}>
                  <div className="sticky top-0 z-10 flex h-7 items-center border-b border-border/50 bg-subtle/95 px-5 text-xs font-medium text-muted-foreground backdrop-blur-sm">
                    {g.label}
                    <span className="ml-1.5 tabular-nums text-faint">{g.items.length}</span>
                  </div>
                  {g.items.map(n => (
                    <InboxRow
                      key={n.id}
                      item={n}
                      ws={ws}
                      tab={tab}
                      active={n.id === selectedId}
                      sticky={sticky.has(n.id)}
                      snoozeOpen={snoozeFor === n.id}
                      onSnoozeOpenChange={o => setSnoozeFor(o ? n.id : null)}
                      onSelect={onRowSelect}
                      actions={rowActions}
                    />
                  ))}
                </section>
              ))
            )}
          </div>
          {items.length > 0 && (
            <div className="hidden h-8 shrink-0 items-center gap-3 border-t px-4 text-2xs text-muted-foreground lg:flex">
              <span className="flex items-center gap-1"><Kbd>J</Kbd><Kbd>K</Kbd> move</span>
              <span className="flex items-center gap-1"><Kbd>E</Kbd> {tab === 'archived' ? 'restore' : 'archive'}</span>
              <span className="flex items-center gap-1"><Kbd>U</Kbd> read</span>
              {tab !== 'archived' && <span className="flex items-center gap-1"><Kbd>S</Kbd> snooze</span>}
              <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
            </div>
          )}
        </div>
        {desktop && (
          <div data-inbox-preview className="hidden min-w-0 flex-1 overflow-hidden lg:block">
            {preview ?? <EmptyPreview tab={tab} empty={!isPending && items.length === 0} />}
          </div>
        )}
      </div>
      {!desktop && (
        <Sheet open={sheetOpen && Boolean(selected)} onOpenChange={setSheetOpen}>
          <SheetContent data-inbox-preview side="right" className="w-full gap-0 p-0 sm:max-w-full [&>button:first-child]:hidden">
            <SheetTitle className="sr-only">{selected?.title ?? 'Notification'}</SheetTitle>
            {preview}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
