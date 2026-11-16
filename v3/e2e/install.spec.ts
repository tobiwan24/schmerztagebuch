import { test, expect } from '@playwright/test';
import { go, onboardWithPassword, PASSWORD } from './helpers';

test.describe('Speicher und Installation', () => {
  test.describe.configure({ timeout: 90_000 });

  test('UI-16: Abschluss des Onboardings ruft storage.persist() auf, Einstellungen zeigen den Status', async ({ page }) => {
    // Browser-Antwort ist nicht deterministisch (Heuristik) — daher ersetzt; gezählt wird der Aufruf.
    await page.addInitScript(() => {
      let granted = false;
      const w = window as unknown as { __persistCalls: number };
      w.__persistCalls = 0;
      const storage = Object.getPrototypeOf(navigator.storage) as object;
      Object.defineProperty(storage, 'persist', {
        configurable: true,
        value: () => {
          w.__persistCalls += 1;
          granted = true;
          return Promise.resolve(true);
        },
      });
      Object.defineProperty(storage, 'persisted', { configurable: true, value: () => Promise.resolve(granted) });
    });
    await onboardWithPassword(page);
    expect(await page.evaluate(() => (window as unknown as { __persistCalls: number }).__persistCalls)).toBe(1);
    await go(page, '/more/settings');
    await expect(page.getByTestId('persist-card')).toContainText('Dauerhafter Speicher');
    await expect(page.getByTestId('persist-card')).toContainText('Gewährt');
  });

  test('UI-19: Install-Banner im Browser-Modus, wegklickbar, nach Reload verborgen', async ({ page }) => {
    await onboardWithPassword(page);
    const banner = page.getByTestId('install-banner');
    await expect(banner).toBeVisible();
    await expect(page.getByTestId('install-safari-hint')).toHaveCount(0);
    await banner.getByRole('button', { name: 'Hinweis schließen' }).click();
    await expect(banner).toHaveCount(0);
    await page.reload();
    await page.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
    await expect(banner).toHaveCount(0);
  });

  test('UI-19: iOS in einem anderen Browser als Safari zeigt zusätzlich den Safari-Hinweis', async ({ browser }) => {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
    });
    const page = await ctx.newPage();
    await onboardWithPassword(page);
    await expect(page.getByTestId('install-safari-hint')).toContainText('nur Safari');
    await ctx.close();
  });

  test('UI-19: in der installierten App (standalone) erscheint das Banner nie', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = window.matchMedia.bind(window);
      window.matchMedia = (q: string) => (q.includes('display-mode: standalone') ? ({ ...orig(q), matches: true } as MediaQueryList) : orig(q));
    });
    await onboardWithPassword(page);
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
    await expect(page.getByTestId('install-banner')).toHaveCount(0);
  });
});
