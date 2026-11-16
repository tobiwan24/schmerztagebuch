import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { initTheme } from './theme';
import { registerServiceWorker } from './sw-client';
import { reportIdFromPath } from './sharing/report-link';

initTheme();

const root = document.getElementById('root');
if (!root) throw new Error('#root fehlt in index.html');

if (reportIdFromPath(window.location.pathname)) {
  // Arzt-Link (EXP-23): eigenständige, nur lesende Ansicht — ohne Konto-, Daten- und Sync-Provider und ohne Service Worker.
  const ReportViewerPage = lazy(() => import('./pages/ReportViewerPage').then((m) => ({ default: m.ReportViewerPage })));
  createRoot(root).render(
    <StrictMode>
      <Suspense fallback={null}>
        <ReportViewerPage />
      </Suspense>
    </StrictMode>,
  );
} else {
  registerServiceWorker();
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
