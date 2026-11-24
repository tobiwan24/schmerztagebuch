import { test, expect, type Download, type Page } from '@playwright/test';
import { addVirtualAuthenticator, go, onboardWithCloud, onboardWithPassword, uniqueUser } from './helpers';

const DAY = 86_400_000;

async function text(d: Download): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of (await d.createReadStream())!) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function addEntry(page: Page, note: string) {
  await go(page, '/entry/new');
  await page.getByLabel(/Schmerzstärke/).fill('6');
  const canvas = page.getByTestId('bodymap-canvas');
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.3 } });
  await page.getByLabel('Notizen').fill(note);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByTestId('entry-time')).toBeVisible();
}

/** Die Inaktivitäts-Sperre (CRY-20) würde beim Vorspulen der Uhr greifen — hier geht es um die Erinnerung, nicht um die Sperre. */
async function idleLockOff(page: Page) {
  await go(page, '/more/settings/sicherheit');
  await page.getByRole('button', { name: 'Aus', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Aus', exact: true })).toHaveAttribute('aria-pressed', 'true');
}

test.describe('Export & Backup', () => {
  // Mehrere Geräte bzw. mehrfaches PBKDF2 (600k): unter Volllast mehr Zeit als die Standard-30 s.
  test.describe.configure({ timeout: 90_000 });

  test('JSON- und CSV-Export laden die Einträge herunter', async ({ page }) => {
    await onboardWithPassword(page);
    await addEntry(page, 'STB-E2E-MARKER Export');
    await go(page, '/more/export');
    // PDF (Standard) mit Körperkarte
    const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('button', { name: 'Herunterladen', exact: true }).click()]);
    expect(pdf.suggestedFilename()).toMatch(/^schmerztagebuch-bericht-.*\.pdf$/);
    const pdfBytes = Buffer.from(await text(pdf), 'utf8');
    expect(pdfBytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Herunterladen', exact: true }).click()]);
    expect(json.suggestedFilename()).toMatch(/\.stb\.json$/);
    const doc = JSON.parse(await text(json)) as { format: string; diaries: { entries: unknown[] }[] };
    expect(doc.format).toBe('stb-export');
    expect(doc.diaries[0]!.entries).toHaveLength(1);

    await page.getByRole('button', { name: 'CSV breit' }).click();
    await page.getByRole('button', { name: 'Excel (DE)' }).click();
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Herunterladen', exact: true }).click()]);
    expect(csv.suggestedFilename()).toMatch(/csv-wide-excel-de-.*\.csv$/);
    const body = await text(csv);
    expect(body.startsWith('﻿')).toBe(true);
    expect(body).toContain('STB-E2E-MARKER Export');
    expect(body.split('\r\n')[0]).toContain(';');
  });

  test('Kartenlayout: PDF mit Layout Karten wird erzeugt', async ({ page }) => {
    await onboardWithPassword(page);
    await addEntry(page, 'STB-E2E-MARKER Karten');
    await go(page, '/more/export');
    await page.getByRole('group', { name: 'PDF-Layout' }).getByRole('button', { name: 'Karten' }).click();
    const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('button', { name: 'Herunterladen', exact: true }).click()]);
    expect(Buffer.from(await text(pdf), 'utf8').subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  test('Dashboard-Layout: Auswahl der Multiselects, PDF wird erzeugt', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/more/templates');
    await page.getByRole('button', { name: /Kopfschmerz-Tagebuch/ }).click();
    await expect(page.getByTestId('template-row')).toHaveCount(2);
    await addEntry(page, 'STB-E2E-MARKER Dashboard');
    await go(page, '/more/export');
    await page.getByRole('group', { name: 'PDF-Layout' }).getByRole('button', { name: 'Dashboard' }).click();
    const auswahl = page.getByRole('group', { name: 'Häufigkeiten im Dashboard' });
    await expect(auswahl.getByRole('checkbox')).toHaveCount(3);
    await auswahl.getByLabel(/^Auslöser/).uncheck();
    const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('button', { name: 'Herunterladen', exact: true }).click()]);
    expect(Buffer.from(await text(pdf), 'utf8').subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  test('Export eines Monats über den Range-Calendar (Schnellauswahl Dieser/Voriger Monat): nur Einträge des Monats; keine gespeicherten Filter (A-147)', async ({ page }) => {
    await onboardWithPassword(page);
    await addEntry(page, 'STB-E2E-MARKER Monat');
    await go(page, '/more/export');
    await page.getByRole('button', { name: 'CSV lang' }).click();
    await expect(page.getByRole('group', { name: 'Zeitraum' }).getByRole('button')).toHaveText(['Gesamt', 'Zeitraum']);
    await page.getByRole('group', { name: 'Zeitraum' }).getByRole('button', { name: 'Zeitraum', exact: true }).click();
    const csvFor = async (preset: string) => {
      await page.locator('#export-range').click();
      await page.getByRole('group', { name: 'Schnellauswahl' }).getByRole('button', { name: preset }).click();
      await expect(page.locator('[data-slot="popover-content"]')).toHaveCount(0);
      const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Herunterladen', exact: true }).click()]);
      return text(d);
    };
    expect(await csvFor('Dieser Monat')).toContain('STB-E2E-MARKER Monat');
    expect(await csvFor('Voriger Monat')).not.toContain('STB-E2E-MARKER Monat');
  });

  test('Backup mit Backup-Code erstellen und auf einem neuen Gerät wiederherstellen; falscher Code wird gemeldet', async ({ page, browser }) => {
    const code = await onboardWithPassword(page);
    await addEntry(page, 'STB-E2E-MARKER aus dem Backup');
    await go(page, '/more/export');
    await page.getByLabel('Backup-Code').fill('AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA');
    await page.getByRole('button', { name: 'Backup herunterladen' }).click();
    await expect(page.getByRole('alert')).toHaveText('Der Backup-Code stimmt nicht.');
    await page.getByLabel('Backup-Code').fill(code);
    const [backup] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('button', { name: 'Backup herunterladen' }).click()]);
    expect(backup.suggestedFilename()).toMatch(/\.stbbackup$/);
    const file = await text(backup);
    expect(file).not.toContain('STB-E2E-MARKER');
    await expect(page.getByTestId('last-backup')).toContainText('Letztes Backup:');

    // neues Gerät
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'de-DE' });
    const b = await ctx.newPage();
    await onboardWithPassword(b);
    await go(b, '/more/export');
    await b.getByLabel('Datei auswählen').setInputFiles({ name: 'sicherung.stbbackup', mimeType: 'application/octet-stream', buffer: Buffer.from(file) });
    const importCode = b.locator('#import-secret');
    await importCode.fill('AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA');
    await b.getByRole('button', { name: 'Backup öffnen' }).click();
    await expect(b.getByRole('alert')).toContainText('Backup-Code stimmt nicht');
    await importCode.fill(code);
    await b.getByRole('button', { name: 'Backup öffnen' }).click();
    await expect(b.getByTestId('import-preview')).toContainText('1 Einträge', { timeout: 30_000 });
    await b.getByRole('button', { name: 'Importieren', exact: true }).click();
    await expect(b.getByText('Import abgeschlossen.')).toBeVisible();
    await go(b, '/history');
    await b.getByTestId('entry-row').first().click();
    await expect(b.getByTestId('entry-field').filter({ hasText: 'Notizen' })).toContainText('STB-E2E-MARKER aus dem Backup');
    await ctx.close();
  });

  test('EXP-12: Backup-Erinnerung erscheint in local-only nach Ablauf der Frist und nicht in cloud-primary', async ({ page, browser, browserName }) => {
    await page.clock.install({ time: new Date() });
    const code = await onboardWithPassword(page);
    await expect(page.getByTestId('backup-reminder')).toHaveCount(0);
    await idleLockOff(page);
    await page.clock.fastForward(8 * DAY);
    await go(page, '/history');
    await go(page, '/');
    await expect(page.getByTestId('backup-reminder')).toContainText('Zeit für ein Backup');
    // nach einem Backup verschwindet sie
    await page.getByTestId('backup-reminder').getByRole('link', { name: 'Backup erstellen' }).click();
    await page.getByLabel('Backup-Code').fill(code);
    await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('button', { name: 'Backup herunterladen' }).click()]);
    await go(page, '/');
    await expect(page.getByTestId('backup-reminder')).toHaveCount(0);

    // Konto-Modus: auch nach Ablauf keine Erinnerung
    if (browserName === 'chromium') {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'de-DE' });
      const c = await ctx.newPage();
      await c.clock.install({ time: new Date() });
      await addVirtualAuthenticator(c);
      await onboardWithCloud(c, uniqueUser('exp12'));
      await idleLockOff(c);
      await c.clock.fastForward(30 * DAY);
      await go(c, '/history');
      await go(c, '/');
      await expect(c.getByRole('heading', { name: 'Start' })).toBeVisible();
      await expect(c.getByTestId('backup-reminder')).toHaveCount(0);
      await ctx.close();
    }
  });
});
