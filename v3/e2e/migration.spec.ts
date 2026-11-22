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

  test('MIG-14: „v2-Daten entfernen" ist erst nach erfolgreicher Prüfung möglich und verlangt Bestätigung', async ({ page }) => {
    await onboardWithPassword(page);
    await createV2Db(page);
    await go(page, '/more/settings');
    const card = page.getByTestId('v2-data-card');
    await expect(card).toContainText('Noch nicht übernommen.');
    await expect(card.getByRole('button', { name: 'v2-Daten von diesem Gerät entfernen' })).toBeDisabled();

    await card.getByRole('link', { name: 'v2-Daten übernehmen' }).click();
    await page.getByRole('button', { name: 'Trockenlauf starten' }).click();
    await page.getByRole('button', { name: 'Jetzt übernehmen' }).click();
    await expect(page.getByTestId('migration-done')).toContainText('Übernahme erfolgreich geprüft.');

    await go(page, '/more/settings');
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
});
