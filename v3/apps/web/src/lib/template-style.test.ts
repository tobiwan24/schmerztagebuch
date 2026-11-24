import { describe, expect, it } from 'vitest';
import { resolveTemplateColor, resolveTemplateIcon } from './template-style';

describe('Vorlagen-Stil auflösen', () => {
  it('RDM-028 P3: v3-Namen und -Tokens bleiben unverändert', () => {
    expect(resolveTemplateIcon('Moon')).toBe('Moon');
    expect(resolveTemplateColor('violet')).toBe('violet');
  });
  it('RDM-028 P3: v2-Icon-Namen werden zugeordnet, case-insensitiv, unbekannt/leer → BookOpen', () => {
    expect(resolveTemplateIcon('Syringe')).toBe('Pill');
    expect(resolveTemplateIcon('BedDouble')).toBe('Moon');
    expect(resolveTemplateIcon('Book')).toBe('BookOpen');
    expect(resolveTemplateIcon('book')).toBe('BookOpen');
    expect(resolveTemplateIcon('flame')).toBe('Flame');
    expect(resolveTemplateIcon('Droplet')).toBe('Droplets');
    expect(resolveTemplateIcon('Footprints')).toBe('Activity');
    expect(resolveTemplateIcon('Gibtsnicht')).toBe('BookOpen');
    expect(resolveTemplateIcon(undefined)).toBe('BookOpen');
  });
  it('RDM-028 P3: Hex-Farben → nächstes Farb-Token', () => {
    expect(resolveTemplateColor('#007AFF')).toBe('blue');
    expect(resolveTemplateColor('#FF3B30')).toBe('red');
    expect(resolveTemplateColor('#34C759')).toBe('green');
    expect(resolveTemplateColor('#5856D6')).toBe('violet');
    expect(resolveTemplateColor('#FF9500')).toBe('amber');
    expect(resolveTemplateColor('#6366f1')).toBe('violet');
    expect(resolveTemplateColor('#f00')).toBe('red');
  });
  it('RDM-028: Grau, Schwarz, ungültig und leer → Standardfarbe Schwarz', () => {
    expect(resolveTemplateColor('black')).toBe('black');
    expect(resolveTemplateColor('#888888')).toBe('black');
    expect(resolveTemplateColor('#000000')).toBe('black');
    expect(resolveTemplateColor('nonsense')).toBe('black');
    expect(resolveTemplateColor(undefined)).toBe('black');
  });
});
