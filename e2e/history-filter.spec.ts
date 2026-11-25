import { test, expect, type Download, type Page } from '@playwright/test';
import { PASSWORD, go, onboardWithPassword, openFilter, openSort, pickDateTime, pickRange } from './helpers';

async function addEntry(page: Page, pain: string, note?: string) {
  await go(page, '/entry/new');
  await page.getByLabel(/Schmerzstärke/).fill(pain);
  if (note) await page.getByLabel('Notizen').fill(note);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByTestId('entry-time')).toBeVisible();
}

async function textOf(d: Download): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of (await d.createReadStream())!) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

const rows = (page: Page) => page.getByTestId('entry-row');

test.describe('Verlauf: Suche und Filter', () => {
  // Mehrere Geräte bzw. mehrfaches PBKDF2 (600k): unter Volllast mehr Zeit als die Standard-30 s.
  test.describe.configure({ timeout: 90_000 });

  test('umlauttolerante Suche und Filter-Chips grenzen den Verlauf ein', async ({ page }) => {
    await onboardWithPassword(page);
    await addEntry(page, '8', 'Übelkeit am Morgen');
    await addEntry(page, '2', 'ruhiger Tag');
    await addEntry(page, '7');
    await go(page, '/history');
    await expect(rows(page)).toHaveCount(3);

    await page.getByLabel('Suchen').fill('uebelkeit');
    await expect(rows(page)).toHaveCount(1);
    await page.getByLabel('Suchen').fill('xyzzy');
    await openFilter(page);
    await expect(page.getByTestId('empty-state')).toContainText('Keine Einträge für diesen Filter');
    await page.getByRole('button', { name: 'Zurücksetzen' }).click();
    await expect(rows(page)).toHaveCount(3);

    await openFilter(page);
    await page.getByRole('button', { name: 'Schmerz ≥ 6' }).click();
    await expect(rows(page)).toHaveCount(2);
    // Schnellauswahl liegt im Zeitraum-Popup (RDM-030)
    await page.getByLabel('Zeitraum', { exact: true }).click();
    await page.getByRole('group', { name: 'Schnellauswahl' }).getByRole('button', { name: '7 Tage' }).click();
    await expect(page.locator('[data-slot="popover-content"]')).toHaveCount(0);
    await expect(page.getByLabel('Zeitraum', { exact: true })).toHaveText('7 Tage');
    await expect(rows(page)).toHaveCount(2);
  });

  test('EXP-18: Exportieren im Verlauf übernimmt die angewendeten Filter; Mehr → Export bleibt', async ({ page }) => {
    await onboardWithPassword(page);
    await addEntry(page, '8', 'Übelkeit am Morgen');
    await addEntry(page, '2', 'ruhiger Tag');
    await addEntry(page, '7');
    await go(page, '/history');
    await expect(rows(page)).toHaveCount(3);
    await openFilter(page);
    await page.getByRole('button', { name: 'Schmerz ≥ 6' }).click();
    await expect(rows(page)).toHaveCount(2);

    await page.getByRole('link', { name: 'Exportieren' }).click();
    await expect(page).toHaveURL(/\/more\/export$/);
    await expect(page.getByRole('button', { name: 'Auswahl aus dem Verlauf' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Herunterladen', exact: true }).click()]);
    const doc = JSON.parse(await textOf(json)) as { diaries: { entries: unknown[] }[] };
    expect(doc.diaries[0]!.entries).toHaveLength(2);

    // „Alle Einträge" wählbar; über Mehr → Export gibt es keine Verlaufs-Auswahl
    await page.getByRole('button', { name: 'Alle Einträge' }).click();
    const [all] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Herunterladen', exact: true }).click()]);
    expect(((JSON.parse(await textOf(all)) as { diaries: { entries: unknown[] }[] }).diaries[0]!.entries)).toHaveLength(3);
    await go(page, '/more/export');
    await expect(page.getByRole('button', { name: 'Auswahl aus dem Verlauf' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Alle Einträge' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('ANA-18: freier Zeitraum (Range-Popup), Vorlagen und Inhalt (UND) grenzen ein', async ({ page }) => {
    await onboardWithPassword(page);
    // Zweite Vorlage per Duplizieren
    await go(page, '/more/templates');
    await page.getByRole('link', { name: 'Allgemeines Schmerz-Tagebuch bearbeiten' }).click();
    await page.getByRole('button', { name: 'Duplizieren' }).click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Allgemeines Schmerz-Tagebuch (Kopie)');
    await page.getByLabel('Name', { exact: true }).fill('Zweite Vorlage');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('template-row')).toHaveCount(2);

    const at = async (when: string, template?: string) => {
      await go(page, '/entry/new');
      if (template) await page.getByRole('button', { name: template }).click();
      await pickDateTime(page, 'Zeitpunkt', when);
      await page.getByLabel('Notizen').fill('Eintrag');
    };
    const saved = async () => {
      await page.getByRole('button', { name: 'Speichern' }).click();
      await expect(page.getByTestId('entry-time')).toBeVisible();
    };
    await at('2026-02-20T10:00');
    await page.getByRole('button', { name: 'Arztbesuch hinzufügen' }).click();
    await page.getByLabel('Titel').fill('Hausarzt');
    await page.getByLabel('Titel').press('Enter');
    await saved();
    await at('2026-03-10T10:00');
    await page.getByLabel('Datei auswählen').setInputFiles({ name: 'Befund.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetisch') });
    await expect(page.getByTestId('attachment-item')).toHaveCount(1);
    await saved();
    await at('2026-03-20T10:00', 'Zweite Vorlage');
    await saved();

    await go(page, '/history');
    await expect(rows(page)).toHaveCount(3);
    await openFilter(page);
    // freier Zeitraum im Range-Popup (RDM-030)
    await pickRange(page, 'Zeitraum', '2026-03-01', '2026-03-31');
    await expect(page.getByLabel('Zeitraum', { exact: true })).toHaveText('01.03. – 31.03.2026');
    await expect(rows(page)).toHaveCount(2);
    await pickRange(page, 'Zeitraum', '2026-03-01', '2026-03-15');
    await expect(rows(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Zurücksetzen' }).click();
    await expect(rows(page)).toHaveCount(3);
    // Vorlagen
    await page.getByRole('group', { name: 'Vorlagen' }).getByRole('button', { name: 'Zweite Vorlage' }).click();
    await expect(rows(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Zurücksetzen' }).click();
    // Inhalt
    await page.getByRole('button', { name: 'Arztbesuch', exact: true }).click();
    await expect(rows(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Arztbesuch', exact: true }).click();
    await page.getByRole('button', { name: 'PDF', exact: true }).click();
    await expect(rows(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Foto', exact: true }).click();
    await expect(page.getByTestId('empty-state')).toContainText('Keine Einträge für diesen Filter');
    await page.getByRole('button', { name: 'Foto', exact: true }).click();
    await page.getByRole('button', { name: 'Body-Map', exact: true }).click();
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await page.getByRole('button', { name: 'Body-Map', exact: true }).click();

    // Kombination Zeitraum + Vorlage + Inhalt
    await pickRange(page, 'Zeitraum', '2026-03-01', '2026-03-31');
    await page.getByRole('group', { name: 'Vorlagen' }).getByRole('button', { name: 'Allgemeines Schmerz-Tagebuch' }).click();
    await expect(page.getByRole('button', { name: 'PDF', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveCount(1);
    // Vorlagen stehen als eigene Gruppe vor den weiteren Filtern
    await expect(page.getByRole('group', { name: 'Weitere Filter' }).getByRole('button', { name: 'Schmerz ≥ 6' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Vorlagen' }).getByRole('button', { name: 'Schmerz ≥ 6' })).toHaveCount(0);
  });

  test('RDM-030: „Übernehmen“ schließt die Karte, Filter bleiben nach der Detailansicht erhalten, nach Neustart leer; kein „Filter speichern“', async ({ page }) => {
    await onboardWithPassword(page);
    await addEntry(page, '8', 'schwerer Tag');
    await addEntry(page, '3');
    await go(page, '/history');
    await openFilter(page);
    await expect(page.getByRole('button', { name: 'Filter speichern' })).toHaveCount(0);
    await expect(page.getByTestId('saved-filters')).toHaveCount(0);
    await page.getByRole('button', { name: 'Schmerz ≥ 6' }).click();
    await expect(rows(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Übernehmen' }).click();
    await expect(page.locator('#history-filter-panel')).toBeHidden();
    await expect(page.locator('[aria-controls="history-filter-panel"]')).toBeFocused();
    await expect(rows(page)).toHaveCount(1);

    // Detail öffnen und zurück: Filter weiter aktiv
    await rows(page).first().click();
    await expect(page).toHaveURL(/\/entry\/[^/]+$/);
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Verlauf' })).toBeVisible();
    await expect(page.getByTestId('filter-count')).toHaveText(/^1/);
    await expect(rows(page)).toHaveCount(1);
    // auch über die untere Navigation
    await go(page, '/');
    await go(page, '/history');
    await expect(rows(page)).toHaveCount(1);

    // Neustart (Reload) setzt die Filter zurück
    await page.reload();
    await page.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await expect(page.getByRole('heading', { name: 'Verlauf' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('filter-count')).toHaveCount(0);
    await expect(rows(page)).toHaveCount(2);
  });
});

/** Filter, Sortieren und Export stehen auf einer Zeile und sind mindestens 44 px hoch (Spec 10:8). */
async function expectOneRow(page: Page) {
  const boxes = await Promise.all([
    page.locator('[aria-controls="history-filter-panel"]').boundingBox(),
    page.locator('[aria-controls="history-sort-panel"]').boundingBox(),
    page.getByRole('link', { name: 'Exportieren' }).boundingBox(),
  ]);
  for (const b of boxes) {
    expect(b).not.toBeNull();
    expect(b!.height).toBeGreaterThanOrEqual(44);
    expect(b!.y).toBe(boxes[0]!.y);
  }
}

test.describe('RDM-028 P4: Verlauf-Kopf', () => {
  test('RDM-028 P4: Verlauf-Kopf zeigt nur Suche offen, Filter/Sortieren/Export kompakt', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await onboardWithPassword(page);
    await addEntry(page, '8', 'Kopf');
    await go(page, '/history');
    const range = page.getByLabel('Zeitraum', { exact: true });
    await expect(page.getByLabel('Suchen')).toBeVisible();
    await expect(range).toBeHidden();
    await expect(page.getByTestId('filter-count')).toHaveCount(0);
    await expectOneRow(page);

    await openFilter(page);
    await expect(range).toBeVisible();
    await page.getByRole('button', { name: 'Schmerz ≥ 6' }).click();
    await expect(page.getByTestId('filter-count')).toHaveText(/^1/);
    await page.getByRole('button', { name: 'Ereignis' }).click();
    await expect(page.getByTestId('filter-count')).toHaveText(/^2/);
    await expectOneRow(page);
    await page.locator('[aria-controls="history-filter-panel"]').click();
    await expect(range).toBeHidden();
    await expect(page.getByTestId('filter-count')).toHaveText(/^2/);

    await openFilter(page);
    await openSort(page);
    await expect(page.locator('#history-filter-panel')).toBeHidden();
    await expect(page.getByLabel('Sortierung')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Exportieren' })).toBeVisible();

    // Escape schließt das Panel und gibt den Fokus an den Auslöser zurück.
    await page.keyboard.press('Escape');
    await expect(page.locator('#history-sort-panel')).toBeHidden();
    await expect(page.locator('[aria-controls="history-sort-panel"]')).toBeFocused();
    await openFilter(page);
    await page.getByLabel('Suchen').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#history-filter-panel')).toBeHidden();

    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
});
