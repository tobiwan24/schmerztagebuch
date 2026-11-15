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

  // Grundlage für BLK-24 (Auswahl und Körperkarte folgen); bewusst ohne Akzeptanz-ID im Namen.
  test('M14.4a Blockeditor: Felder anlegen, konfigurieren, als neue Version speichern und im Formular nutzen', async ({ page }) => {
    await go(page, '/more/templates/new');
    await page.getByLabel('Name', { exact: true }).fill('Blocktest');
    for (const type of ['Slider', 'Checkbox', 'Text', 'Textfeld', 'Datum und Zeit']) {
      await page.getByRole('group', { name: 'Feld hinzufügen' }).getByRole('button', { name: type, exact: true }).click();
    }
    await expect(page.getByTestId('block-editor-card')).toHaveCount(5);

    // Leere Bezeichnungen blockieren das Speichern, Hinweis am Feld
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Bitte gib eine Bezeichnung ein.')).toHaveCount(5);

    const card = (n: number) => page.getByRole('region', { name: new RegExp(`^Feld ${n}:`) });
    await card(1).getByLabel('Bezeichnung', { exact: true }).fill('Intensität');
    await card(1).getByLabel('Maximum', { exact: true }).fill('20');
    await card(1).getByLabel('Schrittweite', { exact: true }).fill('2');
    await card(1).getByLabel('Einheit (optional)').fill('Pkt');
    await card(1).getByLabel('Beschriftung am Minimum').fill('gar nicht');
    await card(1).getByLabel('Pflichtfeld').check();
    await card(1).getByLabel('Rolle').selectOption({ label: 'Ergebnis (z. B. Schmerzstärke)' });
    await card(2).getByLabel('Bezeichnung', { exact: true }).fill('Übelkeit');
    await card(2).getByLabel('Mit Notiz').check();
    await card(3).getByLabel('Bezeichnung', { exact: true }).fill('Stichwort');
    await card(3).getByLabel('Maximale Länge (optional)').fill('5');
    await card(4).getByLabel('Bezeichnung', { exact: true }).fill('Notizen');
    await card(4).getByLabel('Anhänge erlauben').uncheck();
    await card(5).getByLabel('Bezeichnung', { exact: true }).fill('Dauer');
    await card(5).getByLabel('Modus').selectOption('duration');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen' })).toBeVisible();

    // Neuer Eintrag zeigt die Felder mit ihrer Konfiguration
    await go(page, '/entry/new');
    await page.getByRole('button', { name: 'Blocktest' }).click();
    const field = (label: string) => page.getByTestId('block-field').filter({ hasText: label });
    await expect(field('Intensität').getByRole('slider')).toHaveAttribute('max', '20');
    await expect(field('Intensität').getByRole('slider')).toHaveAttribute('step', '2');
    await expect(field('Intensität')).toContainText('gar nicht');
    await expect(field('Übelkeit').getByLabel('Notiz')).toBeVisible();
    await expect(field('Stichwort').getByRole('textbox')).toHaveAttribute('maxlength', '5');
    await expect(field('Dauer').getByLabel('Dauer in Minuten')).toBeVisible();

    // Bestehende Vorlage ändern: Bezeichnung umbenennen → gespeichert, Zustand bleibt
    await go(page, '/more/templates');
    await page.getByRole('link', { name: 'Blocktest bearbeiten' }).click();
    await expect(card(1).getByLabel('Bezeichnung', { exact: true })).toHaveValue('Intensität');
    await expect(card(1).getByLabel('Maximum', { exact: true })).toHaveValue('20');
    await card(1).getByLabel('Bezeichnung', { exact: true }).fill('Stärke');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen' })).toBeVisible();
    await go(page, '/entry/new');
    await page.getByRole('button', { name: 'Blocktest' }).click();
    await expect(field('Stärke')).toBeVisible();
  });
});
