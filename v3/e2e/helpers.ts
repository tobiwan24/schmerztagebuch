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
  await finishDiarySetup(page);
  return code;
}

/** Onboarding-Schritte „Erstes Tagebuch" und „Vorlage" (Standard: Mein Tagebuch, Mensch, erste Katalogvorlage). */
export async function finishDiarySetup(page: Page, template = 'Allgemeines Schmerz-Tagebuch'): Promise<void> {
  await expect(page.getByLabel('Name')).toHaveValue('Mein Tagebuch', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: new RegExp(template) }).click();
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible({ timeout: 30_000 });
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

/** Wartet, bis der Service Worker die Seite kontrolliert. */
export async function swReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

export async function activeVersion(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (e) => resolve((e.data as { version: string }).version);
        navigator.serviceWorker.controller?.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
      }),
  );
}

/** Onboarding „Mit Konto" bis zur Startseite (virtueller Authenticator muss aktiv sein). Liefert den Backup-Code. */
export async function onboardWithCloud(page: Page, username: string): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: /Mit Konto/ }).click();
  await page.getByLabel('Benutzername').fill(username);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Passkey anlegen' }).click();
  const code = (await page.getByTestId('backup-code').textContent({ timeout: 30_000 })) ?? '';
  await page.getByLabel('Ich habe den Code sicher aufbewahrt').check();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await finishDiarySetup(page);
  return code;
}

/** Eindeutiger Benutzername pro Test (eine Server-DB für den ganzen Lauf). */
export const uniqueUser = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

