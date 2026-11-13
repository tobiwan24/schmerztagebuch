import { test, expect, type Page } from '@playwright/test';
import { addDeviceWithBackupCode, addVirtualAuthenticator, go, onboardWithCloud, onboardWithPassword, uniqueUser } from './helpers';

async function addEntry(page: Page, pain: string, note?: string) {
  await go(page, '/entry/new');
  await page.getByLabel(/Schmerzstärke/).fill(pain);
  if (note) await page.getByLabel('Notizen').fill(note);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByTestId('entry-time')).toBeVisible();
}

const rows = (page: Page) => page.getByTestId('entry-row');

test.describe('Verlauf: Suche und Filter', () => {
  // Mehrere Geräte bzw. mehrfaches PBKDF2 (600k): unter Volllast mehr Zeit als die Standard-30 s.
  test.describe.configure({ timeout: 90_000 });

  test('umlauttolerante Suche und Filter-Chips grenzen den Verlauf ein', async ({ page }) => {
    await onboardWithPassword(page);
    await addEntry(page, '8', 'Übelkeit am Morgen');
    await addEntry(page, '2', 'ruhiger Tag');
    await addEntry(page, '7');
    await go(page, '/history');
    await expect(rows(page)).toHaveCount(3);

    await page.getByLabel('Suchen').fill('uebelkeit');
    await expect(rows(page)).toHaveCount(1);
    await page.getByLabel('Suchen').fill('xyzzy');
    await expect(page.getByTestId('empty-state')).toContainText('Keine Einträge für diesen Filter');
    await page.getByRole('button', { name: 'Zurücksetzen' }).click();
    await expect(rows(page)).toHaveCount(3);

    await page.getByRole('button', { name: 'Schmerz ≥ 6' }).click();
    await expect(rows(page)).toHaveCount(2);
    await page.getByRole('button', { name: '7 Tage' }).click();
    await expect(rows(page)).toHaveCount(2);
  });

  test('ANA-11: gespeicherter Filter überlebt Reload und erscheint auf dem Zweitgerät', async ({ page: a, browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'Konto + Zweitgerät mit virtuellem Authenticator (Chromium)');
    await addVirtualAuthenticator(a);
    const user = uniqueUser('ana11');
    const code = await onboardWithCloud(a, user);
    await addEntry(a, '8', 'schwerer Tag');
    await addEntry(a, '3');
    await addEntry(a, '9');

    await go(a, '/history');
    await a.getByRole('button', { name: 'Schmerz ≥ 6' }).click();
    await expect(rows(a)).toHaveCount(2);
    await a.getByRole('button', { name: 'Filter speichern' }).click();
    await a.getByLabel('Name des Filters').fill('Schwere Tage');
    await a.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
    await expect(a.getByTestId('saved-filters')).toContainText('Schwere Tage');
    await expect(a.getByTestId('sync-status')).toHaveAttribute('data-state', 'synced', { timeout: 20_000 });

    // Reload (sperrt) → entsperren → gespeicherter Filter da und wirksam
    await a.reload();
    await a.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
    await a.getByRole('button', { name: 'Mit Passkey entsperren' }).click();
    // Entsperren führt zurück in die gesperrte Ansicht (Verlauf)
    await expect(a.getByRole('heading', { name: 'Verlauf' })).toBeVisible({ timeout: 30_000 });
    await expect(rows(a)).toHaveCount(3);
    await a.getByTestId('saved-filters').getByRole('button', { name: 'Schwere Tage', exact: true }).click();
    await expect(a.getByRole('button', { name: 'Schmerz ≥ 6' })).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(a)).toHaveCount(2);

    // Zweitgerät
    const b = await addDeviceWithBackupCode(browser, user, code);
    await expect(b.getByTestId('sync-status')).toHaveAttribute('data-state', 'synced', { timeout: 20_000 });
    await go(b, '/history');
    await b.getByTestId('saved-filters').getByRole('button', { name: 'Schwere Tage', exact: true }).click();
    await expect(rows(b)).toHaveCount(2);
    await b.context().close();
  });
});
