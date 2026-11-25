import { test, expect, type Page } from '@playwright/test';
import { go, onboardWithPassword, PASSWORD } from './helpers';

async function addEntry(page: Page, template: string | null, note: string) {
  await go(page, '/entry/new');
  if (template) await page.getByRole('button', { name: template }).click();
  await page.getByLabel(/Schmerzstärke/).fill('4');
  await page.getByLabel('Notizen').fill(note);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByTestId('entry-time')).toBeVisible();
}

async function createDiary(page: Page, name: string, template: RegExp) {
  await go(page, '/more/diaries/new');
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: template }).click();
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(page.getByTestId('diary-card')).toHaveCount(2);
}

test.describe('Tagebuch-Umschalter', () => {
  test.describe.configure({ timeout: 90_000 });

  test('UI-24: Umschalter filtert Verlauf und Auswertung (Start hat keine Eintragsliste mehr), setzt die Vorauswahl neuer Einträge und bleibt nach dem Neuladen', async ({ page }) => {
    await onboardWithPassword(page);
    await addEntry(page, null, 'Alpha');
    // Bei nur einem Tagebuch ausgeblendet
    await go(page, '/history');
    await expect(page.getByTestId('entry-row')).toHaveCount(1);
    await expect(page.getByLabel('Tagebuch', { exact: true })).toHaveCount(0);

    await createDiary(page, 'Katzentagebuch', /Migräne-Tracking/);
    const switcher = page.getByLabel('Tagebuch', { exact: true });
    // Neuer Eintrag bietet nur Vorlagen des gewählten Tagebuchs (RDM-034) → erst umschalten
    await go(page, '/');
    await switcher.selectOption({ label: 'Katzentagebuch' });
    await addEntry(page, null, 'Beta');
    await go(page, '/');
    await switcher.selectOption({ label: 'Mein Tagebuch' });
    // Start: Umschalter sichtbar (ein Tagebuch zur Zeit, kein „Alle"), aber keine Eintragsliste mehr
    await go(page, '/');
    await expect(switcher).toBeVisible();
    await expect(switcher.locator('option')).toHaveText(['Mein Tagebuch', 'Katzentagebuch']);
    await expect(page.getByTestId('entry-row')).toHaveCount(0);
    await switcher.selectOption({ label: 'Katzentagebuch' });
    await go(page, '/history');
    await expect(page.getByTestId('entry-row')).toHaveCount(1);
    await expect(page.getByTestId('entry-row')).toContainText('Migräne-Tracking');
    await switcher.selectOption({ label: 'Mein Tagebuch' });
    await expect(page.getByTestId('entry-row')).toHaveCount(1);
    await expect(page.getByTestId('entry-row')).toContainText('Allgemeines Schmerz-Tagebuch');

    // Verlauf: mit „Alle Tagebücher"
    await go(page, '/history');
    await expect(switcher.locator('option')).toHaveText(['Alle Tagebücher', 'Mein Tagebuch', 'Katzentagebuch']);
    await switcher.selectOption({ label: 'Alle Tagebücher' });
    await expect(page.getByTestId('entry-row')).toHaveCount(2);
    await switcher.selectOption({ label: 'Katzentagebuch' });
    await expect(page.getByTestId('entry-row')).toHaveCount(1);

    // Auswertung: Umschalter ist da und wirkt auf die Auswahl der Felder
    await go(page, '/analysis');
    await expect(switcher).toHaveValue(await switcher.locator('option', { hasText: 'Katzentagebuch' }).getAttribute('value') ?? '');

    // Neuer Eintrag: nur die Vorlage des gewählten Tagebuchs (RDM-034)
    await go(page, '/entry/new');
    await expect(page.getByText('Begleitsymptome', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Allgemeines Schmerz-Tagebuch' })).toHaveCount(0);

    // Neu laden, entsperren: Auswahl bleibt
    await page.reload();
    await page.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await go(page, '/history');
    await expect(page.getByTestId('entry-row')).toHaveCount(1);
    await expect(switcher.locator('option:checked')).toHaveText('Katzentagebuch');
  });
});
