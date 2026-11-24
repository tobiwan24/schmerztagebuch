// Onboarding-Schritte nach dem Konto (Spec 10): erstes Tagebuch (Name, Art) → Wetter-Ort (optional) → Vorlage aus dem Katalog oder leer.
import { useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import { TEMPLATE_CATALOG, type DiarySubject } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldLegend, FieldSet } from '@/components/ui/field';
import { LocationPicker } from '@/components/LocationPicker';
import type { WeatherLocation } from '@/weather/geocoding';
import { deOnboarding } from '@/i18n/lazy/onboarding';

export interface DiaryChoice {
  name: string;
  subject: DiarySubject;
  /** Optionaler fester Wetter-Ort (Onboarding-Schritt). */
  location?: WeatherLocation;
}

const SUBJECTS: readonly DiarySubject[] = ['human', 'animal', 'other'];

export function DiaryStep({ onNext, initialName = deOnboarding.diaryDefaultName }: { onNext: (c: DiaryChoice) => void; initialName?: string }) {
  const [name, setName] = useState<string>(initialName);
  const [subject, setSubject] = useState<DiarySubject>('human');
  const [error, setError] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(true);
    onNext({ name: name.trim(), subject });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{deOnboarding.diaryTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="diary-name">{deOnboarding.diaryName}</Label>
            <Input id="diary-name" value={name} aria-invalid={error} onChange={(e) => (setName(e.target.value), setError(false))} />
            {error ? <p className="text-sm text-destructive">{deOnboarding.diaryNameMissing}</p> : null}
          </div>
          <FieldSet className="flex flex-col gap-2">
            <FieldLegend variant="label" className="mb-2">{deOnboarding.diarySubject}</FieldLegend>
            <div className="grid grid-cols-3 gap-2">
              {SUBJECTS.map((s) => (
                <Button key={s} type="button" variant={subject === s ? 'default' : 'outline'} aria-pressed={subject === s} onClick={() => setSubject(s)}>
                  {deOnboarding.subjects[s]}
                </Button>
              ))}
            </div>
          </FieldSet>
          <Button type="submit">{deOnboarding.next}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Optionaler Schritt „Ort für das Wetter" (Spec 10, BLK-39): ohne Ort bleibt das Wetter aus. */
export function LocationStep({ onDone }: { onDone: (location: WeatherLocation | undefined) => void }) {
  const [location, setLocation] = useState<WeatherLocation | undefined>();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{deOnboarding.locationTitle}</CardTitle>
        <CardDescription>{deOnboarding.locationHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <LocationPicker idPrefix="onboarding-location" value={location} onChange={(l) => setLocation(l ?? undefined)} />
        <Button type="button" variant={location ? 'default' : 'outline'} onClick={() => onDone(location)}>
          {location ? deOnboarding.next : deOnboarding.locationLater}
        </Button>
      </CardContent>
    </Card>
  );
}

/** `null` = leer beginnen. */
export function TemplateStep({ busy, onDone }: { busy: boolean; onDone: (catalogId: string | null) => void }) {
  const [choice, setChoice] = useState<string | null>(TEMPLATE_CATALOG[0]?.id ?? null);
  const options = [...TEMPLATE_CATALOG.map((c) => ({ id: c.id as string | null, name: c.name, hint: c.description })), { id: null, name: deOnboarding.templateEmpty, hint: deOnboarding.templateEmptyHint }];
  return (
    <>
      <h2 className="text-lg font-semibold">{deOnboarding.templateTitle}</h2>
      <div role="radiogroup" aria-label={deOnboarding.templateTitle} className="flex flex-col gap-2">
        {options.map((o) => (
          <Button
            key={o.id ?? 'empty'}
            type="button"
            role="radio"
            aria-checked={choice === o.id}
            variant={choice === o.id ? 'default' : 'outline'}
            className="h-auto justify-between py-3 text-left"
            onClick={() => setChoice(o.id)}
          >
            <span className="flex flex-col whitespace-normal">
              <span>{o.name}</span>
              <span className="text-xs opacity-80">{o.hint}</span>
            </span>
            {choice === o.id ? <Check aria-hidden /> : null}
          </Button>
        ))}
      </div>
      <Button disabled={busy} onClick={() => onDone(choice)}>
        {busy ? deOnboarding.working : deOnboarding.finish}
      </Button>
    </>
  );
}
