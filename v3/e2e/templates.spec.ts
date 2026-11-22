import { test, expect, type Page } from '@playwright/test';
import { PASSWORD, go, onboardWithPassword } from './helpers';

const names = (page: Page) => page.getByTestId('template-row').locator('span.flex-1 > span:first-child').allTextContents();

async function quickEntry(page: Page) {
  await go(page, '/');
  await page.getByRole('link', { name: 'Schnell eintragen' }).click();
  const slider = page.getByLabel(/Schmerzstärke/);
  const box = (await slider.boundingBox())!;
  await slider.click({ position: { x: box.width * 0.5, y: box.height / 2 } });
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByTestId('entry-row')).toHaveCount(1);
}

test.describe('Vorlagen verwalten', () => {
  test.beforeEach(async ({ page }) => {
    await onboardWithPassword(page);
  });

  test('BLK-15: Vorlage mit Einträgen kann nur archiviert werden; endgültiges Löschen zeigt Anzahl und verlangt Bestätigung', async ({ page }) => {
    await quickEntry(page);
    await go(page, '/more/templates');
    const row = page.getByTestId('template-row').filter({ hasText: 'Allgemeines Schmerz-Tagebuch' });
    await expect(row).toContainText('1 Eintrag');
    await expect(row.getByRole('button', { name: /löschen$/ })).toHaveCount(0);

    await row.getByRole('button', { name: 'Allgemeines Schmerz-Tagebuch archivieren' }).click();
    const archived = page.getByTestId('archived-templates');
    await expect(archived).toContainText('Allgemeines Schmerz-Tagebuch');
    await expect(page.getByTestId('template-row')).toHaveCount(0);

    await archived.getByRole('button', { name: 'Allgemeines Schmerz-Tagebuch löschen' }).click();
    await expect(page.getByTestId('delete-count')).toContainText('1 Eintrag');
    const final = page.getByRole('button', { name: 'Endgültig löschen' });
    await expect(final).toBeDisabled();
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(archived).toContainText('Allgemeines Schmerz-Tagebuch');

    await archived.getByRole('button', { name: 'Allgemeines Schmerz-Tagebuch löschen' }).click();
    await page.getByLabel('Ich verstehe, dass die Einträge verloren gehen.').check();
    await final.click();
    await expect(page.getByTestId('archived-templates')).toHaveCount(0);
    await go(page, '/history');
    await expect(page.getByTestId('empty-state')).toBeVisible();

    // Vorlage ohne Einträge: Löschen direkt, ohne Zusatzbestätigung
    await go(page, '/more/templates');
    await page.getByRole('button', { name: /Migräne-Tracking/ }).click();
    const migraine = page.getByTestId('template-row').filter({ hasText: 'Migräne-Tracking' });
    await migraine.getByRole('button', { name: 'Migräne-Tracking löschen' }).click();
    await expect(page.getByTestId('delete-count')).toHaveText('Die Vorlage wird endgültig gelöscht.');
    await page.getByRole('button', { name: 'Endgültig löschen' }).click();
    await expect(page.getByTestId('template-row')).toHaveCount(0);
  });

  test('Reihenfolge per Drag & Drop und Pfeiltasten; bleibt nach Neuladen erhalten (Zweitgerät folgt mit der Sync-Oberfläche)', async ({ page }) => {
    await go(page, '/more/templates');
    await page.getByRole('button', { name: /Migräne-Tracking/ }).click();
    await expect(page.getByTestId('template-row')).toHaveCount(2);
    await page.getByRole('button', { name: /Kopfschmerz-Tagebuch/ }).click();
    await expect(page.getByTestId('template-row')).toHaveCount(3);
    expect(await names(page)).toEqual(['Allgemeines Schmerz-Tagebuch', 'Migräne-Tracking', 'Kopfschmerz-Tagebuch']);

    // Ziehen: letzte Vorlage nach oben
    const handle = page.getByRole('button', { name: 'Kopfschmerz-Tagebuch verschieben' });
    const from = (await handle.boundingBox())!;
    const top = (await page.getByTestId('template-row').first().boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, top.y + 4, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => names(page)).toEqual(['Kopfschmerz-Tagebuch', 'Allgemeines Schmerz-Tagebuch', 'Migräne-Tracking']);

    // Tastatur: erste Vorlage eins nach unten
    await page.getByRole('button', { name: 'Kopfschmerz-Tagebuch verschieben' }).press('ArrowDown');
    await expect.poll(() => names(page)).toEqual(['Allgemeines Schmerz-Tagebuch', 'Kopfschmerz-Tagebuch', 'Migräne-Tracking']);

    // Neuladen (sperrt) → nach Entsperren gleiche Reihenfolge
    await expect(page.getByTestId('template-list')).toHaveAttribute('aria-busy', 'false');
    await page.reload();
    await page.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen' })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => names(page)).toEqual(['Allgemeines Schmerz-Tagebuch', 'Kopfschmerz-Tagebuch', 'Migräne-Tracking']);
  });
});
