import { test, expect, type Page } from '@playwright/test';
import { PASSWORD, addVirtualAuthenticator, finishDiarySetup, go, lockViaSettings, onboardWithPassword } from './helpers';

// Mehrfaches PBKDF2 (600k) je Schritt: unter Volllast mehr Zeit.
test.describe.configure({ timeout: 120_000 });

async function openSettings(page: Page) {
  await go(page, '/more/settings');
  await expect(page.getByTestId('factors')).toBeVisible();
}

async function verifyCurrent(page: Page, password = PASSWORD) {
  await page.getByLabel('Aktuelles Passwort').fill(password);
  await page.getByRole('button', { name: 'Bestätigen' }).click();
}

async function unlockWithPassword(page: Page, password: string) {
  await go(page, '/unlock');
  await page.getByLabel('Passwort', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
}

test.describe('Zugang verwalten (nur auf diesem Gerät)', () => {
  test('M14.33a: Passwort ändern verlangt das aktuelle Passwort; das alte Passwort gilt danach nicht mehr', async ({ page }) => {
    await onboardWithPassword(page);
    await openSettings(page);
    await page.getByRole('button', { name: 'Passwort ändern' }).click();
    await verifyCurrent(page, 'falsches-passwort');
    await expect(page.locator('[data-error-code="wrong-password"]')).toBeVisible({ timeout: 30_000 });
    await verifyCurrent(page);
    await page.getByLabel('Neues Passwort', { exact: true }).fill('neues-passwort-456');
    await page.getByLabel('Neues Passwort wiederholen').fill('anderes-passwort-789');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('alert')).toContainText('stimmen nicht überein');
    await page.getByLabel('Neues Passwort wiederholen').fill('neues-passwort-456');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('factors-done')).toContainText('Passwort gespeichert', { timeout: 30_000 });

    await lockViaSettings(page);
    await unlockWithPassword(page, PASSWORD);
    await expect(page.locator('[data-error-code="wrong-password"]')).toBeVisible({ timeout: 30_000 });
    await page.getByLabel('Passwort', { exact: true }).fill('neues-passwort-456');
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible({ timeout: 30_000 });
  });

  test('M14.33a: Backup-Code erneuern zeigt einen neuen Code mit Pflichtbestätigung; der alte Code gilt nicht mehr', async ({ page }) => {
    const oldCode = await onboardWithPassword(page);
    await openSettings(page);
    await page.getByRole('button', { name: 'Backup-Code erneuern' }).click();
    await verifyCurrent(page);
    const newCode = (await page.getByTestId('backup-code').textContent({ timeout: 30_000 })) ?? '';
    expect(newCode).toMatch(/^[A-Z2-7]{8}(-[A-Z2-7]{8}){3}$/);
    expect(newCode).not.toBe(oldCode);
    await expect(page.getByRole('button', { name: 'Weiter' })).toBeDisabled();
    await page.getByLabel('Ich habe den Code sicher aufbewahrt').check();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await expect(page.getByTestId('factors-done')).toContainText('Neuer Backup-Code gespeichert', { timeout: 30_000 });

    await lockViaSettings(page);
    await go(page, '/unlock');
    await page.getByRole('button', { name: 'Backup-Code verwenden' }).click();
    // Der Code wird erst beim Anlegen des neuen Zugangs geprüft (Recovery, CRY-16)
    for (const [code, ok] of [[oldCode, false], [newCode, true]] as const) {
      await page.getByLabel('Backup-Code').fill(code);
      await page.getByRole('button', { name: 'Weiter' }).click();
      await expect(page.getByText('Lege jetzt einen neuen Zugang an')).toBeVisible();
      await page.getByRole('button', { name: 'Mit Passwort' }).click();
      await page.getByLabel('Passwort (mindestens 8 Zeichen)').fill('neues-passwort-456');
      await page.getByLabel('Passwort wiederholen').fill('neues-passwort-456');
      await page.getByRole('button', { name: 'Konto anlegen' }).click();
      if (ok) await expect(page.getByTestId('backup-code')).toBeVisible({ timeout: 30_000 });
      else await expect(page.locator('[data-error-code="wrong-backup-code"]')).toBeVisible({ timeout: 30_000 });
    }
  });

  test('M14.33a: Passkey hinzufügen, damit entsperren und wieder entfernen (Passwort bleibt)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Virtueller Authenticator nur über CDP (Chromium)');
    await addVirtualAuthenticator(page);
    await onboardWithPassword(page);
    await openSettings(page);
    await page.getByRole('button', { name: 'Passkey hinzufügen' }).click();
    await verifyCurrent(page);
    await page.getByRole('button', { name: 'Passkey jetzt anlegen' }).click();
    await expect(page.getByTestId('factors-done')).toContainText('Passkey hinzugefügt', { timeout: 30_000 });

    await lockViaSettings(page);
    await go(page, '/unlock');
    await page.getByRole('button', { name: 'Mit Passkey entsperren' }).click();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible({ timeout: 30_000 });

    await openSettings(page);
    await page.getByRole('button', { name: 'Passkey entfernen' }).click();
    await verifyCurrent(page);
    await page.getByRole('button', { name: 'Passkey jetzt entfernen' }).click();
    await expect(page.getByTestId('factors-done')).toContainText('Passkey entfernt', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Passkey hinzufügen' })).toBeVisible();
  });

  test('M14.33a: der Passkey als einziger Faktor kann nicht entfernt werden; ein Passwort lässt sich hinzufügen', async ({ page, browserName }) => {
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

    await openSettings(page);
    await expect(page.getByRole('button', { name: 'Passkey entfernen' })).toBeDisabled();
    await page.getByRole('button', { name: 'Passwort festlegen' }).click();
    await page.getByLabel('Neues Passwort', { exact: true }).fill('neues-passwort-456');
    await page.getByLabel('Neues Passwort wiederholen').fill('neues-passwort-456');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('factors-done')).toContainText('Passwort gespeichert', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Passkey entfernen' })).toBeEnabled();
  });
});
