// URL-basiertes Routing (A-005, Spec 10): Deep-Links `/quick`, `/invite`, `/entry/:id`, `/migrate`; Zurück-Geste per Historie.
import { createBrowserRouter } from 'react-router';
import { AppShell } from '@/components/AppShell';
import { StartPage } from '@/pages/StartPage';
import { AnalysisPage, EntryPage, HistoryPage, MorePage, NotFoundPage, PlaceholderPage } from '@/pages/SimplePages';
import { SettingsPage } from '@/pages/SettingsPage';
import { de } from '@/i18n/de';

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <StartPage /> },
      { path: '/history', element: <HistoryPage /> },
      { path: '/analysis', element: <AnalysisPage /> },
      { path: '/more', element: <MorePage /> },
      { path: '/more/settings', element: <SettingsPage /> },
      { path: '/more/templates', element: <PlaceholderPage title={de.more.templates} /> },
      { path: '/more/diaries', element: <PlaceholderPage title={de.more.diaries} /> },
      { path: '/more/export', element: <PlaceholderPage title={de.more.export} /> },
      { path: '/entry/:id', element: <EntryPage /> },
      { path: '/quick', element: <PlaceholderPage title={de.quick.title} /> },
      { path: '/invite', element: <PlaceholderPage title={de.invite.title} /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
