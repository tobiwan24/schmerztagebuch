// Mehr → Tagebücher → Einstellungen (Spec 10, UI-14): Name, Zeitzone, Wetter an/aus, GPS-Vorbelegung.
// Nur der Besitzer ändert; Mitglieder mit anderer Rolle sehen die Werte nur lesend (Spec 09).
import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { updateDiarySettings, type Diary } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/StateView';
import { useData } from '@/data/DataContext';
import { useMembers } from '@/data/useSharing';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';

const t = de.diaries;

function timeZones(current: string): string[] {
  let all: string[] = [];
  try {
    all = Intl.supportedValuesOf('timeZone');
  } catch {
    all = [];
  }
  return [...new Set([current, 'UTC', ...all])].sort();
}

export function DiarySettingsPage() {
  const { id = '' } = useParams();
  const data = useData();
  const members = useMembers(id);
  const query = useQuery(() => data.diary.getDiary(id), [data.diary, id]);
  const readOnly = members.query.status === 'ok' && members.query.data.cloud && members.query.data.myRole !== 'owner';
  return (
    <>
      <PageHeader title={t.settingsTitle} back />
      {query.status === 'loading' ? <p className="text-muted-foreground">{de.app.loading}</p> : null}
      {query.status === 'error' ? <ErrorState onRetry={query.retry} /> : null}
      {query.status === 'ok' && !query.data ? <ErrorState detail={t.notFound} /> : null}
      {query.status === 'ok' && query.data && members.query.status !== 'loading' ? <SettingsForm key={query.data.id} diary={query.data} readOnly={readOnly} /> : null}
    </>
  );
}

function SettingsForm({ diary, readOnly }: { diary: Diary; readOnly: boolean }) {
  const data = useData();
  const [name, setName] = useState(diary.name);
  const [timezone, setTimezone] = useState(diary.settings.timezone);
  const [enabled, setEnabled] = useState(diary.settings.weather.enabled);
  const [gpsDefault, setGpsDefault] = useState(diary.settings.weather.gpsDefault);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const nameInvalid = showErrors && name.trim() === '';

  async function save(e: FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    if (name.trim() === '') return setShowErrors(true);
    setBusy(true);
    setSaved(false);
    try {
      const s = await data.stamper.stamp();
      const current = (await data.diary.getDiary(diary.id)) ?? diary;
      await data.diary.saveDiary(updateDiarySettings(current, { name, timezone, weather: { enabled, gpsDefault } }, { hlc: s.hlc, updatedAt: s.at }));
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-6" noValidate onSubmit={(e) => void save(e)}>
      {readOnly ? <p role="status" className="text-sm text-muted-foreground">{t.readOnly}</p> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="diary-name">{t.name}</Label>
        <Input id="diary-name" value={name} disabled={readOnly} aria-invalid={nameInvalid} onChange={(e) => (setName(e.target.value), setSaved(false))} />
        {nameInvalid ? <p role="alert" className="text-sm text-destructive">{t.nameRequired}</p> : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="diary-timezone">{t.timezone}</Label>
        <Select id="diary-timezone" value={timezone} disabled={readOnly} onChange={(e) => (setTimezone(e.target.value), setSaved(false))}>
          {timeZones(diary.settings.timezone).map((z) => (
            <option key={z} value={z}>{z}</option>
          ))}
        </Select>
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">{t.weatherTitle}</legend>
        <Label className="min-h-11 gap-3">
          <Checkbox checked={enabled} disabled={readOnly} onChange={(e) => (setEnabled(e.target.checked), setSaved(false))} />
          {t.weatherEnabled}
        </Label>
        <Label className="min-h-11 gap-3">
          <Checkbox checked={gpsDefault} disabled={readOnly} onChange={(e) => (setGpsDefault(e.target.checked), setSaved(false))} />
          {t.gpsDefault}
        </Label>
        {enabled && !diary.settings.weather.location && !gpsDefault ? <p className="text-sm text-muted-foreground">{t.weatherNoLocation}</p> : null}
      </fieldset>
      {readOnly ? null : (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy}>{busy ? t.saving : t.save}</Button>
          {saved ? <p role="status" className="text-sm text-muted-foreground">{t.saved}</p> : null}
        </div>
      )}
    </form>
  );
}
