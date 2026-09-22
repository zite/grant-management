import { Building2, Copy, Globe, Link2, Mail, MapPin, Phone, Users } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Button } from '@project/components/ui/button';
import { ApplicantAvatar } from '../components/applicants/ApplicantAvatar';
import { ActivitySummary, ApplicationsList, MessagesList, NotesCard, ProfileCard, Section } from '../components/applicants/ApplicantSections';
import { useApplicant } from '../components/applicants/applicantData';
import { EmptyState, IconButton, Tip } from '../components/primitives/bits';
import { PageHeader, useDocumentTitle } from '../components/shell/PageHeader';
import { copyText } from '../lib/clipboard';
import { appUrl } from '../lib/format';
import { useWorkspace } from '../lib/workspace';

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <div className="bg-background px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={tone === 'success' ? 'mt-0.5 text-[17px] font-semibold tabular-nums tracking-[-0.01em] text-tone-success' : 'mt-0.5 text-[17px] font-semibold tabular-nums tracking-[-0.01em]'}>{value}</div>
    </div>
  );
}

function ContactChip({ icon, children, href, external }: { icon: React.ReactNode; children: React.ReactNode; href?: string; external?: boolean }) {
  const inner = (
    <>
      <span className="text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
      <span className="truncate">{children}</span>
    </>
  );
  return href ? (
    <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer noopener' : undefined} className="flex min-w-0 max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] hover:bg-accent">
      {inner}
    </a>
  ) : (
    <span className="flex min-w-0 max-w-full items-center gap-1.5 px-1.5 py-1 text-[13px]">{inner}</span>
  );
}

export function ApplicantPage() {
  const { applicantId = '' } = useParams();
  const ws = useWorkspace();
  const { data, isPending, isError } = useApplicant(applicantId);
  useDocumentTitle(data?.applicant.name ?? 'Applicant');
  const breadcrumb = { to: '/applicants', label: 'Applicants' };

  if (isPending) {
    return (
      <>
        <PageHeader icon={<Users />} title="Applicant" breadcrumb={breadcrumb} />
        <div className="mx-auto w-full max-w-[1180px] space-y-6 px-4 py-8 sm:px-8">
          <div className="flex items-center gap-4">
            <div className="skeleton h-12 w-12 rounded-full" />
            <div className="space-y-2">
              <div className="skeleton h-5 w-48" />
              <div className="skeleton h-3.5 w-32" />
            </div>
          </div>
          <div className="skeleton h-16 w-full rounded-lg" />
          <div className="skeleton h-40 w-full rounded-lg" />
        </div>
      </>
    );
  }
  if (isError || !data) {
    return (
      <>
        <PageHeader icon={<Users />} title="Applicant" breadcrumb={breadcrumb} />
        <EmptyState icon={<Users />} title="Applicant not found" description="They may have been removed, or the link is wrong." />
      </>
    );
  }

  const a = data.applicant;
  const t = data.totals;
  const websiteLabel = a.website.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return (
    <>
      <PageHeader
        icon={<Users />}
        title={a.name || a.email}
        breadcrumb={breadcrumb}
        actions={
          <>
            <Tip label="Copy link to this applicant">
              <IconButton aria-label="Copy link to this applicant" onClick={() => copyText(appUrl(`/applicants/${a.id}`), 'Copied link')}>
                <Link2 />
              </IconButton>
            </Tip>
            <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 px-2.5 text-[12.5px]">
              <a href={`mailto:${a.email}`}>
                <Mail className="!size-3.5" /> Email
              </a>
            </Button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-8 px-4 pb-16 pt-6 sm:px-8 lg:flex-row lg:gap-10 lg:pt-8">
          <div className="min-w-0 flex-1 space-y-8 animate-fade-in">
            <header>
              <div className="flex items-center gap-4">
                <ApplicantAvatar name={a.name} size={48} className="text-[16px]" />
                <div className="min-w-0">
                  <h1 className="truncate text-[20px] font-semibold tracking-[-0.015em]">{a.name || a.email}</h1>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {[a.organization, a.location].filter(Boolean).join(' · ') || 'Individual applicant'}
                  </p>
                </div>
              </div>
              <div className="-ml-1.5 mt-3 flex flex-wrap items-center gap-x-1 gap-y-0.5">
                <span className="flex min-w-0 items-center">
                  <ContactChip icon={<Mail />} href={`mailto:${a.email}`}>{a.email}</ContactChip>
                  <Tip label="Copy email">
                    <IconButton size="sm" aria-label="Copy email" onClick={() => copyText(a.email, 'Copied email')}>
                      <Copy />
                    </IconButton>
                  </Tip>
                </span>
                {a.phone && <ContactChip icon={<Phone />} href={`tel:${a.phone.replace(/[^\d+]/g, '')}`}>{a.phone}</ContactChip>}
                {a.organization && <ContactChip icon={<Building2 />}>{a.organization}</ContactChip>}
                {a.location && <ContactChip icon={<MapPin />}>{a.location}</ContactChip>}
                {a.website && <ContactChip icon={<Globe />} href={a.website} external>{websiteLabel}</ContactChip>}
              </div>
            </header>

            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-5">
              <Stat label="Applications" value={String(t.applications)} />
              <Stat label="Accepted" value={String(t.accepted)} tone={t.accepted ? 'success' : undefined} />
              <Stat label="Requested" value={ws.money(t.requested, { compact: true })} />
              <Stat label="Awarded" value={ws.money(t.awarded, { compact: true })} />
              <div className="col-span-2 sm:col-span-1">
                <Stat label="Paid" value={ws.money(t.paid, { compact: true })} />
              </div>
            </div>

            <Section
              title="Applications"
              count={data.submissions.length}
              action={
                <span className="text-xs text-muted-foreground">
                  {[
                    t.inReview && `${t.inReview} in review`,
                    t.accepted && `${t.accepted} accepted`,
                    t.waitlisted && `${t.waitlisted} waitlisted`,
                    t.declined && `${t.declined} declined`,
                    t.withdrawn && `${t.withdrawn} withdrawn`,
                    t.drafts && `${t.drafts} draft${t.drafts === 1 ? '' : 's'}`,
                  ].filter(Boolean).join(' · ')}
                </span>
              }
            >
              <ApplicationsList submissions={data.submissions} />
              {t.drafts > 0 && <p className="mt-2 text-xs text-muted-foreground">{t.drafts} unsubmitted draft{t.drafts === 1 ? '' : 's'} — drafts open as a preview, since they have no reference yet.</p>}
            </Section>

            <Section title="Messages" count={data.messages.length}>
              <MessagesList messages={data.messages} applicantName={a.name} />
            </Section>

            <Section title="Activity">
              <ActivitySummary detail={data} />
            </Section>
          </div>

          <aside className="w-full shrink-0 space-y-6 lg:sticky lg:top-8 lg:w-[320px] lg:self-start">
            <Section title="Internal notes">
              <NotesCard key={a.id} detail={data} />
            </Section>
            <Section title="Profile">
              <ProfileCard detail={data} />
              <p className="mt-2 px-1 text-xs text-muted-foreground">Changes save as you leave each field. The email is what they sign in to the portal with.</p>
            </Section>
          </aside>
        </div>
      </div>
    </>
  );
}
