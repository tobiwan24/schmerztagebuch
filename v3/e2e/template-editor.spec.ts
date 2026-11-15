import { test, expect, type Page } from '@playwright/test';
import { go, onboardWithPassword } from './helpers';

const names = (page: Page) => page.getByTestId('template-row').locator('span.flex-1 > span:first-child').allTextContents();

test.describe('Vorlagen-Editor', () => {
  test.beforeEach(async ({ page }) => {
    await onboardWithPassword(page);
  });

  test('BLK-23: leere Vorlage anlegen, Name/Icon/Farbe ändern (Liste und Eintragsformular), Duplizieren ist unabhängig', async ({ page }) => {
    // Anlegen
    await go(page, '/more/templates');
    await page.getByRole('link', { name: 'Neue leere Vorlage' }).click();
    await expect(page.getByRole('heading', { name: 'Neue Vorlage' })).toBeVisible();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Bitte gib einen Namen ein.')).toBeVisible();
    await page.getByLabel('Name', { exact: true }).fill('Meine Vorlage');
    await page.getByRole('button', { name: 'Symbol Pill' }).click();
    await page.getByRole('button', { name: 'Rot' }).click();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen' })).toBeVisible();
    const row = (name: string) => page.getByTestId('template-row').filter({ hasText: name });
    await expect(row('Meine Vorlage').getByTestId('template-icon')).toHaveAttribute('data-icon', 'Pill');
    await expect(row('Meine Vorlage').getByTestId('template-icon')).toHaveAttribute('data-color', 'red');

    // Name/Icon/Farbe ändern → Liste und Eintragsformular
    await row('Meine Vorlage').getByRole('link', { name: 'Meine Vorlage bearbeiten' }).click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Meine Vorlage');
    await page.getByLabel('Name', { exact: true }).fill('Umbenannt');
    await page.getByRole('button', { name: 'Symbol Moon' }).click();
    await page.getByRole('button', { name: 'Grün' }).click();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(row('Umbenannt').getByTestId('template-icon')).toHaveAttribute('data-icon', 'Moon');
    await expect(row('Umbenannt').getByTestId('template-icon')).toHaveAttribute('data-color', 'green');
    await go(page, '/entry/new');
    const chip = page.getByRole('button', { name: 'Umbenannt' });
    await expect(chip).toBeVisible();
    await expect(chip.getByTestId('template-icon')).toHaveAttribute('data-icon', 'Moon');

    // Duplizieren: Kopie direkt hinter dem Original, unabhängig
    await go(page, '/more/templates');
    await row('Umbenannt').getByRole('link', { name: 'Umbenannt bearbeiten' }).click();
    await page.getByRole('button', { name: 'Duplizieren' }).click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Umbenannt (Kopie)');
    await page.getByLabel('Name', { exact: true }).fill('Kopie B');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect.poll(() => names(page)).toEqual(['Allgemeines Schmerz-Tagebuch', 'Umbenannt', 'Kopie B']);
    await expect(row('Kopie B').getByTestId('template-icon')).toHaveAttribute('data-icon', 'Moon');
  });
});
