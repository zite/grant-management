import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@project/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@project/components/ui/popover';
import { FIELD_CATALOG } from '@project/shared/forms/catalog';
import { FIELD_TYPES, type FieldType } from '@project/shared/forms/types';
import { FieldIcon } from '@project/shared/ui/FieldIcon';

const GROUP_ORDER = ['Text', 'Choice', 'Numbers & dates', 'Files & contact', 'Layout'] as const;

const KEYWORDS: Partial<Record<FieldType, string[]>> = {
  short_text: ['text', 'input', 'name', 'title'],
  long_text: ['paragraph', 'essay', 'narrative', 'textarea'],
  single_choice: ['radio', 'multiple choice', 'options'],
  multiple_choice: ['checkbox', 'select many'],
  dropdown: ['select', 'list'],
  yes_no: ['boolean', 'toggle', 'consent', 'agree'],
  currency: ['money', 'budget', 'dollars', 'request'],
  file: ['upload', 'attachment', 'document', 'pdf', 'budget'],
  section: ['page', 'step', 'heading', 'group'],
  content: ['instructions', 'paragraph', 'markdown', 'info'],
  url: ['link', 'portfolio'],
};

/** Searchable question types, grouped like the catalog. Arrow keys move, Enter adds. */
export function FieldPalette({ open, onOpenChange, onPick, trigger, align = 'center', side = 'bottom' }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (type: FieldType) => void;
  trigger: ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom';
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string>('short_text');
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  // Ranked by hand: a label that starts with the query beats one that merely contains it, which beats a keyword hit.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const scored = FIELD_TYPES.map(type => {
      const meta = FIELD_CATALOG[type];
      const label = meta.label.toLowerCase();
      const words = label.split(/[\s/]+/);
      const hay = [meta.description, ...(KEYWORDS[type] ?? []), type.replace('_', ' ')].join(' ').toLowerCase();
      const score = label === q ? 100 : label.startsWith(q) ? 80 : words.some(w => w.startsWith(q)) ? 60 : label.includes(q) ? 40 : hay.split(/\W+/).some(w => w.startsWith(q)) ? 20 : hay.includes(q) ? 10 : 0;
      return { type, score };
    }).filter(x => x.score > 0);
    return scored.sort((a, b) => b.score - a.score || FIELD_TYPES.indexOf(a.type) - FIELD_TYPES.indexOf(b.type)).map(x => x.type);
  }, [query]);

  useEffect(() => {
    setActive(matches ? matches[0] ?? '' : 'short_text');
  }, [matches]);

  const item = (type: FieldType) => {
    const meta = FIELD_CATALOG[type];
    return (
      <CommandItem
        key={type}
        value={type}
        onSelect={() => {
          onPick(type);
          onOpenChange(false);
        }}
        className="gap-2.5 rounded-[5px] px-2 py-1.5 text-[13px]"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-2xs">
          <FieldIcon type={type} className="!h-3.5 !w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium leading-5">{meta.label}</span>
          <span className="block truncate text-xs leading-4 text-muted-foreground">{meta.description}</span>
        </span>
      </CommandItem>
    );
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        collisionPadding={12}
        className="w-[320px] overflow-hidden p-0 shadow-lg"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
        onCloseAutoFocus={e => e.preventDefault()}
      >
        <Command loop shouldFilter={false} value={active} onValueChange={setActive}>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Add a question…" className="h-10 text-[13px]" aria-label="Search question types" />
          <CommandList className="max-h-[min(420px,60vh)] p-1">
            {matches?.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No question type matches.</p>}
            {matches
              ? matches.map(item)
              : GROUP_ORDER.map(group => (
                  <CommandGroup
                    key={group}
                    heading={group}
                    className="p-0 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {FIELD_TYPES.filter(t => FIELD_CATALOG[t].group === group).map(item)}
                  </CommandGroup>
                ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
