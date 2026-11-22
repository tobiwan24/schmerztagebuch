import { test, expect } from '@playwright/test';
import { go, onboardWithPassword } from './helpers';

test.describe('Medikamenten-Block', () => {
  test.describe.configure({ timeout: 90_000 });

  test('BLK-49: Editor (Vorgaben, Reihenfolge), Formular (aus Vorgabe und frei), Detailansicht und Schnelleintrag', async ({ page }) => {
    await onboardWithPassword(page);

    // Editor: Palette „Medikamente“, zwei Vorgaben
    await go(page, '/more/templates/new');
    await page.getByLabel('Name', { exact: true }).fill('Mit Medikamenten');
    await page.getByRole('group', { name: 'Feld hinzufügen' }).getByRole('button', { name: 'Medikamente', exact: true }).click();
    const card = page.getByRole('region', { name: /^Feld 1:/ });
    await card.getByLabel('Bezeichnung', { exact: true }).fill('Einnahme');
    await card.getByLabel('Im Schnelleintrag').check();
    await expect(card.getByLabel('Rolle')).toHaveValue('medication');

    // Leere Vorgabe blockiert das Speichern
    await card.getByRole('button', { name: 'Medikament hinzufügen' }).click();
    await card.getByLabel('Name von Medikament 1', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Jedes Medikament braucht einen Namen.')).toBeVisible();

    await card.getByLabel('Name von Medikament 1', { exact: true }).fill('Ibuprofen');
    await card.getByLabel('Dosis von Medikament 1').fill('400');
    await card.getByLabel('Einheit von Medikament 1').selectOption('mg');
    await card.getByRole('button', { name: 'Medikament hinzufügen' }).click();
    await card.getByLabel('Name von Medikament 2', { exact: true }).fill('Paracetamol');
    await card.getByLabel('Dosis von Medikament 2').fill('500');
    // Reihenfolge: Paracetamol nach oben
    await card.getByRole('button', { name: 'Medikament Paracetamol nach oben' }).click();
    await expect(card.getByTestId('preset-row').first().getByLabel('Name von Medikament 1', { exact: true })).toHaveValue('Paracetamol');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen' })).toBeVisible();

    // Formular: Vorgabe, frei, Uhrzeit, Wirkung, Entfernen
    await go(page, '/entry/new');
    await page.getByRole('button', { name: 'Mit Medikamenten' }).click();
    const field = page.getByTestId('medication-field');
    await expect(field.getByRole('button', { name: /^\+ / })).toHaveText(['+ Paracetamol', '+ Ibuprofen', '+ Medikament']);
    await field.getByRole('button', { name: '+ Ibuprofen' }).click();
    const ibu = field.getByRole('group', { name: 'Medikament 1: Ibuprofen' });
    await expect(ibu.getByLabel('Dosis')).toHaveValue('400');
    await expect(ibu.getByLabel('Einheit')).toHaveValue('mg');
    await ibu.getByLabel('Uhrzeit').fill('08:15');
    await ibu.getByLabel('Wirkung (0–10)').selectOption('6');
    await field.getByRole('button', { name: '+ Medikament' }).click();
    const free = field.getByTestId('medication-item').nth(1);
    await free.getByLabel('Name', { exact: true }).fill('Arnika');
    await free.getByLabel('Dosis').fill('5');
    await free.getByLabel('Einheit').selectOption('Tropfen');
    await field.getByRole('button', { name: '+ Paracetamol' }).click();
    await expect(field.getByTestId('medication-item')).toHaveCount(3);
    await field.getByRole('button', { name: 'Paracetamol entfernen' }).click();
    await expect(field.getByTestId('medication-item')).toHaveCount(2);
    await page.getByRole('button', { name: 'Speichern' }).click();

    // Detailansicht
    const row = page.getByTestId('entry-field').filter({ hasText: 'Einnahme' });
    await expect(row).toContainText('Ibuprofen 400 mg');
    await expect(row).toContainText('Arnika 5 Tropfen');

    // Bearbeiten: Werte bleiben erhalten (Uhrzeit, Wirkung)
    await page.getByRole('link', { name: 'Bearbeiten' }).click();
    const again = page.getByTestId('medication-field').getByRole('group', { name: 'Medikament 1: Ibuprofen' });
    await expect(again.getByLabel('Uhrzeit')).toHaveValue('08:15');
    await expect(again.getByLabel('Wirkung (0–10)')).toHaveValue('6');

    // Schnelleintrag zeigt das Feld und speichert eine Position
    await go(page, '/quick');
    await page.getByTestId('quick-template-choice').getByRole('button', { name: 'Mit Medikamenten' }).click();
    await page.getByTestId('medication-field').getByRole('button', { name: '+ Ibuprofen' }).click();
    await expect(page.getByTestId('medication-item')).toHaveCount(1);
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-route', '/');
    await go(page, '/history');
    await expect(page.getByTestId('entry-row')).toHaveCount(2);
    await page.getByTestId('entry-row').first().click();
    await expect(page.getByTestId('entry-field').filter({ hasText: 'Einnahme' })).toContainText('Ibuprofen 400 mg');
  });
});
