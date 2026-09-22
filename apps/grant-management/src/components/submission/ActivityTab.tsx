import { Copy, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { addNote, updateNote } from 'zitejs/api';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { cn } from '@project/components/lib/utils';
import { useAppActions } from '../../lib/app-actions';
import { copyText } from '../../lib/clipboard';
import { errorMessage } from '../../lib/errors';
import type { Note, SubmissionDetail } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { MemberAvatar } from '../primitives/Avatar';
import { describeActivity, groupActivity } from './activityText';
import { MentionText, RelTime, TONE_CHIP, useDetailCache } from './detailBits';
import { fromStored, NoteComposer } from './NoteComposer';

type Filter = 'all' | 'notes' | 'history';

export function ActivityTab({ detail }: { detail: SubmissionDetail }) {
  const ws = useWorkspace();
  const [filter, setFilter] = useState<Filter>('all');
  const { patch, refresh } = useDetailCache(detail.submission.id);

  const timeline = useMemo(() => {
    type Entry = { kind: 'history'; at: string; key: string; item: ReturnType<typeof groupActivity>[number] } | { kind: 'note'; at: string; key: string; item: Note };
    const entries: Entry[] = [];
    if (filter !== 'notes') for (const g of groupActivity(detail.activity)) entries.push({ kind: 'history', at: g.entry.occurredAt ?? '', key: g.entry.id, item: g });
    if (filter !== 'history') for (const n of detail.notes) entries.push({ kind: 'note', at: n.postedAt ?? '', key: n.id, item: n });
    return entries.sort((a, b) => a.at.localeCompare(b.at));
  }, [detail.activity, detail.notes, filter]);

  const post = async (body: string) => {
    const temp: Note = { id: `tmp-${Date.now()}`, authorId: ws.me.id, body, postedAt: new Date().toISOString(), editedAt: null };
    patch(d => ({ ...d, notes: [...d.notes, temp] }));
    try {
      const created = await addNote({ submissionId: detail.submission.id, body });
      patch(d => ({ ...d, notes: d.notes.map(n => (n.id === temp.id ? created : n)) }));
      refresh({ everything: false });
    } catch (e) {
      patch(d => ({ ...d, notes: d.notes.filter(n => n.id !== temp.id) }));
      toast.error(errorMessage(e, "Couldn't add the note"));
      throw e;
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex items-center rounded-md bg-muted p-0.5 text-xs" role="radiogroup" aria-label="Show">
          {([['all', 'All'], ['notes', `Notes${detail.notes.length ? ` ${detail.notes.length}` : ''}`], ['history', 'History']] as const).map(([f, label]) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              onClick={() => setFilter(f)}
              className={cn('h-6 rounded-[5px] px-2.5 text-muted-foreground transition-colors hover:text-foreground', filter === f && 'bg-background text-foreground shadow-2xs')}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">Oldest first</span>
      </div>

      {timeline.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">
          {filter === 'notes' ? 'No notes yet. Notes are internal — use them to share context with your team.' : 'Nothing has happened here yet.'}
        </p>
      ) : (
        <div className="relative">
          <div className="absolute bottom-3 left-[11.5px] top-3 w-px bg-border" aria-hidden />
          {timeline.map(e =>
            e.kind === 'history' ? (
              <HistoryRow key={e.key} detail={detail} entry={e.item} />
            ) : (
              <NoteCard key={e.key} note={e.item} detail={detail} />
            ),
          )}
        </div>
      )}

      <div className="mt-4">
        <NoteComposer onSubmit={post} />
      </div>
    </div>
  );
}

function HistoryRow({ detail, entry }: { detail: SubmissionDetail; entry: ReturnType<typeof groupActivity>[number] }) {
  const ws = useWorkspace();
  const { actor, text, icon: Icon, tone } = describeActivity(entry.entry, ws, detail, entry.group);
  const member = entry.entry.actorType === 'Member' && entry.entry.actorId ? ws.memberById.get(entry.entry.actorId) : undefined;
  return (
    <div className="relative flex items-start gap-2.5 py-1.5 text-[12.5px] leading-5 text-muted-foreground">
      <span className={cn('relative z-[1] mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full ring-4 ring-background', member ? 'bg-background' : TONE_CHIP[tone])}>
        {member ? <MemberAvatar member={member} size={20} /> : <Icon className="h-3 w-3" />}
      </span>
      <span className="min-w-0 flex-1 pt-px">
        <span className="font-medium text-foreground/90">{actor}</span> {text}
        <span className="text-muted-foreground/80"> · </span>
        <RelTime iso={entry.entry.occurredAt} className="text-muted-foreground/90" />
      </span>
      {member && (
        <span className={cn('mt-[3px] hidden h-4 w-4 shrink-0 items-center justify-center rounded sm:flex', TONE_CHIP[tone])} aria-hidden>
          <Icon className="h-2.5 w-2.5" />
        </span>
      )}
    </div>
  );
}

function NoteCard({ note, detail }: { note: Note; detail: SubmissionDetail }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const { patch, refresh } = useDetailCache(detail.submission.id);
  const [editing, setEditing] = useState(false);
  const author = note.authorId ? ws.memberById.get(note.authorId) : undefined;
  const mine = note.authorId === ws.me.id;
  const pending = note.id.startsWith('tmp-');

  const save = async (body: string) => {
    const before = note.body;
    patch(d => ({ ...d, notes: d.notes.map(n => (n.id === note.id ? { ...n, body, editedAt: new Date().toISOString() } : n)) }));
    setEditing(false);
    try {
      await updateNote({ id: note.id, body });
      refresh({ everything: false });
    } catch (e) {
      patch(d => ({ ...d, notes: d.notes.map(n => (n.id === note.id ? { ...n, body: before } : n)) }));
      toast.error(errorMessage(e, "Couldn't save the note"));
    }
  };

  const remove = async () => {
    const ok = await app.confirm({ title: 'Delete this note?', description: 'It will be removed for everyone on your team. This can’t be undone.', confirmLabel: 'Delete note', destructive: true });
    if (!ok) return;
    const snapshot = detail.notes;
    patch(d => ({ ...d, notes: d.notes.filter(n => n.id !== note.id) }));
    try {
      await updateNote({ id: note.id, delete: true });
      toast.success('Note deleted');
    } catch (e) {
      patch(d => ({ ...d, notes: snapshot }));
      toast.error(errorMessage(e, "Couldn't delete the note"));
    }
  };

  return (
    <div className={cn('group/note relative my-2 ml-8 rounded-lg border bg-card shadow-2xs animate-fade-up', pending && 'opacity-70')}>
      <span className="absolute -left-8 top-2.5 z-[1] rounded-full ring-4 ring-background">
        <MemberAvatar member={author} size={22} />
      </span>
      <div className="flex items-center gap-2 px-3.5 pt-2.5">
        <span className="text-[13px] font-medium">{author?.name ?? 'A former team member'}</span>
        <span className="text-xs text-muted-foreground">
          <RelTime iso={note.postedAt} />
          {note.editedAt && ' · edited'}
        </span>
        {!pending && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Note actions" className="ml-auto flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/note:opacity-100 data-[state=open]:opacity-100 max-sm:opacity-100">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem className="text-[13px]" onSelect={() => copyText(fromStored(note.body).text, 'Copied note')}>
                <Copy className="h-3.5 w-3.5" /> Copy text
              </DropdownMenuItem>
              {(mine || ws.isAdmin) && <DropdownMenuSeparator />}
              {mine && (
                <DropdownMenuItem className="text-[13px]" onSelect={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </DropdownMenuItem>
              )}
              {(mine || ws.isAdmin) && (
                <DropdownMenuItem className="text-[13px] text-destructive focus:text-destructive" onSelect={remove}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete…
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {editing ? (
        <div className="p-2">
          <NoteComposer initialBody={note.body} onSubmit={save} onCancel={() => setEditing(false)} submitLabel="Save" autoFocus />
        </div>
      ) : (
        <MentionText body={note.body} className="px-3.5 pb-3 pt-1 text-[13.5px] leading-relaxed" />
      )}
    </div>
  );
}
