import { describe, expect, it } from 'vitest';
import { createDiary, updateDiarySettings } from '@stb/core';
import { resolveConflict } from './resolve.js';

const clock = { now: () => Date.parse('2026-03-01T08:00:00Z') };
const base = createDiary({ id: '0190a0a0-0000-7000-8000-000000000001', name: 'T', subject: 'human', timezone: 'Europe/Berlin' }, clock);

describe('Konfliktauflösung Tagebuch', () => {
  it('DM-14: bei gleichzeitiger Änderung der Tagebuch-Einstellungen gewinnt der höhere HLC, der andere Stand geht ins Protokoll', () => {
    const a = updateDiarySettings(base, { name: 'Von A' }, { hlc: '1700000001000:0000:devA', updatedAt: '2026-03-02T08:00:00.000Z' });
    const b = updateDiarySettings(base, { name: 'Von B' }, { hlc: '1700000002000:0000:devB', updatedAt: '2026-03-02T08:00:01.000Z' });
    const r = resolveConflict('diary', { payload: base, deleted: false }, { payload: a, deleted: false }, { payload: b, deleted: false });
    expect(r.kind).toBe('resolved');
    if (r.kind !== 'resolved') return;
    expect((r.result.payload as { name: string }).name).toBe('Von B');
    expect(r.adoptServer).toBe(true);
    expect(r.conflicts).toHaveLength(1);
  });
});
