import { test, expect, type Page } from '@playwright/test';
import { createV2Db, go, onboardWithPassword, PASSWORD } from './helpers';

async function addEntry(page: Page, note: string) {
  await go(page, '/entry/new');
  await page.getByLabel(/Schmerzstärke/).fill('6');
  await page.getByLabel('Notizen').fill(note);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByTestId('entry-time')).toBeVisible();
}

test.describe('Backup wiederherstellen (leere DB)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('EXP-16: nach dem Onboarding erscheint der Hinweis, ist wegklickbar und bleibt nach dem Neuladen verborgen', async ({ page }) => {
    await onboardWithPassword(page);
    const banner = page.getByTestId('restore-banner');
    await expect(banner).toBeVisible();
    await expect(banner.getByRole('link', { name: 'Backup-Datei wählen' })).toBeVisible();
    // Keine Auto-Sicherung vorhanden → kein Auto-Knopf
    await expect(banner.getByRole('button', { name: /Auto-Sicherung/ })).toHaveCount(0);
    await banner.getByRole('button', { name: 'Ausblenden' }).click();
    await expect(banner).toHaveCount(0);
    await page.reload();
    await page.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
    await expect(banner).toHaveCount(0);
  });

  test('EXP-16: nicht bei vorhandenen v2-Daten (dort greift die Migration)', async ({ page }) => {
    await onboardWithPassword(page);
    await expect(page.getByTestId('restore-banner')).toBeVisible();
    await createV2Db(page);
    await go(page, '/history');
    await go(page, '/');
    await expect(page.getByTestId('v2-banner')).toBeVisible();
    await expect(page.getByTestId('restore-banner')).toHaveCount(0);
  });

  test('EXP-16: nach Löschen von stb-v3 stellt der Hinweis die Auto-Sicherung mit dem Passwort wieder her (falsches Passwort wird gemeldet)', async ({ page, context }) => {
    // Die Sicherung läuft 30 s nach dem letzten Schreiben — die Seitenuhr vorspulen statt zu warten.
    await page.clock.install();
    await onboardWithPassword(page);
    await addEntry(page, 'STB-E2E-MARKER Auto-Sicherung');
    await page.clock.fastForward(40_000);
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              new Promise<boolean>((resolve) => {
                const req = indexedDB.open('stb-v3-autobackup');
                req.onsuccess = () => {
                  const db = req.result;
                  if (!db.objectStoreNames.contains('backups')) return (db.close(), resolve(false));
                  const get = db.transaction('backups').objectStore('backups').get('latest');
                  get.onsuccess = () => (db.close(), resolve(!!get.result));
                  get.onerror = () => (db.close(), resolve(false));
                };
                req.onerror = () => resolve(false);
              }),
          ),
        { timeout: 60_000 },
      )
      .toBe(true);
    await page.close();

    // stb-v3 löschen (von einer Seite ohne App, sonst blockiert die offene Verbindung); die Auto-Sicherung bleibt.
    const bare = await context.newPage();
    await bare.goto('/manifest.webmanifest');
    await bare.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.deleteDatabase('stb-v3');
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
          req.onblocked = () => reject(new Error('stb-v3 ist noch geöffnet'));
        }),
    );
    await bare.close();

    const fresh = await context.newPage();
    await onboardWithPassword(fresh, 'ganz-anderes-passwort-456');
    const banner = fresh.getByTestId('restore-banner');
    await banner.getByRole('button', { name: /Auto-Sicherung vom/ }).click();
    const dialog = fresh.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Passwort', exact: true }).click();
    await dialog.getByLabel('Passwort', { exact: true }).fill('falsches-passwort');
    await dialog.getByRole('button', { name: 'Wiederherstellen' }).click();
    await expect(dialog.getByRole('alert')).toContainText('stimmt nicht');
    await dialog.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Wiederherstellen' }).click();
    await expect(fresh.getByTestId('restore-done')).toContainText('1 Einträge wiederhergestellt');
    await go(fresh, '/history');
    await expect(fresh.getByTestId('entry-row')).toHaveCount(1);
    await expect(fresh.getByTestId('restore-banner')).toHaveCount(0);
  });
});
