import { Archive, ArchiveRestore, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { plural } from '../../../lib/format';
import type { Program } from '../../../lib/types';
import { PageTitle, SettingsCard, SettingsRow, SettingsSection } from '../fields';
import { totalSubmissions, useProgramLifecycle } from '../ProgramActions';

const buttonClass = 'flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-[13px] shadow-2xs transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50';

export function DangerZone({ program, onPublish }: { program: Program; onPublish: () => void }) {
  const life = useProgramLifecycle();
  const total = totalSubmissions(program);
  return (
    <div>
      <PageTitle title="Danger zone" description="Changes that affect whether applicants and your team can see this program." />

      <SettingsSection title="Visibility">
        <SettingsCard>
          {program.status === 'Draft' && (
            <SettingsRow label="Publish" description="Make the program visible in the portal so applicants can apply.">
              <button type="button" className={buttonClass} onClick={onPublish}>
                <Sparkles className="h-3.5 w-3.5" /> Review and publish…
              </button>
            </SettingsRow>
          )}
          {program.status === 'Published' && (
            <SettingsRow label="Unpublish" description="Take it out of the portal. Nobody can start or submit until you publish again; existing submissions aren’t affected.">
              <button type="button" className={buttonClass} onClick={() => life.unpublish(program)}>
                <Undo2 className="h-3.5 w-3.5" /> Unpublish…
              </button>
            </SettingsRow>
          )}
          {program.status === 'Archived' ? (
            <SettingsRow label="Unarchive" description={program.publishedAt ? 'Bring it back as published, in the portal and lists.' : 'Bring it back as a draft.'}>
              <button type="button" className={buttonClass} onClick={() => life.unarchive(program)}>
                <ArchiveRestore className="h-3.5 w-3.5" /> Unarchive
              </button>
            </SettingsRow>
          ) : (
            <SettingsRow label="Archive" description="Hide it from the portal, the sidebar and cross-program lists. Everything in it is kept and you can unarchive at any time.">
              <button type="button" className={buttonClass} onClick={() => life.archive(program)}>
                <Archive className="h-3.5 w-3.5" /> Archive…
              </button>
            </SettingsRow>
          )}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Delete">
        <div className="overflow-hidden rounded-lg border border-tone-danger/30 bg-background">
          <SettingsRow
            label="Delete this program"
            description={
              total > 0
                ? `It has ${plural(total, 'submission')}, drafts included, so it can’t be deleted. Archive it instead.`
                : 'Permanently delete its forms, stages, rubrics, team and program email templates. This can’t be undone.'
            }
          >
            <button type="button" disabled={total > 0} onClick={() => life.remove(program)} className="flex h-8 items-center gap-1.5 rounded-md bg-destructive px-3 text-[13px] font-medium text-destructive-foreground shadow-xs hover:bg-destructive/90 disabled:pointer-events-none disabled:opacity-50">
              <Trash2 className="h-3.5 w-3.5" /> Delete program…
            </button>
          </SettingsRow>
        </div>
      </SettingsSection>
    </div>
  );
}
