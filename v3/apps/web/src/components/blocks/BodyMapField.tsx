// Body-Map (Spec 05, A-024), portiert aus v2 `BodyMapBlock.tsx`: Werkzeuge Punkt und Pinsel, Größe klein/mittel/groß,
// Intensität 1–10 (Farben wie v2), Kommentar je Markierung, Nummerierung in Reihenfolge, Entfernen nummeriert neu.
// Statt Canvas: Bild + SVG-Overlay (skaliert verlustfrei, testbar). Koordinaten normalisiert 0..1.
// Bildwahl: Standardbilder; Wechsel mit vorhandenen Markierungen nur nach Rückfrage. Eigene Bilder folgen (BLK-21).
import { useRef, useState, type PointerEvent } from 'react';
import { ArrowDownToDot, Brush, X } from 'lucide-react';
import { BODYMAP_MAX_PATH, type BodymapValue } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useData } from '@/data/DataContext';
import { BODYMAP_PRESETS, intensityFill, intensityStroke, presetById } from './bodymap-presets';
import { de } from '@/i18n/de';

type Mark = BodymapValue['points'][number];
type Tool = 'point' | 'brush';

/** Größen wie v2 (`POINT_SIZE`), Durchmesser relativ zur Bildbreite. */
export const BODYMAP_SIZES = { small: 0.03, medium: 0.05, large: 0.08 } as const;
type SizeKey = keyof typeof BODYMAP_SIZES;
const DEFAULT_SIZE = BODYMAP_SIZES.medium;
/** Mindestabstand zwischen zwei Pfadpunkten (normalisiert) — hält Pinselstriche klein. */
const MIN_STEP = 0.004;

export function BodyMapField({ id, value, defaultPresetId, onChange }: { id: string; value: BodymapValue | undefined; defaultPresetId: string; onChange: (v: BodymapValue) => void }) {
  const { newId } = useData();
  const current: BodymapValue = value ?? { presetId: defaultPresetId, points: [] };
  const preset = presetById(current.presetId) ?? BODYMAP_PRESETS[0];
  const [tool, setTool] = useState<Tool>('point');
  const [size, setSize] = useState<SizeKey>('medium');
  const [intensity, setIntensity] = useState(5);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [stroke, setStroke] = useState<{ x: number; y: number }[] | null>(null);
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const presetName = (pid: string) => de.bodymap.presets[pid as keyof typeof de.bodymap.presets] ?? pid;

  const toNorm = (e: PointerEvent) => {
    const rect = area.current!.getBoundingClientRect();
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    return { x: clamp((e.clientX - rect.left) / rect.width), y: clamp((e.clientY - rect.top) / rect.height) };
  };
  const add = (mark: Omit<Mark, 'id' | 'intensity' | 'size'>) =>
    onChange({ ...current, points: [...current.points, { id: newId(), intensity, size: BODYMAP_SIZES[size], ...mark }] });

  // Strich in einer Ref puffern: Zeigerereignisse können schneller kommen als Renders (State wäre veraltet).
  const strokeRef = useRef<{ x: number; y: number }[] | null>(null);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const p = toNorm(e);
    if (tool === 'point') return add({ x: p.x, y: p.y, kind: 'point' });
    e.currentTarget.setPointerCapture(e.pointerId);
    strokeRef.current = [p];
    setStroke([p]);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const buf = strokeRef.current;
    if (!buf) return;
    const p = toNorm(e);
    const last = buf[buf.length - 1]!;
    if (Math.hypot(p.x - last.x, p.y - last.y) >= MIN_STEP && buf.length < BODYMAP_MAX_PATH) {
      buf.push(p);
      setStroke([...buf]);
    }
  }
  function onPointerUp() {
    const buf = strokeRef.current;
    if (!buf) return;
    strokeRef.current = null;
    // Kurzer Tipp mit dem Pinsel → Punkt; sonst Strich (Nummer am Anfang des Strichs, wie v2).
    if (buf.length < 2) add({ x: buf[0]!.x, y: buf[0]!.y, kind: 'point' });
    else add({ x: buf[0]!.x, y: buf[0]!.y, kind: 'brush', path: buf });
    setStroke(null);
  }

  function choosePreset(pid: string) {
    if (pid === preset.id) return;
    if (current.points.length > 0) return setSwitchTo(pid);
    onChange({ presetId: pid, points: [] });
  }
  const setComment = (mid: string, comment: string) =>
    onChange({ ...current, points: current.points.map((m) => (m.id === mid ? { ...m, comment: comment || undefined } : m)) });
  const remove = (mid: string) => onChange({ ...current, points: current.points.filter((m) => m.id !== mid) });

  return (
    <div id={id} className="flex flex-col gap-3">
      <div role="group" aria-label={de.bodymap.image} className="flex flex-wrap gap-2">
        {BODYMAP_PRESETS.map((p) => (
          <Button key={p.id} type="button" size="sm" variant={p.id === preset.id ? 'default' : 'outline'} aria-pressed={p.id === preset.id} onClick={() => choosePreset(p.id)}>
            {presetName(p.id)}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 min-[440px]:grid-cols-2">
        <ToggleGroup aria-label={de.bodymap.tool}>
          <ToggleGroupItem pressed={tool === 'point'} aria-label={de.bodymap.toolPoint} onClick={() => setTool('point')}>
            <ArrowDownToDot className="size-4" aria-hidden />
            {de.bodymap.toolPoint}
          </ToggleGroupItem>
          <ToggleGroupItem pressed={tool === 'brush'} aria-label={de.bodymap.toolBrush} onClick={() => setTool('brush')}>
            <Brush className="size-4" aria-hidden />
            {de.bodymap.toolBrush}
          </ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup aria-label={de.bodymap.size}>
          {(Object.keys(BODYMAP_SIZES) as SizeKey[]).map((k) => (
            <ToggleGroupItem key={k} pressed={size === k} onClick={() => setSize(k)}>
              {de.bodymap.sizes[k]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor={`${id}-intensity`} className="shrink-0 font-normal">
          {de.bodymap.intensity}
        </Label>
        <Slider id={`${id}-intensity`} min={1} max={10} step={1} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} />
        <span className="w-6 text-right font-semibold tabular-nums">{intensity}</span>
      </div>

      <div
        ref={area}
        data-testid="bodymap-canvas"
        data-tool={tool}
        aria-label={de.bodymap.tapHint}
        className="relative cursor-crosshair touch-none overflow-hidden rounded-lg border-2 select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => ((strokeRef.current = null), setStroke(null))}
      >
        <img
          src={preset.src}
          alt={presetName(preset.id)}
          className="pointer-events-none block max-h-[60vh] w-full object-contain"
          draggable={false}
          onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        />
        {dims ? (
          <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
            {current.points.map((m, i) => (
              <MarkShape key={m.id} mark={m} n={i + 1} w={dims.w} h={dims.h} />
            ))}
            {stroke && stroke.length > 1 ? (
              <polyline
                points={stroke.map((p) => `${p.x * dims.w},${p.y * dims.h}`).join(' ')}
                className={intensityStroke(intensity)}
                fill="none"
                strokeWidth={BODYMAP_SIZES[size] * dims.w}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.5}
              />
            ) : null}
          </svg>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{tool === 'brush' ? de.bodymap.brushHint : de.bodymap.tapHint}</p>

      {current.points.length > 0 ? (
        <ul data-testid="bodymap-points" className="flex flex-col gap-2">
          {current.points.map((m, i) => (
            <li key={m.id} data-testid="bodymap-mark" className="flex flex-col gap-2 rounded-md border px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>{de.bodymap.markLabel(i + 1, m.kind === 'brush', m.intensity ?? 5)}</span>
                <Button type="button" variant="ghost" size="icon" aria-label={de.bodymap.removePoint(i + 1)} onClick={() => remove(m.id)}>
                  <X aria-hidden />
                </Button>
              </div>
              <Input aria-label={de.bodymap.commentFor(i + 1)} placeholder={de.bodymap.commentPlaceholder} value={m.comment ?? ''} onChange={(e) => setComment(m.id, e.target.value)} />
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog open={switchTo !== null} onClose={() => setSwitchTo(null)} aria-labelledby={`${id}-switch-title`}>
        <DialogTitle id={`${id}-switch-title`}>{de.bodymap.switchTitle}</DialogTitle>
        <DialogDescription>{de.bodymap.switchHint}</DialogDescription>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setSwitchTo(null)}>
            {de.lock.cancel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (switchTo) onChange({ presetId: switchTo, points: [] });
              setSwitchTo(null);
            }}
          >
            {de.bodymap.switchConfirm}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function MarkShape({ mark, n, w, h }: { mark: Mark; n: number; w: number; h: number }) {
  const d = (mark.size ?? DEFAULT_SIZE) * w;
  const x = mark.x * w;
  const y = mark.y * h;
  const font = Math.max(w * 0.025, Math.min(w * 0.04, d * 0.45));
  return (
    <g data-mark-kind={mark.kind ?? 'point'}>
      {mark.kind === 'brush' && mark.path ? (
        <polyline
          points={mark.path.map((p) => `${p.x * w},${p.y * h}`).join(' ')}
          className={intensityStroke(mark.intensity)}
          fill="none"
          strokeWidth={d}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.5}
        />
      ) : (
        <>
          <circle cx={x} cy={y} r={d / 2 + w * 0.008} className={intensityFill(mark.intensity)} opacity={0.25} />
          <circle cx={x} cy={y} r={d / 2} className={`${intensityFill(mark.intensity)} ${intensityStroke(mark.intensity)}`} strokeWidth={w * 0.003} opacity={0.8} />
        </>
      )}
      <text x={x} y={y} dy="0.35em" textAnchor="middle" fontSize={font} className={`fill-white ${intensityStroke(mark.intensity)} font-bold`} strokeWidth={w * 0.003} paintOrder="stroke">
        {`#${n}`}
      </text>
    </g>
  );
}
