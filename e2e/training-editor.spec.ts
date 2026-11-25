import { test, expect } from '@playwright/test';
import { go, onboardWithPassword } from './helpers';

test.describe('Trainingsvorlage im Editor', () => {
  test.describe.configure({ timeout: 90_000 });

  test('UI-31: Schalter, Funktionsphasen, Übungsblock mit Schritten, Video-Link und Stufen; Vorlage ist keine Start-Kachel', async ({ page }) => {
    await onboardWithPassword(page);

    await go(page, '/more/templates/new');
    await page.getByLabel('Name', { exact: true }).fill('Schulterübungen');
    // Ohne Schalter gibt es keinen Übungsblock in der Palette
    const palette = page.getByRole('group', { name: 'Feld hinzufügen' });
    await expect(palette.getByRole('button', { name: 'Übung', exact: true })).toHaveCount(0);
    await page.getByLabel('Trainingsvorlage').check();
    await palette.getByRole('button', { name: 'Übung', exact: true }).click();

    const card = page.getByRole('region', { name: /^Feld 1:/ });
    await card.getByLabel('Bezeichnung', { exact: true }).fill('Schulterkreisen');
    await card.getByLabel('Erklärung der Übung (optional)').fill('Langsam kreisen');
    await card.getByLabel('Sätze (optional)').fill('3');
    await card.getByLabel('Wiederholungen (optional)').fill('10');
    await card.getByLabel('Dauer in Sekunden (optional)').fill('45');
    // Schritte als Liste (RDM-033); ein leerer Schritt entfällt beim Speichern
    for (const [i, text] of ['Aufrecht stehen', 'Langsam atmen', '', 'Schultern nach hinten kreisen'].entries()) {
      await card.getByRole('button', { name: 'Schritt hinzufügen' }).click();
      await card.getByLabel(`Schritt ${i + 1}`, { exact: true }).fill(text);
    }
    await card.getByRole('button', { name: 'Schritt 4 nach oben' }).click();
    await card.getByRole('button', { name: 'Schritt 3 nach oben' }).click();
    await card.getByRole('button', { name: 'Stufe hinzufügen' }).click();
    await card.getByRole('button', { name: 'Stufe hinzufügen' }).click();
    await card.getByLabel('Bezeichnung von Stufe 1').fill('Leicht');
    await card.getByLabel('Bezeichnung von Stufe 2').fill('Mittel');
    await card.getByRole('button', { name: 'Stufe Mittel nach oben' }).click();
    await expect(card.getByLabel('Bezeichnung von Stufe 1')).toHaveValue('Mittel');
    await card.getByRole('button', { name: 'Stufe Mittel nach unten' }).click();

    // Ungültige Phasen und ein http-Link blockieren das Speichern
    await page.getByLabel('Funktionsphasen (optional)').fill('1, x');
    await card.getByLabel('Video-Link (https, optional)').fill('http://example.org/video');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Bitte nur Zahlen angeben, höchstens 20.')).toBeVisible();
    await expect(page.getByText('Der Video-Link muss mit https:// beginnen.')).toBeVisible();
    await expect(card.getByRole('link', { name: 'Video-Link in neuem Tab öffnen' })).toHaveCount(0);

    await page.getByLabel('Funktionsphasen (optional)').fill('2, 1');
    await card.getByLabel('Video-Link (https, optional)').fill('https://example.org/video');
    // Der Link öffnet extern ohne Rückbezug
    const link = card.getByRole('link', { name: 'Video-Link in neuem Tab öffnen' });
    await expect(link).toHaveAttribute('href', 'https://example.org/video');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen', exact: true })).toBeVisible();

    // Neu öffnen: alles ist erhalten
    await page.getByRole('link', { name: /Schulterübungen/ }).first().click();
    await expect(page.getByLabel('Trainingsvorlage')).toBeChecked();
    await expect(page.getByLabel('Funktionsphasen (optional)')).toHaveValue('1, 2');
    const again = page.getByRole('region', { name: /^Feld 1:/ });
    await expect(again.getByLabel('Sätze (optional)')).toHaveValue('3');
    await expect(again.getByLabel('Wiederholungen (optional)')).toHaveValue('10');
    await expect(again.getByLabel('Dauer in Sekunden (optional)')).toHaveValue('45');
    await expect(again.getByLabel('Schritt 1', { exact: true })).toHaveValue('Aufrecht stehen');
    await expect(again.getByLabel('Schritt 2', { exact: true })).toHaveValue('Schultern nach hinten kreisen');
    await expect(again.getByLabel('Schritt 3', { exact: true })).toHaveValue('Langsam atmen');
    await expect(again.getByLabel('Schritt 4', { exact: true })).toHaveCount(0);
    await expect(again.getByLabel('Bezeichnung von Stufe 1')).toHaveValue('Leicht');
    await expect(again.getByLabel('Bezeichnung von Stufe 2')).toHaveValue('Mittel');
    await expect(again.getByLabel('Video-Link (https, optional)')).toHaveValue('https://example.org/video');

    // Trainingsvorlagen erscheinen nicht als Kachel auf Start
    await go(page, '/');
    await expect(page.getByTestId('template-tiles')).toBeVisible();
    await expect(page.getByTestId('template-tile').filter({ hasText: 'Schulterübungen' })).toHaveCount(0);
  });
});
