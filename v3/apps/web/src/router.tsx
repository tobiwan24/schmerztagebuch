// URL-basiertes Routing (A-005, Spec 10): Deep-Links `/quick`, `/invite`, `/entry/:id`, `/migrate`; Zurück-Geste per Historie.
import { createBrowserRouter } from 'react-router';
import { AppShell } from '@/components/AppShell';
import { RouteMarker } from '@/components/RouteMarker';
import { StartPage } from '@/pages/StartPage';
import { HistoryPage, MorePage, NotFoundPage } from '@/pages/SimplePages';
import { SettingsPage } from '@/pages/SettingsPage';
import { EntryDetailPage, EntryEditorPage } from '@/pages/EntryPages';
import { QuickPage } from '@/pages/QuickPage';
import { DiariesPage } from '@/pages/DiariesPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { UnlockPage } from '@/pages/UnlockPage';

/**
 * Schwere Ansichten (Diagramme, PDF/Export, Migration, Vorlagen-Editor, selten genutzte Seiten) werden erst beim Aufruf
 * geladen — initiales JS ≤ 250 KB gzip (Spec 12, QA-02). Der Router wartet beim Navigieren, bis das Modul da ist.
 */
function page<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M & string) {
  return async () => ({ Component: (await load())[name] as React.ComponentType });
}

export const router = createBrowserRouter([
  {
    element: <RouteMarker />,
    children: [
      { path: '/onboarding', element: <OnboardingPage /> },
      { path: '/unlock', element: <UnlockPage /> },
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <StartPage /> },
          { path: '/history', element: <HistoryPage /> },
          { path: '/analysis', lazy: page(() => import('@/pages/AnalysisPage'), 'AnalysisPage') },
          { path: '/more', element: <MorePage /> },
          { path: '/more/settings', element: <SettingsPage /> },
          { path: '/more/settings/diagnose', lazy: page(() => import('@/pages/DiagnosticsPage'), 'DiagnosticsPage') },
          { path: '/more/templates', lazy: page(() => import('@/pages/TemplatesPage'), 'TemplatesPage') },
          { path: '/more/diaries', element: <DiariesPage /> },
          { path: '/more/diaries/:id/shortcut', lazy: page(() => import('@/pages/ShortcutPage'), 'ShortcutPage') },
          { path: '/more/diaries/:id/members', lazy: page(() => import('@/pages/MembersPage'), 'MembersPage') },
          { path: '/more/export', lazy: page(() => import('@/pages/ExportPage'), 'ExportPage') },
          { path: '/entry/new', element: <EntryEditorPage /> },
          { path: '/entry/:id', element: <EntryDetailPage /> },
          { path: '/entry/:id/edit', element: <EntryEditorPage /> },
          { path: '/quick', element: <QuickPage /> },
          { path: '/migrate', lazy: page(() => import('@/pages/MigratePage'), 'MigratePage') },
          { path: '/invite', lazy: page(() => import('@/pages/InvitePage'), 'InvitePage') },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
