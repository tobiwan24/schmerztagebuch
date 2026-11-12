// Wetter beim Speichern und Nachtrag offline erfasster Einträge (Spec 05). Die Entscheidungslogik (Ort, GPS-Schalter,
// Rundung, Pending) liegt pur in `@stb/core` (`resolveEntryWeather`); hier nur die Verdrahtung mit Browser-APIs.
import { resolveEntryWeather, type DiaryWeatherSettings, type Entry, type LatLon, type WeatherDeps } from '@stb/core';
import { createOpenMeteoClient } from './open-meteo.js';
import type { DiaryRepository } from '../data/repositories/diary.js';

/** Minimale Geolocation-Schnittstelle (`navigator.geolocation`). */
export interface GeolocationLike {
  getCurrentPosition(ok: (p: { coords: { latitude: number; longitude: number } }) => void, err: (e: unknown) => void, opts?: object): void;
}

export function geolocationPosition(geo: GeolocationLike): () => Promise<LatLon> {
  return () =>
    new Promise((resolve, reject) =>
      geo.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }), reject, { maximumAge: 600_000, timeout: 10_000 }),
    );
}

export function createWeatherService(deps: { fetchFn: typeof fetch; geolocation: GeolocationLike; now: () => number }) {
  const client = createOpenMeteoClient(deps.fetchFn, deps.now);
  const weatherDeps: WeatherDeps = { fetchWeather: client.fetchWeather, currentPosition: geolocationPosition(deps.geolocation) };

  return {
    /** Wetter-Metadaten für einen neuen Eintrag; ohne Ort/GPS oder deaktiviert → `{}` (keine Abfrage). */
    metaFor(settings: DiaryWeatherSettings, useGps: boolean, occurredAt: string) {
      return resolveEntryWeather({ settings, useGps, occurredAt }, weatherDeps);
    },

    /** Trägt Wetter für Einträge mit `weatherPending` nach (Ort aus `meta.location`, Zeit aus `occurredAt`). */
    async backfill(repo: DiaryRepository, diaryId: string, nextHlc: () => string): Promise<{ filled: number; stillPending: number }> {
      let filled = 0;
      let stillPending = 0;
      for (const e of await repo.listEntries(diaryId)) {
        if (!e.meta.weatherPending || !e.meta.location) continue;
        try {
          const weather = await client.fetchWeather({ lat: e.meta.location.lat, lon: e.meta.location.lon }, e.occurredAt);
          const { weatherPending: _drop, ...meta } = e.meta;
          void _drop;
          const updated: Entry = { ...e, meta: { ...meta, weather }, updatedAt: new Date(deps.now()).toISOString(), hlc: nextHlc() };
          await repo.saveEntry(updated);
          filled++;
        } catch {
          stillPending++;
        }
      }
      return { filled, stillPending };
    },
  };
}
