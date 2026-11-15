// URL-basiertes Routing (A-005, Spec 10): Deep-Links `/quick`, `/invite`, `/entry/:id`, `/migrate`; Zurück-Geste per Historie.
import { createBrowserRouter } from 'react-router';
import { AppShell } from '@/components/AppShell';
import { RouteMarker } from '@/components/RouteMarker';
import { StartPage } from '@/pages/StartPage';
import { HistoryPage, MorePage, NotFoundPage, PlaceholderPage } from '@/pages/SimplePages';
import { AnalysisPage } from '@/pages/AnalysisPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { EntryDetailPage, EntryEditorPage } from '@/pages/EntryPages';
import { QuickPage } from '@/pages/QuickPage';
import { TemplatesPage } from '@/pages/TemplatesPage';
import { ExportPage } from '@/pages/ExportPage';
import { MigratePage } from '@/pages/MigratePage';
import { DiagnosticsPage } from '@/pages/DiagnosticsPage';
import { DiariesPage } from '@/pages/DiariesPage';
import { ShortcutPage } from '@/pages/ShortcutPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { UnlockPage } from '@/pages/UnlockPage';
import { de } from '@/i18n/de';

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
          { path: '/analysis', element: <AnalysisPage /> },
          { path: '/more', element: <MorePage /> },
          { path: '/more/settings', element: <SettingsPage /> },
          { path: '/more/settings/diagnose', element: <DiagnosticsPage /> },
          { path: '/more/templates', element: <TemplatesPage /> },
          { path: '/more/diaries', element: <DiariesPage /> },
          { path: '/more/diaries/:id/shortcut', element: <ShortcutPage /> },
          { path: '/more/export', element: <ExportPage /> },
          { path: '/entry/new', element: <EntryEditorPage /> },
          { path: '/entry/:id', element: <EntryDetailPage /> },
          { path: '/entry/:id/edit', element: <EntryEditorPage /> },
          { path: '/quick', element: <QuickPage /> },
          { path: '/migrate', element: <MigratePage /> },
          { path: '/invite', element: <PlaceholderPage title={de.invite.title} /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
