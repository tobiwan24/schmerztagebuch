import { describe, expect, it } from 'vitest';
import type { BlockDef, Entry, NotificationRule, Template, TemplateVersion } from '@stb/core';
import { notificationRuleSchema } from '@stb/core';
import { buildWorkingSet } from './working-set.js';
import { evaluateRules, ruleText } from './rules.js';

const D = 'd-1';
const T = 't-1';
const at = '2026-03-01T00:00:00.000Z';
const slider: BlockDef = { id: 'b-pain', type: 'slider', label: 'Schmerz', required: false, order: 'a', config: { min: 0, max: 10, step: 1 } };
const templates: Template[] = [{ id: T, diaryId: D, name: 'T', order: 'a', currentVersion: 1, archived: false, createdAt: at, updatedAt: at }];
const versions: TemplateVersion[] = [{ templateId: T, version: 1, createdAt: at, blocks: [slider] }];
const mk = (id: string, ts: string, v: number): Entry => ({
  id, diaryId: D, templateId: T, templateVersion: 1, occurredAt: ts, recordedAt: ts, updatedAt: ts, authorId: 'u', tags: [],
  values: { 'b-pain': v }, meta: { source: 'app', timezone: 'Europe/Berlin' }, hlc: `1:0000:${id}`,
});
const ws = (rows: Entry[]) => buildWorkingSet({ entries: rows, templates, versions, diaries: [{ id: D, settings: { timezone: 'Europe/Berlin' } }] });
const rule = (o: Partial<NotificationRule> = {}): NotificationRule => ({
  id: 'r1', diaryId: D, blockId: 'b-pain', op: '>=', value: 7, consecutiveDays: 3, cooldownHours: 24, hlc: '1:0000:x', updatedAt: at, ...o,
});
const tzs = new Map([[D, 'Europe/Berlin']]);
// 10.–12.03. je Schmerz 8 (12.03. um 23:30 Berlin = 22:30 UTC)
const three = [mk('a', '2026-03-10T08:00:00.000Z', 8), mk('b', '2026-03-11T08:00:00.000Z', 9), mk('c', '2026-03-12T22:30:00.000Z', 7)];

describe('ANA-29: evaluateRules (Folgetage, Zeitzone, Cooldown, Text)', () => {
  it('ANA-29: drei Tage in Folge lösen aus, beschreibender Text', () => {
    const r = evaluateRules(ws(three).entries, [rule()], {}, '2026-03-12T22:40:00.000Z', tzs);
    expect(r).toEqual([{ ruleId: 'r1', text: 'Schmerz ≥ 7 an 3 Tagen in Folge', lastDay: '2026-03-12' }]);
    expect(ruleText('Schmerz', rule({ op: '<=', value: 2.5, consecutiveDays: 1 }))).toBe('Schmerz ≤ 2,5 an 1 Tag');
  });
  it('ANA-29: Tageswechsel folgt der Tagebuch-Zeitzone (23:30 Berlin zählt zum selben Tag)', () => {
    const rows = [mk('a', '2026-03-10T08:00:00.000Z', 8), mk('b', '2026-03-11T22:30:00.000Z', 8), mk('c', '2026-03-12T10:00:00.000Z', 8)];
    expect(evaluateRules(ws(rows).entries, [rule()], {}, '2026-03-12T12:00:00.000Z', tzs)).toHaveLength(1);
    // Auf UTC-Tage gerechnet wären es 10., 11., 12. — mit 11.03.23:30 Berlin → 11.03.; ohne Lücke ok. Gegenprobe: Lücke am 11.
    const gap = [mk('a', '2026-03-10T08:00:00.000Z', 8), mk('b', '2026-03-11T08:00:00.000Z', 3), mk('c', '2026-03-12T10:00:00.000Z', 8)];
    expect(evaluateRules(ws(gap).entries, [rule()], {}, '2026-03-12T12:00:00.000Z', tzs)).toEqual([]);
  });
  it('ANA-29: Cooldown unterdrückt, danach wieder erlaubt', () => {
    const now = '2026-03-12T22:40:00.000Z';
    expect(evaluateRules(ws(three).entries, [rule()], { r1: '2026-03-12T10:00:00.000Z' }, now, tzs)).toEqual([]);
    expect(evaluateRules(ws(three).entries, [rule()], { r1: '2026-03-11T10:00:00.000Z' }, now, tzs)).toHaveLength(1);
  });
  it('ANA-29: Serie muss heute oder gestern enden; „<=“ nimmt den Tagesminimalwert; zu wenige Tage lösen nicht aus', () => {
    expect(evaluateRules(ws(three).entries, [rule()], {}, '2026-03-20T10:00:00.000Z', tzs)).toEqual([]);
    expect(evaluateRules(ws(three).entries, [rule()], {}, '2026-03-13T10:00:00.000Z', tzs)).toHaveLength(1);
    expect(evaluateRules(ws(three).entries, [rule({ consecutiveDays: 4 })], {}, '2026-03-12T22:40:00.000Z', tzs)).toEqual([]);
    const lo = [mk('a', '2026-03-12T08:00:00.000Z', 1), mk('b', '2026-03-12T09:00:00.000Z', 9)];
    expect(evaluateRules(ws(lo).entries, [rule({ op: '<=', value: 2, consecutiveDays: 1 })], {}, '2026-03-12T12:00:00.000Z', tzs)).toHaveLength(1);
    expect(evaluateRules(ws(lo).entries, [rule({ op: '>=', value: 9, consecutiveDays: 1 })], {}, '2026-03-12T12:00:00.000Z', tzs)).toHaveLength(1);
  });
  it('ANA-29: Schema füllt Cooldown mit 24 Stunden und lehnt Unbekanntes ab', () => {
    const rest: Record<string, unknown> = { ...rule() };
    delete rest.cooldownHours;
    expect(notificationRuleSchema.parse(rest).cooldownHours).toBe(24);
    expect(() => notificationRuleSchema.parse({ ...rule(), op: '>' })).toThrow();
  });
});
