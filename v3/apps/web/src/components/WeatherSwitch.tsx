// Schalter „Aktuellen Standort verwenden" für neue Einträge (Spec 05 „Wetter als Metadaten", BLK-33): nur in
// Tagebüchern mit aktivem Wetter, vorbelegt mit `gpsDefault`. Ohne aktives Wetter: kein Schalter, keine Geolocation.
import { useState } from 'react';
import type { DiaryWeatherSettings } from '@stb/core';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useData } from '@/data/DataContext';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';

/** Wetter-Einstellungen des Tagebuchs (`undefined`, solange sie laden). */
export function useDiaryWeatherSettings(diaryId: string | undefined): DiaryWeatherSettings | undefined {
  const data = useData();
  const q = useQuery(async () => (diaryId ? (await data.diary.getDiary(diaryId))?.settings.weather : undefined), [data.diary, diaryId]);
  return q.status === 'ok' ? q.data : undefined;
}

/** Zustand des Schalters; ohne Eingabe gilt die Vorbelegung `gpsDefault`. */
export function useGpsChoice(settings: DiaryWeatherSettings | undefined): [boolean, (v: boolean) => void] {
  const [choice, setChoice] = useState<boolean | null>(null);
  return [choice ?? settings?.gpsDefault ?? false, setChoice];
}

export function WeatherSwitch({ settings, checked, onChange }: { settings: DiaryWeatherSettings | undefined; checked: boolean; onChange: (v: boolean) => void }) {
  if (!settings?.enabled) return null;
  return (
    <div className="flex flex-col gap-1">
      <Label className="min-h-11 gap-3">
        <Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {de.entry.weatherUseGps}
      </Label>
      {!settings.location && !checked ? <p className="text-sm text-muted-foreground">{de.entry.weatherNoLocation}</p> : null}
    </div>
  );
}
