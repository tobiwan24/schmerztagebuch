// Playwright (Spec 01/12): Chromium + WebKit, Mobile-Viewport, JSON-Report für check-acceptance.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  // WebKit unter Windows stürzte bei 6 parallelen Workern ab (Last); 2 Worker sind stabil.
  workers: 2,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: '../reports/playwright.json' }]],
  outputDir: '../reports/playwright-artifacts',
  use: {
    // localhost statt IP: WebAuthn verlangt eine gültige RP-ID.
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 375, height: 812 },
    locale: 'de-DE',
    trace: 'retain-on-failure',
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
  ],
  webServer: {
    command: `npm run build -w @stb/web && npm run preview -w @stb/web -- --port ${PORT} --strictPort --host localhost`,
    cwd: '..',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
