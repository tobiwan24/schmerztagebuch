// Bildbearbeitung für eigene Body-Map-Bilder (Spec 05, A-024), portiert aus v2 `BodyMapBlock.tsx`
// (`resizeAndOptimizeImage`, `getCroppedImg`): weißer Hintergrund, JPEG 0,85, max. 1000×1400.
export const IMAGE_MAX = { width: 1000, height: 1400 } as const;
const JPEG_QUALITY = 0.85;

export interface ProcessedImage {
  dataUrl: string;
  width: number;
  height: number;
}

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
    img.src = src;
  });
}

function toJpeg(img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, w: number, h: number): ProcessedImage {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas nicht verfügbar');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY), width: canvas.width, height: canvas.height };
}

/** Passt ein Maß in die Obergrenzen ein (nur verkleinern). */
export function fitWithin(width: number, height: number, max = IMAGE_MAX): { width: number; height: number } {
  const ratio = Math.min(1, max.width / width, max.height / height);
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

export async function resizeImage(src: string): Promise<ProcessedImage> {
  const img = await load(src);
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight);
  return toJpeg(img, 0, 0, img.naturalWidth, img.naturalHeight, width, height);
}

/** Schneidet den Bereich (in Pixeln des Quellbilds) aus und verkleinert bei Bedarf. */
export async function cropImage(src: string, area: CropArea): Promise<ProcessedImage> {
  const img = await load(src);
  const { width, height } = fitWithin(area.width, area.height);
  return toJpeg(img, area.x, area.y, area.width, area.height, width, height);
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('Datei konnte nicht gelesen werden'));
    r.readAsDataURL(file);
  });
}
