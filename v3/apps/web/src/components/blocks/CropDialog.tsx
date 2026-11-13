// Zuschneiden eines Body-Map-Bilds (Spec 05, A-024) wie v2: react-easy-crop, Seitenverhältnis wählbar, Zoom.
// Ergebnis wird als eigenes Bild des Tagebuchs gespeichert; vorhandene Markierungen gehen dabei verloren (Hinweis).
import { useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { CropArea } from '@/lib/image';
import { de } from '@/i18n/de';

const ASPECTS = [
  { key: 'portrait', value: 3 / 4 },
  { key: 'square', value: 1 },
  { key: 'landscape', value: 4 / 3 },
  { key: 'free', value: undefined },
] as const;

export function CropDialog({
  src, defaultName, hasMarks, busy, onCancel, onApply,
}: { src: string | null; defaultName: string; hasMarks: boolean; busy: boolean; onCancel: () => void; onApply: (area: CropArea, name: string) => void }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]['key']>('portrait');
  const [area, setArea] = useState<Area | null>(null);
  const [name, setName] = useState(defaultName);
  const aspectValue = ASPECTS.find((a) => a.key === aspect)?.value;

  return (
    <Dialog open={src !== null} onClose={onCancel} aria-labelledby="crop-title" className="max-w-md">
      <DialogTitle id="crop-title">{de.bodymap.cropTitle}</DialogTitle>
      {hasMarks ? <DialogDescription>{de.bodymap.cropMarksLost}</DialogDescription> : null}
      <div data-testid="crop-area" className="relative mt-4 h-72 w-full overflow-hidden rounded-md bg-muted">
        {src ? (
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={aspectValue}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_a, pixels) => setArea(pixels)}
          />
        ) : null}
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <ToggleGroup aria-label={de.bodymap.cropAspect}>
          {ASPECTS.map((a) => (
            <ToggleGroupItem key={a.key} pressed={aspect === a.key} onClick={() => setAspect(a.key)}>
              {de.bodymap.aspects[a.key]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex items-center gap-3">
          <Label htmlFor="crop-zoom" className="shrink-0 font-normal">
            {de.bodymap.cropZoom}
          </Label>
          <Slider id="crop-zoom" min={1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="crop-name">{de.bodymap.imageName}</Label>
          <Input id="crop-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {de.lock.cancel}
        </Button>
        <Button type="button" disabled={busy || !area || !name.trim()} onClick={() => area && onApply(area, name.trim())}>
          {busy ? de.entry.saving : de.bodymap.cropApply}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
