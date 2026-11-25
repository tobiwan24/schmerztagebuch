// Diagramm für das PDF-Layout „Dashboard" (EXP-15): Tageswerte des ersten Ergebnis-Blocks als Linie auf einem Canvas
// (heller Hintergrund, unabhängig vom Theme; kein DOM-Chart nötig, auch wenn die Auswertung nicht geöffnet ist).
import type { RenderedImage, ReportChart } from '@stb/export';

const W = 900;
const H = 360;
const PAD = { l: 46, r: 16, t: 34, b: 34 };

const day = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

export async function renderChartImage(chart: ReportChart): Promise<RenderedImage | null> {
  if (!chart.points.length) return null;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const font = 'system-ui, sans-serif';
  ctx.fillStyle = '#1f2937';
  ctx.font = `600 16px ${font}`;
  ctx.fillText(chart.label, PAD.l, 22);

  const values = chart.points.map((p) => p.value);
  const lo = Math.min(0, ...values);
  const hi = Math.max(...values, lo + 1);
  const t0 = ms(chart.from);
  const span = Math.max(1, ms(chart.to) - t0);
  const x = (d: string) => PAD.l + ((ms(d) - t0) / span) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - ((v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  ctx.font = `12px ${font}`;
  ctx.strokeStyle = '#e5e7eb';
  ctx.fillStyle = '#6b7280';
  ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const v = lo + ((hi - lo) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(PAD.l, y(v));
    ctx.lineTo(W - PAD.r, y(v));
    ctx.stroke();
    ctx.fillText(String(Math.round(v * 10) / 10), PAD.l - 6, y(v) + 4);
  }
  ctx.textAlign = 'center';
  for (const [i, d] of [chart.from, chart.to].entries()) ctx.fillText(day(d), i === 0 ? PAD.l + 12 : W - PAD.r - 12, H - 10);

  ctx.strokeStyle = '#374151';
  ctx.lineWidth = 2;
  ctx.beginPath();
  chart.points.forEach((p, i) => (i === 0 ? ctx.moveTo(x(p.day), y(p.value)) : ctx.lineTo(x(p.day), y(p.value))));
  ctx.stroke();
  ctx.fillStyle = '#374151';
  for (const p of chart.points) {
    ctx.beginPath();
    ctx.arc(x(p.day), y(p.value), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return { dataUrl: canvas.toDataURL('image/png'), width: W, height: H };
}
