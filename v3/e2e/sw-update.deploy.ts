// Läuft als eigenes Projekt NACH allen anderen (playwright.config.ts): der Test „deployt" eine neue Version, indem er
// dist/sw.js kurzzeitig austauscht — parallele Tests würden sonst ebenfalls den Update-Hinweis sehen.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { activeVersion, go, onboardWithPassword, swReady } from './helpers';

const DIST_SW = fileURLToPath(new URL('../apps/web/dist/sw.js', import.meta.url));

test('SYN-15, UI-22: „Nach Updates suchen" meldet „aktuell"; neue Version → Hinweis „Neue Version", Neustart aktiviert sie', async ({ page }) => {
  await onboardWithPassword(page);
  await swReady(page);
  const current = await activeVersion(page);
  expect(current).toMatch(/^3\.0\.0-/);

  // UI-22: ohne neue Version meldet die Suche „aktuell“, kein Hinweis.
  await go(page, '/more/settings');
  await page.getByRole('button', { name: 'Nach Updates suchen' }).click();
  await expect(page.getByText('Die App ist auf dem neuesten Stand.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('update-banner')).toHaveCount(0);

  // Gleiche Länge wie die alte Version (der Preview-Server berechnet Content-Length beim Start).
  const next = current.slice(0, -1) + (current.endsWith('x') ? 'y' : 'x');
  const original = readFileSync(DIST_SW, 'utf8');
  writeFileSync(DIST_SW, original.replace(JSON.stringify(current), JSON.stringify(next)));
  try {
    await page.getByRole('button', { name: 'Nach Updates suchen' }).click();
    const banner = page.getByTestId('update-banner');
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText('Neue Version');
    await page.getByRole('button', { name: 'Neu starten' }).click();
    await page.waitForEvent('load');
    await expect.poll(() => activeVersion(page)).toBe(next);
    await expect(banner).toHaveCount(0);
  } finally {
    writeFileSync(DIST_SW, original);
  }
});
