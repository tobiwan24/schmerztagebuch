import { test, expect } from '@playwright/test';
import { go, onboardWithPassword, PASSWORD } from './helpers';

test.describe('Tagebuch-Einstellungen', () => {
  test('UI-14: Name, Zeitzone, Wetter und GPS-Vorbelegung speichern; Stand bleibt nach dem Neuladen', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/more/diaries');
    await page.getByTestId('diary-card').getByRole('link', { name: 'Einstellungen' }).click();
    await expect(page.getByRole('heading', { name: 'Tagebuch-Einstellungen' })).toBeVisible();
    await expect(page.getByLabel('Name')).toHaveValue('Mein Tagebuch');
    await expect(page.getByLabel('Wetter zu jedem Eintrag speichern')).not.toBeChecked();

    // Leerer Name wird abgelehnt
    await page.getByLabel('Name').fill('  ');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Bitte gib einen Namen ein.')).toBeVisible();

    await page.getByLabel('Name').fill('Rückentagebuch');
    await page.getByLabel('Zeitzone').selectOption('America/New_York');
    await page.getByLabel('Wetter zu jedem Eintrag speichern').check();
    await page.getByLabel('Aktuellen Standort standardmäßig verwenden').check();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Gespeichert.')).toBeVisible();

    // Neu laden → entsperren → Stand bleibt erhalten
    await page.reload();
    await page.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await go(page, '/more/diaries');
    await expect(page.getByTestId('diary-card')).toContainText('Rückentagebuch');
    await page.getByTestId('diary-card').getByRole('link', { name: 'Einstellungen' }).click();
    await expect(page.getByLabel('Name')).toHaveValue('Rückentagebuch');
    await expect(page.getByLabel('Zeitzone')).toHaveValue('America/New_York');
    await expect(page.getByLabel('Wetter zu jedem Eintrag speichern')).toBeChecked();
    await expect(page.getByLabel('Aktuellen Standort standardmäßig verwenden')).toBeChecked();
  });
});
