// Schnelleintrag (Spec 05, Wireframe schnelleintrag.html): Tipp 1 „Schnell eintragen" · Tipp 2 Wert · Tipp 3 Speichern.
// Zeitpunkt = jetzt, `meta.source = 'quick'`; weitere Felder später im Eintrag ergänzbar. Pflichtfelder gelten hier nicht.
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { initialWeatherMeta, quickEntrySelection, valuesToSave, type DiaryWeatherSettings, type Diary, type Entry, type FormValues, type QuickEntrySelection, type TemplateState } from '@stb/core';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/StateView';
import { WeatherSwitch, useDiaryWeatherSettings, useGpsChoice } from '@/components/WeatherSwitch';
import { BlockField } from '@/components/blocks/BlockField';
import { useData } from '@/data/DataContext';
import { useWritableDiaries } from '@/data/useSharing';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';

export function QuickPage() {
  const data = useData();
  const navigate = useNavigate();
  const [values, setValues] = useState<FormValues>({});
  const [empty, setEmpty] = useState(false);
  const [saving, setSaving] = useState(false);
  const wanted = useSearchParams()[0].get('diary');
  const writable = useWritableDiaries();
  const writableIds = writable.status === 'ok' ? writable.data.map((d) => d.id).join() : null;
  // Mehrere beschreibbare Tagebücher ohne Angabe → Auswahl (A-041); sonst das gewählte bzw. einzige Tagebuch.
  const query = useQuery<{ choose: Diary[] | null; selection: QuickEntrySelection | null }>(async () => {
    if (writable.status !== 'ok') return { choose: null, selection: null };
    const list = writable.data;
    if (!wanted && list.length > 1) return { choose: list, selection: null };
    const diary = wanted ? list.find((d) => d.id === wanted) : list[0];
    if (!diary) return { choose: null, selection: null };
    const states = (await Promise.all((await data.diary.listTemplates(diary.id)).map((t) => data.diary.getTemplate(t.id)))).filter(
      (s): s is TemplateState => s !== undefined,
    );
    return { choose: null, selection: quickEntrySelection(diary, states) };
  }, [data.diary, wanted, writableIds]);
  const selection = query.status === 'ok' ? query.data.selection : null;
  const weatherSettings = useDiaryWeatherSettings(selection?.state.template.diaryId);
  const [useGps, setUseGps] = useGpsChoice(weatherSettings);

  async function save() {
    if (!selection) return;
    const { state } = selection;
    const toSave = valuesToSave(state.version, values);
    if (Object.keys(toSave).length === 0) return setEmpty(true);
    setSaving(true);
    try {
      const s = await data.stamper.stamp();
      const settings = (await data.diary.getDiary(state.template.diaryId))?.settings.weather;
      const initialMeta = settings && !useGps ? await initialWeatherMeta({ settings, useGps: false }, { currentPosition: () => Promise.reject(new Error('GPS aus')) }) : {};
      const gpsFollowUp: DiaryWeatherSettings | null = settings?.enabled && useGps ? settings : null;
      const entry: Entry = {
        id: data.newId(), diaryId: state.template.diaryId, templateId: state.template.id, templateVersion: state.version.version,
        occurredAt: s.at, recordedAt: s.at, updatedAt: s.at, authorId: s.authorId, values: toSave, tags: [],
        meta: { source: 'quick', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', ...initialMeta }, hlc: s.hlc,
      };
      await data.diary.saveEntry(entry);
      if (gpsFollowUp || entry.meta.weatherPending) void data.weather.followUp(data.diary, entry.id, gpsFollowUp, data.stamper.stamp).catch(() => undefined);
      void navigate('/', { replace: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title={de.quick.title} back />
      {query.status === 'loading' ? <p className="text-muted-foreground">{de.app.loading}</p> : null}
      {query.status === 'error' ? <ErrorState onRetry={query.retry} /> : null}
      {query.status === 'ok' && query.data.choose ? (
        <section data-testid="quick-diary-choice" className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">{de.quick.chooseDiary}</h2>
          {query.data.choose.map((d) => (
            <Button key={d.id} asChild variant="outline" className="h-14 justify-start text-base">
              <Link to={`/quick?diary=${d.id}`}>{d.name}</Link>
            </Button>
          ))}
        </section>
      ) : null}
      {query.status === 'ok' && writable.status === 'ok' && !query.data.choose && (!selection || selection.blocks.length === 0) ? (
        <>
          <EmptyState title={de.quick.noBlocksTitle} hint={de.quick.noBlocksHint} />
          <Button asChild variant="outline">
            <Link to="/entry/new">{de.start.newEntry}</Link>
          </Button>
        </>
      ) : null}
      {selection && selection.blocks.length > 0 ? (
        <form className="flex flex-col gap-6" noValidate onSubmit={(e) => (e.preventDefault(), void save())}>
          <p className="text-sm text-muted-foreground">{de.quick.now(selection.state.template.name)}</p>
          {selection.blocks.map((def) => (
            <BlockField key={def.id} def={def} diaryId={selection.state.template.diaryId} value={values[def.id]} invalid={false} onChange={(v) => (setValues({ ...values, [def.id]: v }), setEmpty(false))} />
          ))}
          <WeatherSwitch settings={weatherSettings} checked={useGps} onChange={setUseGps} />
          {empty ? (
            <p role="alert" className="text-sm text-destructive">
              {de.quick.emptyHint}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="h-14 w-full text-base" disabled={saving}>
            {saving ? de.entry.saving : de.entry.save}
          </Button>
          <Button asChild variant="ghost">
            <Link to="/entry/new">{de.quick.moreFields}</Link>
          </Button>
        </form>
      ) : null}
    </>
  );
}
