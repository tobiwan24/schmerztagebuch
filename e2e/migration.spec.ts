import { test, expect, type Download, type Page } from '@playwright/test';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createV2Db, go, onboardWithPassword } from './helpers';

const v2DbExists = (page: Page) => page.evaluate(async () => (await indexedDB.databases()).some((d) => d.name === 'PainDiaryDB'));

async function pdfText(d: Download): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of (await d.createReadStream())!) chunks.push(c as Buffer);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(Buffer.concat(chunks)), isEvalSupported: false, verbosity: 0 }).promise;
  const texts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) texts.push((await (await doc.getPage(p)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' '));
  return texts.join('\n');
}

test.describe('Migration v2 → v3', () => {
  test.describe.configure({ timeout: 90_000 });

  test('MIG-15: v2-Fixture-DB im Browser → Assistent → Einträge im Verlauf, PDF-Export enthält migrierte Einträge', async ({ page }) => {
    await onboardWithPassword(page);
    await createV2Db(page);
    await go(page, '/history');
    await go(page, '/');
    await page.getByTestId('v2-banner').getByRole('link', { name: 'Übernehmen' }).click();
    await expect(page.getByTestId('v2-found')).toContainText('2 Vorlagen · 9 Einträge');

    await page.getByRole('button', { name: 'Trockenlauf starten' }).click();
    const plan = page.getByTestId('migration-plan');
    await expect(plan).toContainText('4 Vorlagen · 8 Einträge · 3 Anhänge');
    await expect(page.getByTestId('report-undecryptable')).toContainText('2026-01-15');
    await plan.getByRole('button', { name: 'Jetzt übernehmen' }).click();
    await expect(page.getByTestId('migration-done')).toContainText('Übernahme erfolgreich geprüft.');
    const [report] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Bericht herunterladen' }).click()]);
    expect(report.suggestedFilename()).toMatch(/^schmerztagebuch-migrationsbericht-.*\.txt$/);

    await page.getByRole('link', { name: 'Zum Verlauf' }).click();
    await expect(page.getByTestId('entry-row')).toHaveCount(8);
    await page.getByLabel('Suchen').fill('STB-V2-MARKER');
    await expect(page.getByTestId('entry-row')).toHaveCount(1);
    await page.getByTestId('entry-row').first().click();
    await expect(page.getByTestId('entry-field').filter({ hasText: 'Notizen' })).toContainText('STB-V2-MARKER Kopf drückt');
    await expect(page.getByTestId('entry-time')).toContainText('02.03.2026');

    // Banner verschwindet nach erfolgreicher Übernahme
    await go(page, '/');
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
    await expect(page.getByTestId('v2-banner')).toHaveCount(0);

    // PDF-Bericht enthält migrierte Einträge
    await go(page, '/more/export');
    const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('button', { name: 'Herunterladen', exact: true }).click()]);
    const text = await pdfText(pdf);
    expect(text).toContain('Alt-Vorlage');
    expect(text).toContain('Zuhause');
  });

  test('RDM-028 P3: migrierte v2-Vorlage zeigt zugeordnetes Symbol und Farbe, Editor markiert die Wahl', async ({ page }) => {
    await onboardWithPassword(page);
    await createV2Db(page);
    await go(page, '/history');
    await go(page, '/');
    await page.getByTestId('v2-banner').getByRole('link', { name: 'Übernehmen' }).click();
    await page.getByRole('button', { name: 'Trockenlauf starten' }).click();
    await page.getByTestId('migration-plan').getByRole('button', { name: 'Jetzt übernehmen' }).click();
    await expect(page.getByTestId('migration-done')).toBeVisible();
    await go(page, '/more/templates');
    const row = (name: string) => page.getByTestId('template-row').filter({ has: page.getByRole('link', { name: `${name} bearbeiten`, exact: true }) });
    // v2: Flame/#FF3B30 und Book/#007AFF
    await expect(row('Schmerz').getByTestId('template-icon')).toHaveAttribute('data-icon', 'Flame');
    await expect(row('Schmerz').getByTestId('template-icon')).toHaveAttribute('data-color', 'red');
    await expect(row('Alt-Vorlage').getByTestId('template-icon')).toHaveAttribute('data-icon', 'BookOpen');
    await expect(row('Alt-Vorlage').getByTestId('template-icon')).toHaveAttribute('data-color', 'blue');
    await row('Alt-Vorlage').getByRole('link', { name: 'Alt-Vorlage bearbeiten' }).click();
    await expect(page.getByRole('group', { name: 'Farbe', exact: true }).getByRole('button', { name: 'Blau' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Symbol BookOpen' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('RDM-028 P7: v2-Daten-Card nur mit lokaler v2-Datenbank', async ({ page }) => {
    await onboardWithPassword(page);
    // Ohne v2-Datenbank und ohne Migrationsstand: keine Card
    await go(page, '/more/settings/daten');
    await expect(page.getByTestId('persist-card')).toBeVisible();
    await expect(page.getByTestId('v2-data-card')).toHaveCount(0);

    // Mit v2-Datenbank: Card da; nach Übernahme und Löschen der v2-Datenbank (ohne „entfernt“-Vermerk) wieder weg
    await createV2Db(page);
    await go(page, '/history');
    await go(page, '/more/settings/daten');
    await expect(page.getByTestId('v2-data-card')).toBeVisible();
    await page.getByTestId('v2-data-card').getByRole('link', { name: 'v2-Daten übernehmen' }).click();
    await page.getByRole('button', { name: 'Trockenlauf starten' }).click();
    await page.getByRole('button', { name: 'Jetzt übernehmen' }).click();
    await expect(page.getByTestId('migration-done')).toBeVisible();
    await page.evaluate(() => new Promise<void>((resolve) => { const r = indexedDB.deleteDatabase('PainDiaryDB'); r.onsuccess = r.onerror = r.onblocked = () => resolve(); }));
    expect(await v2DbExists(page)).toBe(false);
    await go(page, '/more/settings/daten');
    await expect(page.getByTestId('persist-card')).toBeVisible();
    await expect(page.getByTestId('v2-data-card')).toHaveCount(0);
  });

  test('MIG-14: „v2-Daten entfernen" ist erst nach erfolgreicher Prüfung möglich und verlangt Bestätigung', async ({ page }) => {
    await onboardWithPassword(page);
    await createV2Db(page);
    await go(page, '/more/settings/daten');
    const card = page.getByTestId('v2-data-card');
    await expect(card).toContainText('Noch nicht übernommen.');
    await expect(card.getByRole('button', { name: 'v2-Daten von diesem Gerät entfernen' })).toBeDisabled();

    await card.getByRole('link', { name: 'v2-Daten übernehmen' }).click();
    await page.getByRole('button', { name: 'Trockenlauf starten' }).click();
    await page.getByRole('button', { name: 'Jetzt übernehmen' }).click();
    await expect(page.getByTestId('migration-done')).toContainText('Übernahme erfolgreich geprüft.');

    await go(page, '/more/settings/daten');
    await expect(card).toContainText('Übernommen und geprüft am');
    const remove = card.getByRole('button', { name: 'v2-Daten von diesem Gerät entfernen' });
    await expect(remove).toBeEnabled();
    // Abbrechen lässt alles, wie es ist
    await remove.click();
    await expect(page.getByRole('heading', { name: 'v2-Daten entfernen?' })).toBeVisible();
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    expect(await v2DbExists(page)).toBe(true);
    // Bestätigen entfernt die v2-Datenbank, die migrierten Einträge bleiben
    await remove.click();
    await page.getByRole('button', { name: 'Endgültig entfernen' }).click();
    await expect(page.getByTestId('v2-data-status')).toHaveText('v2-Daten wurden von diesem Gerät entfernt.');
    expect(await v2DbExists(page)).toBe(false);
    await go(page, '/history');
    await expect(page.getByTestId('entry-row')).toHaveCount(8);
  });

  test('Export → Importieren: „Von v2 übernehmen (Migration)“ ist immer sichtbar und führt zu /migrate', async ({ page }) => {
    await onboardWithPassword(page);
    expect(await v2DbExists(page)).toBe(false);
    await go(page, '/more/export');
    await page.getByRole('link', { name: 'Von v2 übernehmen (Migration)' }).click();
    await expect(page.getByRole('heading', { name: 'v2-Daten übernehmen' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-route', '/migrate');
  });

  test('Export → Importieren: eine v2-Backup-Datei zeigt den Migrations-Hinweis mit Link statt „keine Export-Datei“', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/more/export');
    const v2 = JSON.stringify({ version: 21, exportedAt: '2026-01-01T00:00:00.000Z', templates: [], entries: [], settings: [] });
    await page.getByLabel('Datei auswählen').setInputFiles({ name: 'v2-backup.json', mimeType: 'application/json', buffer: Buffer.from(v2) });
    const hint = page.getByTestId('import-v2-hint');
    await expect(hint).toContainText('Das ist ein v2-Backup — bitte die Migration verwenden.');
    await expect(page.getByText('Das ist keine Export-Datei dieser App.')).toHaveCount(0);
    await hint.getByRole('link', { name: 'Von v2 übernehmen (Migration)' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-route', '/migrate');
  });
});
