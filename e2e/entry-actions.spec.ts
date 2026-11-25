import { test, expect, type Page } from '@playwright/test';
import { go, onboardWithPassword } from './helpers';

const save = (page: Page) => page.getByRole('button', { name: 'Speichern' }).click();

test.describe('Eintrag: Löschen und Duplizieren', () => {
  test.describe.configure({ timeout: 90_000 });

  test('BLK-36: Duplizieren öffnet das Formular vorbefüllt (ohne Anhänge), Speichern erzeugt einen neuen Eintrag, das Original bleibt', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/entry/new');
    await page.getByLabel(/Schmerzstärke/).fill('6');
    await page.getByLabel('Notizen').fill('Original-Notiz');
    await page.getByLabel('Tags', { exact: true }).fill('Arbeit');
    await page.getByLabel('Tags', { exact: true }).press('Enter');
    await page.getByLabel('Datei auswählen').setInputFiles({ name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetisch') });
    await save(page);
    await expect(page.getByTestId('entry-time')).toBeVisible();
    await expect(page.getByTestId('attachment')).toHaveCount(1);
    const originalUrl = page.url();

    await page.getByRole('link', { name: 'Duplizieren' }).click();
    await expect(page.getByRole('button', { name: 'Speichern' })).toBeVisible();
    await expect(page.getByLabel(/Schmerzstärke/)).toHaveValue('6');
    await expect(page.getByLabel('Notizen')).toHaveValue('Original-Notiz');
    await expect(page.getByTestId('tag-chip')).toHaveText(['Arbeit']);
    await expect(page.getByTestId('attachment')).toHaveCount(0);
    await page.getByLabel('Notizen').fill('Kopie-Notiz');
    await save(page);
    await expect(page.getByTestId('entry-time')).toBeVisible();
    expect(page.url()).not.toBe(originalUrl);
    await expect(page.getByText('Kopie-Notiz')).toBeVisible();

    await go(page, '/history');
    await expect(page.getByTestId('entry-row')).toHaveCount(2);
  });

  test('BLK-35: Löschen mit Bestätigung entfernt den Eintrag aus Verlauf und Start; Abbrechen ändert nichts', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/entry/new');
    await page.getByLabel(/Schmerzstärke/).fill('3');
    await save(page);
    await expect(page.getByTestId('entry-time')).toBeVisible();

    await page.getByRole('button', { name: 'Löschen' }).click();
    await expect(page.getByRole('dialog')).toContainText('Eintrag löschen?');
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('entry-time')).toBeVisible();

    await page.getByRole('button', { name: 'Löschen' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Endgültig löschen' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-route', '/');
    await go(page, '/history');
    await expect(page.getByTestId('entry-row')).toHaveCount(0);
  });
});
