import { test, expect } from '@playwright/test';
import { PASSWORD, go, onboardWithPassword } from './helpers';

async function unlockWithPassword(page: import('@playwright/test').Page) {
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
}

test.describe('Deep-Links und Zustände', () => {
  for (const [path, heading] of [['/entry/0190a1b2-0000-7000-8000-000000000001', 'Eintrag'], ['/quick', 'Schnelleintrag'], ['/invite#einladung.geheimnis', 'Einladung']] as const) {
    test(`UI-04: Deep-Link ${path.split('#')[0]} öffnet nach dem Entsperren die richtige Ansicht; Zurück funktioniert`, async ({ page }) => {
      await onboardWithPassword(page);
      // Deep-Link von außen (neues Laden → gesperrt)
      await page.goto(path);
      await expect(page.getByTestId('locked-view')).toBeVisible();
      await page.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
      await unlockWithPassword(page);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible({ timeout: 30_000 });
      expect(new URL(page.url()).pathname + new URL(page.url()).hash).toBe(path);

      // Zurück-Navigation innerhalb der App
      await go(page, '/history');
      await page.goBack();
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      // Zurück-Button im Seitenkopf folgt der Historie
      await go(page, '/more');
      await go(page, path);
      await page.getByRole('button', { name: 'Zurück' }).click();
      await expect(page).toHaveURL(/\/more$/);
    });
  }

  test('UI-05: jede Hauptansicht zeigt bei leerer DB ihren Leerzustand', async ({ page }) => {
    await onboardWithPassword(page);
    for (const [path, title] of [['/history', 'Noch nichts im Verlauf'], ['/analysis', 'Noch keine Daten für eine Auswertung']] as const) {
      await go(page, path);
      await expect(page.getByTestId('empty-state')).toContainText(title);
      await expect(page.getByTestId('error-state')).toHaveCount(0);
    }
  });

  test('UI-05: jede Hauptansicht zeigt bei Repository-Fehler ihren Fehlerzustand mit „Erneut versuchen"', async ({ page }) => {
    // Lesefehler nur für den Records-Store simulieren (Konto/Schlüssel bleiben lesbar).
    await page.addInitScript(() => {
      const fail = (name: string) => () => {
        throw new DOMException(`simulierter Fehler in ${name}`, 'UnknownError');
      };
      for (const proto of [IDBObjectStore.prototype, IDBIndex.prototype] as unknown as Record<string, unknown>[]) {
        for (const method of ['openCursor', 'getAll', 'count']) {
          const original = proto[method] as (...a: unknown[]) => unknown;
          proto[method] = function (this: IDBObjectStore | IDBIndex, ...args: unknown[]) {
            const store = 'objectStore' in this ? this.objectStore.name : this.name;
            return store === 'records' ? fail(store)() : original.apply(this, args);
          };
        }
      }
    });
    await onboardWithPassword(page);
    for (const path of ['/history', '/analysis']) {
      await go(page, path);
      const error = page.getByTestId('error-state');
      await expect(error).toBeVisible();
      await expect(error.getByRole('button', { name: 'Erneut versuchen' })).toBeVisible();
      await expect(page.getByTestId('empty-state')).toHaveCount(0);
    }
  });
});
