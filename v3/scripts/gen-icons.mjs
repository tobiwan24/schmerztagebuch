// Erzeugt die PWA-Symbole (PNG) ohne Abhängigkeit: Verlauf + Notizbuch-Motiv wie v2 (icon-192.svg).
// Aufruf: node scripts/gen-icons.mjs  → apps/web/public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../apps/web/public/', import.meta.url));

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x / size, y / size);
      raw.set([r, g, b, a], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const C1 = [0x3e, 0x5a, 0x63];
const C2 = [0x8a, 0x5a, 0x4e];
const C3 = [0xc8, 0x55, 0x3d];
const PAGE = [0xf6, 0xed, 0xe2];
const LINE = [0xb7, 0xa4, 0x8f];

/** @param {boolean} maskable Vollfläche (Sicherheitszone 80 %) statt abgerundetem Quadrat. */
function icon(maskable) {
  // Motiv liegt in der inneren Sicherheitszone (maskable: Kreis mit 40 % Radius um die Mitte)
  const k = maskable ? 0.72 : 1;
  return (u, v) => {
    if (!maskable) {
      // abgerundetes Quadrat, Radius 22 %
      const r = 0.22;
      const dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0);
      const dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
      if (dx * dx + dy * dy > r * r) return [0, 0, 0, 0];
    }
    const t = (u + v) / 2;
    let c = t < 0.6 ? mix(C1, C2, t / 0.6) : mix(C2, C3, (t - 0.6) / 0.4);
    // Seite des Notizbuchs
    const px = (u - 0.5) / k + 0.5;
    const py = (v - 0.5) / k + 0.5;
    if (px >= 0.258 && px <= 0.766 && py >= 0.234 && py <= 0.797) {
      c = PAGE;
      const lines = [[0.375, 0.375, 0.69], [0.375, 0.441, 0.629], [0.375, 0.508, 0.66]];
      for (const [x0, y, x1] of lines) if (px >= x0 && px <= x1 && Math.abs(py - (y + 0.0)) < 0.006) c = LINE;
      // Schmerz-Marker (Punkt)
      if ((px - 0.62) ** 2 + (py - 0.66) ** 2 < 0.045 ** 2) c = C3;
    }
    return [...c, 255];
  };
}

mkdirSync(OUT, { recursive: true });
const files = [
  ['icon-192.png', 192, icon(false)],
  ['icon-512.png', 512, icon(false)],
  ['icon-maskable-512.png', 512, icon(true)],
  ['apple-touch-icon.png', 180, icon(true)],
];
for (const [name, size, px] of files) writeFileSync(OUT + name, png(size, px));
console.log(`Symbole geschrieben nach ${OUT}`);
