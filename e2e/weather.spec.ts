// Wetter beim Speichern (BLK-33). Open-Meteo und Geocoding sind immer per `page.route` gemockt (nie echtes Netz);
// der Service Worker ist blockiert, weil WebKit sonst `page.route` umgeht.
import { test, expect, type Page } from '@playwright/test';
import { go, onboardWithPassword } from './helpers';

const CORS = { 'access-control-allow-origin': '*' };
const BERLIN = { results: [{ name: 'Berlin', admin1: 'Berlin', country: 'Deutschland', latitude: 52.52437, longitude: 13.41053 }] };

interface StoredEntry {
  meta: { source: string; weather?: { temperatureC: number }; weatherPending?: boolean; location?: { lat: number; lon: number; origin: string } };
}

/** 50 Stundenwerte rund um jetzt, damit die beobachtete Stunde und der Wert 24 h zuvor enthalten sind. */
function meteoBody() {
  const hour = Math.floor(Date.now() / 3_600_000) * 3600;
  const time = Array.from({ length: 50 }, (_, i) => hour - 47 * 3600 + i * 3600);
  const series = (v: number) => time.map(() => v);
  return {
    hourly: {
      time, temperature_2m: series(7.5), apparent_temperature: series(5), surface_pressure: series(1010), relative_humidity_2m: series(80),
      precipitation: series(0.2), cloud_cover: series(90), wind_speed_10m: series(14), weather_code: series(61),
    },
  };
}

async function storedEntries(page: Page): Promise<StoredEntry[]> {
  return page.evaluate(
    () =>
      new Promise<StoredEntry[]>((resolve) => {
        const open = indexedDB.open('stb-v3');
        open.onsuccess = () => {
          const all = open.result.transaction('records').objectStore('records').getAll();
          all.onsuccess = () => resolve((all.result as { kind: string; payload: string }[]).filter((r) => r.kind === 'entry').map((r) => JSON.parse(r.payload) as StoredEntry));
        };
      }),
  );
}

/** Open-Meteo mockt; Antworten warten, bis `release()` aufgerufen wird. `requests` zählt die Anfragen. */
async function mockMeteo(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const state = { requests: 0, release };
  await page.route('https://api.open-meteo.com/**', async (route) => {
    state.requests++;
    await gate;
    await route.fulfill({ json: meteoBody(), headers: CORS });
  });
  await page.route('https://geocoding-api.open-meteo.com/**', (route) => route.fulfill({ json: BERLIN, headers: CORS }));
  return state;
}

async function configureDiary(page: Page, opts: { location: boolean; gpsDefault?: boolean }) {
  await go(page, '/more/diaries');
  await page.getByTestId('diary-card').getByRole('link', { name: 'Einstellungen' }).click();
  if (opts.location) {
    await page.getByLabel('Ort suchen').fill('Berlin');
    await page.getByRole('button', { name: 'Berlin, Deutschland' }).click();
  } else {
    await page.getByLabel('Wetter zu jedem Eintrag speichern').check();
  }
  if (opts.gpsDefault) await page.getByLabel('Aktuellen Standort standardmäßig verwenden').check();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Gespeichert.')).toBeVisible();
}

test.describe('Wetter beim Speichern', () => {
  test.use({ geolocation: { latitude: 48.13743, longitude: 11.57549 }, permissions: ['geolocation'], serviceWorkers: 'block' });

  test('BLK-33: Eintragsformular mit festem Ort: Speichern navigiert vor der Antwort, danach meta.weather (diary)', async ({ page }) => {
    const meteo = await mockMeteo(page);
    await onboardWithPassword(page);
    await configureDiary(page, { location: true });
    await go(page, '/entry/new');
    await expect(page.getByLabel('Aktuellen Standort verwenden')).not.toBeChecked();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page).toHaveURL(/\/entry\/[0-9a-f-]+$/);

    // Open-Meteo hat noch nicht geantwortet: Eintrag trägt Ort und weatherPending
    await expect.poll(() => meteo.requests).toBe(1);
    const [pending] = await storedEntries(page);
    expect(pending!.meta.weatherPending).toBe(true);
    expect(pending!.meta.location).toEqual({ lat: 52.5, lon: 13.4, origin: 'diary' });
    expect(pending!.meta.weather).toBeUndefined();

    meteo.release();
    await expect.poll(async () => (await storedEntries(page))[0]!.meta.weather?.temperatureC).toBe(7.5);
    const [done] = await storedEntries(page);
    expect(done!.meta.weatherPending).toBeUndefined();
    expect(done!.meta.location).toEqual({ lat: 52.5, lon: 13.4, origin: 'diary' });
  });

  test('BLK-33: Schalter „Aktuellen Standort verwenden" (vorbelegt mit gpsDefault) → origin gps mit gerundeter Position, auch im Schnelleintrag', async ({ page }) => {
    const meteo = await mockMeteo(page);
    meteo.release();
    await onboardWithPassword(page);
    await configureDiary(page, { location: true, gpsDefault: true });

    await go(page, '/entry/new');
    await expect(page.getByLabel('Aktuellen Standort verwenden')).toBeChecked();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page).toHaveURL(/\/entry\/[0-9a-f-]+$/);
    await expect.poll(async () => (await storedEntries(page))[0]?.meta.weather?.temperatureC).toBe(7.5);
    expect((await storedEntries(page))[0]!.meta.location).toEqual({ lat: 48.1, lon: 11.6, origin: 'gps' });

    await go(page, '/quick');
    await expect(page.getByLabel('Aktuellen Standort verwenden')).toBeChecked();
    const slider = page.getByLabel(/Schmerzstärke/);
    const box = (await slider.boundingBox())!;
    await slider.click({ position: { x: box.width * 0.6, y: box.height / 2 } });
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
    await expect
      .poll(async () => (await storedEntries(page)).find((e) => e.meta.source === 'quick')?.meta.weather?.temperatureC)
      .toBe(7.5);
    expect((await storedEntries(page)).find((e) => e.meta.source === 'quick')!.meta.location).toEqual({ lat: 48.1, lon: 11.6, origin: 'gps' });
  });

  test('BLK-33: Wetter aus → kein Schalter, keine Geolocation, kein Request', async ({ page }) => {
    const meteo = await mockMeteo(page);
    meteo.release();
    await page.addInitScript(() => {
      const w = window as unknown as { __geo: number };
      w.__geo = 0;
      const orig = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      navigator.geolocation.getCurrentPosition = (...a) => (w.__geo++, orig(...a));
    });
    await onboardWithPassword(page);
    await go(page, '/entry/new');
    await expect(page.getByLabel('Aktuellen Standort verwenden')).toHaveCount(0);
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page).toHaveURL(/\/entry\/[0-9a-f-]+$/);
    await page.waitForTimeout(500);
    const [e] = await storedEntries(page);
    expect(e!.meta.weather).toBeUndefined();
    expect(e!.meta.weatherPending).toBeUndefined();
    expect(meteo.requests).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __geo: number }).__geo)).toBe(0);
  });
});
