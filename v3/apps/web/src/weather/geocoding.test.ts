import { describe, expect, it, vi } from 'vitest';
import { buildGeocodingUrl, createGeocodingClient, GeocodingUnavailableError, locationFromPlace, locationFromPosition } from './geocoding';

const BODY = {
  results: [
    { name: 'Berlin', admin1: 'Berlin', country: 'Deutschland', latitude: 52.52437, longitude: 13.41053 },
    { name: 'Berlin', admin1: 'New Hampshire', country: 'USA', latitude: 44.46895, longitude: -71.18508 },
    { name: 'Bern', country: 'Schweiz', latitude: 46.94809, longitude: 7.44744 },
  ],
};

describe('Geocoding', () => {
  it('BLK-38: Anfrage erst ab 2 Zeichen, count=5 und language=de', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(BODY)));
    const client = createGeocodingClient(fetchFn as unknown as typeof fetch);
    expect(await client.search(' b ')).toEqual([]);
    expect(await client.search('')).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(buildGeocodingUrl('b')).toBeNull();
    await client.search(' Köln ');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = new URL((fetchFn.mock.calls[0] as unknown as [string])[0]);
    expect(url.origin + url.pathname).toBe('https://geocoding-api.open-meteo.com/v1/search');
    expect(url.searchParams.get('name')).toBe('Köln');
    expect(url.searchParams.get('count')).toBe('5');
    expect(url.searchParams.get('language')).toBe('de');
  });

  it('BLK-38: Treffer als „Ort, Region, Land"; fehlende Teile und doppelte Namen entfallen', async () => {
    const client = createGeocodingClient((async () => new Response(JSON.stringify(BODY))) as unknown as typeof fetch);
    const hits = await client.search('Ber');
    expect(hits.map((h) => h.label)).toEqual(['Berlin, Deutschland', 'Berlin, New Hampshire, USA', 'Bern, Schweiz']);
    expect(await createGeocodingClient((async () => new Response('{}')) as unknown as typeof fetch).search('xx')).toEqual([]);
  });

  it('BLK-38: gewählter Ort und Standort werden auf 1 Dezimalstelle gerundet', async () => {
    const client = createGeocodingClient((async () => new Response(JSON.stringify(BODY))) as unknown as typeof fetch);
    const [hit] = await client.search('Berlin');
    expect(locationFromPlace(hit!)).toEqual({ lat: 52.5, lon: 13.4, label: 'Berlin, Deutschland' });
    expect(locationFromPosition({ lat: 48.13743, lon: 11.57549 })).toEqual({ lat: 48.1, lon: 11.6, label: 'Aktueller Standort (≈ 48.1, 11.6)' });
  });

  it('BLK-38: Fehler und Offline werfen GeocodingUnavailableError', async () => {
    const http = createGeocodingClient((async () => new Response('x', { status: 500 })) as unknown as typeof fetch);
    await expect(http.search('Berlin')).rejects.toBeInstanceOf(GeocodingUnavailableError);
    const offline = createGeocodingClient((async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch);
    await expect(offline.search('Berlin')).rejects.toBeInstanceOf(GeocodingUnavailableError);
  });
});
