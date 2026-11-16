import { test, expect, type Page } from '@playwright/test';
import { go, onboardWithPassword } from './helpers';

const tagField = (page: Page) => page.getByLabel('Tags', { exact: true });
const chips = (page: Page) => page.getByTestId('tag-chip');

test.describe('Tags im Eintrag', () => {
  test.describe.configure({ timeout: 90_000 });

  test('BLK-29: Tag per Enter, Komma und Vorschlag hinzufügen, per × entfernen; Detail zeigt Chips, Verlaufssuche findet den Tag', async ({ page }) => {
    await onboardWithPassword(page);

    // erster Eintrag: Tags per Enter und Komma, Duplikat (Groß-/Kleinschreibung) wird ignoriert
    await go(page, '/entry/new');
    await page.getByLabel(/Schmerzstärke/).fill('4');
    await tagField(page).fill('Arbeit');
    await tagField(page).press('Enter');
    await tagField(page).fill('Urlaub,');
    await tagField(page).fill('arbeit');
    await tagField(page).press('Enter');
    await expect(chips(page)).toHaveText(['Arbeit', 'Urlaub']);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // × entfernt
    await page.getByRole('button', { name: 'Tag „Urlaub“ entfernen' }).click();
    await expect(chips(page)).toHaveText(['Arbeit']);
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('entry-time')).toBeVisible();
    await expect(chips(page)).toHaveText(['Arbeit']);

    // zweiter Eintrag: Vorschlag aus dem Tagebuch
    await go(page, '/entry/new');
    await page.getByLabel(/Schmerzstärke/).fill('5');
    await tagField(page).fill('arb');
    await page.getByRole('group', { name: 'Vorschläge' }).getByRole('button', { name: 'Arbeit' }).click();
    await expect(chips(page)).toHaveText(['Arbeit']);
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('entry-time')).toBeVisible();
    await expect(chips(page)).toHaveText(['Arbeit']);

    // dritter Eintrag ohne Tag; Suche nach dem Tag findet nur die ersten beiden
    await go(page, '/entry/new');
    await page.getByLabel(/Schmerzstärke/).fill('6');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('entry-time')).toBeVisible();
    await go(page, '/history');
    await expect(page.getByTestId('entry-row')).toHaveCount(3);
    await page.getByLabel('Suchen').fill('arbeit');
    await expect(page.getByTestId('entry-row')).toHaveCount(2);
  });

  test('BLK-29: Tag-Änderung zählt als ungespeicherte Änderung (Warnung beim Verlassen)', async ({ page }) => {
    await onboardWithPassword(page);
    await page.getByRole('link', { name: 'Neuer Eintrag' }).click();
    await expect(page.getByRole('button', { name: 'Speichern' })).toBeVisible();
    await tagField(page).fill('Wochenende');
    await tagField(page).press('Enter');
    await page.getByRole('button', { name: 'Zurück' }).click();
    await expect(page.getByRole('dialog')).toContainText('Änderungen verwerfen?');
  });
});
