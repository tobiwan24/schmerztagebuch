import { test, expect, type Page } from '@playwright/test';

const MAIN_VIEWS = ['/', '/history', '/analysis', '/more', '/more/settings', '/entry/new', '/quick'];

async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

test.describe('App-Gerüst', () => {
  test('UI-03: alle Hauptansichten sind bei 375 px Breite ohne horizontales Scrollen nutzbar', async ({ page }) => {
    for (const path of MAIN_VIEWS) {
      await page.goto(path);
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
    await page.goto('/more/settings');
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

  test('UI-06: „Automatisch" folgt der Systemeinstellung', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/more/settings');
    await page.getByRole('button', { name: 'Automatisch' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });
});
