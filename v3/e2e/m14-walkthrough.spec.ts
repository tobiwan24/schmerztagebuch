// M14.22 / ADR-012: stellvertretende Browserprüfung im iPhone-Viewport (390x844): Kernablauf mit allen M14-Funktionen,
// ohne horizontales Überlaufen auf jeder besuchten Seite. Synthetische Daten.
import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { addVirtualAuthenticator, go, onboardWithCloud, onboardWithPassword, openFilter, uniqueUser } from './helpers';

test.use({ viewport: { width: 390, height: 844 } });
test.describe.configure({ timeout: 180_000 });

const MARKER = 'STB-E2E-MARKER Rundgang';

/** Seite darf nicht breiter sein als der Viewport (iPhone). */
async function noOverflow(page: Page, where: string) {
  const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(w.sw, `horizontaler Überlauf auf ${where}`).toBeLessThanOrEqual(w.iw);
}

const card = (page: Page, n: number) => page.getByRole('region', { name: new RegExp(`^Feld ${n}:`) });

test.describe('M14-Rundgang (iPhone-Viewport)', () => {
  test('Kernablauf lokal: Vorlage, Eintrag, Detail, Duplizieren/Löschen, Verlauf-Filter + PDF, Schnelleintrag, Tagebuch, Einstellungen', async ({ page }) => {
    await onboardWithPassword(page);
    await noOverflow(page, 'Start');

    // Vorlagen-Editor: anlegen
    await go(page, '/more/templates');
    await noOverflow(page, 'Vorlagen');
    await page.getByRole('link', { name: 'Neue leere Vorlage' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Rundgang');
    await page.getByRole('button', { name: 'Symbol Pill' }).click();
    for (const type of ['Slider', 'Textfeld', 'Körperkarte']) {
      await page.getByRole('group', { name: 'Feld hinzufügen' }).getByRole('button', { name: type, exact: true }).click();
    }
    await card(page, 1).getByLabel('Bezeichnung', { exact: true }).fill('Stärke');
    await card(page, 1).getByLabel('Rolle').selectOption({ label: 'Ergebnis (z. B. Schmerzstärke)' });
    await card(page, 1).getByLabel('Im Schnelleintrag').check();
    await card(page, 2).getByLabel('Bezeichnung', { exact: true }).fill('Notizen');
    await card(page, 3).getByLabel('Bezeichnung', { exact: true }).fill('Ort');
    await noOverflow(page, 'Vorlagen-Editor');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen' })).toBeVisible();

    // Vorlage ändern
    await page.getByRole('link', { name: 'Rundgang bearbeiten' }).click();
    await card(page, 2).getByLabel('Bezeichnung', { exact: true }).fill('Beschreibung');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen' })).toBeVisible();

    // Eintrag mit Tags, Anhang, Körperkarte
    await go(page, '/entry/new');
    await page.getByRole('button', { name: 'Rundgang' }).click();
    await page.getByLabel(/Stärke/).fill('7');
    await page.getByLabel('Beschreibung').fill(MARKER);
    await page.getByLabel('Tags', { exact: true }).fill('Arbeit');
    await page.getByLabel('Tags', { exact: true }).press('Enter');
    await page.getByLabel('Datei auswählen').setInputFiles({ name: 'befund.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetisch') });
    const canvas = page.getByTestId('bodymap-canvas');
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.3 } });
    await noOverflow(page, 'Eintrag-Formular');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('entry-time')).toBeVisible();
    await expect(page.getByTestId('tag-chip')).toHaveText(['Arbeit']);
    await expect(page.getByTestId('attachment')).toHaveCount(1);
    await expect(page.getByTestId('bodymap-view')).toBeVisible();
    await expect(page.getByTestId('bodymap-view-mark')).toHaveCount(1);
    await noOverflow(page, 'Eintrag-Detail');

    // Duplizieren → Speichern; Löschen der Kopie
    await page.getByRole('link', { name: 'Duplizieren' }).click();
    await expect(page.getByLabel('Beschreibung')).toHaveValue(MARKER);
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('entry-time')).toBeVisible();
    await go(page, '/history');
    await expect(page.getByTestId('entry-row')).toHaveCount(2);
    await noOverflow(page, 'Verlauf');
    await page.getByTestId('entry-row').first().click();
    await page.getByRole('button', { name: 'Löschen' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Endgültig löschen' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-route', '/');
    await go(page, '/history');
    await expect(page.getByTestId('entry-row')).toHaveCount(1);

    // Verlauf-Filter + Export daraus als PDF (Datei mit pdfjs öffnen)
    await openFilter(page);
    await page.getByLabel('Zeitraum', { exact: true }).click();
    await page.getByRole('group', { name: 'Schnellauswahl' }).getByRole('button', { name: '7 Tage' }).click();
    await expect(page.getByTestId('entry-row')).toHaveCount(1);
    await page.getByLabel('Suchen').fill('rundgang');
    await expect(page.getByTestId('entry-row')).toHaveCount(1);
    await page.getByRole('link', { name: 'Exportieren' }).click();
    await expect(page).toHaveURL(/\/more\/export$/);
    await expect(page.getByRole('button', { name: 'Auswahl aus dem Verlauf' })).toHaveAttribute('aria-pressed', 'true');
    await noOverflow(page, 'Export');
    for (const layout of ['Tabelle', 'Karten', 'Dashboard']) {
      await page.getByRole('group', { name: 'PDF-Layout' }).getByRole('button', { name: layout }).click();
      const [d] = await Promise.all([page.waitForEvent('download', { timeout: 45_000 }), page.getByRole('button', { name: 'Herunterladen', exact: true }).click()]);
      const bytes = new Uint8Array(readFileSync((await d.path())!));
      expect(Buffer.from(bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
      const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 }).promise;
      expect(doc.numPages).toBeGreaterThanOrEqual(1);
      const text = (await (await doc.getPage(1)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ');
      expect(text.length, `PDF ${layout} ohne Text`).toBeGreaterThan(20);
    }

    // Schnelleintrag mit Vorlagenwahl
    await go(page, '/quick');
    await noOverflow(page, 'Schnelleintrag');
    await page.getByRole('button', { name: 'Rundgang' }).click();
    await expect(page.getByLabel(/Stärke/)).toBeVisible();
    await page.getByLabel(/Stärke/).fill('4');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
    await go(page, '/history');
    await expect(page.getByTestId('entry-row')).toHaveCount(2);

    // Tagebuch-Einstellungen / Ort-Bereich
    await go(page, '/more/diaries');
    await noOverflow(page, 'Tagebücher');
    await page.getByTestId('diary-card').getByRole('link', { name: 'Einstellungen' }).click();
    await expect(page.getByRole('heading', { name: 'Tagebuch-Einstellungen' })).toBeVisible();
    await expect(page.getByLabel('Ort suchen')).toBeVisible();
    await noOverflow(page, 'Tagebuch-Einstellungen');

    // Einstellungen: Sicherheit, Sperre, Updates, Konfliktprotokoll, Gefahr-Zone
    await go(page, '/more/settings');
    await expect(page.getByTestId('settings-menu')).toBeVisible();
    await noOverflow(page, 'Einstellungen');
    await go(page, '/more/settings/konto');
    await expect(page.getByTestId('factors')).toBeVisible();
    await noOverflow(page, 'Einstellungen (Konto & Sync)');
    await go(page, '/more/settings/sicherheit');
    await expect(page.getByTestId('stay-status')).toBeVisible();
    await noOverflow(page, 'Einstellungen (Sicherheit & Sperre)');
    await go(page, '/more/settings/updates');
    await expect(page.getByTestId('update-settings')).toBeVisible();
    await page.getByRole('button', { name: 'Nach Updates suchen' }).click();
    await go(page, '/more/settings/daten');
    await page.getByRole('link', { name: 'Konfliktprotokoll' }).click();
    await expect(page.getByRole('heading', { name: 'Konfliktprotokoll' })).toBeVisible();
    await noOverflow(page, 'Konfliktprotokoll');
    await go(page, '/more/settings/daten');
    await page.getByTestId('danger-zone').getByRole('button', { name: 'Alle Daten auf diesem Gerät löschen' }).click();
    await expect(page.getByTestId('danger-zone').getByRole('button', { name: 'Endgültig löschen' })).toBeDisabled();
    await noOverflow(page, 'Gefahr-Zone');
  });

  test('Konto-Modus: Geräte, Konto & Sync, Backup-Code (Chromium)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Virtueller Authenticator mit PRF nur über CDP');
    await addVirtualAuthenticator(page);
    const user = uniqueUser('rund');
    await onboardWithCloud(page, user);
    await expect(page.getByText(/Hallo,/)).toBeVisible();
    await go(page, '/more/settings/konto');
    await expect(page.getByTestId('device-row')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Jetzt synchronisieren' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Backup-Code erneuern' })).toBeVisible();
    await noOverflow(page, 'Einstellungen (Konto)');
    await page.getByRole('button', { name: 'Jetzt synchronisieren' }).click();
  });
});
