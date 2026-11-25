import { describe, expect, it } from 'vitest';
import type { BlockDef, Entry, Template, TemplateVersion } from '@stb/core';
import { buildWorkingSet } from './working-set.js';
import { trainingStats, weekStartOf } from './training.js';

// Fixture (von Hand nachrechenbar): zwei Übungen, Tagebuch-Zeitzone Europe/Berlin.
const D = 'd-1';
const T = 't-train';
const at = '2026-03-01T00:00:00.000Z';
const L = { a: 'l-a', b: 'l-b', c: 'l-c' };
const ex = (id: string, label: string): BlockDef => ({
  id, type: 'exercise', label, required: false, order: id, role: 'activity',
  config: { levels: [{ id: L.a, label: 'Leicht' }, { id: L.b, label: 'Mittel' }, { id: L.c, label: 'Schwer' }] },
});
const templates: Template[] = [{ id: T, diaryId: D, name: 'Übungen', order: 'a', purpose: 'training', currentVersion: 1, archived: false, createdAt: at, updatedAt: at }];
const versions: TemplateVersion[] = [{ templateId: T, version: 1, createdAt: at, blocks: [ex('b-schulter', 'Schulterkreisen'), ex('b-dehnen', 'Dehnen')] }];
const row = (id: string, t: string, values: Record<string, unknown>): Entry => ({
  id, diaryId: D, templateId: T, templateVersion: 1, occurredAt: t, recordedAt: t, updatedAt: t, authorId: 'u', values, tags: [],
  meta: { source: 'app', timezone: 'Europe/Berlin' }, hlc: '0000000000001:0000:x',
});
const entries: Entry[] = [
  // Woche ab Mo 2026-02-23: Di + Do
  row('e1', '2026-02-24T08:00:00.000Z', { 'b-schulter': { done: true, levelId: L.a }, 'b-dehnen': { done: true } }),
  row('e2', '2026-02-26T08:00:00.000Z', { 'b-schulter': { done: true, levelId: L.a } }),
  // Woche ab Mo 2026-03-02: keine Einträge
  // Woche ab Mo 2026-03-09: Mo zweimal (zählt einmal), Mi nicht erledigt
  row('e3', '2026-03-09T07:00:00.000Z', { 'b-schulter': { done: true, levelId: L.b } }),
  row('e4', '2026-03-09T17:00:00.000Z', { 'b-schulter': { done: true, levelId: L.c }, 'b-dehnen': { done: true, levelId: L.a } }),
  row('e5', '2026-03-11T08:00:00.000Z', { 'b-schulter': { done: false, levelId: L.c } }),
  // 23:30 UTC am Sonntag 2026-03-15 = Montag 00:30 in Berlin, also Woche ab 2026-03-16
  row('e6', '2026-03-15T23:30:00.000Z', { 'b-dehnen': { done: true, levelId: L.b } }),
];
const ws = buildWorkingSet({ entries, templates, versions, diaries: [{ id: D, settings: { timezone: 'Europe/Berlin' } }] });

describe('Training in der Analyse', () => {
  it('ANA-24: weekStartOf liefert den Montag der Woche', () => {
    expect(weekStartOf('2026-03-15')).toBe('2026-03-09'); // Sonntag
    expect(weekStartOf('2026-03-16')).toBe('2026-03-16'); // Montag
    expect(weekStartOf('2026-03-11')).toBe('2026-03-09');
  });

  it('ANA-24: Tage mit erledigten Übungen je Woche, lückenlos, Tage zählen einmal, nicht erledigt zählt nicht (Tagebuch-Zeitzone)', () => {
    const s = trainingStats(ws.entries);
    expect(s.weeks).toEqual([
      { weekStart: '2026-02-23', days: 2 },
      { weekStart: '2026-03-02', days: 0 },
      { weekStart: '2026-03-09', days: 1 },
      { weekStart: '2026-03-16', days: 1 },
    ]);
    expect(s.totalDays).toBe(4);
  });

  it('ANA-24: Verlauf der Stufe je Übung (jüngste erledigte Durchführung je Tag, aufsteigend)', () => {
    const s = trainingStats(ws.entries);
    expect(s.levels).toEqual([
      {
        blockId: 'b-dehnen',
        label: 'Dehnen',
        points: [
          { day: '2026-03-09', levelIndex: 0, levelLabel: 'Leicht' },
          { day: '2026-03-16', levelIndex: 1, levelLabel: 'Mittel' },
        ],
      },
      {
        blockId: 'b-schulter',
        label: 'Schulterkreisen',
        points: [
          { day: '2026-02-24', levelIndex: 0, levelLabel: 'Leicht' },
          { day: '2026-02-26', levelIndex: 0, levelLabel: 'Leicht' },
          { day: '2026-03-09', levelIndex: 2, levelLabel: 'Schwer' },
        ],
      },
    ]);
  });

  it('ANA-24: ohne Trainingseinträge leer', () => {
    expect(trainingStats([])).toEqual({ weeks: [], totalDays: 0, levels: [] });
  });
});
