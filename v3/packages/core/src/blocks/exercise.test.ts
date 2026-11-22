import { describe, it, expect } from 'vitest';
import { analyzeBlockValue, blockModules, parseBlockConfig, parseBlockValue } from './index.js';
import { createIdGenerator } from '../ids.js';

const { newId } = createIdGenerator({ now: () => 1_700_000_000_000 });
const l1 = newId();
const l2 = newId();
const config = parseBlockConfig('exercise', {
  description: 'Schulterkreisen',
  steps: ['Aufrecht stehen', 'Schultern kreisen'],
  targetSets: 3,
  targetReps: 10,
  videoUrl: 'https://example.org/video',
  levels: [
    { id: l1, label: 'Leicht' },
    { id: l2, label: 'Mittel' },
  ],
});

describe('exercise', () => {
  it('BLK-51: videoUrl nur https, höchstens 20 Schritte, eindeutige Stufen', () => {
    for (const videoUrl of ['http://example.org/v', 'javascript:alert(1)', 'nicht-url', 'ftp://x.org']) {
      expect(() => parseBlockConfig('exercise', { videoUrl })).toThrow();
    }
    expect(() => parseBlockConfig('exercise', { steps: Array.from({ length: 21 }, () => 'x') })).toThrow();
    expect(parseBlockConfig('exercise', { steps: Array.from({ length: 20 }, () => 'x') }).steps).toHaveLength(20);
    expect(() => parseBlockConfig('exercise', { levels: [{ id: l1, label: 'A' }, { id: l1, label: 'B' }] })).toThrow();
    expect(() => parseBlockConfig('exercise', { targetSets: 0 })).toThrow();
    expect(parseBlockConfig('exercise', {})).toEqual({});
  });

  it('BLK-51: Wert gegen Konfiguration prüfen (Stufe, Schmerz 0..10, ganze Zahlen)', () => {
    const ok = parseBlockValue('exercise', config, { done: true, sets: 3, reps: 10, durationSec: 90, levelId: l2, painDuring: 4 });
    expect(ok.success).toBe(true);
    expect(parseBlockValue('exercise', config, { done: true, levelId: newId() }).success).toBe(false);
    expect(parseBlockValue('exercise', config, { done: true, painDuring: 11 }).success).toBe(false);
    expect(parseBlockValue('exercise', config, { done: true, sets: -1 }).success).toBe(false);
    expect(parseBlockValue('exercise', config, { done: true, reps: 2.5 }).success).toBe(false);
    expect(parseBlockValue('exercise', config, {}).success).toBe(false);
  });

  it('BLK-51: emptyValue, isEmpty, toDisplay', () => {
    const m = blockModules.exercise;
    expect(m.emptyValue(config)).toEqual({ done: false });
    expect(m.isEmpty({ done: false })).toBe(true);
    expect(m.isEmpty(undefined)).toBe(true);
    expect(m.isEmpty({ done: true })).toBe(false);
    expect(m.isEmpty({ done: false, sets: 2 })).toBe(false);
    expect(m.toDisplay({ done: true, sets: 3, reps: 10, durationSec: 60, levelId: l2, painDuring: 2 }, config)).toBe(
      'erledigt, 3 × 10, 60 s, Mittel, Schmerz 2',
    );
    expect(m.toDisplay({ done: false }, config)).toBe('nicht erledigt');
  });

  it('BLK-51: Analyse = Ereignis erledigt + Sätze, Wiederholungen, Dauer numerisch', () => {
    expect(analyzeBlockValue('exercise', config, { done: true, sets: 3, reps: 10, durationSec: 60, levelId: l2, painDuring: 2 })).toEqual({
      kind: 'exercise',
      done: true,
      sets: 3,
      reps: 10,
      durationSec: 60,
      levelId: l2,
      levelLabel: 'Mittel',
      levelIndex: 1,
      painDuring: 2,
    });
    expect(analyzeBlockValue('exercise', config, { done: true })).toEqual({ kind: 'exercise', done: true });
    expect(analyzeBlockValue('exercise', config, { done: false })).toBeNull();
  });
});
