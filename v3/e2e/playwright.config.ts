// Playwright (Spec 01/12): Chromium + WebKit, Mobile-Viewport, JSON-Report für check-acceptance.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: '../reports/playwright.json' }]],
  outputDir: '../reports/playwright-artifacts',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 375, height: 812 },
    locale: 'de-DE',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, isMobile: false } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    command: `npm run build -w @stb/web && npm run preview -w @stb/web -- --port ${PORT} --strictPort --host 127.0.0.1`,
    cwd: '..',
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
