// Schnelleintrag (Spec 05, Wireframe schnelleintrag.html): Tipp 1 „Schnell eintragen" · Tipp 2 Wert · Tipp 3 Speichern.
// Zeitpunkt = jetzt, `meta.source = 'quick'`; weitere Felder später im Eintrag ergänzbar. Pflichtfelder gelten hier nicht.
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { initialWeatherMeta, quickEntryOptions, valuesToSave, type DiaryWeatherSettings, type Diary, type Entry, type FormValues, type QuickEntrySelection, type TemplateState } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { FieldLegend, FieldSet } from '@/components/ui/field';
import { TemplateIcon } from '@/components/TemplateIcon';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/StateView';
import { WeatherSwitch, useDiaryWeatherSettings, useGpsChoice } from '@/components/WeatherSwitch';
import { BlockField } from '@/components/blocks/BlockField';
import { LlmFillButton } from '@/components/LlmFillButton';
import { LlmDraftNotice, LlmMarked } from '@/components/LlmDraftNotice';
import { applyFill, type FillDraft } from '@/llm/fill';
import type { LlmFillResponse } from '@stb/sync-protocol';
import { useData } from '@/data/DataContext';
import { useWritableDiaries } from '@/data/useSharing';
import { useActiveDiary } from '@/data/diary-scope';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';
import { deQuick } from '@/i18n/lazy/quick';

export function QuickPage() {
  const data = useData();
  const navigate = useNavigate();
  const [values, setValues] = useState<FormValues>({});
  const [empty, setEmpty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [draft, setDraft] = useState<FillDraft | null>(null);
  const [llmChanged, setLlmChanged] = useState<ReadonlySet<string>>(new Set());
  const [params] = useSearchParams();
  const wanted = params.get('diary');
  const templateParam = params.get('template');
  const writable = useWritableDiaries();
  const writableIds = writable.status === 'ok' ? writable.data.map((d) => d.id).join() : null;
  const active = useActiveDiary();
  // Ohne Angabe: das gewählte Tagebuch, falls beschreibbar (RDM-034); sonst bei mehreren beschreibbaren Tagebüchern die Auswahl (A-041).
  const query = useQuery<{ choose: Diary[] | null; options: QuickEntrySelection[]; lastTemplateId: string | null }>(async () => {
    if (writable.status !== 'ok' || !active.ready) return { choose: null, options: [], lastTemplateId: null };
    const list = writable.data;
    // `?template=` ohne `diary`: das Tagebuch der Vorlage bestimmt die Auswahl (RDM-028 P2).
    const templateDiaryId = !wanted && templateParam ? (await data.diary.listAllTemplates()).find((x) => x.id === templateParam)?.diaryId : undefined;
    const activeWritable = active.diaryId && list.some((d) => d.id === active.diaryId) ? active.diaryId : null;
    const diaryId = wanted ?? (templateDiaryId && list.some((d) => d.id === templateDiaryId) ? templateDiaryId : null) ?? (templateParam ? null : activeWritable);
    if (!diaryId && list.length > 1) return { choose: list, options: [], lastTemplateId: null };
    const diary = diaryId ? list.find((d) => d.id === diaryId) : list[0];
    if (!diary) return { choose: null, options: [], lastTemplateId: null };
    const states = (await Promise.all((await data.diary.listTemplates(diary.id)).map((t) => data.diary.getTemplate(t.id)))).filter(
      (s): s is TemplateState => s !== undefined,
    );
    // Vorausgewählt: die Vorlage des zuletzt gespeicherten Eintrags (A-070), sonst die erste.
    const last = (await data.diary.listEntries(diary.id)).reduce<Entry | null>((a, e) => (!a || e.recordedAt > a.recordedAt ? e : a), null);
    return { choose: null, options: quickEntryOptions(diary, states), lastTemplateId: last?.templateId ?? null };
  }, [data.diary, wanted, templateParam, writableIds, active.diaryId, active.ready]);
  const options = query.status === 'ok' ? query.data.options : [];
  const selection = (query.status === 'ok' ? options.find((o) => o.state.template.id === (chosen ?? (templateParam && options.some((x) => x.state.template.id === templateParam) ? templateParam : query.data.lastTemplateId))) : undefined) ?? options[0] ?? null;
  const switchTo = (id: string) => {
    if (id === selection?.state.template.id) return;
    if (Object.keys(valuesToSave(selection!.state.version, values)).length > 0) setPending(id);
    else setChosen(id);
  };
  const weatherSettings = useDiaryWeatherSettings(selection?.state.template.diaryId);
  const [useGps, setUseGps] = useGpsChoice(weatherSettings);
  // Der KI-Entwurf gilt nur für die Schnelleintrag-Felder der gewählten Vorlage (das Modell sieht nur diese Blöcke).
  const quickVersion = selection ? { ...selection.state.version, blocks: selection.blocks } : null;
  function onDraft(response: LlmFillResponse) {
    if (!quickVersion) return;
    const d = applyFill(quickVersion, values, response);
    setValues(d.values);
    setEmpty(false);
    setLlmChanged(new Set(d.changed));
    setDraft(d);
  }

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
      <PageHeader title={deQuick.title} back />
      {query.status === 'loading' ? <p className="text-muted-foreground">{de.app.loading}</p> : null}
      {query.status === 'error' ? <ErrorState onRetry={query.retry} /> : null}
      {query.status === 'ok' && query.data.choose ? (
        <section data-testid="quick-diary-choice" className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">{deQuick.chooseDiary}</h2>
          {query.data.choose.map((d) => (
            <Button key={d.id} asChild variant="outline" className="h-14 justify-start text-base">
              <Link to={`/quick?diary=${d.id}`}>{d.name}</Link>
            </Button>
          ))}
        </section>
      ) : null}
      {selection && options.length > 1 ? (
        <FieldSet className="flex flex-col gap-2" data-testid="quick-template-choice">
          <FieldLegend variant="label" className="mb-2">{deQuick.template}</FieldLegend>
          <div className="flex flex-wrap gap-2">
            {options.map((o) => {
              const active = o.state.template.id === selection.state.template.id;
              return (
                <Button key={o.state.template.id} type="button" size="sm" className="h-auto min-h-9 max-w-full whitespace-normal py-1 text-left" variant={active ? 'default' : 'outline'} aria-pressed={active} onClick={() => switchTo(o.state.template.id)}>
                  <TemplateIcon icon={o.state.template.icon} color={o.state.template.color} className={active ? 'text-primary-foreground' : undefined} />
                  {o.state.template.name}
                </Button>
              );
            })}
          </div>
        </FieldSet>
      ) : null}
      {query.status === 'ok' && writable.status === 'ok' && !query.data.choose && (!selection || selection.blocks.length === 0) ? (
        <>
          <EmptyState title={deQuick.noBlocksTitle} hint={deQuick.noBlocksHint} />
          <Button asChild variant="outline">
            <Link to="/entry/new">{de.start.newEntry}</Link>
          </Button>
        </>
      ) : null}
      {selection && selection.blocks.length > 0 ? (
        <form className="flex flex-col gap-6" noValidate onSubmit={(e) => (e.preventDefault(), void save())}>
          <p className="text-sm text-muted-foreground">{deQuick.now(selection.state.template.name)}</p>
          {quickVersion ? <LlmFillButton templateName={selection.state.template.name} version={quickVersion} onDraft={onDraft} /> : null}
          {draft ? <LlmDraftNotice draft={draft} onDismiss={() => setDraft(null)} /> : null}
          {selection.blocks.map((def) => (
            <LlmMarked key={def.id} marked={llmChanged.has(def.id)}>
              <BlockField
                def={def} diaryId={selection.state.template.diaryId} value={values[def.id]} invalid={false} itemId={data.newId}
                onChange={(v) => {
                  setValues({ ...values, [def.id]: v });
                  setEmpty(false);
                  if (llmChanged.has(def.id)) setLlmChanged((prev) => new Set([...prev].filter((id) => id !== def.id)));
                }}
              />
            </LlmMarked>
          ))}
          <WeatherSwitch settings={weatherSettings} checked={useGps} onChange={setUseGps} />
          {empty ? (
            <p role="alert" className="text-sm text-destructive">
              {deQuick.emptyHint}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="h-14 w-full text-base" disabled={saving}>
            {saving ? de.entry.saving : de.entry.save}
          </Button>
          <Button asChild variant="ghost">
            <Link to="/entry/new">{deQuick.moreFields}</Link>
          </Button>
        </form>
      ) : null}
      <Dialog open={pending !== null} onClose={() => setPending(null)} aria-labelledby="quick-switch-title">
        <DialogTitle id="quick-switch-title">{de.entry.switchTitle}</DialogTitle>
        <DialogDescription>{de.entry.switchHint}</DialogDescription>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setPending(null)}>
            {de.entry.keepEditing}
          </Button>
          <Button type="button" variant="destructive" onClick={() => (setChosen(pending), setValues({}), setEmpty(false), setPending(null), setDraft(null), setLlmChanged(new Set()))}>
            {de.entry.switchConfirm}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
