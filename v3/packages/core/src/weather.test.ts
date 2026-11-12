import { describe, it, expect, vi } from 'vitest';
import { needsWeatherRefetch, planWeather, resolveEntryWeather, roundLocation, type WeatherDeps } from './weather.js';
import type { Weather } from './templates.js';

const weather: Weather = {
  provider: 'open-meteo', fetchedAt: '2026-03-01T10:05:00Z', observedAt: '2026-03-01T10:00:00Z',
  temperatureC: 8, apparentTemperatureC: 6, pressureHpa: 1012, pressureDelta24hHpa: -4, humidityPct: 70,
  precipitationMm: 0, cloudCoverPct: 80, windKmh: 12, weatherCode: 3,
};

function deps(over: Partial<WeatherDeps> = {}): WeatherDeps {
  return {
    fetchWeather: vi.fn(async () => weather),
    currentPosition: vi.fn(async () => ({ lat: 52.5208, lon: 13.4094 })),
    ...over,
  };
}

const fixed = { lat: 48.137, lon: 11.575, label: 'München' };
const at = '2026-03-01T10:20:00+01:00';

describe('Wetter-Regeln', () => {
  it('BLK-13: occurredAt-Änderung um mehr als 1 h löst Neuermittlung aus', () => {
    expect(needsWeatherRefetch('2026-03-01T10:00:00Z', '2026-03-01T11:00:01Z')).toBe(true);
    expect(needsWeatherRefetch('2026-03-01T10:00:00Z', '2026-03-01T08:30:00Z')).toBe(true);
    expect(needsWeatherRefetch('2026-03-02T10:00:00Z', '2026-03-01T10:00:00Z')).toBe(true);
  });

  it('BLK-13: Änderung um höchstens 1 h löst keine Neuermittlung aus (auch über Zeitzonen-Schreibweisen)', () => {
    expect(needsWeatherRefetch('2026-03-01T10:00:00Z', '2026-03-01T11:00:00Z')).toBe(false);
    expect(needsWeatherRefetch('2026-03-01T10:00:00Z', '2026-03-01T10:45:00Z')).toBe(false);
    expect(needsWeatherRefetch('2026-03-01T10:00:00Z', '2026-03-01T11:30:00+01:00')).toBe(false);
  });

  it('BLK-18: ohne festen Ort und ohne GPS-Schalter: kein Plan, kein Request, kein weatherPending', async () => {
    const settings = { enabled: true, gpsDefault: false };
    expect(planWeather(settings, false)).toEqual({ action: 'none', reason: 'no-location' });
    const d = deps();
    const meta = await resolveEntryWeather({ settings, useGps: false, occurredAt: at }, d);
    expect(meta).toEqual({});
    expect(d.fetchWeather).not.toHaveBeenCalled();
    expect(d.currentPosition).not.toHaveBeenCalled();
  });

  it('BLK-18: Wetter deaktiviert: weder Standort noch Request, auch mit festem Ort und GPS', async () => {
    const settings = { enabled: false, gpsDefault: true, location: fixed };
    expect(planWeather(settings, true)).toEqual({ action: 'none', reason: 'disabled' });
    const d = deps();
    expect(await resolveEntryWeather({ settings, useGps: true, occurredAt: at }, d)).toEqual({});
    expect(d.fetchWeather).not.toHaveBeenCalled();
    expect(d.currentPosition).not.toHaveBeenCalled();
  });

  it('BLK-18: fester Ort ohne GPS → Abfrage mit gerundetem Tagebuch-Ort (origin diary)', async () => {
    const settings = { enabled: true, gpsDefault: false, location: fixed };
    expect(planWeather(settings, false)).toEqual({ action: 'fetch', origin: 'diary', location: { lat: 48.1, lon: 11.6 } });
    const d = deps();
    const meta = await resolveEntryWeather({ settings, useGps: false, occurredAt: at }, d);
    expect(meta).toEqual({ weather, location: { lat: 48.1, lon: 11.6, origin: 'diary' } });
    expect(d.fetchWeather).toHaveBeenCalledWith({ lat: 48.1, lon: 11.6 }, at);
    expect(d.currentPosition).not.toHaveBeenCalled();
  });

  it('BLK-18: GPS-Schalter → Standort, gerundet (origin gps); Fehler beim Abruf → weatherPending', async () => {
    const settings = { enabled: true, gpsDefault: true };
    const d = deps({ fetchWeather: vi.fn(async () => { throw new Error('offline'); }) });
    const meta = await resolveEntryWeather({ settings, useGps: true, occurredAt: at }, d);
    expect(meta).toEqual({ weatherPending: true, location: { lat: 52.5, lon: 13.4, origin: 'gps' } });
    expect(d.fetchWeather).toHaveBeenCalledWith({ lat: 52.5, lon: 13.4 }, at);
  });

  it('BLK-18: GPS nicht verfügbar → fester Ort als Rückfall, ohne festen Ort kein Wetter', async () => {
    const fail = { currentPosition: vi.fn(async () => { throw new Error('denied'); }) };
    const withFixed = await resolveEntryWeather({ settings: { enabled: true, gpsDefault: true, location: fixed }, useGps: true, occurredAt: at }, deps(fail));
    expect(withFixed.location).toEqual({ lat: 48.1, lon: 11.6, origin: 'diary' });
    const d = deps(fail);
    expect(await resolveEntryWeather({ settings: { enabled: true, gpsDefault: true }, useGps: true, occurredAt: at }, d)).toEqual({});
    expect(d.fetchWeather).not.toHaveBeenCalled();
  });

  it('BLK-18: roundLocation rundet auf 1 Dezimalstelle', () => {
    expect(roundLocation({ lat: 48.149, lon: -0.051 })).toEqual({ lat: 48.1, lon: -0.1 });
  });
});
