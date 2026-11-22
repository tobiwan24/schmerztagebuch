// Grundgerüst: Kopfzeile, Inhalt, untere Leiste mit vier Zielen (Spec 10 „Navigation"). Mobile-first, Desktop zentriert.
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { useReminderScheduler } from '@/data/useReminders';
import { useRuleEvaluation } from '@/data/useRuleHints';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/AuthContext';
import { useData } from '@/data/DataContext';
import { useQuery } from '@/data/useQuery';
import { SyncStatus } from '@/components/SyncStatus';
import { DiarySwitcher } from '@/components/DiarySwitcher';
import { WhatsNewGate } from '@/components/WhatsNewGate';
import { TourGate } from '@/tour/TourGate';
import { TOUR_RING } from '@/tour/anchor';
import { DiaryScopeProvider } from '@/data/diary-scope';
import { BarChart3, Home, List, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { de } from '@/i18n/de';

const TABS = [
  { to: '/', label: de.nav.start, Icon: Home, end: true },
  { to: '/history', label: de.nav.history, Icon: List, end: false },
  { to: '/analysis', label: de.nav.analysis, Icon: BarChart3, end: false },
  { to: '/more', label: de.nav.more, Icon: MoreHorizontal, end: false },
] as const;

/** Ansichten, die auch gesperrt erreichbar sind (Entsperren über Einstellungen, CRY-10). */
const OPEN_WHEN_LOCKED = ['/more', '/more/settings', '/more/settings/diagnose'];

export function AppShell() {
  const { status } = useAuth();
  useReminderScheduler();
  useRuleEvaluation();
  const { diary } = useData();
  const location = useLocation();
  // Entsperrt, aber noch kein Tagebuch → Onboarding fortsetzen. Bei Lesefehler normal weiter (Fehlerzustand der Ansicht).
  const diaries = useQuery(() => (status === 'unlocked' ? diary.listDiaries() : Promise.resolve(null)), [diary, status]);
  if (status === 'loading') return <p className="p-4 text-muted-foreground">{de.app.loading}</p>;
  if (status === 'no-account') return <Navigate to="/onboarding" replace />;
  if (status === 'unlocked' && diaries.status === 'ok' && diaries.data?.length === 0) return <Navigate to="/onboarding" replace />;
  const locked = status === 'locked';
  const here = location.pathname + location.search + location.hash;
  const unlockHref = `/unlock?next=${encodeURIComponent(here)}`;
  return (
    <DiaryScopeProvider enabled={status === 'unlocked'}>
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      {locked ? (
        <div role="status" data-testid="lock-banner" className="flex items-center justify-between gap-2 border-b bg-muted px-4 py-2 text-sm">
          <span className="flex items-center gap-2">
            <Lock className="size-4" aria-hidden />
            {de.lock.bannerText}
          </span>
          <Button asChild size="sm">
            <Link to={unlockHref} replace>
              {de.lock.bannerAction}
            </Link>
          </Button>
        </div>
      ) : null}
      <SyncStatus />
      {status === 'unlocked' ? <WhatsNewGate /> : null}
      {status === 'unlocked' ? <TourGate /> : null}
      <main className="flex flex-1 flex-col gap-4 p-4 pb-24">
        {locked ? null : <DiarySwitcher />}
        {locked && !OPEN_WHEN_LOCKED.includes(location.pathname) ? (
          <section data-testid="locked-view" className="flex flex-col gap-3">
            <h1 className="text-xl font-semibold">{de.lock.lockedTitle}</h1>
            <p className="text-muted-foreground">{de.lock.lockedHint}</p>
            <Button asChild>
              <Link to={unlockHref} replace>
                {de.lock.bannerAction}
              </Link>
            </Button>
          </section>
        ) : (
          <Outlet />
        )}
      </main>
      <nav
        aria-label={de.nav.label}
        data-tour="nav"
        className={cn('fixed inset-x-0 bottom-0 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur', TOUR_RING)}
      >
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {TABS.map(({ to, label, Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-14 flex-col items-center justify-center gap-1 text-xs text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    isActive && 'font-semibold text-foreground',
                  )
                }
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
    </DiaryScopeProvider>
  );
}
