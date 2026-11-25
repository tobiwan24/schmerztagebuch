import { describe, it, expect, afterEach, vi } from 'vitest';
import { createHlcClock, createTemplate, keyBetween, type BlockDef, type DiaryWeatherSettings, type Entry } from '@stb/core';
import { createWeatherService, type GeolocationLike } from '../../apps/web/src/weather/service.js';
import { createDevice, fixture, startServer } from '../sync/harness.js';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0).reverse()) await c();
});

const OCCURRED = '2026-03-01T10:20:00Z';
const NOW = Date.parse('2026-03-01T10:25:00Z');
const OBS_S = Date.parse('2026-03-01T10:00:00Z') / 1000;

/** Open-Meteo-Antwort mit 48 Stundenwerten bis einschließlich 10:00 UTC. */
function meteoResponse(): Response {
  const time = Array.from({ length: 48 }, (_, i) => OBS_S - (47 - i) * 3600);
  const series = (v: number) => time.map(() => v);
  const pressure = time.map((_, i) => (i === 47 ? 1008 : i === 23 ? 1014 : 1010));
  return new Response(JSON.stringify({
    hourly: {
      time, temperature_2m: series(7.5), apparent_temperature: series(5), surface_pressure: pressure, relative_humidity_2m: series(80),
      precipitation: series(0.2), cloud_cover: series(90), wind_speed_10m: series(14), weather_code: series(61),
    },
  }), { status: 200 });
}

function spies(opts: { offline?: boolean } = {}) {
  const urls: string[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request) => {
    urls.push(String(url));
    if (opts.offline) throw new TypeError('Failed to fetch');
    return meteoResponse();
  }) as unknown as typeof fetch;
  const getCurrentPosition = vi.fn((ok: (p: { coords: { latitude: number; longitude: number } }) => void) => ok({ coords: { latitude: 52.52083, longitude: 13.40944 } }));
  const geolocation: GeolocationLike = { getCurrentPosition };
  return { urls, fetchFn, geolocation, getCurrentPosition };
}

const FIXED: DiaryWeatherSettings = { enabled: true, gpsDefault: false, location: { lat: 48.13743, lon: 11.57549, label: 'München' } };

async function setup() {
  const f = await fixture();
  const server = await startServer(f.diaryId);
  closers.push(server.close);
  const d = await createDevice({ app: server.app, user: 'alice', diaryId: f.diaryId, dk: f.dk, clock: f.clock });
  closers.push(d.close);
  const pain: BlockDef = { id: f.newId(), type: 'slider', label: 'Schmerz', required: false, order: keyBetween(null, null), config: { min: 0, max: 10, step: 1 } };
  const tpl = createTemplate({ id: f.newId(), diaryId: f.diaryId, name: 'T', order: 'V', blocks: [pain] }, f.clock);
  await d.repo.saveTemplate(tpl);
  const hlc = createHlcClock(f.clock, 'devA');
  const entry = (meta: Partial<Entry['meta']>): Entry => ({
    id: f.newId(), diaryId: f.diaryId, templateId: tpl.template.id, templateVersion: 1, occurredAt: OCCURRED, recordedAt: OCCURRED, updatedAt: OCCURRED,
    authorId: 'alice', values: { [pain.id]: 5 }, tags: [], meta: { source: 'app', timezone: 'Europe/Berlin', ...meta }, hlc: hlc.tick(),
  });
  return { ...f, server, d, entry, hlc };
}

describe('Wetter im Client', () => {
  it('BLK-11: Standort wird auf 1 Dezimalstelle gerundet, bevor er das Gerät verlässt (Request-Mitschnitt)', async () => {
    const s = spies();
    const svc = createWeatherService({ fetchFn: s.fetchFn, geolocation: s.geolocation, now: () => NOW });
    await svc.metaFor(FIXED, false, OCCURRED);
    await svc.metaFor({ ...FIXED, gpsDefault: true }, true, OCCURRED);
    expect(s.urls).toHaveLength(2);
    expect(s.urls[0]).toContain('latitude=48.1&longitude=11.6&');
    expect(s.urls[1]).toContain('latitude=52.5&longitude=13.4&');
    for (const u of s.urls) {
      expect(u).not.toMatch(/latitude=-?\d+\.\d{2}/);
      expect(u).not.toMatch(/longitude=-?\d+\.\d{2}/);
      expect(u).not.toContain('München');
    }
  });

  it('BLK-12: Wetter wird im (verschlüsselten) Eintrag gespeichert', async () => {
    const { d, server, entry } = await setup();
    const s = spies();
    const svc = createWeatherService({ fetchFn: s.fetchFn, geolocation: s.geolocation, now: () => NOW });
    const meta = await svc.metaFor(FIXED, false, OCCURRED);
    expect(meta.weather).toMatchObject({ provider: 'open-meteo', observedAt: '2026-03-01T10:00:00.000Z', temperatureC: 7.5, pressureHpa: 1008, pressureDelta24hHpa: -6, weatherCode: 61 });
    const e = entry(meta);
    await d.repo.saveEntry(e);
    expect((await d.repo.getEntry(e.id))?.meta.weather?.temperatureC).toBe(7.5);
    // Wetter steht nur im Payload, nicht in Index-Feldern; beim Server nur als Chiffretext
    const raw = await d.db.records.get(e.id);
    expect(Object.keys(raw ?? {})).not.toContain('weather');
    await d.engine.sync();
    const dump = JSON.stringify(server.db.prepare('SELECT * FROM records').all());
    expect(dump).not.toContain('open-meteo');
    expect(dump).not.toContain('temperatureC');
  });

  it('BLK-12: offline erfasster Eintrag wird als weatherPending markiert und später nachgetragen', async () => {
    const { d, diaryId, entry, hlc } = await setup();
    const off = spies({ offline: true });
    const meta = await createWeatherService({ fetchFn: off.fetchFn, geolocation: off.geolocation, now: () => NOW }).metaFor(FIXED, false, OCCURRED);
    expect(meta).toEqual({ weatherPending: true, location: { lat: 48.1, lon: 11.6, origin: 'diary' } });
    const e = entry(meta);
    await d.repo.saveEntry(e);

    expect(await createWeatherService({ fetchFn: off.fetchFn, geolocation: off.geolocation, now: () => NOW }).backfill(d.repo, diaryId, () => hlc.tick()))
      .toEqual({ filled: 0, stillPending: 1 });

    const on = spies();
    const r = await createWeatherService({ fetchFn: on.fetchFn, geolocation: on.geolocation, now: () => NOW }).backfill(d.repo, diaryId, () => hlc.tick());
    expect(r).toEqual({ filled: 1, stillPending: 0 });
    expect(on.urls[0]).toContain('latitude=48.1&longitude=11.6&');
    const after = await d.repo.getEntry(e.id);
    expect(after?.meta.weatherPending).toBeUndefined();
    expect(after?.meta.weather?.temperatureC).toBe(7.5);
    expect(after?.meta.location).toEqual({ lat: 48.1, lon: 11.6, origin: 'diary' });
    expect(after!.hlc > e.hlc).toBe(true);
  });

  it('BLK-12: Nachtrag älterer Einträge nutzt die Archiv-API', async () => {
    const on = spies();
    const svc = createWeatherService({ fetchFn: on.fetchFn, geolocation: on.geolocation, now: () => NOW + 10 * 86_400_000 });
    await svc.metaFor(FIXED, false, OCCURRED);
    expect(on.urls[0]).toContain('https://archive-api.open-meteo.com/v1/archive?');
    expect(on.urls[0]).toContain('start_date=2026-02-28&end_date=2026-03-01');
  });

  it('BLK-14: Wetter deaktiviert → keine Standortabfrage und kein Request an Open-Meteo', async () => {
    const s = spies();
    const svc = createWeatherService({ fetchFn: s.fetchFn, geolocation: s.geolocation, now: () => NOW });
    expect(await svc.metaFor({ ...FIXED, enabled: false, gpsDefault: true }, true, OCCURRED)).toEqual({});
    expect(s.getCurrentPosition).not.toHaveBeenCalled();
    expect(s.fetchFn).not.toHaveBeenCalled();
  });

  it('BLK-17: ohne GPS-Schalter fester Ort (origin diary) ohne Geolocation-Aufruf; mit Schalter origin gps', async () => {
    const s = spies();
    const svc = createWeatherService({ fetchFn: s.fetchFn, geolocation: s.geolocation, now: () => NOW });
    const fixedMeta = await svc.metaFor(FIXED, false, OCCURRED);
    expect(fixedMeta.location).toEqual({ lat: 48.1, lon: 11.6, origin: 'diary' });
    expect(s.getCurrentPosition).not.toHaveBeenCalled();
    const gpsMeta = await svc.metaFor(FIXED, true, OCCURRED);
    expect(gpsMeta.location).toEqual({ lat: 52.5, lon: 13.4, origin: 'gps' });
    expect(s.getCurrentPosition).toHaveBeenCalledTimes(1);
  });
});
