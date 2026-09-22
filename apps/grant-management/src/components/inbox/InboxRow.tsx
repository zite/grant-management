import { AlarmClock, AlarmClockOff, Archive, ArchiveRestore, Mail, MailOpen } from 'lucide-react';
import { memo, useMemo, type ReactNode } from 'react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@project/components/ui/dropdown-menu';
import { cn } from '@project/components/lib/utils';
import { timeAgo } from '../../lib/format';
import type { Workspace } from '../../lib/workspace';
import { Glyph, IconButton, Kbd, Tip } from '../primitives/bits';
import { snoozeOptions, untilLabel, type InboxItem, type InboxTab, type SnoozeOption } from './inboxData';
import { ActorAvatar, typeMeta } from './inboxMeta';

/** Snooze presets as a menu. Digits pick while it's open, so S then 2 snoozes until tomorrow. */
export function SnoozeMenu({ item, open, onOpenChange, onSnooze, onUnsnooze, children, align = 'end' }: {
  item: InboxItem;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSnooze: (option: SnoozeOption) => void;
  onUnsnooze: () => void;
  children: ReactNode;
  align?: 'start' | 'end';
}) {
  const options = useMemo(() => (open === false ? [] : snoozeOptions()), [open]);
  const snoozed = Boolean(item.snoozedUntil && Date.parse(item.snoozedUntil) > Date.now());
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="w-[272px]"
        onClick={e => e.stopPropagation()}
        onCloseAutoFocus={e => e.preventDefault()}
        onKeyDown={e => {
          const i = Number(e.key) - 1;
          if (options[i] && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            onOpenChange?.(false);
            onSnooze(options[i]);
          }
        }}
      >
        <DropdownMenuLabel className="text-2xs font-medium text-muted-foreground">
          {snoozed ? `Snoozed until ${untilLabel(item.snoozedUntil)}` : 'Snooze until…'}
        </DropdownMenuLabel>
        {options.map((o, i) => (
          <DropdownMenuItem key={o.key} className="text-[13px]" onSelect={() => onSnooze(o)}>
            <span className="whitespace-nowrap">{o.label}</span>
            <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">{o.hint}</span>
            <Kbd className="ml-1.5">{i + 1}</Kbd>
          </DropdownMenuItem>
        ))}
        {snoozed && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-[13px]" onSelect={onUnsnooze}>
              <AlarmClockOff className="h-3.5 w-3.5" /> Unsnooze now
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type RowActions = {
  toggleRead: (item: InboxItem) => void;
  archive: (item: InboxItem) => void;
  snooze: (item: InboxItem, option: SnoozeOption) => void;
  unsnooze: (item: InboxItem) => void;
};

function InboxRowInner({ item, ws, tab, active, sticky, snoozeOpen, onSnoozeOpenChange, onSelect, actions }: {
  item: InboxItem;
  ws: Workspace;
  tab: InboxTab;
  active: boolean;
  /** Read during this visit to Unread — shown, but no longer bold. */
  sticky?: boolean;
  snoozeOpen: boolean;
  onSnoozeOpenChange: (open: boolean) => void;
  onSelect: (item: InboxItem) => void;
  actions: RowActions;
}) {
  const unread = !item.readAt;
  const program = item.programId ? ws.programById.get(item.programId) : undefined;
  const meta = typeMeta(item.type);
  const when = tab === 'snoozed' ? untilLabel(item.snoozedUntil) : timeAgo(tab === 'archived' ? item.occurredAt : item.sortAt).replace(' ago', '');
  const context = item.submissionReference && item.submissionReference !== 'Draft' ? item.submissionReference : program?.key;

  return (
    <div
      aria-current={active ? 'true' : undefined}
      data-inbox-id={item.id}
      onClick={() => onSelect(item)}
      className={cn(
        'group relative flex cursor-default gap-3 border-b border-border/50 py-2.5 pl-5 pr-4 outline-none transition-colors duration-75',
        active ? 'bg-accent' : 'hover:bg-accent/50',
      )}
    >
      {unread && <span className="absolute left-2 top-[21px] h-1.5 w-1.5 rounded-full bg-primary" aria-label="Unread" />}
      <span className="mt-0.5">
        <ActorAvatar item={item} ws={ws} size={28} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('truncate text-[13px]', unread ? 'font-semibold text-foreground' : sticky ? 'font-medium' : 'font-normal text-foreground/85')}>{item.title}</span>
          <span className={cn('ml-auto shrink-0 text-xs tabular-nums text-muted-foreground', 'group-hover:invisible', (active || snoozeOpen) && 'invisible')}>
            {tab === 'snoozed' && <AlarmClock className="mr-1 inline h-3 w-3 -translate-y-px" />}
            {when}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">{item.body || meta.label}</span>
          {program && (
            <span className="flex max-w-[45%] shrink-0 items-center gap-1 text-xs">
              <Glyph icon={program.icon} color={program.color} size={14} className="text-[9px]" />
              <span className="truncate tabular-nums">{context}</span>
            </span>
          )}
        </div>
      </div>
      <div
        className={cn('absolute right-2.5 top-1.5 items-center gap-0.5 rounded-md border bg-popover p-0.5 shadow-sm', active || snoozeOpen ? 'flex' : 'hidden group-hover:flex')}
        onClick={e => e.stopPropagation()}
      >
        <Tip label={unread ? 'Mark as read' : 'Mark as unread'} keys={['U']}>
          <IconButton size="sm" aria-label={unread ? 'Mark as read' : 'Mark as unread'} onClick={() => actions.toggleRead(item)}>
            {unread ? <MailOpen /> : <Mail />}
          </IconButton>
        </Tip>
        {tab !== 'archived' && (
          <SnoozeMenu item={item} open={snoozeOpen} onOpenChange={onSnoozeOpenChange} onSnooze={o => actions.snooze(item, o)} onUnsnooze={() => actions.unsnooze(item)}>
            <IconButton size="sm" aria-label="Snooze">
              <AlarmClock />
            </IconButton>
          </SnoozeMenu>
        )}
        <Tip label={tab === 'archived' ? 'Move back to inbox' : 'Archive'} keys={['E']}>
          <IconButton size="sm" aria-label={tab === 'archived' ? 'Move back to inbox' : 'Archive'} onClick={() => actions.archive(item)}>
            {tab === 'archived' ? <ArchiveRestore /> : <Archive />}
          </IconButton>
        </Tip>
      </div>
    </div>
  );
}

export const InboxRow = memo(InboxRowInner);
