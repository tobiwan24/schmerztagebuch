// Einstellungen → Sperre (CRY-20): Inaktivitäts-Auswahl. „Entsperrt bleiben“ ist entfallen (RDM-035, A-151).
import { test, expect } from '@playwright/test';
import { PASSWORD, go, lockViaSettings, onboardWithPassword } from './helpers';

test.describe('Sperre', () => {
  test('CRY-20: Inaktivität wählbar und bleibt nach Sperren/Entsperren; keine Option „entsperrt bleiben“ mehr', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/more/settings/sicherheit');
    await expect(page.getByText(/entsperrt bleiben/i)).toHaveCount(0);
    await page.getByRole('button', { name: '5 min', exact: true }).click();
    await expect(page.getByRole('button', { name: '5 min', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '30 min', exact: true })).toHaveAttribute('aria-pressed', 'false');

    await lockViaSettings(page);
    await page.getByRole('main').getByRole('link', { name: 'Entsperren' }).click();
    await expect(page.getByText(/entsperrt bleiben/i)).toHaveCount(0);
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();

    await go(page, '/more/settings/sicherheit');
    await expect(page.getByRole('button', { name: '5 min', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
});
