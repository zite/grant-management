import { useQueryClient } from '@tanstack/react-query';
import { FileText, Globe, LayoutGrid, LogOut, Mail, Menu, ShieldCheck, Star, UserRound } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { cn } from '@project/components/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle } from '@project/components/ui/sheet';
import { useSession } from '../lib/auth';
import { initials } from '../lib/format';
import { useMe, usePortal } from '../lib/queries';
import { Button, CountBadge } from './ui';

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  // A new page starts at the top, like any website.
  useEffect(() => {
    if (!location.search.includes('step=')) window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <a href="#main" className="sr-only z-[60] rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <TopBar />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <Footer />
    </div>
  );
}

function Wordmark() {
  const { data } = usePortal();
  const s = data?.settings;
  if (!s) return <span className="skeleton h-7 w-44" aria-hidden />;
  if (s.logoUrl) return <img src={s.logoUrl} alt={s.organizationName} className="h-8 max-w-[200px] object-contain" />;
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-[12px] font-semibold tracking-wide text-primary-foreground" aria-hidden>
        {initials(s.organizationName)}
      </span>
      <span className="truncate font-serif text-[17px] font-semibold">{s.organizationName}</span>
    </span>
  );
}

function TopBar() {
  const { user, isLoading, signIn, signOut, name } = useSession();
  const me = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  const todo = me.data?.counts.todo ?? 0;
  const isReviewer = Boolean(me.data?.reviewer.isReviewer);
  const openReviews = me.data?.reviewer.open ?? 0;
  const displayName = me.data?.profile.name || name;

  const links: Array<{ to: string; label: string; icon: typeof LayoutGrid; badge?: number; badgeLabel?: string; end?: boolean }> = [
    { to: '/', label: 'Programs', icon: LayoutGrid, end: true },
    ...(user ? [{ to: '/applications', label: 'My applications', icon: FileText, badge: todo, badgeLabel: `${todo} things need your attention` }] : []),
    ...(user && isReviewer ? [{ to: '/reviews', label: 'Reviews', icon: Star, badge: openReviews, badgeLabel: `${openReviews} reviews to do` }] : []),
  ];

  const doSignOut = () => {
    qc.removeQueries({ queryKey: ['portal'], predicate: q => q.queryKey[1] !== 'site' });
    signOut();
  };

  return (
    <header className="no-print sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 max-w-page items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="-mx-1.5 flex min-w-0 items-center rounded-lg px-1.5 py-1 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35" aria-label="Home">
          <Wordmark />
        </Link>

        <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
          {links.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                cn(
                  'relative inline-flex h-16 items-center gap-2 border-b-2 px-1 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
                  isActive || (l.to === '/' && location.pathname.startsWith('/programs')) ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )
              }
            >
              {l.label}
              {l.badge ? <CountBadge count={l.badge} label={l.badgeLabel} /> : null}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {isLoading ? (
            <span className="skeleton h-9 w-9 rounded-full" aria-hidden />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-10 items-center gap-2 rounded-full p-0.5 pr-0.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35 md:pr-3"
                  aria-label={`Account menu for ${displayName}`}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border bg-muted text-[13px] font-semibold text-foreground/75">{initials(displayName)}</span>
                  <span className="hidden max-w-[160px] truncate text-[15px] font-medium md:inline">{displayName.split(' ')[0]}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 rounded-xl p-1.5">
                <DropdownMenuLabel className="px-2.5 py-2 font-normal">
                  <span className="block truncate text-[15px] font-medium">{displayName}</span>
                  <span className="block truncate text-sm text-muted-foreground">{user.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="h-10 gap-2.5 rounded-lg px-2.5 text-[15px]">
                  <Link to="/applications"><FileText className="h-4 w-4" /> My applications</Link>
                </DropdownMenuItem>
                {isReviewer && (
                  <DropdownMenuItem asChild className="h-10 gap-2.5 rounded-lg px-2.5 text-[15px]">
                    <Link to="/reviews"><Star className="h-4 w-4" /> Reviews</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild className="h-10 gap-2.5 rounded-lg px-2.5 text-[15px]">
                  <Link to="/profile"><UserRound className="h-4 w-4" /> Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={doSignOut} className="h-10 gap-2.5 rounded-lg px-2.5 text-[15px]">
                  <LogOut className="h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button size="sm" variant="ink" onClick={() => signIn()} className="h-9 px-4">
              Sign in
            </Button>
          )}
          <button
            type="button"
            className="relative flex h-10 w-10 items-center justify-center rounded-lg text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35 md:hidden"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
            {todo > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" aria-hidden />}
          </button>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-[86%] max-w-sm flex-col gap-0 p-0">
          <div className="border-b px-5 py-4">
            <SheetTitle className="text-base font-semibold">Menu</SheetTitle>
          </div>
          <nav aria-label="Mobile" className="flex flex-col gap-1 p-3">
            {links.map(l => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => cn('flex h-12 items-center gap-3 rounded-xl px-3 text-base font-medium', isActive ? 'bg-accent text-foreground' : 'text-foreground/85 hover:bg-accent')}
              >
                <l.icon className="h-5 w-5 text-muted-foreground" aria-hidden />
                <span className="flex-1">{l.label}</span>
                {l.badge ? <CountBadge count={l.badge} label={l.badgeLabel} /> : null}
              </NavLink>
            ))}
            {user && (
              <NavLink to="/profile" className={({ isActive }) => cn('flex h-12 items-center gap-3 rounded-xl px-3 text-base font-medium', isActive ? 'bg-accent' : 'text-foreground/85 hover:bg-accent')}>
                <UserRound className="h-5 w-5 text-muted-foreground" aria-hidden /> Profile
              </NavLink>
            )}
          </nav>
          <div className="mt-auto border-t p-4">
            {user ? (
              <>
                <p className="truncate text-sm text-muted-foreground">Signed in as {user.email}</p>
                <Button variant="secondary" className="mt-3 w-full" onClick={doSignOut}>
                  <LogOut /> Sign out
                </Button>
              </>
            ) : (
              <Button className="w-full" size="lg" onClick={() => signIn()}>
                Sign in
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}

function Footer() {
  const { data } = usePortal();
  const s = data?.settings;
  const year = new Date().getFullYear();
  return (
    <footer className="no-print mt-16 border-t bg-background">
      <div className="mx-auto flex max-w-page flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="font-serif text-[17px] font-semibold">{s?.organizationName ?? ' '}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">© {year} · Questions about an application? We're here to help.</p>
        </div>
        {(s?.websiteUrl || s?.supportEmail || s?.privacyUrl) && (
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {s?.websiteUrl && (
            <li>
              <a href={s.websiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:underline">
                <Globe className="h-4 w-4" aria-hidden /> {s.websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </a>
            </li>
          )}
          {s?.supportEmail && (
            <li>
              <a href={`mailto:${s.supportEmail}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:underline">
                <Mail className="h-4 w-4" aria-hidden /> {s.supportEmail}
              </a>
            </li>
          )}
          {s?.privacyUrl && (
            <li>
              <a href={s.privacyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:underline">
                <ShieldCheck className="h-4 w-4" aria-hidden /> Privacy
              </a>
            </li>
          )}
        </ul>
        )}
      </div>
    </footer>
  );
}
