// Eintragsformular (Spec 05 „Einträge", Wireframe eintrag.html): Vorlage, Zeitangabe Zeitpunkt/Zeitraum, Blöcke,
// Pflichtfelder (BLK-07), Warnung bei ungespeicherten Änderungen nur nach echter Änderung (BLK-09), Speichern unten fixiert.
import { cn } from '@/lib/utils';
import { TOUR_RING } from '@/tour/anchor';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useBlocker, useNavigate } from 'react-router';
import {
  checkAttachmentFile,
  initialValues,
  initialWeatherMeta,
  isDirty,
  metaForEdit,
  missingRequired,
  nowTimeInput,
  sortedBlocks,
  timeInputFrom,
  timeToEntry,
  updateTemplate,
  upgradeEntryVersion,
  validateTime,
  valuesToSave,
  type AttachmentMeta,
  type DiaryWeatherSettings,
  type Entry,
  type FormSnapshot,
  type FormValues,
  type Template,
  type TemplateVersion,
  type TimeInput,
} from '@stb/core';
import { Button } from '@/components/ui/button';
import { TagInput } from '@/components/TagInput';
import { TemplateIcon } from '@/components/TemplateIcon';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { WeatherSwitch, useDiaryWeatherSettings, useGpsChoice } from '@/components/WeatherSwitch';
import { BlockField } from '@/components/blocks/BlockField';
import { LlmFillButton } from '@/components/LlmFillButton';
import { LlmDraftNotice, LlmMarked } from '@/components/LlmDraftNotice';
import { applyFill, type FillDraft } from '@/llm/fill';
import type { AttachmentApi } from '@/components/blocks/TextareaField';
import type { LlmFillResponse } from '@stb/sync-protocol';
import { useData } from '@/data/DataContext';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';

const SWIPE_PX = 60;

/** Angehängte, noch nicht gespeicherte Datei (BLK-30: erst beim Speichern wird geschrieben). */
interface PendingAttachment {
  meta: AttachmentMeta;
  bytes: Uint8Array<ArrayBuffer>;
  previewUrl?: string;
}

interface Loaded {
  template: Template;
  version: TemplateVersion;
}

/** Vorbelegung beim Duplizieren (BLK-36): Werte und Tags des Originals, Zeitpunkt = jetzt. */
export interface EntryPrefill {
  templateId: string;
  values: FormValues;
  tags: string[];
}

export function EntryForm({ templates, entry, prefill }: { templates: Template[]; entry?: Entry; prefill?: EntryPrefill }) {
  const data = useData();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const loadedRef = useRef<Loaded | null>(null);
  loadedRef.current = loaded;
  const [initial, setInitial] = useState<FormSnapshot | null>(null);
  const [current, setCurrent] = useState<FormSnapshot | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const leaving = useRef(false);
  /** Eintrags-ID steht beim Öffnen fest, damit Anhänge schon vor dem Speichern auf den Eintrag verweisen können (BLK-30). */
  const entryId = useRef(entry?.id ?? data.newId());
  const [pending, setPending] = useState<Map<string, PendingAttachment>>(new Map());
  /** Bearbeiten: vorhandene Anhänge, die der Nutzer entfernt hat — gelöscht erst beim Speichern. */
  const removedExisting = useRef<Set<string>>(new Set());
  const swipe = useRef<{ x: number; y: number } | null>(null);
  /** Vorlagenwechsel mit Eingaben erst nach Rückfrage (BLK-42, BLK-09-Regel). */
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  /** Bearbeiten: Eintrag bleibt auf älterer Version, weil beim Heben ein Wert verloren ginge (BLK-27). */
  const [keptOldVersion, setKeptOldVersion] = useState(false);
  /** Duplizieren: gilt nur für die erste Vorlagenwahl beim Öffnen. */
  const prefillRef = useRef(prefill);
  /** KI-Entwurf (Spec 08): Hinweis und markierte Felder; nur Anzeige, gespeichert wird erst durch den Nutzer. */
  const [draft, setDraft] = useState<FillDraft | null>(null);
  const [llmChanged, setLlmChanged] = useState<ReadonlySet<string>>(new Set());

  function clearPending() {
    setPending((prev) => {
      for (const p of prev.values()) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      return new Map();
    });
  }

  // Vorlage laden. Neu: aktuelle Version. Bearbeiten: aktuelle Version, wenn kein Wert verloren geht, sonst die Version
  // des Eintrags (Spec 02, A-038).
  async function selectTemplate(templateId: string, discard = false) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    let version: TemplateVersion | undefined;
    if (entry) {
      const currentState = await data.diary.getTemplate(entry.templateId);
      const up = currentState ? upgradeEntryVersion(entry, currentState.version) : undefined;
      version = up?.upgraded ? currentState?.version : await data.diary.getTemplateVersion(entry.templateId, entry.templateVersion);
      setKeptOldVersion(!!currentState && !up?.upgraded && currentState.version.version > entry.templateVersion);
    } else {
      version = (await data.diary.getTemplate(templateId))?.version;
    }
    if (!version) return;
    const fill = prefillRef.current?.templateId === templateId ? prefillRef.current : undefined;
    prefillRef.current = undefined;
    const next: FormSnapshot = entry
      ? { templateId, values: { ...entry.values }, time: timeInputFrom(entry), tags: entry.tags }
      : fill
        ? { templateId, values: { ...initialValues(version), ...fill.values }, time: nowTimeInput(data.now()), tags: fill.tags }
        : { templateId, values: initialValues(version), time: current?.time ?? nowTimeInput(data.now()), tags: current?.tags ?? [] };
    if (!entry) clearPending();
    setLoaded({ template, version });
    // Vorlagenwechsel ohne Eingabe ist keine Änderung (BLK-09): Ausgangszustand wandert mit.
    setInitial((prev) => (!discard && prev && current && isDirty(prev, current) ? prev : next));
    setCurrent(next);
    setShowErrors(false);
    setDraft(null);
    setLlmChanged(new Set());
  }

  useEffect(() => {
    const first = entry?.templateId ?? prefill?.templateId ?? templates[0]?.id;
    if (first) void selectTemplate(first);
    // Nur beim Öffnen; spätere Wechsel über die Auswahl.
  }, []);

  // Vorschläge: Tags der vorhandenen Einträge des Tagebuchs (BLK-28).
  const diaryId = loaded?.template.diaryId;
  const known = useQuery(async () => (diaryId ? (await data.diary.listEntries(diaryId)).map((e) => e.tags) : []), [data.diary, diaryId]);
  const knownTags = known.status === 'ok' ? known.data : [];

  const existing = useQuery(async () => (entry ? await data.attachments.listForEntry(entry.diaryId, entry.id) : []), [data.attachments, entry?.id, entry?.diaryId]);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => () => {
    for (const p of pendingRef.current.values()) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
  }, []);
  const attachmentApi: AttachmentApi = useMemo(
    () => ({
      info(id) {
        const p = pendingRef.current.get(id);
        if (p) return { id, name: p.meta.name, kind: p.meta.kind, ...(p.previewUrl ? { previewUrl: p.previewUrl } : {}) };
        const m = existing.status === 'ok' ? existing.data.find((x) => x.id === id) : undefined;
        return m ? { id, name: m.name, kind: m.kind } : undefined;
      },
      async add(file) {
        const verdict = checkAttachmentFile({ mime: file.type, sizeBytes: file.size });
        if (!verdict.ok) return { error: verdict.reason };
        const bytes = new Uint8Array(await file.arrayBuffer());
        const id = data.newId();
        const meta: AttachmentMeta = {
          id, diaryId: loadedRef.current?.template.diaryId ?? '', entryId: entryId.current, kind: verdict.kind, mime: file.type.toLowerCase(),
          name: (file.name.trim() || (verdict.kind === 'pdf' ? 'Dokument.pdf' : 'Foto')).slice(-200), sizeBytes: file.size, createdAt: new Date(data.now()).toISOString(),
        };
        const previewUrl = verdict.kind === 'image' ? URL.createObjectURL(new Blob([bytes], { type: meta.mime })) : undefined;
        setPending((prev) => new Map(prev).set(id, { meta, bytes, ...(previewUrl ? { previewUrl } : {}) }));
        pendingRef.current = new Map(pendingRef.current).set(id, { meta, bytes, ...(previewUrl ? { previewUrl } : {}) });
        return { id };
      },
      remove(id) {
        const p = pendingRef.current.get(id);
        if (p) {
          if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
          setPending((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
          const next = new Map(pendingRef.current);
          next.delete(id);
          pendingRef.current = next;
        } else removedExisting.current.add(id);
      },
    }),
    [data, existing],
  );

  const weatherSettings = useDiaryWeatherSettings(loaded?.template.diaryId);
  const [useGps, setUseGps] = useGpsChoice(weatherSettings);

  const dirty = initial !== null && current !== null && isDirty(initial, current);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const requestTemplate = (id: string) => {
    if (id === loaded?.template.id) return;
    if (dirty) setPendingTemplate(id);
    else void selectTemplate(id);
  };

  if (!loaded || !current) return <p className="text-muted-foreground">{de.app.loading}</p>;
  const { template, version } = loaded;
  const missing = new Set(showErrors ? missingRequired(version, current.values) : []);
  const timeError = showErrors ? validateTime(current.time) : null;

  // Wischen (A-058): nur Touch/Stift, ≥ 60 px, überwiegend waagerecht; Eingabefelder, Slider und Body-Map sind ausgenommen.
  const swipeIgnored = (t: EventTarget) => t instanceof Element && !!t.closest('input, textarea, select, .touch-none');
  function onSwipeEnd(e: PointerEvent<HTMLFormElement>) {
    const s = swipe.current;
    swipe.current = null;
    if (!s || entry || templates.length < 2) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) <= Math.abs(e.clientY - s.y) * 2) return;
    const i = templates.findIndex((t) => t.id === template.id);
    const next = templates[dx < 0 ? i + 1 : i - 1];
    if (next) requestTemplate(next.id);
  }

  const setValues = (values: FormValues) => setCurrent({ ...current, values });

  /** Body-Map „Als Standard für dieses Feld": Block-Konfiguration ändern → neue Vorlagenversion (Spec 02). */
  async function setBlockDefault(blockId: string, presetId: string) {
    const state = await data.diary.getTemplate(template.id);
    if (!state) return;
    const blocks = state.version.blocks.map((b) => (b.id === blockId && b.type === 'bodymap' ? { ...b, config: { ...b.config, defaultPresetId: presetId } } : b));
    await data.diary.saveTemplate(updateTemplate(state, { blocks }, { now: data.now }).state);
  }
  const setTime = (time: TimeInput) => setCurrent({ ...current, time });
  function onDraft(response: LlmFillResponse) {
    if (!current) return;
    const d = applyFill(version, current.values, response);
    setCurrent({ ...current, values: d.values, ...(d.time && !entry ? { time: d.time } : {}) });
    setLlmChanged(new Set(d.changed));
    setDraft(d);
  }
  const setTags = (tags: string[]) => setCurrent({ ...current, tags });

  async function save() {
    if (!current || !loaded) return;
    const miss = missingRequired(loaded.version, current.values);
    const tErr = validateTime(current.time);
    if (miss.length || tErr) {
      setShowErrors(true);
      document.getElementById(miss.length ? `block-${miss[0]}` : 'entry-time')?.focus();
      return;
    }
    setSaving(true);
    try {
      const s = await data.stamper.stamp();
      const time = timeToEntry(current.time);
      const values = valuesToSave(loaded.version, current.values);
      // Anhänge: nur Dateien, die noch in einem Textarea-Wert stehen; vorhandene, die der Nutzer entfernt hat, werden gelöscht (BLK-30).
      const keptIds = new Set(Object.values(values).flatMap((v) => (v && typeof v === 'object' && 'attachmentIds' in v ? ((v as { attachmentIds?: string[] }).attachmentIds ?? []) : [])));
      await data.attachments.commit({
        add: [...pending.values()].filter((p) => keptIds.has(p.meta.id)).map(({ meta, bytes }) => ({ meta: { ...meta, diaryId: loaded.template.diaryId }, bytes })),
        removeIds: [...removedExisting.current].filter((id) => !keptIds.has(id)),
      });
      let next: Entry;
      let gpsFollowUp: DiaryWeatherSettings | null = null;
      if (entry) {
        const rest: Omit<Entry, 'period'> & { period?: Entry['period'] } = { ...entry };
        delete rest.period;
        next = { ...rest, ...time, templateVersion: loaded.version.version, values, tags: [...current.tags], meta: metaForEdit(entry, time.occurredAt), updatedAt: s.at, hlc: s.hlc };
      } else {
        // Wetter nur bei neuen Einträgen: fester Ort sofort als `weatherPending`; mit GPS-Schalter wird die Position danach bestimmt.
        const settings = (await data.diary.getDiary(loaded.template.diaryId))?.settings.weather;
        const initialMeta = settings && !useGps ? await initialWeatherMeta({ settings, useGps: false }, { currentPosition: () => Promise.reject(new Error('GPS aus')) }) : {};
        if (settings?.enabled && useGps) gpsFollowUp = settings;
        next = {
          id: entryId.current, diaryId: loaded.template.diaryId, templateId: loaded.template.id, templateVersion: loaded.version.version,
          ...time, recordedAt: s.at, updatedAt: s.at, authorId: s.authorId, values, tags: [...current.tags],
          meta: { source: 'app', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', ...initialMeta }, hlc: s.hlc,
        };
      }
      await data.diary.saveEntry(next);
      // Speichern wartet nie auf das Netz: Wetter (und ggf. Position) laufen im Hintergrund weiter (BLK-33).
      if (gpsFollowUp || next.meta.weatherPending) void data.weather.followUp(data.diary, next.id, gpsFollowUp, data.stamper.stamp).catch(() => undefined);
      leaving.current = true;
      void navigate(`/entry/${next.id}`, { replace: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex touch-pan-y flex-col gap-6" noValidate
      onPointerDown={(e) => (swipe.current = e.pointerType === 'mouse' || swipeIgnored(e.target) ? null : { x: e.clientX, y: e.clientY })}
      onPointerUp={onSwipeEnd}
      onPointerCancel={() => (swipe.current = null)}
      onSubmit={(e) => (e.preventDefault(), void save())}>
      {!entry && templates.length > 1 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{de.entry.template}</legend>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <Button key={t.id} type="button" size="sm" className="h-auto min-h-9 max-w-full whitespace-normal py-1 text-left" variant={t.id === template.id ? 'default' : 'outline'} aria-pressed={t.id === template.id} onClick={() => requestTemplate(t.id)}>
                <TemplateIcon icon={t.icon} color={t.color} className={t.id === template.id ? 'text-primary-foreground' : undefined} />
                {t.name}
              </Button>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <TemplateIcon icon={template.icon} color={template.color} />
          {template.name}
        </p>
      )}

      {keptOldVersion ? (
        <p role="status" data-testid="old-version-hint" className="text-sm text-muted-foreground">
          {de.entry.oldVersionHint}
        </p>
      ) : null}

      <LlmFillButton templateName={template.name} version={version} onDraft={onDraft} />
      {draft ? <LlmDraftNotice draft={draft} onDismiss={() => setDraft(null)} /> : null}

      <div data-tour="entry-fields" className={cn('flex flex-col gap-6', TOUR_RING)}>
        <TimeField time={current.time} error={timeError} onChange={setTime} />

        {sortedBlocks(version).map((def) => (
          <LlmMarked key={def.id} marked={llmChanged.has(def.id)}>
            <BlockField
              def={def} value={current.values[def.id]} invalid={missing.has(def.id)}
              onChange={(v) => {
                setValues({ ...current.values, [def.id]: v });
                if (llmChanged.has(def.id)) setLlmChanged((prev) => new Set([...prev].filter((id) => id !== def.id)));
              }}
              diaryId={template.diaryId} onSetDefault={setBlockDefault} attachments={attachmentApi} newId={data.newId}
            />
          </LlmMarked>
        ))}
      </div>

      <TagInput tags={current.tags} onChange={setTags} known={knownTags} />

      {!entry ? <WeatherSwitch settings={weatherSettings} checked={useGps} onChange={setUseGps} /> : null}

      {missing.size > 0 ? (
        <p role="alert" className="text-sm text-destructive">
          {de.entry.requiredSummary}
        </p>
      ) : null}

      <div data-tour="entry-save" className={cn('sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 bg-background/95 py-2 backdrop-blur', TOUR_RING)}>
        <Button type="submit" size="lg" className="w-full" disabled={saving}>
          {saving ? de.entry.saving : de.entry.save}
        </Button>
      </div>

      <Dialog open={pendingTemplate !== null} onClose={() => setPendingTemplate(null)} aria-labelledby="switch-title">
        <DialogTitle id="switch-title">{de.entry.switchTitle}</DialogTitle>
        <DialogDescription>{de.entry.switchHint}</DialogDescription>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setPendingTemplate(null)}>
            {de.entry.keepEditing}
          </Button>
          <Button
            type="button" variant="destructive"
            onClick={() => {
              const id = pendingTemplate;
              setPendingTemplate(null);
              // Eingaben verwerfen: Ausgangszustand zurücksetzen, damit selectTemplate ihn neu setzt.
              if (id) void selectTemplate(id, true);
            }}
          >
            {de.entry.switchConfirm}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} aria-labelledby="discard-title">
        <DialogTitle id="discard-title">{de.entry.discardTitle}</DialogTitle>
        <DialogDescription>{de.entry.discardHint}</DialogDescription>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => blocker.reset?.()}>
            {de.entry.keepEditing}
          </Button>
          <Button type="button" variant="destructive" onClick={() => blocker.proceed?.()}>
            {de.entry.discard}
          </Button>
        </DialogFooter>
      </Dialog>
    </form>
  );
}

/** Browser liefern `datetime-local` teils mit Sekunden (WebKit) — minutengenau vergleichen und speichern. */
const minutes = (v: string) => (v.length > 16 ? v.slice(0, 16) : v);

function TimeField({ time, error, onChange }: { time: TimeInput; error: ReturnType<typeof validateTime>; onChange: (t: TimeInput) => void }) {
  const toPoint = (): TimeInput => (time.mode === 'point' ? time : { mode: 'point', at: time.withTime ? time.start : `${time.start}T12:00` });
  const toPeriod = (): TimeInput => {
    if (time.mode === 'period') return time;
    const day = time.at.slice(0, 10);
    return { mode: 'period', start: day, end: day, withTime: false };
  };
  const setWithTime = (on: boolean) => {
    if (time.mode !== 'period' || time.withTime === on) return;
    onChange(
      on
        ? { mode: 'period', start: `${time.start}T00:00`, end: `${time.end}T23:59`, withTime: true }
        : { mode: 'period', start: time.start.slice(0, 10), end: time.end.slice(0, 10), withTime: false },
    );
  };
  const invalid = error ? { 'aria-invalid': true as const, 'aria-describedby': 'entry-time-error' } : {};
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium">{de.entry.timeLabel}</legend>
      <ToggleGroup aria-label={de.entry.timeLabel}>
        <ToggleGroupItem pressed={time.mode === 'point'} onClick={() => onChange(toPoint())}>
          {de.entry.modePoint}
        </ToggleGroupItem>
        <ToggleGroupItem pressed={time.mode === 'period'} onClick={() => onChange(toPeriod())}>
          {de.entry.modePeriod}
        </ToggleGroupItem>
      </ToggleGroup>
      {time.mode === 'point' ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="entry-time">{de.entry.pointLabel}</Label>
          <Input id="entry-time" type="datetime-local" value={time.at} onChange={(e) => onChange({ mode: 'point', at: minutes(e.target.value) })} {...invalid} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="entry-time">{de.entry.periodStart}</Label>
              <Input id="entry-time" type={time.withTime ? 'datetime-local' : 'date'} value={time.start} onChange={(e) => onChange({ ...time, start: minutes(e.target.value) })} {...invalid} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="entry-time-end">{de.entry.periodEnd}</Label>
              <Input id="entry-time-end" type={time.withTime ? 'datetime-local' : 'date'} value={time.end} onChange={(e) => onChange({ ...time, end: minutes(e.target.value) })} {...invalid} />
            </div>
          </div>
          <div className="flex min-h-11 items-center gap-3">
            <Checkbox id="entry-with-time" checked={time.withTime} onChange={(e) => setWithTime(e.target.checked)} />
            <Label htmlFor="entry-with-time" className="font-normal">
              {de.entry.withTime}
            </Label>
          </div>
        </>
      )}
      {error ? (
        <p id="entry-time-error" role="alert" className="text-sm text-destructive">
          {error === 'missing' ? de.entry.timeMissing : de.entry.endBeforeStart}
        </p>
      ) : null}
    </fieldset>
  );
}
