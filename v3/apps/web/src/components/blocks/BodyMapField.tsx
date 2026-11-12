// Body-Map (Spec 05), portiert aus v2 `BodyMapBlock.tsx`: Bild-Preset (vorausgewählt, BLK-03), Punkte antippen mit
// Intensität 1–10, normalisierte Koordinaten 0..1, Punkte-Liste mit Entfernen. Statt Canvas: Bild + SVG-Overlay.
// Nicht übernommen (v3-Wertform kennt sie nicht): Pinsel, Punktgröße, Kommentare je Punkt, eigene Bilder/Zuschnitt.
import { useState, type MouseEvent } from 'react';
import { X } from 'lucide-react';
import type { BodymapValue } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useData } from '@/data/DataContext';
import { BODYMAP_PRESETS, intensityFill, presetById } from './bodymap-presets';
import { de } from '@/i18n/de';

export function BodyMapField({ id, value, defaultPresetId, onChange }: { id: string; value: BodymapValue | undefined; defaultPresetId: string; onChange: (v: BodymapValue) => void }) {
  const { newId } = useData();
  const current: BodymapValue = value ?? { presetId: defaultPresetId, points: [] };
  const preset = presetById(current.presetId) ?? BODYMAP_PRESETS[0];
  const [intensity, setIntensity] = useState(5);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const presetName = (pid: string) => de.bodymap.presets[pid as keyof typeof de.bodymap.presets] ?? pid;

  function addPoint(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    const x = clamp((e.clientX - rect.left) / rect.width);
    const y = clamp((e.clientY - rect.top) / rect.height);
    onChange({ ...current, points: [...current.points, { id: newId(), x, y, intensity }] });
  }

  const hasPoints = current.points.length > 0;
  return (
    <div id={id} className="flex flex-col gap-3">
      <div role="group" aria-label={de.bodymap.image} className="flex flex-wrap gap-2">
        {BODYMAP_PRESETS.map((p) => (
          <Button
            key={p.id}
            type="button"
            size="sm"
            variant={p.id === preset.id ? 'default' : 'outline'}
            aria-pressed={p.id === preset.id}
            disabled={hasPoints && p.id !== preset.id}
            onClick={() => onChange({ presetId: p.id, points: [] })}
          >
            {presetName(p.id)}
          </Button>
        ))}
      </div>
      {hasPoints ? <p className="text-xs text-muted-foreground">{de.bodymap.switchHint}</p> : null}

      <div className="flex items-center gap-3">
        <Label htmlFor={`${id}-intensity`} className="shrink-0 font-normal">
          {de.bodymap.intensity}
        </Label>
        <Slider id={`${id}-intensity`} min={1} max={10} step={1} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} />
        <span className="w-6 text-right font-semibold tabular-nums">{intensity}</span>
      </div>

      <div data-testid="bodymap-canvas" aria-label={de.bodymap.tapHint} className="relative cursor-crosshair touch-manipulation overflow-hidden rounded-lg border-2" onClick={addPoint}>
        <img
          src={preset.src}
          alt={presetName(preset.id)}
          className="block max-h-[60vh] w-full object-contain select-none"
          draggable={false}
          onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        />
        {size ? (
          <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
            {current.points.map((p, i) => (
              <g key={p.id}>
                <circle cx={p.x * size.w} cy={p.y * size.h} r={size.w * 0.03} className={`${intensityFill(p.intensity)} stroke-white`} strokeWidth={size.w * 0.004} opacity={0.85} />
                <text x={p.x * size.w} y={p.y * size.h} dy="0.35em" textAnchor="middle" fontSize={size.w * 0.03} className="fill-white font-bold">
                  {i + 1}
                </text>
              </g>
            ))}
          </svg>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{de.bodymap.tapHint}</p>

      {hasPoints ? (
        <ul data-testid="bodymap-points" className="flex flex-col gap-1">
          {current.points.map((p, i) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1 text-sm">
              <span>{de.bodymap.pointLabel(i + 1, p.intensity ?? 5)}</span>
              <Button type="button" variant="ghost" size="icon" aria-label={de.bodymap.removePoint(i + 1)} onClick={() => onChange({ ...current, points: current.points.filter((q) => q.id !== p.id) })}>
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
