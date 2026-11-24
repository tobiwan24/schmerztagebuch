// Konfiguration des Übungsblocks im Vorlagen-Editor (UI-31): Beschreibung, Sätze, Wiederholungen, Dauer, Schritte, Video-Link, Stufen.
// Übungsmedien (RDM-033): je Schritt optional ein Bild, dazu ein hochgeladenes Video; neue Dateien werden im Editor vorgemerkt
// (`ExerciseMediaDraftContext`) und erst beim Speichern der Vorlage geschrieben.
import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, Film, ImageMinus, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { EXERCISE_MAX_STEPS, checkExerciseMediaFile, stepImageId, stepText, type ExerciseConfig, type ExerciseMedia, type ExerciseStep } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ExerciseStepImage } from '@/components/ExerciseMedia';
import { useExerciseMediaDraft } from '@/components/exercise-media-draft';
import { useData } from '@/data/DataContext';
import { deTemplates } from '@/i18n/lazy/templates';

const t = deTemplates.editor.exercise;

/** Entfernt ein optionales Feld (kein `undefined` im Datensatz). */
function withOptional(c: ExerciseConfig, key: keyof ExerciseConfig, value: unknown): ExerciseConfig {
  const { [key]: _drop, ...rest } = c;
  void _drop;
  return (value === undefined ? rest : { ...rest, [key]: value }) as ExerciseConfig;
}

/** Positive ganze Zahl mit eigenem Textzustand; leer = nicht gesetzt. */
function IntField({ id, label, value, onChange }: { id: string; label: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          if (raw.trim() === '') return onChange(undefined);
          const n = Number(raw);
          if (Number.isInteger(n) && n > 0) onChange(n);
        }}
      />
    </div>
  );
}

/** Schritt im Editor: Text darf beim Tippen leer sein, `key` bleibt beim Umsortieren stabil. */
interface StepItem {
  key: string;
  text: string;
  imageId?: string;
}

/** Editor-Schritte → gespeicherte Schritte: leere Schritte ohne Bild entfallen, Schritte ohne Bild bleiben reiner Text. */
function toSteps(items: readonly StepItem[]): ExerciseStep[] {
  return items.flatMap((s): ExerciseStep[] => {
    const text = s.text.trim();
    if (s.imageId) return [text ? { text, imageId: s.imageId } : { imageId: s.imageId }];
    return text ? [text] : [];
  });
}

const sizeMb = (n: number) => `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

export function ExerciseConfigEditor({
  blockId, config, newId, onChange,
}: { blockId: string; config: ExerciseConfig; newId: () => string; onChange: (config: ExerciseConfig) => void }) {
  const data = useData();
  const draft = useExerciseMediaDraft();
  const id = (k: string) => `block-${blockId}-${k}`;
  const [steps, setStepItems] = useState<StepItem[]>(() =>
    (config.steps ?? []).map((s) => ({ key: newId(), text: stepText(s), ...(stepImageId(s) ? { imageId: stepImageId(s)! } : {}) })),
  );
  const [mediaError, setMediaError] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const imageTarget = useRef<string | null>(null);

  const setSteps = (next: StepItem[]) => {
    setStepItems(next);
    const saved = toSteps(next);
    onChange(withOptional(config, 'steps', saved.length ? saved : undefined));
  };
  const moveStep = (i: number, to: number) => {
    if (to < 0 || to >= steps.length) return;
    const next = [...steps];
    const [item] = next.splice(i, 1);
    next.splice(to, 0, item!);
    setSteps(next);
  };

  /** Datei prüfen und vormerken; liefert die neue Medien-ID oder `undefined` (Fehler wird angezeigt). */
  async function stage(file: File, kind: ExerciseMedia['kind']): Promise<string | undefined> {
    setMediaError(null);
    if (!draft) return undefined;
    const verdict = checkExerciseMediaFile(kind, { mime: file.type, sizeBytes: file.size });
    if (!verdict.ok) {
      setMediaError(verdict.reason === 'tooLarge' ? (kind === 'video' ? t.videoTooLarge(sizeMb(file.size)) : t.imageTooLarge) : kind === 'video' ? t.videoType : t.imageType);
      return undefined;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const meta: ExerciseMedia = {
      id: newId(), diaryId: draft.diaryId, templateId: draft.templateId, kind, mime: file.type.toLowerCase(),
      name: file.name.trim().slice(0, 200) || (kind === 'video' ? 'video' : 'bild'), sizeBytes: bytes.length, createdAt: new Date(data.now()).toISOString(),
    };
    draft.pending.set(meta.id, { meta, bytes });
    return meta.id;
  }

  const video = config.videoUrl ?? '';
  const videoOk = /^https:\/\/\S+$/.test(video);
  const levels = config.levels ?? [];
  const setLevels = (next: NonNullable<ExerciseConfig['levels']>) => onChange(withOptional(config, 'levels', next.length ? next : undefined));
  const move = (i: number, to: number) => {
    if (to < 0 || to >= levels.length) return;
    const next = [...levels];
    const [item] = next.splice(i, 1);
    next.splice(to, 0, item!);
    setLevels(next);
  };
  const videoMeta = config.videoMediaId ? draft?.pending.get(config.videoMediaId)?.meta : undefined;

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id('description')}>{t.description}</Label>
        <Textarea id={id('description')} value={config.description ?? ''} onChange={(e) => onChange(withOptional(config, 'description', e.target.value === '' ? undefined : e.target.value))} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <IntField id={id('sets')} label={t.sets} value={config.targetSets} onChange={(v) => onChange(withOptional(config, 'targetSets', v))} />
        <IntField id={id('reps')} label={t.reps} value={config.targetReps} onChange={(v) => onChange(withOptional(config, 'targetReps', v))} />
        <IntField id={id('duration')} label={t.duration} value={config.targetDurationSec} onChange={(v) => onChange(withOptional(config, 'targetDurationSec', v))} />
      </div>

      <div className="flex flex-col gap-2" role="group" aria-label={t.steps}>
        <p className="text-sm font-medium">{t.steps}</p>
        <p className="text-sm text-muted-foreground">{t.stepsHint}</p>
        {steps.map((s, i) => (
          <div key={s.key} className="flex flex-col gap-2" data-testid="exercise-step-edit">
            <div className="flex items-center gap-1">
              <Input aria-label={t.stepLabel(i + 1)} value={s.text} onChange={(e) => setSteps(steps.map((x) => (x.key === s.key ? { ...x, text: e.target.value } : x)))} />
              {s.imageId ? (
                <Button type="button" variant="ghost" size="icon" aria-label={t.removeImage(i + 1)} onClick={() => setSteps(steps.map((x) => (x.key === s.key ? { key: x.key, text: x.text } : x)))}>
                  <ImageMinus aria-hidden />
                </Button>
              ) : (
                <Button type="button" variant="ghost" size="icon" aria-label={t.addImage(i + 1)} disabled={!draft} onClick={() => ((imageTarget.current = s.key), imageInput.current?.click())}>
                  <ImagePlus aria-hidden />
                </Button>
              )}
              <Button type="button" variant="ghost" size="icon" aria-label={t.stepUp(i + 1)} disabled={i === 0} onClick={() => moveStep(i, i - 1)}>
                <ArrowUp aria-hidden />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label={t.stepDown(i + 1)} disabled={i === steps.length - 1} onClick={() => moveStep(i, i + 1)}>
                <ArrowDown aria-hidden />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label={t.removeStep(i + 1)} onClick={() => setSteps(steps.filter((x) => x.key !== s.key))}>
                <Trash2 aria-hidden />
              </Button>
            </div>
            {s.imageId ? <ExerciseStepImage key={s.imageId} id={s.imageId} alt={t.stepImage(i + 1)} className="h-24 w-auto self-start rounded-md object-contain" /> : null}
          </div>
        ))}
        <Button
          type="button" variant="outline" size="sm" className="self-start" disabled={steps.length >= EXERCISE_MAX_STEPS}
          onClick={() => setStepItems([...steps, { key: newId(), text: '' }])}
        >
          <Plus aria-hidden />
          {t.addStep}
        </Button>
        <Input
          ref={imageInput} type="file" accept="image/*" className="hidden" aria-label={t.imageInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            const key = imageTarget.current;
            e.target.value = '';
            if (!file || !key) return;
            void stage(file, 'image').then((mediaId) => {
              if (mediaId) setSteps(steps.map((x) => (x.key === key ? { ...x, imageId: mediaId } : x)));
            });
          }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={id('video')}>{t.video}</Label>
        <div className="flex items-center gap-2">
          <Input id={id('video')} type="url" inputMode="url" value={video} onChange={(e) => onChange(withOptional(config, 'videoUrl', e.target.value.trim() === '' ? undefined : e.target.value.trim()))} />
          {videoOk ? (
            <Button asChild variant="outline" size="icon">
              <a href={video} target="_blank" rel="noopener noreferrer" aria-label={t.videoOpen}>
                <ExternalLink aria-hidden />
              </a>
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-2" role="group" aria-label={t.videoUpload}>
        <p className="text-sm font-medium">{t.videoUpload}</p>
        <p className="text-sm text-muted-foreground">{t.videoHint}</p>
        {config.videoMediaId ? (
          <div className="flex items-center gap-2" data-testid="exercise-video-edit">
            <Film aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-sm">{videoMeta ? `${videoMeta.name} · ${sizeMb(videoMeta.sizeBytes)}` : t.videoStored}</span>
            <Button type="button" variant="ghost" size="icon" aria-label={t.videoRemove} onClick={() => onChange(withOptional(config, 'videoMediaId', undefined))}>
              <Trash2 aria-hidden />
            </Button>
          </div>
        ) : null}
        <Button type="button" variant="outline" size="sm" className="self-start" disabled={!draft} onClick={() => videoInput.current?.click()}>
          <Film aria-hidden />
          {config.videoMediaId ? t.videoReplace : t.videoAdd}
        </Button>
        <Input
          ref={videoInput} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" aria-label={t.videoInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            void stage(file, 'video').then((mediaId) => {
              if (mediaId) onChange(withOptional(config, 'videoMediaId', mediaId));
            });
          }}
        />
      </div>
      {mediaError ? <p role="alert" className="text-sm text-destructive" data-testid="exercise-media-error">{mediaError}</p> : null}

      <div className="flex flex-col gap-2" role="group" aria-label={t.levels}>
        <p className="text-sm font-medium">{t.levels}</p>
        {levels.map((l, i) => {
          const name = l.label || String(i + 1);
          return (
            <div key={l.id} className="flex items-center gap-1">
              <Input aria-label={t.levelLabel(i + 1)} value={l.label} onChange={(e) => setLevels(levels.map((x) => (x.id === l.id ? { ...x, label: e.target.value } : x)))} />
              <Button type="button" variant="ghost" size="icon" aria-label={t.moveUp(name)} disabled={i === 0} onClick={() => move(i, i - 1)}>
                <ArrowUp aria-hidden />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label={t.moveDown(name)} disabled={i === levels.length - 1} onClick={() => move(i, i + 1)}>
                <ArrowDown aria-hidden />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label={t.removeLevel(name)} onClick={() => setLevels(levels.filter((x) => x.id !== l.id))}>
                <Trash2 aria-hidden />
              </Button>
            </div>
          );
        })}
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setLevels([...levels, { id: newId(), label: t.defaultLevel(levels.length + 1) }])}>
          <Plus aria-hidden />
          {t.addLevel}
        </Button>
      </div>
    </>
  );
}
