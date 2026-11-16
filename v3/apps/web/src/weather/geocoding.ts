// Ortssuche über die Open-Meteo-Geocoding-API (Spec 05 „Wetter als Metadaten", A-043). Nur der eingegebene Ortsname
// verlässt das Gerät. Gespeichert wird der Ort immer auf 1 Dezimalstelle gerundet (BLK-11/BLK-38).
import { roundLocation, type LatLon } from '@stb/core';

export const GEOCODING_MIN_CHARS = 2;
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

export interface PlaceHit {
  label: string;
  lat: number;
  lon: number;
}

export interface WeatherLocation {
  lat: number;
  lon: number;
  label: string;
}

interface GeocodingResponse {
  results?: { name?: string; admin1?: string; country?: string; latitude?: number; longitude?: number }[];
}

export class GeocodingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeocodingUnavailableError';
  }
}

/** `null`, solange der Suchbegriff (getrimmt) kürzer als 2 Zeichen ist. */
export function buildGeocodingUrl(query: string): string | null {
  const name = query.trim();
  if (name.length < GEOCODING_MIN_CHARS) return null;
  return `${GEOCODING_URL}?name=${encodeURIComponent(name)}&count=5&language=de&format=json`;
}

/** „Ort, Region, Land"; fehlende oder gleichlautende Teile entfallen. */
function placeLabel(r: NonNullable<GeocodingResponse['results']>[number]): string {
  const parts: string[] = [];
  for (const p of [r.name, r.admin1, r.country]) if (p && !parts.includes(p)) parts.push(p);
  return parts.join(', ');
}

export function createGeocodingClient(fetchFn: typeof fetch) {
  return {
    async search(query: string): Promise<PlaceHit[]> {
      const url = buildGeocodingUrl(query);
      if (!url) return [];
      let body: GeocodingResponse;
      try {
        const res = await fetchFn(url);
        if (!res.ok) throw new GeocodingUnavailableError(`Geocoding HTTP ${res.status}`);
        body = (await res.json()) as GeocodingResponse;
      } catch (e) {
        throw e instanceof GeocodingUnavailableError ? e : new GeocodingUnavailableError(e instanceof Error ? e.message : 'Geocoding nicht erreichbar');
      }
      const hits: PlaceHit[] = [];
      for (const r of body.results ?? []) {
        if (typeof r.latitude !== 'number' || typeof r.longitude !== 'number' || !r.name) continue;
        hits.push({ label: placeLabel(r), lat: r.latitude, lon: r.longitude });
      }
      return hits;
    },
  };
}

/** Gewählter Treffer → Ort für `settings.weather.location` (gerundet). */
export function locationFromPlace(hit: PlaceHit): WeatherLocation {
  return { ...roundLocation(hit), label: hit.label };
}

/** „Aktuellen Standort übernehmen" (Open-Meteo hat keine Rückwärtssuche, A-043) → gerundeter Ort. */
export function locationFromPosition(p: LatLon): WeatherLocation {
  const r = roundLocation(p);
  return { ...r, label: `Aktueller Standort (≈ ${r.lat}, ${r.lon})` };
}
