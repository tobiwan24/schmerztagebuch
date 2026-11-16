import { expect, type Browser, type Page } from '@playwright/test';
import { buildV2Dump } from '../packages/core/src/migration-v2/fixture';

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

/** Onboarding-Schritte „Erstes Tagebuch", „Ort für das Wetter" (übersprungen) und „Vorlage" (Standard: Mein Tagebuch, Mensch, erste Katalogvorlage). */
export async function finishDiarySetup(page: Page, template = 'Allgemeines Schmerz-Tagebuch'): Promise<void> {
  await expect(page.getByLabel('Name')).toHaveValue('Mein Tagebuch', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Später' }).click();
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
  // Der Router rendert asynchron — erst weiter, wenn die neue Route tatsächlich gerendert ist (RouteMarker).
  await expect(page.locator('html')).toHaveAttribute('data-route', path, { timeout: 10_000 });
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

/** Zweitgerät: neuer Browser-Kontext mit eigenem virtuellen Authenticator, Anmeldung per Backup-Code (A-023). */
export async function addDeviceWithBackupCode(browser: Browser, username: string, backupCode: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'de-DE' });
  const page = await ctx.newPage();
  await addVirtualAuthenticator(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: /Mit Konto/ }).click();
  await page.getByRole('button', { name: 'Ich habe schon ein Konto' }).click();
  await page.getByRole('button', { name: 'Mit Backup-Code anmelden' }).click();
  await page.getByLabel('Benutzername').fill(username);
  await page.getByLabel('Backup-Code').fill(backupCode);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Passkey für dieses Gerät anlegen' }).click();
  const newCode = (await page.getByTestId('backup-code').textContent({ timeout: 30_000 })) ?? '';
  expect(newCode).not.toBe(backupCode);
  await page.getByLabel('Ich habe den Code sicher aufbewahrt').check();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible({ timeout: 30_000 });
  return page;
}

/** Legt im Browser eine v2-`PainDiaryDB` an — Stores/Indizes wie Dexie v21 (IndexedDB-Version 210). */
export async function createV2Db(page: Page) {
  const dump = buildV2Dump();
  await page.evaluate(async (d) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('PainDiaryDB', 210);
      req.onupgradeneeded = () => {
        const db = req.result;
        const t = db.createObjectStore('templates', { keyPath: 'id', autoIncrement: true });
        for (const i of ['name', 'order', 'syncId']) t.createIndex(i, i);
        const e = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
        for (const i of ['templateId', 'timestamp', 'encrypted', 'syncId']) e.createIndex(i, i);
        e.createIndex('tags', 'tags', { multiEntry: true });
        db.createObjectStore('settings', { keyPath: 'key' });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['templates', 'entries', 'settings'], 'readwrite');
        for (const t of d.templates) tx.objectStore('templates').put(t);
        for (const e of d.entries) tx.objectStore('entries').put({ ...e, timestamp: new Date(e.timestamp) });
        for (const s of d.settings) tx.objectStore('settings').put(s);
        tx.oncomplete = () => (db.close(), resolve());
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, dump);
}
