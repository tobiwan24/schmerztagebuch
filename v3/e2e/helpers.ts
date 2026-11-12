import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'sicheres-passwort-123';

/** Onboarding „nur auf diesem Gerät" mit Passwort bis zur Startseite. Liefert den angezeigten Backup-Code. */
export async function onboardWithPassword(page: Page, password = PASSWORD): Promise<string> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: /Nur auf diesem Gerät/ }).click();
  await page.getByRole('button', { name: 'Mit Passwort' }).click();
  await page.getByLabel('Passwort (mindestens 8 Zeichen)').fill(password);
  await page.getByLabel('Passwort wiederholen').fill(password);
  await page.getByRole('button', { name: 'Konto anlegen' }).click();
  const code = (await page.getByTestId('backup-code').textContent({ timeout: 30_000 })) ?? '';
  await page.getByLabel('Ich habe den Code sicher aufbewahrt').check();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible({ timeout: 30_000 });
  return code;
}

/**
 * Navigation innerhalb der App ohne Neuladen (wie ein Link-Klick). `page.goto` lädt neu — dann ist die App korrekt wieder
 * gesperrt, weil Schlüssel nur im Speicher liegen (Spec 03).
 */
export async function go(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, '\\?')}$`));
}

/** Virtueller Authenticator mit PRF (nur Chromium, CDP). */
export async function addVirtualAuthenticator(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
      isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true,
    },
  });
}

/** Sperren über die Einstellungen. */
export async function lockViaSettings(page: Page): Promise<void> {
  await go(page, '/more/settings');
  await page.getByRole('button', { name: 'Jetzt sperren' }).click();
  await expect(page.getByTestId('lock-banner')).toBeVisible();
}
