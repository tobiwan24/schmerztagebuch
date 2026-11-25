// URL-basiertes Routing (A-005, Spec 10): Deep-Links `/quick`, `/invite`, `/entry/:id`, `/migrate`; Zurück-Geste per Historie.
import { createBrowserRouter } from 'react-router';
import { AppShell } from '@/components/AppShell';
import { RouteMarker } from '@/components/RouteMarker';
import { StartPage } from '@/pages/StartPage';
import { MorePage, NotFoundPage } from '@/pages/SimplePages';

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
      { path: '/onboarding', lazy: page(() => import('@/pages/OnboardingPage'), 'OnboardingPage') },
      // Arzt-Link-Ansicht (EXP-23): außerhalb der AppShell, ohne Entsperr-Prüfung, nur lesend
      { path: '/r/:id', lazy: page(() => import('@/pages/ReportViewerPage'), 'ReportViewerPage') },
      { path: '/unlock', lazy: page(() => import('@/pages/UnlockPage'), 'UnlockPage') },
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <StartPage /> },
          { path: '/history', lazy: page(() => import('@/pages/HistoryPage'), 'HistoryPage') },
          { path: '/analysis', lazy: page(() => import('@/pages/AnalysisPage'), 'AnalysisPage') },
          { path: '/training', lazy: page(() => import('@/pages/TrainingPage'), 'TrainingPage') },
          { path: '/more', element: <MorePage /> },
          { path: '/more/settings', lazy: page(() => import('@/pages/SettingsPage'), 'SettingsPage') },
          { path: '/more/settings/konto', lazy: page(() => import('@/pages/SettingsSections'), 'SettingsAccountPage') },
          { path: '/more/settings/updates', lazy: page(() => import('@/pages/SettingsSections'), 'SettingsUpdatesPage') },
          { path: '/more/settings/sicherheit', lazy: page(() => import('@/pages/SettingsSections'), 'SettingsSecurityPage') },
          { path: '/more/settings/darstellung', lazy: page(() => import('@/pages/SettingsSections'), 'SettingsAppearancePage') },
          { path: '/more/settings/erinnerungen', lazy: page(() => import('@/pages/SettingsSections'), 'SettingsRemindersPage') },
          { path: '/more/settings/ki', lazy: page(() => import('@/pages/SettingsSections'), 'SettingsLlmPage') },
          { path: '/more/settings/daten', lazy: page(() => import('@/pages/SettingsSections'), 'SettingsDataPage') },
          { path: '/more/settings/konflikte', lazy: page(() => import('@/pages/ConflictLogPage'), 'ConflictLogPage') },
          { path: '/more/settings/diagnose', lazy: page(() => import('@/pages/DiagnosticsPage'), 'DiagnosticsPage') },
          { path: '/more/templates', lazy: page(() => import('@/pages/TemplatesPage'), 'TemplatesPage') },
          { path: '/more/templates/new', lazy: page(() => import('@/pages/TemplateEditorPage'), 'TemplateEditorPage') },
          { path: '/more/templates/:id', lazy: page(() => import('@/pages/TemplateEditorPage'), 'TemplateEditorPage') },
          { path: '/more/diaries', lazy: page(() => import('@/pages/DiariesPage'), 'DiariesPage') },
          { path: '/more/diaries/new', lazy: page(() => import('@/pages/DiaryCreatePage'), 'DiaryCreatePage') },
          { path: '/more/diaries/:id/settings', lazy: page(() => import('@/pages/DiarySettingsPage'), 'DiarySettingsPage') },
          { path: '/more/diaries/:id/shortcut', lazy: page(() => import('@/pages/ShortcutPage'), 'ShortcutPage') },
          { path: '/more/diaries/:id/members', lazy: page(() => import('@/pages/MembersPage'), 'MembersPage') },
          { path: '/more/export', lazy: page(() => import('@/pages/ExportPage'), 'ExportPage') },
          { path: '/entry/new', lazy: page(() => import('@/pages/EntryPages'), 'EntryEditorPage') },
          { path: '/entry/:id', lazy: page(() => import('@/pages/EntryPages'), 'EntryDetailPage') },
          { path: '/entry/:id/edit', lazy: page(() => import('@/pages/EntryPages'), 'EntryEditorPage') },
          { path: '/quick', lazy: page(() => import('@/pages/QuickPage'), 'QuickPage') },
          { path: '/migrate', lazy: page(() => import('@/pages/MigratePage'), 'MigratePage') },
          { path: '/invite', lazy: page(() => import('@/pages/InvitePage'), 'InvitePage') },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
