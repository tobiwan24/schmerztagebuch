import { readFileSync } from 'node:fs';
import { decode } from 'fast-png';
import { describe, expect, it } from 'vitest';

const asset = (name: string) => readFileSync(new URL(`../../assets/bodymap/${name}`, import.meta.url));

describe('Body-Map-Standardbilder', () => {
  it.each(['koerper-vorderseite.png', 'koerper-rueckseite.png'])('BLK-40: %s hat in den äußeren 4 Pixelspalten links keine sichtbaren Pixel (Alpha = 0)', (name) => {
    const img = decode(asset(name));
    expect(img.channels).toBe(4);
    expect(img.depth).toBe(8);
    const visible: [number, number][] = [];
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < 4; x++) {
        if (img.data[(y * img.width + x) * 4 + 3] !== 0) visible.push([x, y]);
      }
    }
    expect(visible).toEqual([]);
  });
});
