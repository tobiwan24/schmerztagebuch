import { describe, expect, it } from 'vitest';
import { addWidget, createDashboard, createDiary, moveWidget, renameDashboard, updateDiarySettings } from '@stb/core';
import { resolveConflict } from './resolve.js';
import { kindRank } from './order.js';

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

describe('Sync von Dashboards', () => {
  const ids = { d: '0190a0a0-0000-7000-8000-0000000000d1', diary: '0190a0a0-0000-7000-8000-000000000001', w1: '0190a0a0-0000-7000-8000-0000000000a1', w2: '0190a0a0-0000-7000-8000-0000000000a2' };
  const st = (n: number) => ({ hlc: `${String(1_700_000_000_000 + n).padStart(13, '0')}:0000:dev${n % 2 ? 'A' : 'B'}`, updatedAt: new Date(1_700_000_000_000 + n).toISOString() });
  const base0 = addWidget(createDashboard({ id: ids.d, diaryId: ids.diary, name: 'Woche' }, [], st(1)), { id: ids.w1, kind: 'timeseries', config: { days: 30 } }, st(2));
  const side = (d: unknown, deleted = false) => ({ payload: d, deleted });

  it('SYN-19: Konflikt zweier Geräte — ganzer Datensatz, der höhere HLC gewinnt, der andere Stand geht ins Protokoll (Widgets werden nicht gemischt)', () => {
    const a = renameDashboard(base0, 'Von A', st(3));
    const b = addWidget(moveWidget(base0, ids.w1, 0, st(4)), { id: ids.w2, kind: 'kpi', config: { stat: 'max', days: 7 } }, st(6));
    const r = resolveConflict('dashboard', side(base0), side(a), side(b));
    expect(r.kind).toBe('resolved');
    if (r.kind !== 'resolved') return;
    expect(r.result.payload).toEqual(b);
    expect(r.adoptServer).toBe(true);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]!.losingValue).toEqual(side(a));
    // umgekehrt: lokal neuer → lokaler Stand gewinnt, Server-Stand im Protokoll
    const r2 = resolveConflict('dashboard', side(base0), side(b), side(a));
    expect(r2.kind === 'resolved' && r2.result.payload).toEqual(b);
    expect(r2.kind === 'resolved' && r2.adoptServer).toBe(false);
  });

  it('SYN-19: gleicher Stand auf beiden Seiten erzeugt keinen Konflikt; gelöschtes Dashboard (Tombstone) mit neuerem HLC gewinnt', () => {
    const same = resolveConflict('dashboard', side(base0), side(base0), side(base0));
    expect(same.kind === 'resolved' && same.conflicts).toEqual([]);
    const gone = { ...base0, ...st(9) };
    const r = resolveConflict('dashboard', side(base0), side(renameDashboard(base0, 'x', st(3))), side(gone, true));
    expect(r.kind === 'resolved' && r.result.deleted).toBe(true);
  });

  it('SYN-19: Dashboards gehen nach Tagebuch, Vorlagen und Vorlagenversionen hinaus (Reihenfolge nach Vorlagen)', () => {
    const kinds = ['dashboard', 'entry', 'templateVersion', 'savedFilter', 'template', 'diary'];
    expect([...kinds].sort((a, b) => kindRank(a) - kindRank(b)).slice(0, 3)).toEqual(['diary', 'template', 'templateVersion']);
    expect(kindRank('dashboard')).toBeGreaterThan(kindRank('templateVersion'));
  });
});
