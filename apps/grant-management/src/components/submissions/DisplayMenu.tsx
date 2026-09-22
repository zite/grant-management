import { Columns3, List, SlidersHorizontal, Table2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@project/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Switch } from '@project/components/ui/switch';
import { cn } from '@project/components/lib/utils';
import { isInputField, type FormField } from '@project/shared/forms/types';
import { FieldIcon } from '@project/shared/ui/FieldIcon';
import { DISPLAY_PROPERTIES, GROUPINGS, ORDERINGS, type Grouping } from '../../lib/constants';
import type { Layout, ViewOptions } from '../../lib/view';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-8 items-center justify-between gap-3">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function MiniSelect<V extends string>({ value, onChange, options }: { value: V; onChange: (v: V) => void; options: ReadonlyArray<{ value: V; label: string }> }) {
  return (
    <Select value={value} onValueChange={v => onChange(v as V)}>
      <SelectTrigger className="h-7 w-[160px] text-[13px] shadow-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(o => (
          <SelectItem key={o.value} value={o.value} className="text-[13px]">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const LAYOUTS: Array<{ value: Layout; label: string; icon: ReactNode }> = [
  { value: 'list', label: 'List', icon: <List className="h-4 w-4" /> },
  { value: 'board', label: 'Board', icon: <Columns3 className="h-4 w-4" /> },
  { value: 'table', label: 'Table', icon: <Table2 className="h-4 w-4" /> },
];

export function LayoutToggle({ layout, onChange }: { layout: Layout; onChange: (l: Layout) => void }) {
  return (
    <div className="flex h-7 items-center rounded-md border bg-background p-0.5" role="radiogroup" aria-label="Layout">
      {LAYOUTS.map(l => (
        <button
          key={l.value}
          type="button"
          role="radio"
          aria-checked={layout === l.value}
          aria-label={`${l.label} layout`}
          title={l.label}
          onClick={() => onChange(l.value)}
          className={cn('flex h-full w-7 items-center justify-center rounded-[4px] text-muted-foreground transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5', layout === l.value ? 'bg-accent text-foreground shadow-2xs' : 'hover:text-foreground')}
        >
          {l.icon}
        </button>
      ))}
    </div>
  );
}

export function DisplayMenu({ options, onChange, onReset, isDirty, answerFields }: {
  options: ViewOptions;
  onChange: (patch: Partial<ViewOptions>) => void;
  onReset: () => void;
  isDirty: boolean;
  /** The single program's questions, when one is in scope — offered as table columns. */
  answerFields?: FormField[];
}) {
  const props = new Set(options.properties);
  const toggleProp = (key: (typeof DISPLAY_PROPERTIES)[number]['key']) => {
    const next = new Set(props);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange({ properties: DISPLAY_PROPERTIES.map(p => p.key).filter(k => next.has(k)) });
  };
  const columns = new Set(options.answerColumns);
  const questions = (answerFields ?? []).filter(isInputField);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="ghost-chip h-7 gap-1.5 text-muted-foreground hover:text-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Display
          {isDirty && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label="Customized" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[80vh] w-[360px] overflow-y-auto p-0 shadow-lg">
        <div className="grid grid-cols-3 gap-1.5 p-3">
          {LAYOUTS.map(l => (
            <button
              key={l.value}
              type="button"
              onClick={() => onChange({ layout: l.value })}
              className={cn('flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-[12.5px] transition-colors', options.layout === l.value ? 'border-primary/50 bg-primary/[0.06] text-foreground' : 'text-muted-foreground hover:bg-accent')}
            >
              {l.icon}
              {l.label}
            </button>
          ))}
        </div>
        <div className="space-y-0.5 border-t px-3 py-2">
          {options.layout !== 'table' && (
            <Row label={options.layout === 'board' ? 'Columns' : 'Grouping'}>
              <MiniSelect value={options.grouping} onChange={v => onChange({ grouping: v as Grouping })} options={options.layout === 'board' ? GROUPINGS.filter(g => g.value !== 'none') : GROUPINGS} />
            </Row>
          )}
          <Row label="Ordering">
            <MiniSelect value={options.ordering} onChange={v => onChange({ ordering: v })} options={ORDERINGS} />
          </Row>
          {options.layout === 'list' && (
            <Row label="Show empty groups">
              <Switch checked={options.emptyGroups} onCheckedChange={v => onChange({ emptyGroups: v })} />
            </Row>
          )}
        </div>
        <div className="border-t px-3 pb-3 pt-2.5">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Display properties</div>
          <div className="flex flex-wrap gap-1.5">
            {DISPLAY_PROPERTIES.map(p => (
              <button key={p.key} type="button" onClick={() => toggleProp(p.key)} className={cn('h-6 rounded-md border px-2 text-xs transition-colors', props.has(p.key) ? 'border-foreground/15 bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60')}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {options.layout === 'table' && (
          <div className="border-t px-3 pb-3 pt-2.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Answer columns</span>
              {questions.length > 0 && (
                <button type="button" className="text-2xs text-muted-foreground hover:text-foreground" onClick={() => onChange({ answerColumns: columns.size ? [] : questions.filter(q => q.type !== 'long_text' && q.type !== 'file').map(q => q.id) })}>
                  {columns.size ? 'Clear' : 'Add short answers'}
                </button>
              )}
            </div>
            {questions.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">Filter to a single program to add its questions as columns.</p>
            ) : (
              <div className="max-h-56 space-y-px overflow-y-auto">
                {questions.map(q => (
                  <label key={q.id} className="flex h-7 cursor-pointer items-center gap-2 rounded px-1 text-[12.5px] hover:bg-accent">
                    <input
                      type="checkbox"
                      className="accent-[hsl(var(--primary))]"
                      checked={columns.has(q.id)}
                      onChange={() => onChange({ answerColumns: questions.map(x => x.id).filter(id => (id === q.id ? !columns.has(id) : columns.has(id))) })}
                    />
                    <FieldIcon type={q.type} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{q.label || 'Untitled question'}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        {isDirty && (
          <div className="flex justify-end border-t px-3 py-2">
            <button type="button" onClick={onReset} className="text-xs text-muted-foreground hover:text-foreground">
              Reset to default
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
