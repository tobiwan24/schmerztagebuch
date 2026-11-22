// Body-Map-Bilder aus v2 einordnen (A-031): v2 speicherte nur das (verkleinerte) Bild als Data-URL, kein `presetId`.
// Vergleich per Fingerabdruck (16×16 Graustufen) und Seitenverhältnis mit den Standardbildern; passt keines, wird das
// Bild als eigenes Bild übernommen (mit seinen Maßen). Läuft vor der (synchronen) Transformation, nur im Browser.
import type { ResolvedImage, V2Source } from '@stb/core';
import { BODYMAP_PRESETS } from '@/components/blocks/bodymap-presets';

const SIZE = 16;
/** Mittlere Abweichung je Pixel (0–255), bis zu der zwei Bilder als gleich gelten (JPEG-Verkleinerung, Skalierung). */
const MAX_DIFF = 14;
const MAX_RATIO_DIFF = 0.02;

interface Print {
  width: number;
  height: number;
  gray: Float32Array;
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild nicht lesbar'));
    img.src = src;
  });
}

async function fingerprint(src: string): Promise<Print> {
  const img = await load(src);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
  const gray = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < gray.length; i++) gray[i] = 0.299 * px[i * 4]! + 0.587 * px[i * 4 + 1]! + 0.114 * px[i * 4 + 2]!;
  return { width: img.naturalWidth, height: img.naturalHeight, gray };
}

function diff(a: Print, b: Print): number {
  let sum = 0;
  for (let i = 0; i < a.gray.length; i++) sum += Math.abs(a.gray[i]! - b.gray[i]!);
  return sum / a.gray.length;
}

/** Alle Bild-Data-URLs aus Body-Map-Werten der entschlüsselten v2-Einträge. */
export function collectBodymapImages(src: V2Source): string[] {
  const out = new Set<string>();
  for (const e of src.entries) {
    for (const b of e.blocks ?? []) {
      if (b.type !== 'bodymap' || typeof b.value !== 'string') continue;
      try {
        const v = JSON.parse(b.value) as { image?: unknown };
        if (typeof v.image === 'string' && v.image) out.add(v.image);
      } catch {
        // unlesbarer Wert — die Transformation meldet ihn
      }
    }
  }
  return [...out];
}

/**
 * Ordnet alle Bilder vorab ein und liefert die synchrone `resolveImage`-Funktion für `transformV2`. Der Standard des
 * Blocks (`defaultPresetId`) wird bei Gleichstand bevorzugt.
 */
export async function prepareImageResolver(src: V2Source): Promise<(image: string, hint: { defaultPresetId?: string }) => ResolvedImage | null> {
  const images = collectBodymapImages(src);
  if (!images.length) return () => null;
  const presets: { id: string; print: Print | null }[] = await Promise.all(BODYMAP_PRESETS.map(async (p) => ({ id: p.id as string, print: await fingerprint(p.src).catch(() => null) })));
  const resolved = new Map<string, { print: Print } | null>();
  for (const img of images) resolved.set(img, await fingerprint(img).then((print) => ({ print })).catch(() => null));

  return (image, hint) => {
    const r = resolved.get(image);
    if (!r) return null;
    const ratio = r.print.width / r.print.height;
    const candidates = presets
      .filter((p): p is { id: string; print: Print } => !!p.print && Math.abs(p.print.width / p.print.height - ratio) / ratio <= MAX_RATIO_DIFF)
      .map((p) => ({ id: p.id, d: diff(p.print, r.print) }))
      .filter((c) => c.d <= MAX_DIFF)
      .sort((a, b) => a.d - b.d || (a.id === hint.defaultPresetId ? -1 : b.id === hint.defaultPresetId ? 1 : 0));
    return candidates[0] ? { presetId: candidates[0].id } : { width: r.print.width, height: r.print.height };
  };
}
