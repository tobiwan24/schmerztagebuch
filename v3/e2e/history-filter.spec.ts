import { test, expect, type Download, type Page } from '@playwright/test';
import { addDeviceWithBackupCode, addVirtualAuthenticator, go, onboardWithCloud, onboardWithPassword, openFilter, openSort, uniqueUser } from './helpers';

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
    await page.getByRole('button', { name: '7 Tage' }).click();
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

  test('ANA-18: freier Zeitraum, Vorlagen und Inhalt (UND) grenzen ein; gespeicherter Filter stellt alles wieder her', async ({ page }) => {
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
      await page.getByLabel('Zeitpunkt', { exact: true }).fill(when);
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
    // freier Zeitraum
    await page.getByLabel('Von').fill('2026-03-01');
    await expect(rows(page)).toHaveCount(2);
    await page.getByLabel('Bis').fill('2026-03-15');
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

    // Kombination Zeitraum + Vorlage + Inhalt als gespeicherter Filter
    await page.getByLabel('Von').fill('2026-03-01');
    await page.getByRole('group', { name: 'Vorlagen' }).getByRole('button', { name: 'Allgemeines Schmerz-Tagebuch' }).click();
    await expect(rows(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Filter speichern' }).click();
    await page.getByLabel('Name des Filters').fill('Befunde im März');
    await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('saved-filters')).toContainText('Befunde im März');
    await page.getByRole('button', { name: 'Zurücksetzen' }).click();
    await expect(rows(page)).toHaveCount(3);
    await page.getByTestId('saved-filters').getByRole('button', { name: 'Befunde im März', exact: true }).click();
    await expect(page.getByLabel('Von')).toHaveValue('2026-03-01');
    await expect(page.getByRole('group', { name: 'Vorlagen' }).getByRole('button', { name: 'Allgemeines Schmerz-Tagebuch' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'PDF', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveCount(1);
  });

  test('ANA-11: gespeicherter Filter überlebt Reload und erscheint auf dem Zweitgerät', async ({ page: a, browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'Konto + Zweitgerät mit virtuellem Authenticator (Chromium)');
    await addVirtualAuthenticator(a);
    const user = uniqueUser('ana11');
    const code = await onboardWithCloud(a, user);
    await addEntry(a, '8', 'schwerer Tag');
    await addEntry(a, '3');
    await addEntry(a, '9');

    await go(a, '/history');
    await openFilter(a);
    await a.getByRole('button', { name: 'Schmerz ≥ 6' }).click();
    await expect(rows(a)).toHaveCount(2);
    await a.getByRole('button', { name: 'Filter speichern' }).click();
    await a.getByLabel('Name des Filters').fill('Schwere Tage');
    await a.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
    await expect(a.getByTestId('saved-filters')).toContainText('Schwere Tage');
    await expect(a.getByTestId('sync-status')).toHaveAttribute('data-state', 'synced', { timeout: 20_000 });

    // Reload (sperrt) → entsperren → gespeicherter Filter da und wirksam
    await a.reload();
    await a.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
    await a.getByRole('button', { name: 'Mit Passkey entsperren' }).click();
    // Entsperren führt zurück in die gesperrte Ansicht (Verlauf)
    await expect(a.getByRole('heading', { name: 'Verlauf' })).toBeVisible({ timeout: 30_000 });
    await expect(rows(a)).toHaveCount(3);
    await openFilter(a);
    await a.getByTestId('saved-filters').getByRole('button', { name: 'Schwere Tage', exact: true }).click();
    await expect(a.getByRole('button', { name: 'Schmerz ≥ 6' })).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(a)).toHaveCount(2);

    // Zweitgerät
    const b = await addDeviceWithBackupCode(browser, user, code);
    await expect(b.getByTestId('sync-status')).toHaveAttribute('data-state', 'synced', { timeout: 20_000 });
    await go(b, '/history');
    await openFilter(b);
    await b.getByTestId('saved-filters').getByRole('button', { name: 'Schwere Tage', exact: true }).click();
    await expect(rows(b)).toHaveCount(2);
    await b.context().close();
  });
});

test.describe('RDM-028 P4: Verlauf-Kopf', () => {
  test('RDM-028 P4: Verlauf-Kopf zeigt nur Suche offen, Filter/Sortieren/Export kompakt', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await onboardWithPassword(page);
    await addEntry(page, '8', 'Kopf');
    await go(page, '/history');
    const range = page.getByRole('group', { name: 'Zeitraum' });
    await expect(page.getByLabel('Suchen')).toBeVisible();
    await expect(range).toHaveCount(0);
    await expect(page.getByTestId('filter-count')).toHaveCount(0);

    await openFilter(page);
    await expect(range).toBeVisible();
    await page.getByRole('button', { name: 'Schmerz ≥ 6' }).click();
    await expect(page.getByTestId('filter-count')).toHaveText(/^1/);
    await page.getByRole('button', { name: 'Ereignis' }).click();
    await expect(page.getByTestId('filter-count')).toHaveText(/^2/);
    await page.locator('[aria-controls="history-filter-panel"]').click();
    await expect(range).toHaveCount(0);
    await expect(page.getByTestId('filter-count')).toHaveText(/^2/);

    await openFilter(page);
    await openSort(page);
    await expect(page.locator('#history-filter-panel')).toHaveCount(0);
    await expect(page.getByLabel('Sortierung')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Exportieren' })).toBeVisible();

    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
});
