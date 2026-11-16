import { test, expect } from '@playwright/test';
import { go, onboardWithPassword } from './helpers';

test.describe('Schnelleintrag je Tagebuch', () => {
  test.describe.configure({ timeout: 90_000 });

  test('BLK-37: Einstellung je Tagebuch, Knopf je Tagebuch auf Start, /quick?diary= und Auswahl ohne Parameter', async ({ page }) => {
    await onboardWithPassword(page);

    // Ein Tagebuch: ein Knopf; Einstellung: Vorlage + nur das Feld „Notizen"
    await go(page, '/');
    await expect(page.getByRole('link', { name: /Schnell eintragen/ })).toHaveCount(1);
    await go(page, '/more/diaries');
    await page.getByTestId('diary-card').getByRole('link', { name: 'Einstellungen' }).click();
    await page.getByLabel('Vorlage für den Schnelleintrag').selectOption({ label: 'Allgemeines Schmerz-Tagebuch' });
    await page.getByLabel('Notizen', { exact: true }).check();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Gespeichert.')).toBeVisible();

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

    // Start: je Tagebuch ein Knopf
    await go(page, '/');
    await expect(page.getByRole('link', { name: /Schnell eintragen/ })).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'Schnell eintragen · Katzentagebuch' })).toBeVisible();

    // /quick ohne Parameter: Auswahl
    await go(page, '/quick');
    await expect(page.getByTestId('quick-diary-choice').getByRole('link')).toHaveCount(2);

    // Katzentagebuch: Standardregel, speichern in ≤ 3 Tipps
    await go(page, '/');
    await page.getByRole('link', { name: 'Schnell eintragen · Katzentagebuch' }).click();
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
    await page.getByRole('link', { name: 'Schnell eintragen · Mein Tagebuch' }).click();
    await expect(page.getByText('jetzt · Allgemeines Schmerz-Tagebuch')).toBeVisible();
    await expect(page.getByLabel('Notizen')).toBeVisible();
  });
});
