import { describe, expect, it } from 'vitest';
import type { Entry } from '@stb/core';
import { PAGE_SIZE, pageGroups, type ListEntry } from './history-list';

const mk = (i: number, day: string, hour: number, templateName = 'A'): ListEntry =>
  ({ id: `e${i}`, occurredAt: `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`, templateName, meta: { timezone: 'UTC' } }) as unknown as Entry & { templateName: string };

// 3 Tage zu je 40 Einträgen
const all = ['2026-03-03', '2026-03-02', '2026-03-01'].flatMap((d, di) => Array.from({ length: 40 }, (_, h) => mk(di * 40 + h, d, 10 + (h % 3))));

describe('Verlauf: Seiten und Gruppen', () => {
  it('erste Seite hat höchstens PAGE_SIZE Einträge; die Tagesgruppe an der Grenze ist nach „Weitere laden“ vollständig und einzeln', () => {
    const first = pageGroups(all, 'newest', PAGE_SIZE);
    expect(first.total).toBe(120);
    expect(first.groups.flatMap((g) => g.entries)).toHaveLength(50);
    expect(first.groups).toHaveLength(2);
    expect(first.groups[1]!.entries).toHaveLength(10);
    const more = pageGroups(all, 'newest', PAGE_SIZE * 2);
    expect(more.groups.map((g) => g.entries.length)).toEqual([40, 40, 20]);
    expect(new Set(more.groups.map((g) => g.key)).size).toBe(3);
  });

  it('Sortierung wirkt vor dem Schneiden: oldest beginnt mit dem ältesten Tag', () => {
    const r = pageGroups(all, 'oldest', 10);
    expect(r.groups).toHaveLength(1);
    expect('day' in r.groups[0]!.by && r.groups[0]!.by.day).toBe('2026-03-01');
  });

  it('Vorlagensortierung gruppiert nach Vorlagenname', () => {
    const mixed = [mk(1, '2026-03-01', 8, 'Zeta'), mk(2, '2026-03-02', 8, 'Alpha'), mk(3, '2026-03-03', 8, 'Zeta')];
    const r = pageGroups(mixed, 'template_date', 10);
    expect(r.groups.map((g) => ('template' in g.by ? g.by.template : ''))).toEqual(['Alpha', 'Zeta']);
    expect(r.groups[1]!.entries.map((e) => e.id)).toEqual(['e3', 'e1']);
  });
});
