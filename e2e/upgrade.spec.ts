import { test, expect } from '@playwright/test';
import { PASSWORD, addDeviceWithBackupCode, addVirtualAuthenticator, go, lockViaSettings, onboardWithPassword, uniqueUser, pickDateTime } from './helpers';

test.describe('Wechsel „nur auf diesem Gerät" → „Mit Konto"', () => {
  // Mehrere Geräte bzw. mehrfaches PBKDF2 (600k): unter Volllast mehr Zeit als die Standard-30 s.
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'Virtueller Authenticator mit PRF nur über CDP (Chromium)');
  });

  test('SYN-11: Wechsel local-only → cloud-primary lädt alle Records hoch; zweites Gerät sieht danach alle Daten', async ({ page, browser }) => {
    await onboardWithPassword(page);
    // lokale Daten: zwei Einträge, eine zweite Vorlage
    for (const [time, note] of [['2026-02-10T08:00', 'STB-E2E-MARKER lokal eins'], ['2026-02-11T09:30', 'STB-E2E-MARKER lokal zwei']] as const) {
      await go(page, '/entry/new');
      await pickDateTime(page, 'Zeitpunkt', time);
      await page.getByLabel('Notizen').fill(note);
      await page.getByRole('button', { name: 'Speichern' }).click();
      await expect(page.getByTestId('entry-time')).toBeVisible();
    }
    await go(page, '/more/templates');
    await page.getByRole('button', { name: /Migräne-Tracking/ }).click();
    await expect(page.getByTestId('template-row')).toHaveCount(2);
    await go(page, '/more');
    await expect(page.getByTestId('sync-status')).toHaveCount(0); // local-only: kein Sync

    // umstellen
    await addVirtualAuthenticator(page);
    await go(page, '/more/settings/konto');
    await page.getByRole('button', { name: 'Mit Konto synchronisieren' }).click();
    const user = uniqueUser('syn11');
    await page.getByLabel('Benutzername').fill(user);
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: 'Passkey anlegen' }).click();
    const code = (await page.getByTestId('backup-code').textContent({ timeout: 30_000 })) ?? '';
    await page.getByLabel('Ich habe den Code sicher aufbewahrt').check();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await expect(page.getByTestId('account-card')).toBeVisible({ timeout: 30_000 });
    await go(page, '/more');
    await expect(page.getByTestId('sync-status')).toHaveAttribute('data-state', 'synced', { timeout: 20_000 });
    await expect(page.getByTestId('sync-status')).toHaveAttribute('data-pending', '0');

    // Entsperren mit dem bisherigen Passwort bleibt auf diesem Gerät möglich (UMK unverändert), danach weiter synchron
    await lockViaSettings(page);
    await go(page, '/unlock');
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('sync-status')).toHaveAttribute('data-state', 'synced', { timeout: 20_000 });

    // zweites Gerät sieht alles
    const b = await addDeviceWithBackupCode(browser, user, code);
    await expect(b.getByTestId('sync-status')).toHaveAttribute('data-state', 'synced', { timeout: 20_000 });
    await go(b, '/history');
    await expect(b.getByTestId('entry-row')).toHaveCount(2);
    await b.getByTestId('entry-row').first().click();
    await expect(b.getByTestId('entry-field').filter({ hasText: 'Notizen' })).toContainText('STB-E2E-MARKER lokal zwei');
    await go(b, '/more/templates');
    await expect(b.getByTestId('template-row')).toHaveCount(2);
    await b.context().close();
  });
});
