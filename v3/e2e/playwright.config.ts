// Playwright (Spec 01/12): Chromium + WebKit, Mobile-Viewport, JSON-Report für check-acceptance.
import { defineConfig, devices } from '@playwright/test';
import { APP_VERSION } from '../apps/web/src/version';

const PORT = 4173;

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  // 2: Mit 6 Workern stürzte der Playwright-WebKit-Browser unter Windows wiederholt ab (Crash-Dialog, CrashReport.dmp,
  // 2026-11-16) — der Engpass ist WebKit, nicht die CPU. Zeitgewinn mit 6 war ohnehin gering (≈ 4 → 3,5 min).
  workers: 2,
  retries: 0,
  // Jeder Test startet in einem frischen Browser-Kontext ohne Cache: Die App (Bundle, Lazy-Chunks, 2× PBKDF2 mit 600k beim
  // Onboarding) wird neu geladen und übersetzt. Auf einem Windows-Rechner mit zwei parallelen Browsern (WebKit ist dabei am
  // langsamsten) schwankt das um ein Vielfaches; die Playwright-Vorgaben (30 s je Test, 5 s je Erwartung) reißen dann
  // vereinzelt. Gewartet wird weiter gezielt auf Bereitschaft (sichtbare Elemente, `data-route`), nur die Obergrenze ist höher.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['json', { outputFile: '../reports/playwright.json' }]],
  outputDir: '../reports/playwright-artifacts',
  use: {
    // localhost statt IP: WebAuthn verlangt eine gültige RP-ID.
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 375, height: 812 },
    locale: 'de-DE',
    // Ohne Screencast-Bilder: Der Playwright-WebKit-Build für Windows stürzt sonst mit Skia „SkBitmap tryAllocPixels (368x796)“
    // ab (WebKit2.dll, Crash-Dialog + CrashReport.dmp); die Trace-Aktionen/DOM-Snapshots bleiben erhalten.
    trace: { mode: 'retain-on-failure', screenshots: false },
    // Neuigkeiten-Dialog (UI-27) aus: Jeder Kontext – auch `browser.newContext()` – startet mit der aktuellen Version als gesehen,
    // sonst blockiert der modale Dialog die Bedienung. `whats-new.spec.ts` überschreibt das für die Prüfung des Dialogs.
    storageState: {
      cookies: [],
      origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: 'stb-v3-whatsnew', value: APP_VERSION }] }],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, isMobile: false } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 375, height: 812 } } },
    // Tauscht dist/sw.js kurz aus („Deploy") — darum erst nach allen anderen Projekten.
    {
      name: 'deploy',
      testMatch: '**/*.deploy.ts',
      dependencies: ['chromium', 'webkit'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, isMobile: false },
    },
    // CRY-15: nach allen Tests die Server-DB auf Klartext aus Testeinträgen scannen.
    { name: 'server-scan', testMatch: '**/*.scan.ts', dependencies: ['deploy'] },
  ],
  webServer: [
    {
      command: `npm run build -w @stb/web && npm run preview -w @stb/web -- --port ${PORT} --strictPort --host localhost`,
      cwd: '..',
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    // Echter Sync-Server (frische DB pro Lauf); die Preview leitet /api dorthin weiter (vite.config.ts).
    {
      command: 'npx tsc -b apps/server && node e2e/start-server.mjs',
      cwd: '..',
      url: 'http://127.0.0.1:3901/api/v1/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
