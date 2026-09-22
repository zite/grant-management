import { Archive, ArchiveRestore, Copy, ExternalLink, FolderKanban, Link2, MoreHorizontal, Plus, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { FormsTab } from '../components/builder/FormsTab';
import { EmptyState, Glyph, IconButton, Tip } from '../components/primitives/bits';
import { PublishDialog, totalSubmissions, useProgramLifecycle } from '../components/program/ProgramActions';
import { PhaseBadge, portalProgramUrl } from '../components/program/ProgramBits';
import { ProgramOverview } from '../components/program/ProgramOverview';
import { ProgramReviews } from '../components/program/ProgramReviews';
import { ProgramSettings } from '../components/program/settings/ProgramSettings';
import { PageHeader, useDocumentTitle } from '../components/shell/PageHeader';
import { SubmissionsView } from '../components/submissions/SubmissionsView';
import { useAppActions } from '../lib/app-actions';
import { copyText } from '../lib/clipboard';
import { plural } from '../lib/format';
import { useWorkspace } from '../lib/workspace';

const TABS = ['submissions', 'reviews', 'form', 'settings'] as const;

export function ProgramPage() {
  const { programId = '', tab, section } = useParams();
  const ws = useWorkspace();
  const app = useAppActions();
  const life = useProgramLifecycle();
  const program = ws.programById.get(programId);
  const [publishOpen, setPublishOpen] = useState(false);
  useDocumentTitle(program ? (tab === 'settings' ? `${program.name} settings` : program.name) : 'Program');

  useEffect(() => {
    app.setContextProgram(program ? programId : null);
    return () => app.setContextProgram(null);
  }, [programId, Boolean(program)]);

  if (!program) {
    return (
      <>
        <PageHeader icon={<FolderKanban />} title="Program" breadcrumb={{ to: '/programs', label: 'Programs' }} />
        <EmptyState
          icon={<FolderKanban />}
          title="Program not found"
          description="It may have been deleted, or the link is incomplete."
          action={<Link to="/programs" className="text-[13px] text-primary hover:underline">Back to programs</Link>}
        />
      </>
    );
  }
  if (tab && !(TABS as readonly string[]).includes(tab)) return <Navigate to={`/programs/${program.id}`} replace />;

  const base = `/programs/${program.id}`;
  const portal = portalProgramUrl(ws.settings.portalUrl, program.slug);
  const isDraft = program.status === 'Draft';
  const isArchived = program.status === 'Archived';
  const portalReason = !ws.settings.portalUrl
    ? 'The portal address is saved the first time someone opens the portal app'
    : isDraft
      ? 'Publish the program to see it in the portal'
      : isArchived
        ? 'Archived programs are hidden from the portal'
        : null;
  const total = totalSubmissions(program);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        breadcrumb={{ to: '/programs', label: 'Programs' }}
        icon={<Glyph icon={program.icon} color={program.color} size={18} />}
        title={
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{program.name}</span>
            <PhaseBadge phase={program.phase} className="hidden sm:inline-flex" />
          </span>
        }
        tabs={[
          { to: base, label: 'Overview', end: true },
          { to: `${base}/submissions`, label: 'Submissions', count: program.counts.inPipeline },
          { to: `${base}/reviews`, label: 'Reviews' },
          { to: `${base}/form`, label: 'Forms' },
          { to: `${base}/settings`, label: 'Settings' },
        ]}
        actions={
          <>
            <Tip label={portalReason ?? 'View in portal'}>
              <span className="hidden md:inline-flex">
                <IconButton aria-label="View in portal" disabled={Boolean(portalReason)} onClick={() => portal && window.open(portal, '_blank', 'noopener')}>
                  <ExternalLink />
                </IconButton>
              </span>
            </Tip>
            <Tip label={portal ? 'Copy portal link' : 'The portal address isn’t known yet'}>
              <span className="hidden md:inline-flex">
                <IconButton aria-label="Copy portal link" disabled={!portal} onClick={() => portal && copyText(portal, 'Portal link copied')}>
                  <Link2 />
                </IconButton>
              </span>
            </Tip>
            {isDraft && (
              <button
                type="button"
                onClick={() => setPublishOpen(true)}
                className="ml-1 flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12.5px] font-medium text-primary-foreground shadow-xs hover:bg-primary/90"
              >
                <Sparkles className="h-3.5 w-3.5" /> Publish
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton aria-label="Program actions">
                  <MoreHorizontal />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {tab === 'submissions' && (
                  <>
                    <DropdownMenuItem className="text-[13px]" onSelect={() => app.openAddSubmission(program.id)}>
                      <Plus className="h-3.5 w-3.5" /> Add submission…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem className="text-[13px] md:hidden" disabled={Boolean(portalReason)} onSelect={() => portal && window.open(portal, '_blank', 'noopener')}>
                  <ExternalLink className="h-3.5 w-3.5" /> View in portal
                </DropdownMenuItem>
                <DropdownMenuItem className="text-[13px] md:hidden" disabled={!portal} onSelect={() => portal && copyText(portal, 'Portal link copied')}>
                  <Link2 className="h-3.5 w-3.5" /> Copy portal link
                </DropdownMenuItem>
                {program.status === 'Published' && (
                  <DropdownMenuItem className="text-[13px]" onSelect={() => life.unpublish(program)}>
                    <Undo2 className="h-3.5 w-3.5" /> Unpublish…
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="text-[13px]" onSelect={() => life.duplicate(program)}>
                  <Copy className="h-3.5 w-3.5" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {isArchived ? (
                  <DropdownMenuItem className="text-[13px]" onSelect={() => life.unarchive(program)}>
                    <ArchiveRestore className="h-3.5 w-3.5" /> Unarchive
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem className="text-[13px]" onSelect={() => life.archive(program)}>
                    <Archive className="h-3.5 w-3.5" /> Archive…
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem disabled={total > 0} className="flex-wrap text-[13px] text-tone-danger focus:text-tone-danger" onSelect={() => life.remove(program)}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete program…
                  {total > 0 && <span className="w-full pl-6 text-2xs text-muted-foreground">Has {plural(total, 'submission')} — archive it instead</span>}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {!tab ? (
        <ProgramOverview program={program} onPublish={() => setPublishOpen(true)} />
      ) : tab === 'submissions' ? (
        <SubmissionsView
          key={program.id}
          surfaceKey={`program:${program.id}`}
          programId={program.id}
          baseFilters={{ programIds: [program.id] }}
          lockedFilters={['program']}
          defaults={{ layout: 'board', grouping: 'stage' }}
          defaultFilters={{ statuses: ['Submitted', 'Accepted', 'Waitlisted', 'Declined'] }}
          toolbarStart={
            <Tip label="Add a submission on an applicant’s behalf">
              <button type="button" onClick={() => app.openAddSubmission(program.id)} className="mr-1 flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-[12.5px] shadow-2xs hover:bg-accent">
                <Plus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Add submission</span>
              </button>
            </Tip>
          }
          emptyState={
            <EmptyState
              icon={<FolderKanban />}
              title={isDraft ? 'No submissions — this program is a draft' : 'No submissions yet'}
              description={isDraft ? 'Publish it so applicants can apply, or add a submission on someone’s behalf.' : 'When applicants submit through the portal, they appear here.'}
              action={
                isDraft ? (
                  <button type="button" onClick={() => setPublishOpen(true)} className="text-[13px] text-primary hover:underline">
                    Review and publish
                  </button>
                ) : undefined
              }
            />
          }
        />
      ) : tab === 'reviews' ? (
        <ProgramReviews program={program} />
      ) : tab === 'form' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <FormsTab programId={program.id} formId={section} />
        </div>
      ) : (
        <ProgramSettings program={program} section={section} onPublish={() => setPublishOpen(true)} />
      )}

      <PublishDialog program={program} open={publishOpen} onOpenChange={setPublishOpen} />
    </div>
  );
}
