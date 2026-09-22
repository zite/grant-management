import { ArrowRight, Inbox } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@project/components/lib/utils';
import { Markdown } from '@project/shared/ui/Markdown';
import { DeadlineText, ProgramRow } from '../components/program';
import { Alert, Button, Container, EmptyState, ProgressBar, SectionHeading, Skeleton } from '../components/ui';
import { useSession } from '../lib/auth';
import { errorMessage } from '../lib/errors';
import { awardLabel, longDate, plural, timeAgo } from '../lib/format';
import { useMyApplications, usePortal, type PortalProgram } from '../lib/queries';
import { useDocumentTitle } from '../lib/useDocumentTitle';

const RECENT_DAYS = 365;

export function HomePage() {
  const portal = usePortal();
  const { user } = useSession();
  const mine = useMyApplications();
  const [type, setType] = useState<string>('all');
  useDocumentTitle(portal.data ? 'Programs' : null);

  const programs = portal.data?.programs ?? [];
  const types = useMemo(() => [...new Set(programs.filter(p => p.phase !== 'archived').map(p => p.type))].sort(), [programs]);
  const filtered = type === 'all' ? programs : programs.filter(p => p.type === type);
  const open = filtered.filter(p => p.accepting && p.phase !== 'scheduled').sort(byDeadline);
  const soon = filtered.filter(p => p.phase === 'scheduled').sort((a, b) => Date.parse(a.opensAt ?? '') - Date.parse(b.opensAt ?? ''));
  const closed = filtered
    .filter(p => p.phase === 'closed' && !p.accepting && p.deadline && Date.now() - Date.parse(p.deadline) < RECENT_DAYS * 86_400_000)
    .sort((a, b) => Date.parse(b.deadline ?? '') - Date.parse(a.deadline ?? ''))
    .slice(0, 6);

  const drafts = (mine.data?.applications ?? []).filter(a => a.status === 'Draft' && a.accepting);
  const settings = portal.data?.settings;
  const allOpen = programs.filter(p => p.accepting && p.phase !== 'scheduled');

  return (
    <div>
      <section className="border-b bg-background">
        <Container className="py-12 sm:py-16 lg:py-20">
          {portal.isPending ? (
            <div className="max-w-2xl space-y-4" aria-hidden>
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-12 w-3/4" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-2/3" />
            </div>
          ) : settings ? (
            <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="max-w-[38rem] animate-fade-up">
                <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-faint">{settings.organizationName}</p>
                <h1 className="mt-4 font-serif text-4xl font-semibold leading-[1.08] sm:text-[44px] sm:leading-[1.06]">{settings.portalHeadline}</h1>
                <Markdown compact className="mt-5 text-lg leading-relaxed text-muted-foreground">{settings.portalIntro}</Markdown>
                {allOpen.length > 0 && (
                  <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
                    <a href="#open-now" className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-[15px] font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35">
                      See open programs <ArrowRight className="h-4 w-4" aria-hidden />
                    </a>
                    <a href="#how-it-works" className="text-[15px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                      How applying works
                    </a>
                  </div>
                )}
              </div>
              <AtAGlance programs={allOpen} currency={settings.currency} />
            </div>
          ) : null}
        </Container>
      </section>

      <Container className="py-12 sm:py-14">
        {portal.isError && (
          <Alert tone="danger" title="The programs didn't load" action={<Button variant="secondary" size="sm" onClick={() => portal.refetch()}>Try again</Button>}>
            {errorMessage(portal.error, 'Check your connection and try again.')}
          </Alert>
        )}

        {user && drafts.length > 0 && (
          <section aria-labelledby="continue-heading" className="mb-12 animate-fade-up">
            <h2 id="continue-heading" className="sr-only">Continue your application</h2>
            <div className="space-y-3">
              {drafts.slice(0, 3).map(d => (
                <Link
                  key={d.id}
                  to={`/applications/${d.id}`}
                  className="group flex items-center gap-5 rounded-lg border border-l-[3px] border-l-primary bg-background p-4 shadow-2xs transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35 sm:p-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">Draft in progress</p>
                    <p className="mt-1.5 truncate font-serif text-xl font-semibold">{d.title || d.programName}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {d.progress && (
                        <span className="flex items-center gap-2">
                          <ProgressBar value={d.progress.ratio} className="w-20" label="Progress" />
                          {Math.round(d.progress.ratio * 100)}% complete
                        </span>
                      )}
                      {d.lastSavedAt && <span className="hidden sm:inline">Saved {timeAgo(d.lastSavedAt)}</span>}
                      <DeadlineText program={{ phase: d.phase, deadline: d.deadline, opensAt: null, allowLate: d.allowLate }} iconless />
                    </div>
                  </div>
                  <span className="hidden shrink-0 items-center gap-1.5 text-[15px] font-medium text-primary sm:inline-flex">
                    Continue <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                  <ArrowRight className="h-5 w-5 shrink-0 text-primary sm:hidden" aria-hidden />
                </Link>
              ))}
            </div>
          </section>
        )}

        {types.length > 1 && (
          <div role="group" aria-label="Filter by program type" className="scrollbar-none -mx-4 mb-10 flex gap-6 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
            {['all', ...types].map(t => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => setType(t)}
                className={cn(
                  'shrink-0 border-b-2 pb-2.5 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
                  type === t ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t === 'all' ? 'All programs' : pluralType(t)}
              </button>
            ))}
          </div>
        )}

        {portal.isPending ? (
          <div className="space-y-6" aria-hidden>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
        ) : portal.data && programs.length === 0 ? (
          <div className="rounded-lg border bg-background">
            <EmptyState icon={Inbox} title="No programs are open right now">
              {settings?.organizationName ?? 'We'} will publish new opportunities here. Check back soon
              {settings?.supportEmail ? (
                <>
                  , or email <a className="font-medium text-primary hover:underline" href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a> with questions.
                </>
              ) : (
                '.'
              )}
            </EmptyState>
          </div>
        ) : portal.data ? (
          <div className="space-y-14">
            <ProgramSection id="open-now" title="Open now" programs={open} currency={settings!.currency} empty={type === 'all' ? 'Nothing is accepting applications right now. Take a look at what’s opening soon.' : `No ${pluralType(type).toLowerCase()} are open right now.`} />
            {soon.length > 0 && <ProgramSection id="opening-soon" title="Opening soon" programs={soon} currency={settings!.currency} />}
            {closed.length > 0 && <ProgramSection id="recently-closed" title="Recently closed" programs={closed} currency={settings!.currency} muted />}
          </div>
        ) : null}
      </Container>

      <HowItWorks />
    </div>
  );
}

/** What an applicant actually wants from a landing page: how much, and by when. */
function AtAGlance({ programs, currency }: { programs: PortalProgram[]; currency: string }) {
  if (!programs.length) return null;
  const withDeadline = programs.filter(p => p.deadline).sort(byDeadline);
  const next = withDeadline[0];
  const mins = programs.map(p => p.awardMin).filter((n): n is number => typeof n === 'number' && n > 0);
  const maxes = programs.map(p => p.awardMax).filter((n): n is number => typeof n === 'number' && n > 0);
  const range = mins.length || maxes.length ? awardLabel(mins.length ? Math.min(...mins) : null, maxes.length ? Math.max(...maxes) : null, currency, 'range') : null;

  const facts: Array<{ label: string; value: string; note?: string }> = [
    { label: 'Open now', value: plural(programs.length, 'program') },
    ...(next?.deadline ? [{ label: 'Next deadline', value: longDate(next.deadline), note: next.name }] : []),
    ...(range ? [{ label: 'Awards', value: range }] : []),
  ];

  return (
    <aside aria-label="At a glance" className="animate-fade-up lg:w-[19rem]">
      <div className="border-t-2 border-foreground pt-5">
        <dl className="divide-y">
          {facts.map(f => (
            <div key={f.label} className="py-3.5 first:pt-0 last:pb-0">
              <dt className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">{f.label}</dt>
              <dd className="mt-1 font-serif text-xl font-semibold leading-snug">{f.value}</dd>
              {f.note && <dd className="mt-0.5 truncate text-sm text-muted-foreground">{f.note}</dd>}
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}

function HowItWorks() {
  const steps = [
    { title: 'Find a program', body: 'Read what each program funds and who can apply.' },
    { title: 'Check you’re eligible', body: 'A few quick questions before you invest your time.' },
    { title: 'Apply at your own pace', body: 'Your answers save as you go, on any device.' },
    { title: 'Hear back here', body: 'Follow your status, messages and any requests.' },
  ];
  return (
    <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-24 border-t">
      <Container className="py-12 sm:py-14">
        <h2 id="how-heading" className="font-serif text-xl font-semibold">How applying works</h2>
        <ol className="mt-7 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="border-t pt-4">
              <span className="font-serif text-sm font-semibold tabular-nums text-primary">{String(i + 1).padStart(2, '0')}</span>
              <p className="mt-1.5 font-medium">{s.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

function ProgramSection({ id, title, programs, currency, muted, empty }: { id: string; title: string; programs: PortalProgram[]; currency: string; muted?: boolean; empty?: string }) {
  return (
    <section aria-labelledby={`${id}-heading`} id={id} className="scroll-mt-24">
      <SectionHeading id={`${id}-heading`} count={programs.length}>
        {title}
      </SectionHeading>
      {programs.length ? (
        <ul>
          {programs.map(p => (
            <ProgramRow key={p.id} program={p} currency={currency} muted={muted} />
          ))}
        </ul>
      ) : (
        <p className="py-8 text-[15px] text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

function byDeadline(a: PortalProgram, b: PortalProgram) {
  const da = a.deadline ? Date.parse(a.deadline) : Infinity;
  const db = b.deadline ? Date.parse(b.deadline) : Infinity;
  return da - db;
}

function pluralType(t: string) {
  if (t === 'Open call') return 'Open calls';
  if (t === 'Other') return 'Other';
  if (t.endsWith('y')) return `${t.slice(0, -1)}ies`;
  return `${t}s`;
}
