// Body-Map für den PDF-Bericht als Bild rendern (wie v2 `renderBodyMapToImage`): Bild + Markierungen (Punkte als Kreise,
// Pinselstriche als Linien, Nummern) auf einem Canvas, Farben je Intensität wie in der App.
import type { BodymapValue } from '@stb/core';
import type { RenderedImage } from '@stb/export';
import { BODYMAP_PRESETS } from '@/components/blocks/bodymap-presets';

const COLORS = (i: number | undefined) => {
  const v = i ?? 5;
  return v <= 3 ? '#22c55e' : v <= 6 ? '#eab308' : v <= 8 ? '#f97316' : '#ef4444';
};
const MAX_SIDE = 1000;

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Body-Map-Bild konnte nicht geladen werden'));
    img.src = src;
  });
}

/** `ownImages`: eigene Bilder des Tagebuchs (ID → Data-URL). */
export function createBodymapRenderer(ownImages: Map<string, string>) {
  return async (value: BodymapValue): Promise<RenderedImage | null> => {
    const src = BODYMAP_PRESETS.find((p) => p.id === value.presetId)?.src ?? ownImages.get(value.presetId);
    if (!src) return null;
    const img = await load(src);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    value.points.forEach((m, i) => {
      const color = COLORS(m.intensity);
      const d = (m.size ?? 0.05) * w;
      if (m.kind === 'brush' && m.path) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = color;
        ctx.lineWidth = d;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        m.path.forEach((p, j) => (j ? ctx.lineTo(p.x * w, p.y * h) : ctx.moveTo(p.x * w, p.y * h)));
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(m.x * w, m.y * h, d / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      const font = Math.max(12, Math.min(20, d * 0.45));
      ctx.font = `bold ${font}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.strokeText(`#${i + 1}`, m.x * w, m.y * h);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`#${i + 1}`, m.x * w, m.y * h);
    });
    return { dataUrl: canvas.toDataURL('image/png'), width: w, height: h };
  };
}
