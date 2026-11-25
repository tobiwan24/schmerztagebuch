import { test, expect } from '@playwright/test';
import { go, onboardWithPassword } from './helpers';

test.describe('Auswertung: Diagramm als Eintrag', () => {
  test.describe.configure({ timeout: 90_000 });

  test('ANA-21: PNG des Verlaufsdiagramms wird Bild-Anhang eines neuen Eintrags, Beschriftung wird der Text', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/entry/new');
    await page.getByLabel(/Schmerzstärke/).fill('5');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('entry-time')).toBeVisible();

    await go(page, '/analysis');
    await expect(page.getByTestId('analysis-view-trend').locator('svg.recharts-surface')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Als Eintrag speichern' }).click();
    const dialog = page.getByRole('dialog', { name: 'Diagramm als Eintrag speichern' });
    await expect(dialog.getByLabel('Vorlage')).toBeVisible();
    await dialog.getByLabel('Beschriftung').fill('Verlauf Test');
    await dialog.getByRole('button', { name: 'Speichern' }).click();

    // neuer Eintrag mit Beschriftung und einem Bild-Anhang
    await expect(page.getByTestId('entry-time')).toBeVisible();
    await expect(page).toHaveURL(/\/entry\//);
    await expect(page.getByText('Verlauf Test').first()).toBeVisible();
    await expect(page.getByTestId('attachment')).toHaveCount(1);
    await expect(page.getByTestId('attachment')).toContainText('.png');

    await go(page, '/history');
    await expect(page.getByTestId('entry-row')).toHaveCount(2);
  });
});
