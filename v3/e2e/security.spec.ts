import { test, expect, type Page } from '@playwright/test';
import { PASSWORD, addDeviceWithBackupCode, addVirtualAuthenticator, finishDiarySetup, go, lockViaSettings, onboardWithCloud, onboardWithPassword, uniqueUser } from './helpers';

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
  test('CRY-18: Passwort ändern verlangt das aktuelle Passwort; das alte Passwort gilt danach nicht mehr', async ({ page }) => {
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

  test('CRY-18: Backup-Code erneuern zeigt einen neuen Code mit Pflichtbestätigung; der alte Code gilt nicht mehr', async ({ page }) => {
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

  test('CRY-18: Passkey hinzufügen, damit entsperren und wieder entfernen (Passwort bleibt)', async ({ page, browserName }) => {
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

  test('CRY-18: der Passkey als einziger Faktor kann nicht entfernt werden; ein Passwort lässt sich hinzufügen', async ({ page, browserName }) => {
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

test.describe('Zugang verwalten (Konto)', () => {
  test('CRY-18: Backup-Code im Konto erneuern ersetzt Code und Server-Wrap; mit dem alten Code ist keine Anmeldung mehr möglich', async ({ page, browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'Virtueller Authenticator nur über CDP (Chromium)');
    await addVirtualAuthenticator(page);
    const user = uniqueUser('renew');
    const oldCode = await onboardWithCloud(page, user);
    await openSettings(page);
    // Im Konto gibt es nur den Backup-Code zu erneuern (Passwort/Passkey: nur auf diesem Gerät)
    await expect(page.getByRole('button', { name: 'Passwort ändern' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Backup-Code erneuern' }).click();
    const newCode = (await page.getByTestId('backup-code').textContent({ timeout: 30_000 })) ?? '';
    expect(newCode).toMatch(/^[A-Z2-7]{8}(-[A-Z2-7]{8}){3}$/);
    expect(newCode).not.toBe(oldCode);
    await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled();
    await page.getByLabel('Ich habe den Code sicher aufbewahrt').check();
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    await expect(page.getByTestId('factors-done')).toContainText('Neuer Backup-Code gespeichert', { timeout: 30_000 });

    // Zweitgerät: alter Code wird vom Server abgelehnt …
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'de-DE' });
    const other = await ctx.newPage();
    await addVirtualAuthenticator(other);
    await other.goto('/');
    await other.getByRole('button', { name: 'Weiter' }).click();
    await other.getByRole('button', { name: /Mit Konto/ }).click();
    await other.getByRole('button', { name: 'Ich habe schon ein Konto' }).click();
    await other.getByRole('button', { name: 'Mit Backup-Code anmelden' }).click();
    await other.getByLabel('Benutzername').fill(user);
    await other.getByLabel('Backup-Code').fill(oldCode);
    await other.getByRole('button', { name: 'Weiter' }).click();
    await expect(other.locator('[data-error-code="wrong-backup-code"]')).toBeVisible({ timeout: 30_000 });
    await ctx.close();
    // … der neue Code funktioniert
    const added = await addDeviceWithBackupCode(browser, user, newCode);
    await added.context().close();
  });
});
