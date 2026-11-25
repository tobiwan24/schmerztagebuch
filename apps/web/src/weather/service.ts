// Wetter beim Speichern und Nachtrag offline erfasster Einträge (Spec 05). Die Entscheidungslogik (Ort, GPS-Schalter,
// Rundung, Pending) liegt pur in `@stb/core` (`resolveEntryWeather`); hier nur die Verdrahtung mit Browser-APIs.
import { initialWeatherMeta, resolveEntryWeather, type DiaryWeatherSettings, type LatLon, type Weather, type WeatherDeps } from '@stb/core';
import { createOpenMeteoClient } from './open-meteo.js';
import type { DiaryRepository } from '../data/repositories/diary.js';

/** Stempel (HLC + Zeit) für eine Änderung am Eintrag. */
export type Stamp = () => Promise<{ hlc: string; at: string }>;

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

    /**
     * Ermittelt das Wetter eines gespeicherten Eintrags mit `weatherPending` (Ort aus `meta.location`, Zeit aus
     * `occurredAt`) und schreibt es mit neuem HLC zurück. Fehlschlag (offline) → bleibt markiert, `false`.
     */
    async complete(repo: DiaryRepository, entryId: string, stamp: Stamp): Promise<boolean> {
      const e = await repo.getEntry(entryId);
      if (!e?.meta.weatherPending || !e.meta.location) return false;
      let weather: Weather;
      try {
        weather = await client.fetchWeather({ lat: e.meta.location.lat, lon: e.meta.location.lon }, e.occurredAt);
      } catch {
        return false;
      }
      // Zwischenzeitlich geändert (z. B. neu bearbeitet)? Dann gehört das Ergebnis nicht mehr zu diesem Stand.
      const fresh = await repo.getEntry(entryId);
      if (!fresh?.meta.weatherPending || fresh.occurredAt !== e.occurredAt) return false;
      const { weatherPending: _drop, ...meta } = fresh.meta;
      void _drop;
      const s = await stamp();
      await repo.saveEntry({ ...fresh, meta: { ...meta, weather }, updatedAt: s.at, hlc: s.hlc });
      return true;
    },

    /**
     * Nach dem Speichern im Hintergrund (Speichern wartet nie auf das Netz, BLK-33): mit GPS-Schalter (`gps` = Einstellungen
     * des Tagebuchs) zuerst die Position bestimmen und als Ort am Eintrag festhalten, danach das Wetter abrufen.
     */
    async followUp(repo: DiaryRepository, entryId: string, gps: DiaryWeatherSettings | null, stamp: Stamp): Promise<void> {
      if (gps) {
        const meta = await initialWeatherMeta({ settings: gps, useGps: true }, weatherDeps);
        const e = await repo.getEntry(entryId);
        if (!meta.location || !e) return;
        const s = await stamp();
        await repo.saveEntry({ ...e, meta: { ...e.meta, ...meta }, updatedAt: s.at, hlc: s.hlc });
      }
      await this.complete(repo, entryId, stamp);
    },

    /** Trägt Wetter für Einträge mit `weatherPending` nach (Ort aus `meta.location`, Zeit aus `occurredAt`). */
    async backfill(repo: DiaryRepository, diaryId: string, nextHlc: () => string): Promise<{ filled: number; stillPending: number }> {
      let filled = 0;
      let stillPending = 0;
      const stamp: Stamp = async () => ({ hlc: nextHlc(), at: new Date(deps.now()).toISOString() });
      for (const e of await repo.listEntries(diaryId)) {
        if (!e.meta.weatherPending || !e.meta.location) continue;
        if (await this.complete(repo, e.id, stamp)) filled++;
        else stillPending++;
      }
      return { filled, stillPending };
    },
  };
}
