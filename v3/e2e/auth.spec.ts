import { test, expect } from '@playwright/test';
import { PASSWORD, addVirtualAuthenticator, finishDiarySetup, go, lockViaSettings, onboardWithPassword } from './helpers';

test.describe('Onboarding und Entsperren (nur auf diesem Gerät)', () => {
  test('CRY-08: Registrierung ist ohne Bestätigung des Backup-Codes nicht abschließbar', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: /Nur auf diesem Gerät/ }).click();
    await page.getByRole('button', { name: 'Mit Passwort' }).click();
    await page.getByLabel('Passwort (mindestens 8 Zeichen)').fill(PASSWORD);
    await page.getByLabel('Passwort wiederholen').fill(PASSWORD);
    await page.getByRole('button', { name: 'Konto anlegen' }).click();
    await expect(page.getByTestId('backup-code')).toHaveText(/^[A-Z2-7]{8}(-[A-Z2-7]{8}){3}$/, { timeout: 30_000 });
    const next = page.getByRole('button', { name: 'Weiter' });
    await expect(next).toBeDisabled();
    // Abbruch (Reload) vor der Bestätigung: es entsteht kein Konto
    await page.reload();
    await page.goto('/history');
    await expect(page).toHaveURL(/\/onboarding$/);
  });

  test('CRY-09: Entsperren mit virtuellem Authenticator (PRF) entsperrt die Daten', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Virtueller Authenticator nur über CDP (Chromium)');
    await addVirtualAuthenticator(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: /Nur auf diesem Gerät/ }).click();
    await page.getByRole('button', { name: 'Mit Passkey (Face ID / Touch ID)' }).click();
    await expect(page.getByTestId('backup-code')).toBeVisible({ timeout: 30_000 });
    await page.getByLabel('Ich habe den Code sicher aufbewahrt').check();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await finishDiarySetup(page);

    await lockViaSettings(page);
    await go(page, '/history');
    await expect(page.getByTestId('locked-view')).toBeVisible();
    await page.getByTestId('locked-view').getByRole('link', { name: 'Entsperren' }).click();
    await page.getByRole('button', { name: 'Mit Passkey entsperren' }).click();
    await expect(page).toHaveURL(/\/history$/);
    await expect(page.getByRole('heading', { name: 'Verlauf' })).toBeVisible();
    await expect(page.getByTestId('lock-banner')).toHaveCount(0);
  });

  test('CRY-10: nach Abbruch ist der Entsperr-Dialog über Banner und Einstellungen erreichbar; gesperrte Views bleiben gesperrt', async ({ page }) => {
    await onboardWithPassword(page);
    await lockViaSettings(page);
    await go(page, '/history');
    await page.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
    await expect(page).toHaveURL(/\/unlock\?next=%2Fhistory$/, { timeout: 15_000 });
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(page).toHaveURL(/\/history$/);
    await expect(page.getByTestId('locked-view')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Verlauf' })).toHaveCount(0);

    // erneut über das Banner …
    await page.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
    await expect(page.getByRole('heading', { name: 'Tagebuch entsperren' })).toBeVisible();
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    // … und über die Einstellungen
    await go(page, '/more/settings');
    await page.getByRole('main').getByRole('link', { name: 'Entsperren' }).click();
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await expect(page).toHaveURL(/\/more\/settings$/);
    await expect(page.getByTestId('lock-banner')).toHaveCount(0);
  });

  test('CRY-10: falsches Passwort zeigt die eigene Meldung und lässt die Ansicht gesperrt', async ({ page }) => {
    await onboardWithPassword(page);
    await lockViaSettings(page);
    await go(page, '/unlock');
    await page.getByLabel('Passwort', { exact: true }).fill('falsches-passwort');
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await expect(page.locator('[data-error-code="wrong-password"]')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(page.getByTestId('locked-view')).toBeVisible();
  });

  test('CRY-16: Recovery mit Backup-Code erzwingt neuen Zugang und zeigt einen neuen Code', async ({ page }) => {
    const oldCode = await onboardWithPassword(page);
    await lockViaSettings(page);
    await go(page, '/unlock');
    await page.getByRole('button', { name: 'Backup-Code verwenden' }).click();
    await page.getByLabel('Backup-Code').fill(oldCode.toLowerCase().replace(/-/g, ' '));
    await page.getByRole('button', { name: 'Weiter' }).click();
    await expect(page.getByText('Lege jetzt einen neuen Zugang an')).toBeVisible();
    await page.getByRole('button', { name: 'Mit Passwort' }).click();
    await page.getByLabel('Passwort (mindestens 8 Zeichen)').fill('neues-passwort-456');
    await page.getByLabel('Passwort wiederholen').fill('neues-passwort-456');
    await page.getByRole('button', { name: 'Konto anlegen' }).click();
    const newCode = (await page.getByTestId('backup-code').textContent({ timeout: 30_000 })) ?? '';
    expect(newCode).not.toBe(oldCode);
    await expect(page.getByRole('button', { name: 'Weiter' })).toBeDisabled();
    await page.getByLabel('Ich habe den Code sicher aufbewahrt').check();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible({ timeout: 30_000 });

    // alter Zugang gilt nicht mehr
    await lockViaSettings(page);
    await go(page, '/unlock');
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await expect(page.locator('[data-error-code="wrong-password"]')).toBeVisible({ timeout: 30_000 });
  });

  test('SYN-10: im Modus „nur auf diesem Gerät" geht keinerlei Request an den Sync-Server', async ({ page }) => {
    const apiRequests: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.startsWith('/api/')) apiRequests.push(r.url());
    });
    await onboardWithPassword(page);
    for (const path of ['/', '/history', '/analysis', '/more', '/more/settings']) await go(page, path);
    await lockViaSettings(page);
    await go(page, '/unlock');
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible({ timeout: 30_000 });
    expect(apiRequests).toEqual([]);
  });
});
