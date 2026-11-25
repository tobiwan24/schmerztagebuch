import { describe, it, expect } from 'vitest';
import { bigFixture } from './big-fixture.js';
import { buildWorkingSet, type WorkingSet } from './working-set.js';
import { createSearchIndex, isSearchSnapshot, SEARCH_INDEX_VERSION } from './search.js';

function bigWs(count = 5000): WorkingSet {
  const big = bigFixture(count);
  return buildWorkingSet({ entries: big.entries, templates: big.templates, versions: big.versions, diaries: big.diaries });
}
/** Wie nach dem Speichern und Laden (Verschlüsselung/IndexedDB serialisieren den Stand). */
const stored = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const withTag = (ws: WorkingSet, ids: string[], tag: string): WorkingSet => {
  const entries = ws.entries.map((e) => (ids.includes(e.id) ? { ...e, tags: [...e.tags, tag] } : e));
  return { ...ws, entries, byId: new Map(entries.map((e) => [e.id, e])) };
};

describe('Persistierter Suchindex', () => {
  it('ANA-33: Kaltstart aus dem gespeicherten Stand und erste Suche bei 5.000 Einträgen < 500 ms; gleiche Treffer wie ein Neuaufbau', () => {
    const ws = bigWs();
    const first = createSearchIndex(ws);
    const snapshot = stored(first.snapshot());
    expect(snapshot).not.toBeNull();
    expect(Object.keys(snapshot!.stamps)).toHaveLength(5000);
    expect(first.snapshot()).toBeNull(); // nichts geändert seit dem letzten Sichern

    const t0 = performance.now();
    const cold = createSearchIndex(ws, { snapshot });
    const hits = cold.search('Kopfschmerz');
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(500);
    expect(hits.size).toBeGreaterThan(0);
    expect(cold.snapshot()).toBeNull(); // unverändert gegenüber dem Arbeitsset → nichts neu zu sichern

    const rebuilt = createSearchIndex(ws);
    for (const q of ['Kopfschmerz', 'uebelkeit', 'Rücken', 'xyzzy', 'physio termin']) {
      expect([...cold.search(q)].sort(), q).toEqual([...rebuilt.search(q)].sort());
    }
  });

  it('ANA-33: Index nach Eintragsänderung aktuell — geänderte, neue und entfernte Einträge werden inkrementell nachgezogen', () => {
    const ws = bigWs(300);
    const snapshot = stored(createSearchIndex(ws).snapshot());
    const [a, b, c] = ws.entries.slice(0, 3).map((e) => e.id) as [string, string, string];
    // a bekommt einen neuen Tag, b wird entfernt, c bleibt; dazu ein neuer Eintrag d (Kopie von c mit neuer ID)
    const changed = withTag(ws, [a], 'zzgeaendert');
    const d = { ...changed.byId.get(c)!, id: 'neu-d', tags: ['zzneu'] };
    const entries = [...changed.entries.filter((e) => e.id !== b), d];
    const next: WorkingSet = { ...changed, entries, byId: new Map(entries.map((e) => [e.id, e])) };

    const idx = createSearchIndex(next, { snapshot });
    expect(idx.search('zzgeaendert')).toEqual(new Set([a]));
    expect(idx.search('zzneu')).toEqual(new Set(['neu-d']));
    expect(idx.search('zzgeaendert').has(b)).toBe(false);
    const all = createSearchIndex(next);
    for (const e of ws.entries.slice(0, 40)) expect([...idx.search(e.templateName)].sort()).toEqual([...all.search(e.templateName)].sort());
    expect([...idx.search(ws.byId.get(b)!.templateName)].includes(b)).toBe(false);

    const snap2 = idx.snapshot();
    expect(snap2).not.toBeNull();
    expect(Object.keys(snap2!.stamps)).toHaveLength(entries.length);
    // Der neue Stand enthält die Änderungen: ohne weitere Änderung nichts zu tun.
    const again = createSearchIndex(next, { snapshot: stored(snap2) });
    expect(again.snapshot()).toBeNull();
    expect(again.search('zzneu')).toEqual(new Set(['neu-d']));

    // Laufender Betrieb: sync zählt die Unterschiede, add/remove markieren den Stand als geändert
    expect(idx.sync(next)).toBe(0);
    expect(idx.sync(withTag(next, [c], 'zzspaeter'))).toBe(1);
    expect(idx.search('zzspaeter')).toEqual(new Set([c]));
    idx.remove(c);
    expect(idx.search('zzspaeter').size).toBe(0);
    expect(idx.snapshot()).not.toBeNull();
  });

  it('ANA-33: unbrauchbarer oder fremder Stand (Version, Format, defektes JSON) führt zum normalen Neuaufbau', () => {
    const ws = bigWs(50);
    const good = stored(createSearchIndex(ws).snapshot())!;
    expect(isSearchSnapshot(good)).toBe(true);
    for (const bad of [undefined, null, 'x', { v: SEARCH_INDEX_VERSION + 1, stamps: {}, index: '{}' }, { ...good, index: '{kaputt' }, { ...good, index: '{"x":1}' }]) {
      const idx = createSearchIndex(ws, { snapshot: bad });
      const fresh = createSearchIndex(ws);
      expect([...idx.search('Kopfschmerz')].sort(), String(bad && JSON.stringify(bad).slice(0, 30))).toEqual([...fresh.search('Kopfschmerz')].sort());
      expect(idx.snapshot()).not.toBeNull(); // frisch aufgebaut → muss gesichert werden
    }
  });
});
