import { test, expect } from '@playwright/test';
import { go, onboardWithPassword } from './helpers';

test.describe('Einstellungen: Diagnose und Erinnerungen', () => {
  test('UI-09: Diagnose zeigt Version, Sync-Status und Outbox-Länge und enthält keine Eintragsinhalte', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/entry/new');
    await page.getByLabel(/Schmerzstärke/).fill('5');
    await page.getByLabel('Notizen').fill('STB-E2E-MARKER geheim');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('entry-time')).toBeVisible();

    await go(page, '/more/settings');
    await page.getByRole('link', { name: 'Über & Diagnose' }).click();
    const diag = page.getByTestId('diagnostics');
    await expect(page.getByTestId('diag-version')).toHaveText(/^3\.\d+\.\d+/);
    await expect(page.getByTestId('diag-sync')).toHaveText('aus (nur auf diesem Gerät)');
    await expect(page.getByTestId('diag-outbox')).toHaveText(/^\d+/);
    await expect(diag).toContainText('Datensätze „entry"');
    const html = await page.content();
    expect(html).not.toContain('STB-E2E-MARKER');
  });

  test('Erinnerung: Einstellung (Uhrzeit, Wochentage) bleibt gespeichert', async ({ page, context, browserName }) => {
    if (browserName === 'chromium') await context.grantPermissions(['notifications']);
    await onboardWithPassword(page);
    await go(page, '/more/settings');
    const card = page.getByTestId('reminder-card');
    await card.getByLabel('Erinnerung aktiv').check();
    await card.getByLabel('Uhrzeit').fill('07:45');
    await card.getByRole('button', { name: 'Sa' }).click();
    await go(page, '/more');
    await go(page, '/more/settings');
    await expect(card.getByLabel('Erinnerung aktiv')).toBeChecked();
    await expect(card.getByLabel('Uhrzeit')).toHaveValue('07:45');
    await expect(card.getByRole('button', { name: 'Sa' })).toHaveAttribute('aria-pressed', 'false');
    await expect(card.getByRole('button', { name: 'So' })).toHaveAttribute('aria-pressed', 'true');
  });
});
