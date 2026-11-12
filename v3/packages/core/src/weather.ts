// Wetter als Metadaten (Spec 05 „Wetter als Metadaten"): pure Regeln + Ablauf mit injizierten Abhängigkeiten.
// Die eigentlichen Requests (Open-Meteo, Geolocation) liefern die Apps über `WeatherDeps`.
import { z } from 'zod';
import type { EntryMeta, Weather } from './templates.js';

export const diaryWeatherSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  /** Fester Ort des Tagebuchs (gerundet gespeichert). */
  location: z.strictObject({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), label: z.string() }).optional(),
  /** GPS pro Eintrag standardmäßig an? */
  gpsDefault: z.boolean(),
});
export type DiaryWeatherSettings = z.infer<typeof diaryWeatherSettingsSchema>;

export interface LatLon {
  lat: number;
  lon: number;
}

/** Schwelle für Neuermittlung bei geänderter Eintragszeit (Spec 05: „deutlich (> 1 h)"). */
export const WEATHER_REFETCH_THRESHOLD_MS = 60 * 60 * 1000;

const round1 = (x: number): number => Math.round(x * 10) / 10 || 0;

/** Ort auf ~10 km (1 Dezimalstelle) runden, bevor er das Gerät verlässt oder gespeichert wird. */
export function roundLocation(p: LatLon): LatLon {
  return { lat: round1(p.lat), lon: round1(p.lon) };
}

/** Muss das Wetter nach Änderung von `occurredAt` neu ermittelt werden? (> 1 h Abstand, BLK-13) */
export function needsWeatherRefetch(previousOccurredAt: string, nextOccurredAt: string): boolean {
  const a = Date.parse(previousOccurredAt);
  const b = Date.parse(nextOccurredAt);
  if (Number.isNaN(a) || Number.isNaN(b)) throw new RangeError('Ungültiger Zeitpunkt');
  return Math.abs(b - a) > WEATHER_REFETCH_THRESHOLD_MS;
}

export type WeatherPlan =
  | { action: 'none'; reason: 'disabled' | 'no-location' }
  | { action: 'fetch'; origin: 'diary'; location: LatLon }
  | { action: 'fetch'; origin: 'gps' };

/**
 * Entscheidet, ob und woher Wetter ermittelt wird. Ohne festen Ort und ohne GPS-Schalter: keine Abfrage (BLK-18).
 * `useGps` ist der Schalter „Aktuellen Standort verwenden" im Formular (Vorbelegung `gpsDefault`).
 */
export function planWeather(settings: DiaryWeatherSettings, useGps: boolean): WeatherPlan {
  if (!settings.enabled) return { action: 'none', reason: 'disabled' };
  if (useGps) return { action: 'fetch', origin: 'gps' };
  if (settings.location) return { action: 'fetch', origin: 'diary', location: roundLocation(settings.location) };
  return { action: 'none', reason: 'no-location' };
}

export interface WeatherDeps {
  /** Open-Meteo-Abfrage für einen (bereits gerundeten) Ort zum Zeitpunkt `occurredAt`. */
  fetchWeather(location: LatLon, occurredAt: string): Promise<Weather>;
  /** Geolocation; wird nur aufgerufen, wenn der GPS-Schalter aktiv ist. */
  currentPosition(): Promise<LatLon>;
}

export type EntryWeatherMeta = Pick<EntryMeta, 'weather' | 'weatherPending' | 'location'>;

/**
 * Ermittelt die Wetter-Metadaten eines Eintrags. Kein Plan → `{}` (kein `weatherPending`).
 * GPS nicht verfügbar → Rückfall auf den festen Ort, sonst kein Wetter (DECISIONS A-009).
 * Abruf fehlgeschlagen (offline) → `weatherPending: true` mit gerundetem Ort für den späteren Nachtrag.
 */
export async function resolveEntryWeather(
  input: { settings: DiaryWeatherSettings; useGps: boolean; occurredAt: string },
  deps: WeatherDeps,
): Promise<EntryWeatherMeta> {
  const plan = planWeather(input.settings, input.useGps);
  if (plan.action === 'none') return {};

  let location: LatLon;
  let origin: 'diary' | 'gps';
  if (plan.origin === 'gps') {
    try {
      location = roundLocation(await deps.currentPosition());
      origin = 'gps';
    } catch {
      const fallback = planWeather(input.settings, false);
      if (fallback.action !== 'fetch' || fallback.origin !== 'diary') return {};
      location = fallback.location;
      origin = 'diary';
    }
  } else {
    location = plan.location;
    origin = 'diary';
  }

  const stored = { lat: location.lat, lon: location.lon, origin };
  try {
    return { weather: await deps.fetchWeather(location, input.occurredAt), location: stored };
  } catch {
    return { weatherPending: true, location: stored };
  }
}
