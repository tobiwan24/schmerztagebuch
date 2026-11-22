// Ort für das Wetter festlegen (Spec 05 „Wetter als Metadaten", BLK-39): Ortssuche über die Open-Meteo-Geocoding-API
// (entprellt, ab 2 Zeichen) oder aktueller Standort. Der Ort wird gerundet (1 Dezimalstelle) an den Aufrufer gegeben.
import { useEffect, useMemo, useState } from 'react';
import { LocateFixed, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createGeocodingClient, GEOCODING_MIN_CHARS, locationFromPlace, locationFromPosition, type PlaceHit, type WeatherLocation } from '@/weather/geocoding';
import { geolocationPosition } from '@/weather/service';
import { deLocation } from '@/i18n/lazy/location';

const t = deLocation;
const DEBOUNCE_MS = 400;

interface SearchResult {
  query: string;
  hits: PlaceHit[];
  failed: boolean;
}

export interface LocationPickerProps {
  value: WeatherLocation | undefined;
  /** `null` = Ort entfernt. */
  onChange: (location: WeatherLocation | null) => void;
  disabled?: boolean;
  idPrefix?: string;
}

export function LocationPicker({ value, onChange, disabled = false, idPrefix = 'location' }: LocationPickerProps) {
  const client = useMemo(() => createGeocodingClient((input, init) => fetch(input, init)), []);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateFailed, setLocateFailed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (debounced.length < GEOCODING_MIN_CHARS) return;
    let cancelled = false;
    client
      .search(debounced)
      .then((hits) => !cancelled && setResult({ query: debounced, hits, failed: false }))
      .catch(() => !cancelled && setResult({ query: debounced, hits: [], failed: true }));
    return () => {
      cancelled = true;
    };
  }, [client, debounced]);

  const active = debounced.length >= GEOCODING_MIN_CHARS && query.trim() === debounced;
  const current = active && result?.query === debounced ? result : null;
  const searching = active && !current;

  function choose(hit: PlaceHit) {
    onChange(locationFromPlace(hit));
    setQuery('');
    setDebounced('');
  }

  async function useCurrent() {
    setLocating(true);
    setLocateFailed(false);
    try {
      onChange(locationFromPosition(await geolocationPosition(navigator.geolocation)(), t.currentLabel));
    } catch {
      setLocateFailed(true);
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-md border p-3" data-testid="location-current">
          <p className="text-sm">
            <span className="text-muted-foreground">{t.current}: </span>
            {value.label}
          </p>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange(null)}>
            <X aria-hidden />
            {t.remove}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-search`}>{t.searchLabel}</Label>
        <Input id={`${idPrefix}-search`} value={query} disabled={disabled} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
        <p className="text-xs text-muted-foreground">{t.searchHint}</p>
        {searching ? <p role="status" className="text-sm text-muted-foreground">{t.searching}</p> : null}
        {current?.failed ? <p role="alert" className="text-sm text-destructive">{t.searchError}</p> : null}
        {current && !current.failed && current.hits.length === 0 ? <p role="status" className="text-sm text-muted-foreground">{t.noHits}</p> : null}
        {current && current.hits.length > 0 ? (
          <ul aria-label={t.hits} className="flex flex-col gap-1">
            {current.hits.map((h) => (
              <li key={`${h.label}-${h.lat}-${h.lon}`}>
                <Button type="button" variant="outline" className="h-auto min-h-11 w-full justify-start whitespace-normal py-2 text-left" onClick={() => choose(h)}>
                  {h.label}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Button type="button" variant="outline" disabled={disabled || locating} onClick={() => void useCurrent()}>
        <LocateFixed aria-hidden />
        {locating ? t.locating : t.useCurrent}
      </Button>
      {locateFailed ? <p role="alert" className="text-sm text-destructive">{t.locateError}</p> : null}
    </div>
  );
}
