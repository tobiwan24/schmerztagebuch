import { describe, expect, it } from 'vitest';
import { addTag, normalizeTag, suggestTags, MAX_TAGS, MAX_TAG_LENGTH } from './tags.js';

describe('Tags (Spec 05, BLK-28)', () => {
  it('BLK-28: Normalisierung trimmt, fasst Leerraum zusammen, entfernt Kommas und kürzt auf 40 Zeichen', () => {
    expect(normalizeTag('  Arbeit   heute \n')).toBe('Arbeit heute');
    expect(normalizeTag('a,b')).toBe('ab');
    expect(normalizeTag('x'.repeat(60))).toBe('x'.repeat(MAX_TAG_LENGTH));
    expect(normalizeTag('   ')).toBeNull();
    expect(normalizeTag(' , ')).toBeNull();
  });

  it('BLK-28: Duplikate ohne Rücksicht auf Groß-/Kleinschreibung — die erste Schreibweise bleibt', () => {
    expect(addTag(['Arbeit'], 'arbeit')).toEqual(['Arbeit']);
    expect(addTag(['Arbeit'], ' ARBEIT ')).toEqual(['Arbeit']);
    expect(addTag(['Arbeit'], 'Urlaub')).toEqual(['Arbeit', 'Urlaub']);
    expect(addTag([], '')).toEqual([]);
  });

  it('BLK-28: höchstens 20 Tags', () => {
    const full = Array.from({ length: MAX_TAGS }, (_, i) => `t${i}`);
    expect(addTag(full, 'neu')).toEqual(full);
    expect(addTag(full.slice(1), 'neu')).toHaveLength(MAX_TAGS);
  });

  it('BLK-28: Vorschläge = vorhandene Tags mit passendem Präfix, nach Häufigkeit, höchstens 8, ohne bereits gesetzte', () => {
    const all = [['Arbeit', 'Urlaub'], ['arbeit'], ['Arzt'], ['Arbeit', 'Wochenende']];
    expect(suggestTags(all, 'ar', [])).toEqual(['Arbeit', 'Arzt']);
    expect(suggestTags(all, 'AR', ['arbeit'])).toEqual(['Arzt']);
    expect(suggestTags(all, 'x', [])).toEqual([]);
    const many = [Array.from({ length: 12 }, (_, i) => `tag${String(i).padStart(2, '0')}`)];
    expect(suggestTags(many, 't', [])).toHaveLength(8);
    expect(suggestTags(all, '', [])[0]).toBe('Arbeit');
  });
});
