import { describe, it, expect } from 'vitest';
import { parseInviteCode } from './flow';
import { loadQrDecoder, qrMatrix } from '../lib/qr';

const ID = '0b6f3c1e-5d2a-4c1b-9a7e-2f4d8c9b1a00';
const SECRET = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';

/** QR-Matrix in ein RGBA-Bild rendern (Ruhezone 4 Module, 4 px je Modul), wie es die Kamera liefern würde. */
async function render(text: string) {
  const { size, path } = await qrMatrix(text);
  const scale = 4;
  const quiet = 4;
  const w = (size + 2 * quiet) * scale;
  const dark = new Set<string>();
  for (const m of path.matchAll(/M(\d+) (\d+)/g)) dark.add(`${m[1]},${m[2]}`);
  const data = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const c = Math.floor(x / scale) - quiet;
      const r = Math.floor(y / scale) - quiet;
      if (dark.has(`${c},${r}`)) data.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 3);
    }
  }
  return { data, w };
}

describe('Einladungscode (RDM-032)', () => {
  it('SHR-18: parseInviteCode nimmt Code, Fragment und ganzen Link an, lehnt anderes ab', () => {
    const want = { id: ID, secret: SECRET };
    expect(parseInviteCode(`${ID}.${SECRET}`)).toEqual(want);
    expect(parseInviteCode(` #${ID}.${SECRET}\n`)).toEqual(want);
    expect(parseInviteCode(`https://example.test:8060/invite#${ID}.${SECRET}`)).toEqual(want);
    expect(parseInviteCode('https://example.test/invite')).toBeNull();
    expect(parseInviteCode(`${ID}.kurz`)).toBeNull();
    expect(parseInviteCode('')).toBeNull();
  });

  it('SHR-18: QR-Code aus qrMatrix wird vom Leser wieder als derselbe Code erkannt', async () => {
    const code = `${ID}.${SECRET}`;
    const { data, w } = await render(code);
    const decode = await loadQrDecoder();
    expect(decode(data, w, w)).toBe(code);
    expect(parseInviteCode(decode(data, w, w) ?? '')).toEqual({ id: ID, secret: SECRET });
  });
});
