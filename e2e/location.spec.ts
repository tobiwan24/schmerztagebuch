import { test, expect, type Page } from '@playwright/test';
import { PASSWORD, go, onboardWithPassword } from './helpers';

const BERLIN = { results: [{ name: 'Berlin', admin1: 'Berlin', country: 'Deutschland', latitude: 52.52437, longitude: 13.41053 }] };

/** Geocoding immer gemockt (nie echtes Open-Meteo); liefert die angefragten URLs zurück. */
async function mockGeocoding(page: Page): Promise<string[]> {
  const urls: string[] = [];
  await page.route('https://geocoding-api.open-meteo.com/**', async (route) => {
    urls.push(route.request().url());
    await route.fulfill({ json: BERLIN, headers: { 'access-control-allow-origin': '*' } });
  });
  return urls;
}

async function openSettings(page: Page) {
  await go(page, '/more/diaries');
  await page.getByTestId('diary-card').getByRole('link', { name: 'Einstellungen' }).click();
  await expect(page.getByRole('heading', { name: 'Tagebuch-Einstellungen' })).toBeVisible();
}

test.describe('Wetter-Ort', () => {
  // Service Worker blockieren: In WebKit umgeht der SW-Abruf sonst `page.route` und träfe das echte Open-Meteo.
  test.use({ geolocation: { latitude: 48.13743, longitude: 11.57549 }, permissions: ['geolocation'], serviceWorkers: 'block' });

  test('BLK-39: Ort in den Tagebuch-Einstellungen per Suche setzen und entfernen', async ({ page }) => {
    const urls = await mockGeocoding(page);
    await onboardWithPassword(page);
    await openSettings(page);
    await expect(page.getByText('Ohne Ort kein Wetter.')).toBeVisible();

    await page.getByLabel('Ort suchen').fill('B');
    await page.waitForTimeout(700);
    expect(urls).toHaveLength(0); // ab 2 Zeichen
    await page.getByLabel('Ort suchen').fill('Berl');
    await page.getByRole('button', { name: 'Berlin, Deutschland' }).click();
    await expect(page.getByTestId('location-current')).toContainText('Berlin, Deutschland');
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('count=5');
    expect(urls[0]).toContain('language=de');
    await expect(page.getByLabel('Wetter zu jedem Eintrag speichern')).toBeChecked();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Gespeichert.')).toBeVisible();

    await go(page, '/more');
    await openSettings(page);
    await expect(page.getByTestId('location-current')).toContainText('Berlin, Deutschland');
    await expect(page.getByLabel('Wetter zu jedem Eintrag speichern')).toBeChecked();

    await page.getByRole('button', { name: 'Ort entfernen' }).click();
    await expect(page.getByLabel('Wetter zu jedem Eintrag speichern')).not.toBeChecked();
    await expect(page.getByText('Ohne Ort kein Wetter.')).toBeVisible();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Gespeichert.')).toBeVisible();
    await go(page, '/more');
    await openSettings(page);
    await expect(page.getByTestId('location-current')).toHaveCount(0);
  });

  test('BLK-39: aktuellen Standort übernehmen (gerundet); Fehler der Ortssuche speichert nichts', async ({ page }) => {
    await page.route('https://geocoding-api.open-meteo.com/**', (route) => route.fulfill({ status: 500, body: 'x', headers: { 'access-control-allow-origin': '*' } }));
    await onboardWithPassword(page);
    await openSettings(page);
    await page.getByLabel('Ort suchen').fill('Berlin');
    await expect(page.getByText('Die Ortssuche ist gerade nicht erreichbar. Es wurde nichts gespeichert.')).toBeVisible();
    await expect(page.getByTestId('location-current')).toHaveCount(0);

    await page.getByRole('button', { name: 'Aktuellen Standort übernehmen' }).click();
    await expect(page.getByTestId('location-current')).toContainText('Aktueller Standort (≈ 48.1, 11.6)');
    await expect(page.getByLabel('Wetter zu jedem Eintrag speichern')).toBeChecked();
  });

  test('BLK-39: Onboarding-Schritt „Ort für das Wetter" setzt den Ort des ersten Tagebuchs', async ({ page }) => {
    await mockGeocoding(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: /Nur auf diesem Gerät/ }).click();
    await page.getByRole('button', { name: 'Mit Passwort' }).click();
    await page.getByLabel('Passwort (mindestens 8 Zeichen)').fill(PASSWORD);
    await page.getByLabel('Passwort wiederholen').fill(PASSWORD);
    await page.getByRole('button', { name: 'Konto anlegen' }).click();
    await page.getByLabel('Ich habe den Code sicher aufbewahrt').check({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: 'Weiter' }).click(); // Tagebuch-Schritt
    await expect(page.getByText('Ort für das Wetter', { exact: true })).toBeVisible();
    await page.getByLabel('Ort suchen').fill('Berlin');
    await page.getByRole('button', { name: 'Berlin, Deutschland' }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('radio', { name: /Allgemeines Schmerz-Tagebuch/ }).click();
    await page.getByRole('button', { name: 'Fertig' }).click();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible({ timeout: 30_000 });

    await openSettings(page);
    await expect(page.getByTestId('location-current')).toContainText('Berlin, Deutschland');
    await expect(page.getByLabel('Wetter zu jedem Eintrag speichern')).toBeChecked();
  });
});
