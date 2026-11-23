import { test, expect, type Page } from '@playwright/test';
import { addEntry, addVirtualAuthenticator, go, onboardWithCloud, onboardWithPassword, uniqueUser } from './helpers';

const MAIN_VIEWS = ['/', '/history', '/analysis', '/more', '/more/settings', '/entry/new', '/quick'];

async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

test.describe('App-Gerüst', () => {
  test.beforeEach(async ({ page }) => {
    await onboardWithPassword(page);
  });

  test('UI-03: alle Hauptansichten sind bei 375 px Breite ohne horizontales Scrollen nutzbar', async ({ page }) => {
    for (const path of MAIN_VIEWS) {
      await go(page, path);
      await expect(page.locator('h1')).toBeVisible();
      expect(await hasHorizontalScroll(page), path).toBe(false);
    }
  });

  test('UI-03: untere Navigation führt zu den vier Zielen; Touch-Ziele mindestens 44 px hoch', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
    for (const [name, path] of [['Verlauf', '/history'], ['Auswertung', '/analysis'], ['Mehr', '/more'], ['Start', '/']] as const) {
      const link = nav.getByRole('link', { name });
      const box = await link.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${path === '/' ? '/$' : path}$`));
    }
  });

  test('UI-06: Dark Mode wirkt sofort und bleibt nach Reload erhalten', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await go(page, '/more/settings');
    const html = page.locator('html');
    await expect(html).not.toHaveClass(/dark/);
    const bgLight = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await page.getByRole('button', { name: 'Dunkel' }).click();
    await expect(html).toHaveClass(/dark/);
    const bgDark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bgDark).not.toBe(bgLight);

    await page.reload();
    await expect(html).toHaveClass(/dark/);
    await expect(page.getByRole('button', { name: 'Dunkel' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Hell' }).click();
    await page.reload();
    await expect(html).not.toHaveClass(/dark/);
  });

  test('UI-06: „Auto" folgt der Systemeinstellung', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await go(page, '/more/settings');
    await page.getByRole('button', { name: 'Auto', exact: true }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });
});

test.describe('RDM-028 P1: Grundgerüst', () => {
  test('RDM-028 P1: Fußleiste bleibt beim Scrollen fest am unteren Rand und liegt über dem Inhalt', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/entry/new');
    await expect(page.locator('h1')).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
    const viewport = page.viewportSize()!;
    const check = async (label: string) => {
      const box = (await nav.boundingBox())!;
      expect(Math.round(box.y + box.height), `${label}: unterer Rand`).toBe(viewport.height);
      const inside = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return !!el?.closest('nav[aria-label="Hauptnavigation"]');
      }, { x: box.x + box.width / 2, y: box.y + 10 });
      expect(inside, `${label}: Nav über dem Inhalt`).toBe(true);
    };
    await check('vor Scroll');
    // Seite künstlich verlängern, damit Scrollen sicher möglich ist (unabhängig vom Formularumfang).
    await page.evaluate(() => {
      const filler = document.createElement('div');
      filler.style.height = '2500px';
      document.querySelector('main')!.appendChild(filler);
    });
    expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1000)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await check('nach Scroll ans Ende');
    await page.evaluate(() => window.scrollTo(0, 200));
    await check('nach Scroll in die Mitte');
  });

  test('RDM-028 P1: Sync-Status steht rechtsbündig in der Titelzeile der Tab-Hauptseiten, nicht auf Unterseiten und in der Detailansicht', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Virtueller Authenticator mit PRF nur über CDP (Chromium)');
    await addVirtualAuthenticator(page);
    await onboardWithCloud(page, uniqueUser('p1'));
    const status = page.getByTestId('sync-status');
    for (const path of ['/', '/history', '/analysis', '/more']) {
      await go(page, path);
      await expect(status, path).toHaveCount(1);
      await expect(page.locator('header').filter({ has: page.locator('h1') }).getByTestId('sync-status'), path).toBeVisible();
      const h = (await page.locator('h1').boundingBox())!;
      const s = (await status.boundingBox())!;
      expect(Math.abs(h.y + h.height / 2 - (s.y + s.height / 2)), `${path}: gleiche Zeile`).toBeLessThan(12);
      expect(s.x, `${path}: rechts neben dem Titel`).toBeGreaterThan(h.x + h.width);
      expect(Math.round(s.x + s.width), `${path}: rechtsbündig`).toBeGreaterThan(375 - 24);
    }
    await go(page, '/more/settings');
    await expect(page.locator('h1')).toBeVisible();
    await expect(status).toHaveCount(0);
    await addEntry(page, '4', 'STB-E2E-MARKER P1'); // endet in der Detailansicht
    await expect(status).toHaveCount(0);
  });
});
