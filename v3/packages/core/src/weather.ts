// Wetter als Metadaten (Spec 05 „Wetter als Metadaten"): pure Regeln + Ablauf mit injizierten Abhängigkeiten.
// Die eigentlichen Requests (Open-Meteo, Geolocation) liefern die Apps über `WeatherDeps`.
import { z } from 'zod';
import type { Entry, EntryMeta, Weather } from './templates.js';

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
 * Wetter-Metadaten beim Speichern eines neuen Eintrags, **ohne** Netzabfrage (BLK-32): fester Ort → sofort
 * `weatherPending` + gerundeter Ort (`origin: 'diary'`); mit GPS-Schalter erst nach der Positionsbestimmung
 * (`origin: 'gps'`, Rückfall auf den festen Ort, A-009). Kein Plan → `{}`.
 */
export async function initialWeatherMeta(
  input: { settings: DiaryWeatherSettings; useGps: boolean },
  deps: Pick<WeatherDeps, 'currentPosition'>,
): Promise<EntryWeatherMeta> {
  const plan = planWeather(input.settings, input.useGps);
  if (plan.action === 'none') return {};
  if (plan.origin === 'gps') {
    try {
      const p = roundLocation(await deps.currentPosition());
      return { weatherPending: true, location: { lat: p.lat, lon: p.lon, origin: 'gps' } };
    } catch {
      const fallback = planWeather(input.settings, false);
      if (fallback.action !== 'fetch' || fallback.origin !== 'diary') return {};
      return { weatherPending: true, location: { lat: fallback.location.lat, lon: fallback.location.lon, origin: 'diary' } };
    }
  }
  return { weatherPending: true, location: { lat: plan.location.lat, lon: plan.location.lon, origin: 'diary' } };
}

/**
 * Meta eines bearbeiteten Eintrags (BLK-32): Ändert sich `occurredAt` um mehr als 1 h und ist ein Ort gespeichert,
 * wird das Wetter am **gespeicherten** Ort neu ermittelt (`weatherPending`, altes Wetter entfällt). GPS wird beim
 * Bearbeiten nie abgefragt; ohne gespeicherten Ort bleibt alles unverändert.
 */
export function metaForEdit(previous: Pick<Entry, 'occurredAt' | 'meta'>, nextOccurredAt: string): EntryMeta {
  if (!previous.meta.location || !needsWeatherRefetch(previous.occurredAt, nextOccurredAt)) return previous.meta;
  const { weather: _old, ...rest } = previous.meta;
  void _old;
  return { ...rest, weatherPending: true };
}

/**
 * Ermittelt die Wetter-Metadaten eines Eintrags. Kein Plan → `{}` (kein `weatherPending`).
 * GPS nicht verfügbar → Rückfall auf den festen Ort, sonst kein Wetter (DECISIONS A-009).
 * Abruf fehlgeschlagen (offline) → `weatherPending: true` mit gerundetem Ort für den späteren Nachtrag.
 */
export async function resolveEntryWeather(
  input: { settings: DiaryWeatherSettings; useGps: boolean; occurredAt: string },
  deps: WeatherDeps,
): Promise<EntryWeatherMeta> {
  const initial = await initialWeatherMeta(input, deps);
  if (!initial.location) return {};
  try {
    return { weather: await deps.fetchWeather({ lat: initial.location.lat, lon: initial.location.lon }, input.occurredAt), location: initial.location };
  } catch {
    return initial;
  }
}
