import { Copy, Download, FileText, Mail, Megaphone, MoreHorizontal, RotateCcw, Tag, Trash2, UserRound, Users, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { exportSubmissionPdf } from 'zitejs/api';
import { errorMessage } from '../../lib/errors';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { useAppActions } from '../../lib/app-actions';
import { copyText } from '../../lib/clipboard';
import { useSubmissionActions } from '../../lib/mutations';
import type { Submission } from '../../lib/types';
import { OutcomeGlyph, StageGlyph } from '../primitives/icons';
import { Kbd } from '../primitives/bits';
import { SubmissionPropertyPicker, type PickerKind } from './SubmissionPropertyPicker';

const btn = 'ghost-chip h-8 gap-1.5 px-2.5 text-[13px] text-foreground/90 hover:text-foreground';

export function BulkActionBar({ submissions, onClear, openKind, onOpenKind, onExport }: {
  submissions: Submission[];
  onClear: () => void;
  openKind: PickerKind | null;
  onOpenKind: (k: PickerKind | null) => void;
  onExport: (ids: string[]) => void;
}) {
  const actions = useSubmissionActions();
  const app = useAppActions();
  const [decideOpen, setDecideOpen] = useState(false);
  if (submissions.length === 0) return null;

  const picker = (kind: PickerKind, label: string, icon: React.ReactNode) => (
    <SubmissionPropertyPicker
      key={kind}
      submissions={submissions}
      kind={kind}
      align="center"
      open={openKind === kind}
      onOpenChange={o => onOpenKind(o ? kind : null)}
      trigger={
        <button type="button" className={btn}>
          {icon}
          <span className="hidden sm:inline">{label}</span>
        </button>
      }
    />
  );
  const inPipeline = submissions.filter(s => s.status === 'Submitted');
  const decided = submissions.filter(s => ['Accepted', 'Declined', 'Waitlisted'].includes(s.status));
  const unreleased = decided.filter(s => !s.notifiedAt);
  const oneProgram = new Set(submissions.map(s => s.programId)).size === 1;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center px-4">
      <div role="toolbar" aria-label="Bulk actions" className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border bg-popover p-1 shadow-xl animate-fade-up">
        <div className="flex h-8 items-center gap-2 border-r pl-2.5 pr-2">
          <span className="whitespace-nowrap text-[13px] font-medium tabular-nums">{submissions.length} selected</span>
          <button type="button" onClick={onClear} aria-label="Clear selection" className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {oneProgram && inPipeline.length > 0 && picker('stage', 'Move', <StageGlyph kind="Review" color="#6943d0" />)}
        <DropdownMenu open={decideOpen} onOpenChange={setDecideOpen}>
          <DropdownMenuTrigger asChild>
            <button type="button" className={btn}>
              <OutcomeGlyph status="Accepted" />
              <span className="hidden sm:inline">Decide</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="w-52">
            {(['Accepted', 'Waitlisted', 'Declined'] as const).map(d => (
              <DropdownMenuItem key={d} className="text-[13px]" onSelect={() => app.openDecision(submissions, d)}>
                <OutcomeGlyph status={d} /> {d === 'Accepted' ? 'Accept…' : d === 'Waitlisted' ? 'Waitlist…' : 'Decline…'}
              </DropdownMenuItem>
            ))}
            {decided.length > 0 && <DropdownMenuSeparator />}
            {unreleased.length > 0 && (
              <DropdownMenuItem className="text-[13px]" onSelect={() => app.openDecision(unreleased, 'release')}>
                <Megaphone className="h-3.5 w-3.5" /> Release {unreleased.length} decision{unreleased.length === 1 ? '' : 's'}…
              </DropdownMenuItem>
            )}
            {decided.length > 0 && (
              <DropdownMenuItem className="text-[13px]" onSelect={() => app.openDecision(decided, 'reopen')}>
                <RotateCcw className="h-3.5 w-3.5" /> Reopen {decided.length} decision{decided.length === 1 ? '' : 's'}…
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {inPipeline.length > 0 && (
          <button type="button" className={btn} onClick={() => app.openAssignReviewers(inPipeline)}>
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="hidden sm:inline">Reviewers</span>
          </button>
        )}
        {picker('owner', 'Owner', <UserRound className="h-3.5 w-3.5 text-muted-foreground" />)}
        {picker('labels', 'Labels', <Tag className="h-3.5 w-3.5 text-muted-foreground" />)}
        <button type="button" className={btn} onClick={() => app.openCompose(submissions)}>
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="hidden sm:inline">Message</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={btn} aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-52">
            <DropdownMenuItem className="text-[13px]" onSelect={() => onExport(submissions.map(s => s.id))}>
              <Download className="h-3.5 w-3.5" /> Export to CSV
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-[13px]"
              onSelect={async () => {
                const id = toast.loading(`Preparing a packet of ${submissions.length} submission${submissions.length === 1 ? '' : 's'}…`);
                try {
                  const res = await exportSubmissionPdf({ ids: submissions.slice(0, 100).map(s => s.id) });
                  // Browsers block a window opened after an await, so the toast carries the link.
                  toast.success('Board packet ready', { id, duration: 15000, action: { label: 'Open PDF', onClick: () => window.open(res.url, '_blank', 'noopener') } });
                } catch (e) {
                  toast.error(errorMessage(e, "Couldn't build the PDF"), { id });
                }
              }}
            >
              <FileText className="h-3.5 w-3.5" /> Download board packet (PDF)
            </DropdownMenuItem>
            <DropdownMenuItem className="text-[13px]" onSelect={() => copyText(submissions.map(s => s.reference).join(', '), `Copied ${submissions.length} references`)}>
              <Copy className="h-3.5 w-3.5" /> Copy references
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-[13px] text-destructive focus:text-destructive"
              onSelect={async () => {
                const ok = await app.confirm({
                  title: `Delete ${submissions.length} submission${submissions.length === 1 ? '' : 's'}?`,
                  description: 'This permanently removes them with their reviews, messages, tasks, payments and history. Decline or withdraw instead to keep a record.',
                  confirmLabel: 'Delete permanently',
                  destructive: true,
                });
                if (ok && (await actions.remove(submissions))) onClear();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="hidden items-center gap-1 border-l px-2 text-2xs text-muted-foreground md:flex">
          <Kbd>Esc</Kbd> to clear
        </span>
      </div>
    </div>
  );
}
