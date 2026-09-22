import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { MOD } from '../../lib/hotkeys';
import { Kbd } from '../primitives/bits';

const GROUPS: Array<{ title: string; items: Array<{ label: string; keys: string[]; then?: boolean }> }> = [
  {
    title: 'General',
    items: [
      { label: 'Command menu', keys: [MOD, 'K'] },
      { label: 'Create…', keys: ['C'] },
      { label: 'Search in current list', keys: ['/'] },
      { label: 'Keyboard shortcuts', keys: ['?'] },
      { label: 'Toggle sidebar', keys: ['['] },
      { label: 'Toggle theme', keys: [MOD, '⇧', 'L'] },
    ],
  },
  {
    title: 'Navigation',
    items: [
      { label: 'Inbox', keys: ['G', 'I'], then: true },
      { label: 'My reviews', keys: ['G', 'R'], then: true },
      { label: 'Submissions', keys: ['G', 'S'], then: true },
      { label: 'Programs', keys: ['G', 'P'], then: true },
      { label: 'Awards', keys: ['G', 'W'], then: true },
      { label: 'Applicants', keys: ['G', 'A'], then: true },
      { label: 'Reports', keys: ['G', 'T'], then: true },
      { label: 'Settings', keys: ['G', ','], then: true },
    ],
  },
  {
    title: 'Submission lists',
    items: [
      { label: 'Move focus', keys: ['J', 'K'] },
      { label: 'Select / deselect', keys: ['X'] },
      { label: 'Extend selection', keys: ['⇧', 'J'] },
      { label: 'Select all', keys: [MOD, 'A'] },
      { label: 'Open submission', keys: ['↵'] },
      { label: 'Peek', keys: ['Space'] },
      { label: 'Clear selection', keys: ['Esc'] },
    ],
  },
  {
    title: 'Submissions',
    items: [
      { label: 'Move to stage', keys: ['S'] },
      { label: 'Set owner', keys: ['O'] },
      { label: 'Make me the owner', keys: ['I'] },
      { label: 'Labels', keys: ['L'] },
      { label: 'Assign reviewers', keys: ['R'] },
      { label: 'Message applicant', keys: ['M'] },
      { label: 'Accept', keys: ['⇧', 'A'] },
      { label: 'Waitlist', keys: ['⇧', 'W'] },
      { label: 'Decline', keys: ['⇧', 'D'] },
      { label: 'Previous / next tab', keys: ['[', ']'] },
      { label: 'Copy reference', keys: [MOD, '.'] },
    ],
  },
  {
    title: 'Reviewing',
    items: [
      { label: 'Score the focused criterion', keys: ['1', '–', '9'] },
      { label: 'Next / previous criterion', keys: ['↓', '↑'] },
      { label: 'Choose a recommendation', keys: ['←', '→', 'Space'] },
      { label: 'Submit review', keys: [MOD, '↵'] },
      { label: 'Save now', keys: [MOD, 'S'] },
      { label: 'Previous / next in queue', keys: ['⇧', 'K', 'J'] },
      { label: 'Find in answers', keys: ['/'] },
      { label: 'Back to My reviews', keys: ['Esc'] },
    ],
  },
  {
    title: 'Inbox',
    items: [
      { label: 'Next / previous notification', keys: ['J', 'K'] },
      { label: 'Open notification', keys: ['↵'] },
      { label: 'Archive', keys: ['E'] },
      { label: 'Archive all read', keys: ['⇧', 'E'] },
      { label: 'Mark read / unread', keys: ['U'] },
      { label: 'Snooze', keys: ['S'] },
      { label: 'Close preview', keys: ['Esc'] },
    ],
  },
  {
    title: 'Form builder',
    items: [
      { label: 'Add a question', keys: ['A'] },
      { label: 'Select next / previous question', keys: ['↓', '↑'] },
      { label: 'Move question down / up', keys: ['⌥', '↓', '↑'] },
      { label: 'Duplicate question', keys: [MOD, 'D'] },
      { label: 'Delete question', keys: ['⌫'] },
      { label: 'Undo', keys: [MOD, 'Z'] },
      { label: 'Redo', keys: [MOD, '⇧', 'Z'] },
      { label: 'Save form', keys: [MOD, 'S'] },
    ],
  },
  {
    title: 'Programs, awards & applicants',
    items: [
      { label: 'Active / closed / archived programs', keys: ['1', '2', '3'] },
      { label: 'Move focus', keys: ['J', 'K'] },
      { label: 'Open', keys: ['↵'] },
      { label: 'Peek award', keys: ['Space'] },
      { label: 'Search the list', keys: ['/'] },
    ],
  },
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0 sm:rounded-xl">
        <DialogHeader className="border-b px-5 pb-3 pt-4">
          <DialogTitle className="text-[15px]">Keyboard shortcuts</DialogTitle>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search shortcuts…" className="mt-2 h-8 rounded-md border bg-transparent px-2.5 text-[13px] outline-none focus:border-foreground/30" />
        </DialogHeader>
        <div className="grid max-h-[62vh] gap-x-8 gap-y-5 overflow-y-auto px-5 py-4 sm:grid-cols-2">
          {GROUPS.map(g => {
            const items = g.items.filter(i => i.label.toLowerCase().includes(q.toLowerCase()));
            if (!items.length) return null;
            return (
              <div key={g.title}>
                <div className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">{g.title}</div>
                {items.map(i => (
                  <div key={i.label} className="flex h-8 items-center justify-between border-b border-border/50 text-[13px] last:border-0">
                    <span>{i.label}</span>
                    <span className="flex items-center gap-1">
                      {i.keys.map((k, n) => (
                        <span key={n} className="flex items-center gap-1">
                          {i.then && n > 0 && <span className="text-2xs text-muted-foreground">then</span>}
                          {k === '–' ? <span className="text-2xs text-muted-foreground">to</span> : <Kbd>{k}</Kbd>}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
