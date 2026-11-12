import { describe, it, expect } from 'vitest';
import type { Entry } from '@stb/core';
import { mergeEntry, type EntrySide } from './merge.js';

const A = 'block-a';
const B = 'block-b';
const C = 'block-c';

function entry(values: Record<string, unknown>, hlc: string, extra: Partial<Entry> = {}): Entry {
  return {
    id: 'e1', diaryId: 'd1', templateId: 't1', templateVersion: 1,
    occurredAt: '2026-03-01T10:00:00Z', recordedAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-01T10:00:00Z',
    authorId: 'u1', values, tags: [], meta: { source: 'app', timezone: 'Europe/Berlin' }, hlc, ...extra,
  };
}
const side = (e: Entry, deleted = false): EntrySide => ({ entry: e, deleted });

const H0 = '1700000000000:0000:base';
const H_LOCAL = '1700000001000:0000:devA';
const H_REMOTE = '1700000002000:0000:devB';

describe('Entry-Merge', () => {
  it('SYN-04: disjunkte Blockänderungen auf zwei Geräten werden beide übernommen', () => {
    const base = entry({ [A]: 3, [B]: 'alt' }, H0);
    const local = entry({ [A]: 7, [B]: 'alt' }, H_LOCAL);
    const remote = entry({ [A]: 3, [B]: 'neu', [C]: true }, H_REMOTE);
    const r = mergeEntry(side(base), side(local), side(remote));
    expect(r.result.entry.values).toEqual({ [A]: 7, [B]: 'neu', [C]: true });
    expect(r.result.deleted).toBe(false);
    expect(r.conflicts).toEqual([]);
  });

  it('SYN-04: Entfernen eines Werts auf einer Seite wird übernommen; gleiche Änderung auf beiden Seiten ist kein Konflikt', () => {
    const base = entry({ [A]: 3, [B]: 'x' }, H0);
    const local = entry({ [A]: 5, [B]: 'x' }, H_LOCAL);
    const remote = entry({ [A]: 5 }, H_REMOTE);
    const r = mergeEntry(side(base), side(local), side(remote));
    expect(r.result.entry.values).toEqual({ [A]: 5 });
    expect(r.conflicts).toEqual([]);
  });

  it('SYN-04: Tags werden vereinigt; ohne gemeinsame Basis gilt ein leerer Ausgangsstand', () => {
    const local = entry({ [A]: 1 }, H_LOCAL, { tags: ['Wetter', 'Stress'] });
    const remote = entry({ [B]: 2 }, H_REMOTE, { tags: ['Stress', 'Sport'] });
    const r = mergeEntry(undefined, side(local), side(remote));
    expect(r.result.entry.tags).toEqual(['Sport', 'Stress', 'Wetter']);
    expect(r.result.entry.values).toEqual({ [A]: 1, [B]: 2 });
  });

  it('SYN-05: gleicher Block auf beiden Seiten geändert → höherer HLC gewinnt, Verlierer im ConflictLog', () => {
    const base = entry({ [A]: 3 }, H0);
    const local = entry({ [A]: 6 }, H_LOCAL);
    const remote = entry({ [A]: 8 }, H_REMOTE);
    const r = mergeEntry(side(base), side(local), side(remote));
    expect(r.result.entry.values[A]).toBe(8);
    expect(r.conflicts).toEqual([{ field: `values.${A}`, losingValue: 6, losingHlc: H_LOCAL, winningHlc: H_REMOTE }]);
    // symmetrisch: Ergebnis unabhängig davon, welche Seite lokal ist
    const flipped = mergeEntry(side(base), side(remote), side(local));
    expect(flipped.result.entry.values[A]).toBe(8);
    expect(flipped.conflicts[0]?.losingValue).toBe(6);
  });

  it('SYN-05: konkurrierende Änderung an Zeitangabe/Meta folgt derselben Regel; Ergebnis-HLC ist das Maximum', () => {
    const base = entry({}, H0);
    const local = entry({}, H_REMOTE, { occurredAt: '2026-03-01T09:00:00Z' });
    const remote = entry({}, H_LOCAL, { occurredAt: '2026-03-01T08:00:00Z' });
    const r = mergeEntry(side(base), side(local), side(remote));
    expect(r.result.entry.occurredAt).toBe('2026-03-01T09:00:00Z');
    expect(r.result.entry.hlc).toBe(H_REMOTE);
    expect(r.conflicts).toMatchObject([{ field: 'occurredAt', losingValue: '2026-03-01T08:00:00Z' }]);
  });

  it('SYN-05: deleted gewinnt nur, wenn sein HLC höher ist', () => {
    const base = entry({ [A]: 1 }, H0);
    const edited = entry({ [A]: 2 }, H_REMOTE);
    const deletedOlder = entry({ [A]: 1 }, H_LOCAL);
    const keep = mergeEntry(side(base), side(deletedOlder, true), side(edited));
    expect(keep.result.deleted).toBe(false);
    expect(keep.result.entry.values[A]).toBe(2);

    const editedOlder = entry({ [A]: 2 }, H_LOCAL);
    const deletedNewer = entry({ [A]: 1 }, H_REMOTE);
    const gone = mergeEntry(side(base), side(editedOlder), side(deletedNewer, true));
    expect(gone.result.deleted).toBe(true);
    expect(gone.conflicts).toMatchObject([{ field: 'deleted', losingValue: false }]);
  });

  it('SYN-05: Merge ist deterministisch bei gleichem Zeitpunkt (Knoten-ID entscheidet)', () => {
    const base = entry({ [A]: 0 }, H0);
    const a = entry({ [A]: 1 }, '1700000001000:0000:devA');
    const b = entry({ [A]: 2 }, '1700000001000:0000:devB');
    expect(mergeEntry(side(base), side(a), side(b)).result.entry.values[A]).toBe(2);
    expect(mergeEntry(side(base), side(b), side(a)).result.entry.values[A]).toBe(2);
  });
});
