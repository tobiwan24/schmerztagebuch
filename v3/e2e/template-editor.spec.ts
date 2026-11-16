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

  test('BLK-24: Blockeditor: alle sieben Feldtypen anlegen, konfigurieren, als neue Version speichern und im Formular nutzen', async ({ page }) => {
    await go(page, '/more/templates/new');
    await page.getByLabel('Name', { exact: true }).fill('Blocktest');
    for (const type of ['Slider', 'Checkbox', 'Text', 'Textfeld', 'Datum und Zeit', 'Auswahl', 'Körperkarte']) {
      await page.getByRole('group', { name: 'Feld hinzufügen' }).getByRole('button', { name: type, exact: true }).click();
    }
    await expect(page.getByTestId('block-editor-card')).toHaveCount(7);

    // Leere Bezeichnungen blockieren das Speichern, Hinweis am Feld
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Bitte gib eine Bezeichnung ein.')).toHaveCount(7);

    const card = (n: number) => page.getByRole('region', { name: new RegExp(`^Feld ${n}:`) });
    await card(1).getByLabel('Bezeichnung', { exact: true }).fill('Schmerzgrad');
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
    await card(6).getByLabel('Bezeichnung', { exact: true }).fill('Begleiter');
    await card(6).getByLabel('Auswahl', { exact: true }).selectOption('single');
    await card(6).getByLabel('Option 1', { exact: true }).fill('Ruhe');
    await card(6).getByRole('button', { name: 'Option hinzufügen' }).click();
    await card(6).getByLabel('Option 2', { exact: true }).fill('Licht');
    await card(6).getByRole('button', { name: 'Option hinzufügen' }).click();
    await card(6).getByLabel('Option 3', { exact: true }).fill('Ruhe');
    // Doppelte Optionsnamen blockieren das Speichern
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Optionen dürfen nicht gleich heißen.')).toBeVisible();
    await card(6).getByLabel('Option 3', { exact: true }).fill('Lärm');
    const blue = card(6).getByRole('group', { name: 'Farbe von Lärm' }).getByRole('button', { name: 'Blau' });
    await blue.click();
    await expect(blue).toHaveAttribute('aria-pressed', 'true');
    // Reihenfolge per Tastatur: Lärm nach oben (zwischen Ruhe und Licht)
    await card(6).getByRole('button', { name: 'Option Lärm verschieben' }).press('ArrowUp');
    await expect(card(6).getByLabel('Option 2', { exact: true })).toHaveValue('Lärm');
    // Entfernen und neu hinzufügen
    await card(6).getByRole('button', { name: 'Option Ruhe entfernen' }).click();
    await expect(card(6).getByTestId('option-row')).toHaveCount(2);
    await card(6).getByRole('button', { name: 'Option hinzufügen' }).click();
    await card(6).getByLabel('Option 3', { exact: true }).fill('Stille');
    await card(7).getByLabel('Bezeichnung', { exact: true }).fill('Ort');
    await card(7).getByLabel('Standardbild').selectOption({ label: 'Fuß plantar' });
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen' })).toBeVisible();

    // Neuer Eintrag zeigt die Felder mit ihrer Konfiguration
    await go(page, '/entry/new');
    await page.getByRole('button', { name: 'Blocktest' }).click();
    const field = (label: string) => page.getByTestId('block-field').filter({ hasText: label });
    await expect(field('Schmerzgrad').getByRole('slider')).toHaveAttribute('max', '20');
    await expect(field('Schmerzgrad').getByRole('slider')).toHaveAttribute('step', '2');
    await expect(field('Schmerzgrad')).toContainText('gar nicht');
    await expect(field('Übelkeit').getByLabel('Notiz')).toBeVisible();
    await expect(field('Stichwort').getByRole('textbox')).toHaveAttribute('maxlength', '5');
    await expect(field('Dauer').getByLabel('Dauer in Minuten')).toBeVisible();
    // Einfachauswahl: zweite Wahl ersetzt die erste; Reihenfolge wie im Editor
    const opts = field('Begleiter').getByRole('button');
    await expect(opts).toHaveText(['Lärm', 'Licht', 'Stille']);
    await opts.nth(0).click();
    await opts.nth(1).click();
    await expect(opts.nth(0)).toHaveAttribute('aria-pressed', 'false');
    await expect(opts.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(field('Ort').getByRole('img', { name: 'Fuß plantar' })).toBeVisible();

    // Bestehende Vorlage ändern: Bezeichnung umbenennen → gespeichert, Zustand bleibt
    await go(page, '/more/templates');
    await page.getByRole('link', { name: 'Blocktest bearbeiten' }).click();
    await expect(card(1).getByLabel('Bezeichnung', { exact: true })).toHaveValue('Schmerzgrad');
    await expect(card(1).getByLabel('Maximum', { exact: true })).toHaveValue('20');
    await card(1).getByLabel('Bezeichnung', { exact: true }).fill('Stärke');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen' })).toBeVisible();
    await go(page, '/entry/new');
    await page.getByRole('button', { name: 'Blocktest' }).click();
    await expect(field('Stärke')).toBeVisible();
  });

  // Editor-Teil von BLK-43 (je Block und alle); die Darstellung im Formular folgt mit M14.15b, daher ohne ID im Namen.
  test('M14.4c Editor: Bezeichnung ausblenden je Feld und für alle bleibt gespeichert', async ({ page }) => {
    await go(page, '/more/templates/new');
    await page.getByLabel('Name', { exact: true }).fill('Ohne Labels');
    for (const type of ['Checkbox', 'Text']) {
      await page.getByRole('group', { name: 'Feld hinzufügen' }).getByRole('button', { name: type, exact: true }).click();
    }
    const card = (n: number) => page.getByRole('region', { name: new RegExp(`^Feld ${n}:`) });
    await card(1).getByLabel('Bezeichnung', { exact: true }).fill('Eins');
    await card(2).getByLabel('Bezeichnung', { exact: true }).fill('Zwei');
    await card(1).getByLabel('Bezeichnung im Formular ausblenden').check();
    await expect(card(2).getByLabel('Bezeichnung im Formular ausblenden')).not.toBeChecked();
    await page.getByRole('button', { name: 'Alle Bezeichnungen ausblenden' }).click();
    await expect(card(2).getByLabel('Bezeichnung im Formular ausblenden')).toBeChecked();
    await page.getByRole('button', { name: 'Alle Bezeichnungen einblenden' }).click();
    await expect(card(1).getByLabel('Bezeichnung im Formular ausblenden')).not.toBeChecked();
    await card(2).getByLabel('Bezeichnung im Formular ausblenden').check();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen' })).toBeVisible();
    await page.getByRole('link', { name: 'Ohne Labels bearbeiten' }).click();
    await expect(card(1).getByLabel('Bezeichnung im Formular ausblenden')).not.toBeChecked();
    await expect(card(2).getByLabel('Bezeichnung im Formular ausblenden')).toBeChecked();
  });
});
