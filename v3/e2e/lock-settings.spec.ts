// Einstellungen → Sperre (CRY-20): Dauer „entsperrt bleiben", Widerruf, Inaktivitäts-Auswahl.
import { test, expect } from '@playwright/test';
import { PASSWORD, go, lockViaSettings, onboardWithPassword } from './helpers';

test.describe('Sperre', () => {
  test('CRY-20: Dauer einstellbar (Entsperr-Dialog zeigt sie), „entsperrt bleiben" aktiv und widerrufbar, Inaktivität wählbar', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/more/settings');
    await expect(page.getByTestId('stay-status')).toContainText('nicht entsperrt');
    const days = page.getByLabel(/Entsperrt bleiben \(Tage/);
    await days.fill('3');
    await days.blur();
    await page.getByRole('button', { name: '5 min', exact: true }).click();
    await expect(page.getByRole('button', { name: '5 min', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '30 min', exact: true })).toHaveAttribute('aria-pressed', 'false');

    await lockViaSettings(page);
    await page.getByRole('main').getByRole('link', { name: 'Entsperren' }).click();
    await expect(page.getByText('Auf diesem Gerät entsperrt bleiben (3 Tage)')).toBeVisible();
    await page.getByLabel(/Auf diesem Gerät entsperrt bleiben/).check();
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();

    await go(page, '/more/settings');
    await expect(page.getByTestId('stay-status')).toContainText('bleibt entsperrt bis');
    await page.getByRole('button', { name: 'Entsperrt bleiben widerrufen' }).click();
    await expect(page.getByTestId('stay-status')).toContainText('Widerrufen');
    await expect(page.getByRole('button', { name: '5 min', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
});
