import { expect, type Browser, type BrowserContext, type CDPSession, type Page } from '@playwright/test';
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

/** Virtueller Authenticator mit PRF (nur Chromium, CDP). Liefert CDP-Sitzung und Authenticator-ID (z. B. zum Leeren). */
export async function addVirtualAuthenticator(page: Page): Promise<{ cdp: CDPSession; authenticatorId: string }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
      isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true,
    },
  });
  return { cdp, authenticatorId };
}

/** Sperren über die Einstellungen. */
export async function lockViaSettings(page: Page): Promise<void> {
  await go(page, '/more/settings/sicherheit');
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

// ---------------------------------------------------------------------------------------------------------------------------
// Geteilte Tagebücher: mehrere Konten (Chromium, virtueller Authenticator)

/** Löst einen Sync-Lauf aus (Rückkehr in den Vordergrund). */
export const foreground = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

/** Mitglieder-Seite des (ersten) eigenen Tagebuchs öffnen. */
export async function openMembers(page: Page) {
  await go(page, '/more/diaries');
  await page.getByTestId('diary-card').getByRole('link', { name: 'Mitglieder & Einladungen' }).click();
  await page.getByTestId('members-card').waitFor();
}

/** Lädt eine neue Person ein (Rolle „Darf eintragen“ bzw. `role`) und lässt sie annehmen; wartet, bis der Owner sie bestätigt hat. */
export async function inviteMember(owner: Page, browser: Browser, name: string, expectedMembers: number, role: 'Darf eintragen' | 'Darf lesen' = 'Darf eintragen'): Promise<{ ctx: BrowserContext; page: Page }> {
  await openMembers(owner);
  await owner.getByRole('button', { name: role }).click();
  await owner.getByRole('button', { name: 'Einladungslink erzeugen' }).click();
  const hash = new URL((await owner.getByTestId('invite-link').textContent())!).hash;
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'de-DE' });
  const page = await ctx.newPage();
  await addVirtualAuthenticator(page);
  await onboardWithCloud(page, name);
  await go(page, `/invite${hash}`);
  await page.getByRole('button', { name: 'Einladung annehmen' }).click();
  await expect(page.getByTestId('invite-accepted')).toBeVisible();
  await expect
    .poll(
      async () => {
        await foreground(owner);
        await openMembers(owner);
        return owner.getByTestId('member').count();
      },
      { timeout: 45_000, intervals: [1000, 2000] },
    )
    .toBe(expectedMembers);
  return { ctx, page };
}

/** Eintrag mit Schmerzstärke und Notiz anlegen (Allgemeines Schmerz-Tagebuch). */
export async function addEntry(page: Page, pain: string, note: string) {
  await go(page, '/entry/new');
  await page.getByLabel(/Schmerzstärke/).fill(pain);
  await page.getByLabel('Notizen').fill(note);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByTestId('entry-time')).toBeVisible();
}

/** Verlauf: Filter-Panel öffnen (RDM-028 P4), falls noch zu. */
export async function openFilter(page: Page) {
  const btn = page.locator('[aria-controls="history-filter-panel"]');
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click();
  await expect(page.locator('#history-filter-panel')).toBeVisible();
}

/** Verlauf: Sortieren-Panel öffnen (RDM-028 P4), falls noch zu. */
export async function openSort(page: Page) {
  const btn = page.locator('[aria-controls="history-sort-panel"]');
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click();
  await expect(page.locator('#history-sort-panel')).toBeVisible();
}

/** Öffnet einen Tab der Auswertung; die Tab-Leiste ist ein Carousel, ein Tab kann außerhalb des Bildes liegen — dann Punkte antippen, bis er ganz sichtbar ist, und klicken. */
export async function openAnalysisView(page: Page, name: string): Promise<void> {
  const region = page.getByRole('region', { name: 'Ansichten' });
  const group = page.getByRole('group', { name: 'Ansicht' });
  const tab = group.getByRole('button', { name, exact: true });
  const fits = async () => {
    const b = await tab.boundingBox();
    const v = await region.locator('[data-slot=carousel-content]').boundingBox();
    return !!b && !!v && b.x >= v.x - 1 && b.x + b.width <= v.x + v.width + 1;
  };
  if (!(await fits())) {
    const dots = region.locator('[data-slot=carousel-dots] button');
    const n = await dots.count();
    for (let i = 0; i < n && !(await fits()); i++) {
      await dots.nth(i).click();
      await expect.poll(fits, { timeout: 3000 }).toBe(true).catch(() => undefined);
    }
  }
  await tab.click();
  await expect(tab).toHaveAttribute('aria-pressed', 'true');
}

// ---- shadcn-Datepicker (A-146): Popover + Calendar statt nativer Datumsfelder ----
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const popover = (page: Page) => page.locator('[data-slot="popover-content"]');

/** Im offenen Calendar zum Monat von `ymd` blättern und den Tag anklicken. */
export async function chooseDay(page: Page, ymd: string): Promise<void> {
  const [y, m, d] = ymd.split('-').map(Number);
  const pop = popover(page);
  await expect(pop).toBeVisible();
  for (let i = 0; i < 120; i++) {
    const caption = (await pop.locator('.rdp-caption_label').first().textContent()) ?? '';
    const [name, year] = caption.trim().split(/\s+/);
    const shown = Number(year) * 12 + MONTHS.indexOf(name);
    const wanted = y * 12 + (m - 1);
    if (shown === wanted) break;
    await pop.getByRole('button', { name: shown < wanted ? 'Zum nächsten Monat' : 'Zum vorherigen Monat' }).click();
  }
  // Tageslabel „Montag, 2. März 2026“; „12.“ darf nicht auf „2.“ passen.
  await pop.getByRole('button', { name: new RegExp(`(^|\\s)${d}\\. ${MONTHS[m - 1]} ${y}`) }).first().click();
}

/** Datum (und optional Uhrzeit) in einem Datepicker setzen; `label` = Beschriftung des Datums-Auslösers. */
export async function pickDate(page: Page, label: string, ymd: string, hm?: string): Promise<void> {
  await page.getByLabel(label, { exact: true }).click();
  await chooseDay(page, ymd);
  await expect(popover(page)).toHaveCount(0);
  if (hm) await page.getByLabel(`${label}: Uhrzeit`, { exact: true }).fill(hm);
}

/** `YYYY-MM-DDTHH:mm` wie früher bei `datetime-local` in einen DateTimePicker eintragen. */
export async function pickDateTime(page: Page, label: string, value: string): Promise<void> {
  await pickDate(page, label, value.slice(0, 10), value.slice(11, 16));
}

/** Zeitraum mit Uhrzeiten (`YYYY-MM-DDTHH:mm`) im DateTimeRangePicker: zwei Tage, beide Uhrzeiten, Popup per Esc schließen. */
export async function pickDateTimeRange(page: Page, label: string, start: string, end: string): Promise<void> {
  await page.getByLabel(label, { exact: true }).click();
  await chooseDay(page, start.slice(0, 10));
  await chooseDay(page, end.slice(0, 10));
  await popover(page).getByLabel('Beginn: Uhrzeit', { exact: true }).fill(start.slice(11, 16));
  await popover(page).getByLabel('Ende: Uhrzeit', { exact: true }).fill(end.slice(11, 16));
  await page.keyboard.press('Escape');
  await expect(popover(page)).toHaveCount(0);
}

/** Zeitraum im Range-Datepicker wählen (zwei Klicks im selben Popup). */
export async function pickRange(page: Page, label: string, from: string, to: string): Promise<void> {
  await page.getByLabel(label, { exact: true }).click();
  await chooseDay(page, from);
  await chooseDay(page, to);
  await expect(popover(page)).toHaveCount(0);
}
