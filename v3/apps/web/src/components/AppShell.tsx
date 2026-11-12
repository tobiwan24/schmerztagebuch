// Grundgerüst: Kopfzeile, Inhalt, untere Leiste mit vier Zielen (Spec 10 „Navigation"). Mobile-first, Desktop zentriert.
import { NavLink, Outlet } from 'react-router';
import { BarChart3, Home, List, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { de } from '@/i18n/de';

const TABS = [
  { to: '/', label: de.nav.start, Icon: Home, end: true },
  { to: '/history', label: de.nav.history, Icon: List, end: false },
  { to: '/analysis', label: de.nav.analysis, Icon: BarChart3, end: false },
  { to: '/more', label: de.nav.more, Icon: MoreHorizontal, end: false },
] as const;

export function AppShell() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <main className="flex flex-1 flex-col gap-4 p-4 pb-24">
        <Outlet />
      </main>
      <nav
        aria-label={de.nav.label}
        className="fixed inset-x-0 bottom-0 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
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
  );
}
