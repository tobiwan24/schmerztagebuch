// ANA-15: Analyse-Texte sind rein beschreibend — keine kausalen Formulierungen (Spec 06).
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deAnalysis } from './lazy/analysis';

const FORBIDDEN = [/verursach/i, /führt zu/i, /\bwegen\b/i, /\bdeshalb\b/i, /\bdaher\b/i, /\bausgelöst durch\b/i];

/** Alle String-Werte eines (verschachtelten) Objekts. */
function strings(o: unknown): string[] {
  if (typeof o === 'string') return [o];
  if (o && typeof o === 'object') return Object.values(o).flatMap(strings);
  return [];
}

describe('Analyse-Texte', () => {
  it('ANA-15: Analyse-Texte enthalten keine kausalen Formulierungen (Wortliste „verursacht", „führt zu", „wegen")', () => {
    const texts = strings(deAnalysis);
    expect(texts.length).toBeGreaterThan(5);
    const dir = fileURLToPath(new URL('../../../../packages/analysis/src/', import.meta.url));
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))) {
      // String-Literale und Kommentare des Analyse-Pakets (Kennzahl-Beschriftungen, Hinweise)
      texts.push(...(readFileSync(dir + f, 'utf8').match(/'[^'\n]*'|`[^`\n]*`/g) ?? []));
    }
    const hits = texts.filter((t) => FORBIDDEN.some((re) => re.test(t)));
    expect(hits).toEqual([]);
    // Selbsttest der Wortliste
    expect(FORBIDDEN.some((re) => re.test('Stress verursacht Schmerzen'))).toBe(true);
    expect(FORBIDDEN.some((re) => re.test('Schlafmangel führt zu Migräne'))).toBe(true);
    expect(FORBIDDEN.some((re) => re.test('wegen des Wetters'))).toBe(true);
  });
});
