import { describe, expect, it } from 'vitest';
import { OPTION_COLORS } from '@stb/core';
import { OPTION_TONES, optionTone } from './option-colors';

describe('Optionsfarben im Formular', () => {
  it('jede Farbe der Editor-Palette hat einen eigenen Ton', () => {
    for (const c of OPTION_COLORS) expect(optionTone(c)?.hex).toBe(c);
  });
  it('fremde Töne werden der nächsten Palettenfarbe zugeordnet, ungültige bleiben neutral', () => {
    expect(optionTone('#ff0000')?.hex).toBe('#ef4444');
    expect(optionTone('#2563eb')?.hex).toBe('#3b82f6');
    expect(optionTone('#6366f1')?.hex).toBe('#6366f1');
    expect(optionTone('rot')).toBeNull();
    expect(optionTone('#abc')).not.toBeNull();
  });
  it('gewählte Töne sind dunkle Flächen (-700) mit weißem Text', () => {
    for (const t of OPTION_TONES) expect(t.selected).toMatch(/bg-\w+-700 text-white/);
  });
});
