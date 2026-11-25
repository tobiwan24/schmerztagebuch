import { test, expect, type Page } from '@playwright/test';
import { go, onboardWithPassword } from './helpers';

const names = (page: Page) => page.getByTestId('template-row').locator('span.flex-1 > span:first-child').allTextContents();

test.describe('Vorlagen-Editor', () => {
  test.beforeEach(async ({ page }) => {
    await onboardWithPassword(page);
  });

  test('RDM-028: neue Vorlage hat Standardfarbe Schwarz, Schwarz steht in der Farbpalette', async ({ page }) => {
    await go(page, '/more/templates');
    await page.getByRole('link', { name: 'Neue leere Vorlage' }).click();
    await expect(page.getByRole('button', { name: 'Schwarz' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('Name', { exact: true }).fill('Ohne Farbwahl');
    await page.getByRole('button', { name: 'Speichern' }).click();
    const row = page.getByTestId('template-row').filter({ hasText: 'Ohne Farbwahl' });
    await expect(row.getByTestId('template-icon')).toHaveAttribute('data-color', 'black');
    await expect(row.getByTestId('template-icon')).toHaveClass(/text-foreground/);
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
    await expect(page.getByRole('heading', { name: 'Vorlagen', exact: true })).toBeVisible();
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
    await expect(page.getByRole('heading', { name: 'Vorlagen', exact: true })).toBeVisible();

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
    await expect(page.getByRole('heading', { name: 'Vorlagen', exact: true })).toBeVisible();
    await go(page, '/entry/new');
    await page.getByRole('button', { name: 'Blocktest' }).click();
    await expect(field('Stärke')).toBeVisible();
  });

  test('BLK-25: Felder per Tastatur und Ziehen umsortieren, entfernen (neue Version, entferntes Feld bleibt sichtbar), Warnung beim Verlassen nur nach echter Änderung', async ({ page }) => {
    // Hohes Fenster: Ziehen mit der Maus braucht alle Karten im sichtbaren Bereich
    await page.setViewportSize({ width: 600, height: 2400 });
    await go(page, '/more/templates/new');
    await page.getByLabel('Name', { exact: true }).fill('Reihe');
    for (const label of ['Alpha', 'Beta', 'Gamma']) {
      await page.getByRole('group', { name: 'Feld hinzufügen' }).getByRole('button', { name: 'Text', exact: true }).click();
      await page.getByRole('region', { name: /^Feld [0-9]+: Text$/ }).last().getByLabel('Bezeichnung', { exact: true }).fill(label);
    }
    // Ein Typwechsel wird nicht angeboten
    await expect(page.getByRole('region', { name: /^Feld 1:/ }).getByLabel('Typ')).toHaveCount(0);
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen', exact: true })).toBeVisible();

    // Eintrag mit allen drei Feldern (Version 1)
    await go(page, '/entry/new');
    await page.getByRole('button', { name: 'Reihe' }).click();
    await page.getByLabel('Gamma').fill('Wert-G');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('entry-field').filter({ hasText: 'Gamma' })).toContainText('Wert-G');
    const entryUrl = page.url();

    const labels = () => page.getByTestId('block-editor-card').getByLabel('Bezeichnung', { exact: true }).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    await go(page, '/more/templates');
    await page.getByRole('link', { name: 'Reihe bearbeiten' }).click();
    await expect.poll(labels).toEqual(['Alpha', 'Beta', 'Gamma']);

    // Tastatur: Gamma zweimal nach oben
    const gamma = page.getByRole('button', { name: 'Feld Gamma verschieben' });
    await gamma.press('ArrowUp');
    await gamma.press('ArrowUp');
    await expect.poll(labels).toEqual(['Gamma', 'Alpha', 'Beta']);
    // Ziehen: Beta mit der Maus über Gamma ziehen
    const grip = await page.getByRole('button', { name: 'Feld Beta verschieben' }).boundingBox();
    const top = await page.getByRole('region', { name: /^Feld 1:/ }).boundingBox();
    await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip!.x + grip!.width / 2, top!.y + 5, { steps: 12 });
    await page.mouse.up();
    await expect.poll(labels).toEqual(['Beta', 'Gamma', 'Alpha']);
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen', exact: true })).toBeVisible();

    // Neuer Eintrag zeigt die neue Reihenfolge
    await go(page, '/entry/new');
    await page.getByRole('button', { name: 'Reihe' }).click();
    await expect(page.getByTestId('block-field').locator('label').first()).toContainText('Beta');
    await expect(page.getByTestId('block-field')).toHaveCount(3);

    // Entfernen: Gamma weg → neue Version; der ältere Eintrag zeigt den Wert weiter, ohne Hinweis (RDM-028 P5)
    await go(page, '/more/templates');
    await page.getByRole('link', { name: 'Reihe bearbeiten' }).click();
    await page.getByRole('button', { name: 'Feld Gamma entfernen' }).click();
    await expect.poll(labels).toEqual(['Beta', 'Alpha']);
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen', exact: true })).toBeVisible();
    await go(page, new URL(entryUrl).pathname);
    await expect(page.getByTestId('entry-field').filter({ hasText: 'Gamma' })).toContainText('Wert-G');
    await expect(page.getByTestId('entry-field').filter({ hasText: 'Gamma' })).not.toContainText('archiviertes Feld');

    // Warnung: ohne echte Änderung keine Abfrage (auch nach Hinzufügen und Entfernen), nach Änderung schon
    await go(page, '/more/templates');
    await page.getByRole('link', { name: 'Reihe bearbeiten' }).click();
    await page.getByRole('group', { name: 'Feld hinzufügen' }).getByRole('button', { name: 'Text', exact: true }).click();
    await page.getByRole('button', { name: /^Feld .* entfernen$/ }).last().click();
    const nav = (name: string) => page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name });
    await nav('Start').click();
    await expect(page).toHaveURL(/[/]$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await go(page, '/more/templates');
    await page.getByRole('link', { name: 'Reihe bearbeiten' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Reihe 2');
    await nav('Start').click();
    await expect(page.getByRole('dialog', { name: 'Änderungen verwerfen?' })).toBeVisible();
    await page.getByRole('button', { name: 'Weiter bearbeiten' }).click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Reihe 2');
    await nav('Start').click();
    await page.getByRole('button', { name: 'Verwerfen' }).click();
    await expect(page).toHaveURL(/[/]$/);
    await go(page, '/more/templates');
    await expect(page.getByTestId('template-row').filter({ hasText: 'Reihe 2' })).toHaveCount(0);
    await expect(page.getByTestId('template-row').filter({ hasText: 'Reihe' })).toHaveCount(1);
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
    await expect(page.getByRole('heading', { name: 'Vorlagen', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Ohne Labels bearbeiten' }).click();
    await expect(card(1).getByLabel('Bezeichnung im Formular ausblenden')).not.toBeChecked();
    await expect(card(2).getByLabel('Bezeichnung im Formular ausblenden')).toBeChecked();
  });
});
