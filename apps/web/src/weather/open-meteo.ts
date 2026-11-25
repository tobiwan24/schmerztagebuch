// Open-Meteo-Adapter (Spec 05 „Wetter als Metadaten"). Die Abfrage geht direkt vom Gerät an Open-Meteo, nur mit dem
// bereits auf 1 Dezimalstelle gerundeten Ort (BLK-11). Zeitnah (≤ 48 h): Forecast-API mit `past_days`; älter
// (Nachtrag/Migration): Archiv-API. Beide liefern Stundenwerte; die Luftdruckänderung ist der Wert 24 h zuvor.
import type { LatLon, Weather } from '@stb/core';

const HOURLY = [
  'temperature_2m', 'apparent_temperature', 'surface_pressure', 'relative_humidity_2m',
  'precipitation', 'cloud_cover', 'wind_speed_10m', 'weather_code',
] as const;

const RECENT_MS = 48 * 60 * 60 * 1000;
const HOUR_S = 3600;

interface HourlyResponse {
  hourly?: { time?: number[] } & Partial<Record<(typeof HOURLY)[number], (number | null)[]>>;
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function buildOpenMeteoUrl(location: LatLon, occurredAtMs: number, nowMs: number): string {
  const common = `latitude=${location.lat}&longitude=${location.lon}&hourly=${HOURLY.join(',')}&timeformat=unixtime&timezone=GMT`;
  if (nowMs - occurredAtMs <= RECENT_MS && occurredAtMs <= nowMs + HOUR_S * 1000) {
    return `https://api.open-meteo.com/v1/forecast?${common}&past_days=3&forecast_days=1`;
  }
  return `https://archive-api.open-meteo.com/v1/archive?${common}&start_date=${ymd(occurredAtMs - 86_400_000)}&end_date=${ymd(occurredAtMs)}`;
}

export class WeatherUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WeatherUnavailableError';
  }
}

export function createOpenMeteoClient(fetchFn: typeof fetch, now: () => number) {
  return {
    async fetchWeather(location: LatLon, occurredAt: string): Promise<Weather> {
      const occurredAtMs = Date.parse(occurredAt);
      const res = await fetchFn(buildOpenMeteoUrl(location, occurredAtMs, now()));
      if (!res.ok) throw new WeatherUnavailableError(`Open-Meteo HTTP ${res.status}`);
      const body = (await res.json()) as HourlyResponse;
      const h = body.hourly;
      const observedS = Math.floor(occurredAtMs / 1000 / HOUR_S) * HOUR_S;
      const i = h?.time?.indexOf(observedS) ?? -1;
      const at = (k: (typeof HOURLY)[number], idx: number) => h?.[k]?.[idx];
      const value = (k: (typeof HOURLY)[number]) => {
        const v = at(k, i);
        if (typeof v !== 'number') throw new WeatherUnavailableError(`Open-Meteo: ${k} fehlt für ${new Date(observedS * 1000).toISOString()}`);
        return v;
      };
      if (i < 0) throw new WeatherUnavailableError('Open-Meteo: Stunde nicht in der Antwort');
      const pressure = value('surface_pressure');
      const before = at('surface_pressure', i - 24);
      return {
        provider: 'open-meteo',
        fetchedAt: new Date(now()).toISOString(),
        observedAt: new Date(observedS * 1000).toISOString(),
        temperatureC: value('temperature_2m'),
        apparentTemperatureC: value('apparent_temperature'),
        pressureHpa: pressure,
        pressureDelta24hHpa: typeof before === 'number' ? Math.round((pressure - before) * 10) / 10 : 0,
        humidityPct: value('relative_humidity_2m'),
        precipitationMm: value('precipitation'),
        cloudCoverPct: value('cloud_cover'),
        windKmh: value('wind_speed_10m'),
        weatherCode: Math.round(value('weather_code')),
      };
    },
  };
}
