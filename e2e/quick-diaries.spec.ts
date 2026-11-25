import { test, expect } from '@playwright/test';
import { go, onboardWithPassword } from './helpers';

test.describe('Schnelleintrag je Tagebuch', () => {
  test.describe.configure({ timeout: 90_000 });

  test('BLK-37: Auswahl im Editor, Knopf des gewählten Tagebuchs auf Start, /quick?diary= und ohne Parameter das gewählte Tagebuch', async ({ page }) => {
    await onboardWithPassword(page);

    // Ein Tagebuch: ein Knopf; Auswahl im Vorlagen-Editor (BLK-45): nur das Feld „Notizen"
    await go(page, '/');
    await expect(page.getByRole('link', { name: /Schnell eintragen/ })).toHaveCount(1);
    await go(page, '/more/templates');
    await page.getByRole('link', { name: 'Allgemeines Schmerz-Tagebuch bearbeiten' }).click();
    await page.getByTestId('block-editor-card').filter({ has: page.locator('input[value="Notizen"]') }).getByLabel('Im Schnelleintrag').check();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen', exact: true })).toBeVisible();

    await go(page, '/quick');
    await expect(page.getByLabel('Notizen')).toBeVisible();
    await expect(page.getByLabel(/Schmerzstärke/)).toHaveCount(0);

    // Zweites Tagebuch ohne eigene Einstellung (Standardregel: Slider mit Rolle outcome)
    await go(page, '/more/diaries/new');
    await page.getByLabel('Name').fill('Katzentagebuch');
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('radio', { name: /Migräne-Tracking/ }).click();
    await page.getByRole('button', { name: 'Fertig' }).click();
    await expect(page.getByTestId('diary-card')).toHaveCount(2);

    // Start: nur der Knopf des gewählten Tagebuchs (RDM-034), ohne Tagebuch-Namen
    await go(page, '/');
    const switcher = page.getByLabel('Tagebuch', { exact: true });
    await expect(page.getByRole('link', { name: /Schnell eintragen/ })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Schnell eintragen', exact: true })).toBeVisible();

    // /quick ohne Parameter: das gewählte Tagebuch, keine Auswahl
    await go(page, '/quick');
    await expect(page.getByTestId('quick-diary-choice')).toHaveCount(0);
    await expect(page.getByText('jetzt · Allgemeines Schmerz-Tagebuch')).toBeVisible();

    // Katzentagebuch wählen: Standardregel, speichern in ≤ 3 Tipps
    await go(page, '/');
    await switcher.selectOption({ label: 'Katzentagebuch' });
    await expect(page.getByRole('link', { name: /Schnell eintragen/ })).toHaveCount(1);
    await page.getByRole('link', { name: 'Schnell eintragen', exact: true }).click();
    await expect(page.getByText('jetzt · Migräne-Tracking')).toBeVisible();
    const slider = page.getByLabel(/Schmerzstärke/);
    const box = (await slider.boundingBox())!;
    await slider.click({ position: { x: box.width * 0.5, y: box.height / 2 } });
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();

    await go(page, '/history');
    await expect(page.getByTestId('entry-row')).toHaveCount(1);
    await expect(page.getByTestId('entry-row')).toContainText('Migräne-Tracking');

    // Mein Tagebuch: konfiguriertes Feld
    await go(page, '/');
    await switcher.selectOption({ label: 'Mein Tagebuch' });
    await page.getByRole('link', { name: 'Schnell eintragen', exact: true }).click();
    await expect(page.getByText('jetzt · Allgemeines Schmerz-Tagebuch')).toBeVisible();
    await expect(page.getByLabel('Notizen')).toBeVisible();
  });
});
