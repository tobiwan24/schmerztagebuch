import { test, expect } from '@playwright/test';
import { go, onboardWithPassword } from './helpers';

test.describe('Gefahr-Zone', () => {
  test.describe.configure({ timeout: 90_000 });

  test('UI-21: Löschen nur nach Eingabe von „LÖSCHEN", danach Onboarding; PainDiaryDB bleibt', async ({ page }) => {
    await onboardWithPassword(page);
    // v2-Datenbank als Attrappe anlegen
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const r = indexedDB.open('PainDiaryDB', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('entries');
          r.onsuccess = () => {
            r.result.close();
            resolve();
          };
          r.onerror = () => reject(r.error);
        }),
    );
    await go(page, '/more/settings/daten');
    const zone = page.getByTestId('danger-zone');
    await zone.getByRole('button', { name: 'Alle Daten auf diesem Gerät löschen' }).click();
    const confirm = zone.getByRole('button', { name: 'Endgültig löschen' });
    await expect(confirm).toBeDisabled();
    await zone.getByLabel(/Zur Bestätigung/).fill('loeschen');
    await expect(confirm).toBeDisabled();
    await zone.getByLabel(/Zur Bestätigung/).fill('LÖSCHEN');
    await confirm.click();
    await expect(page).toHaveURL(/\/onboarding$/, { timeout: 30_000 });
    const names = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
    expect(names).not.toContain('stb-v3-autobackup');
    expect(names).toContain('PainDiaryDB');
  });
});
