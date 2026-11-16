// Eingabe des Übungs-Blocks (UI-30): erledigt, Stufe, Sätze, Wiederholungen, Dauer, Schmerz bei der Übung.
// `guided` (Trainingsdurchgang) zeigt zusätzlich Erklärung, Ziel, Ablauf, Video-Link und einen Timer mit Start/Pause.
import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Pause, Play, RotateCcw } from 'lucide-react';
import type { ExerciseConfig, ExerciseValue } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { de } from '@/i18n/de';

const t = de.training.field;

const pad = (n: number) => String(n).padStart(2, '0');
/** Sekunden als „m:ss“. */
export const formatSeconds = (s: number): string => `${Math.floor(s / 60)}:${pad(s % 60)}`;

type Counter = 'sets' | 'reps' | 'durationSec';
/** Wert mit ausdrücklich leeren Angaben (`undefined`), bevor `normalize` sie entfernt. */
type Loose = { [K in keyof ExerciseValue]?: ExerciseValue[K] | undefined };

/** Wert ohne leere Angaben; ganz leer (nicht erledigt, nichts eingetragen) → `undefined`. */
function normalize(v: Loose): ExerciseValue | undefined {
  const { done = false, ...rest } = v;
  const kept = Object.fromEntries(Object.entries(rest).filter(([, x]) => x !== undefined)) as Omit<ExerciseValue, 'done'>;
  return !done && Object.keys(kept).length === 0 ? undefined : { done, ...kept };
}

function targetText(c: ExerciseConfig): string {
  const parts: string[] = [];
  if (c.targetSets !== undefined && c.targetReps !== undefined) parts.push(`${c.targetSets} × ${c.targetReps}`);
  else if (c.targetSets !== undefined) parts.push(t.targetSets(c.targetSets));
  else if (c.targetReps !== undefined) parts.push(t.targetReps(c.targetReps));
  if (c.targetDurationSec !== undefined) parts.push(t.targetDuration(c.targetDurationSec));
  return parts.join(', ');
}

export function ExerciseField({
  id, config, value, onChange, guided = false,
}: { id: string; config: ExerciseConfig; value: ExerciseValue | undefined; onChange: (v: ExerciseValue | undefined) => void; guided?: boolean }) {
  const current: ExerciseValue = value ?? { done: false };
  const [running, setRunning] = useState(false);
  // Der Timer zählt im Wert selbst (`durationSec`); Refs halten Wert und Callback für den Takt aktuell.
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      const v = latest.current.value ?? { done: false };
      latest.current.onChange(normalize({ ...v, durationSec: (v.durationSec ?? 0) + 1 }));
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  const patch = (p: Loose) => onChange(normalize({ ...current, ...p }));
  const setCounter = (key: Counter, raw: string) => {
    if (raw.trim() === '') return patch({ [key]: undefined });
    const n = Math.trunc(Number(raw));
    if (Number.isFinite(n) && n >= 0) patch({ [key]: n });
  };
  const fid = (k: string) => `${id}-${k}`;
  const target = targetText(config);
  const seconds = current.durationSec ?? 0;

  return (
    <div id={id} className="flex flex-col gap-3" data-testid="exercise-field">
      {guided ? (
        <>
          {config.description ? <p className="text-sm">{config.description}</p> : null}
          {target ? <p className="text-sm font-medium" data-testid="exercise-target">{t.target(target)}</p> : null}
          {config.steps && config.steps.length > 0 ? (
            <section className="flex flex-col gap-1">
              <h3 className="text-sm font-medium">{t.steps}</h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {config.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </section>
          ) : null}
          {config.videoUrl ? (
            <Button asChild variant="outline" className="self-start">
              <a href={config.videoUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                {t.video}
              </a>
            </Button>
          ) : null}
          <div role="group" aria-label={t.timer} className="flex flex-wrap items-center gap-2">
            <span data-testid="exercise-timer" aria-live="off" className="min-w-16 text-2xl font-semibold tabular-nums">
              {formatSeconds(seconds)}
            </span>
            <Button type="button" variant={running ? 'secondary' : 'default'} onClick={() => setRunning(!running)}>
              {running ? <Pause aria-hidden /> : <Play aria-hidden />}
              {running ? t.timerPause : t.timerStart}
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label={t.timerReset} disabled={seconds === 0} onClick={() => (setRunning(false), patch({ durationSec: undefined }))}>
              <RotateCcw aria-hidden />
            </Button>
          </div>
        </>
      ) : null}
      <div className="flex min-h-11 items-center gap-3">
        <Checkbox id={fid('done')} checked={current.done} onChange={(e) => patch({ done: e.target.checked })} />
        <Label htmlFor={fid('done')} className="font-normal">{t.done}</Label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {config.levels && config.levels.length > 0 ? (
          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor={fid('level')} className="text-xs">{t.level}</Label>
            <Select id={fid('level')} value={current.levelId ?? ''} onChange={(e) => patch({ levelId: e.target.value === '' ? undefined : e.target.value })}>
              <option value="">{t.noLevel}</option>
              {config.levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        {([['sets', 'sets', t.sets], ['reps', 'reps', t.reps], ['duration', 'durationSec', t.duration]] as const).map(([k, key, label]) => (
          <div key={k} className="flex flex-col gap-1">
            <Label htmlFor={fid(k)} className="text-xs">{label}</Label>
            <Input id={fid(k)} type="number" min={0} inputMode="numeric" value={current[key] ?? ''} onChange={(e) => setCounter(key, e.target.value)} />
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <Label htmlFor={fid('pain')} className="text-xs">{t.pain}</Label>
          <Select id={fid('pain')} value={current.painDuring === undefined ? '' : String(current.painDuring)} onChange={(e) => patch({ painDuring: e.target.value === '' ? undefined : Number(e.target.value) })}>
            <option value="">{t.noPain}</option>
            {Array.from({ length: 11 }, (_, n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  );
}
