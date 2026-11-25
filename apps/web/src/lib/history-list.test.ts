import { describe, expect, it } from 'vitest';
import type { Entry } from '@stb/core';
import { PAGE_SIZE, pageGroups, type ListEntry } from './history-list';

const mk = (i: number, day: string, hour: number, templateName = 'A'): ListEntry =>
  ({ id: `e${i}`, occurredAt: `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`, templateName, meta: { timezone: 'UTC' } }) as unknown as Entry & { templateName: string };

// 3 Tage zu je 40 Einträgen
const all = ['2026-03-03', '2026-03-02', '2026-03-01'].flatMap((d, di) => Array.from({ length: 40 }, (_, h) => mk(di * 40 + h, d, 10 + (h % 3))));

describe('Verlauf: Seiten und Gruppen', () => {
  it('RDM-028 P3: Zeitsortierung ergibt eine Gruppe ohne Überschrift; erste Seite hat höchstens PAGE_SIZE Einträge, Weitere laden hängt an', () => {
    const first = pageGroups(all, 'newest', PAGE_SIZE);
    expect(first.total).toBe(120);
    expect(first.groups).toHaveLength(1);
    expect(first.groups[0]!.by).toBeNull();
    expect(first.groups[0]!.entries).toHaveLength(50);
    const more = pageGroups(all, 'newest', PAGE_SIZE * 2);
    expect(more.groups.map((g) => g.entries.length)).toEqual([100]);
  });

  it('Sortierung wirkt vor dem Schneiden: oldest beginnt mit dem ältesten Tag', () => {
    const r = pageGroups(all, 'oldest', 10);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]!.entries[0]!.occurredAt.startsWith('2026-03-01')).toBe(true);
  });

  it('Vorlagensortierung gruppiert nach Vorlagenname', () => {
    const mixed = [mk(1, '2026-03-01', 8, 'Zeta'), mk(2, '2026-03-02', 8, 'Alpha'), mk(3, '2026-03-03', 8, 'Zeta')];
    const r = pageGroups(mixed, 'template_date', 10);
    expect(r.groups.map((g) => (g.by?.template ?? ''))).toEqual(['Alpha', 'Zeta']);
    expect(r.groups[1]!.entries.map((e) => e.id)).toEqual(['e3', 'e1']);
  });
});
