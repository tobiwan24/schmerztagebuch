// Konfiguration des Übungsblocks im Vorlagen-Editor (UI-31): Beschreibung, Sätze, Wiederholungen, Dauer, Schritte, Video-Link, Stufen.
import { useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { EXERCISE_MAX_STEPS, type ExerciseConfig } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

export function ExerciseConfigEditor({
  blockId, config, newId, onChange,
}: { blockId: string; config: ExerciseConfig; newId: () => string; onChange: (config: ExerciseConfig) => void }) {
  const id = (k: string) => `block-${blockId}-${k}`;
  // Schritte als Text (eine Zeile je Schritt); Leerzeilen bleiben beim Tippen erhalten.
  const [stepsText, setStepsText] = useState((config.steps ?? []).join('\n'));
  const levels = config.levels ?? [];
  const setLevels = (next: NonNullable<ExerciseConfig['levels']>) => onChange(withOptional(config, 'levels', next.length ? next : undefined));
  const move = (i: number, to: number) => {
    if (to < 0 || to >= levels.length) return;
    const next = [...levels];
    const [item] = next.splice(i, 1);
    next.splice(to, 0, item!);
    setLevels(next);
  };
  const video = config.videoUrl ?? '';
  const videoOk = /^https:\/\/\S+$/.test(video);
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
      <div className="flex flex-col gap-2">
        <Label htmlFor={id('steps')}>{t.steps}</Label>
        <Textarea
          id={id('steps')}
          value={stepsText}
          onChange={(e) => {
            const lines = e.target.value.split('\n');
            // Mehr als 20 Zeilen werden nicht angenommen (Spec 05).
            if (lines.length > EXERCISE_MAX_STEPS) return;
            setStepsText(e.target.value);
            const steps = lines.map((l) => l.trim()).filter((l) => l !== '');
            onChange(withOptional(config, 'steps', steps.length ? steps : undefined));
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
