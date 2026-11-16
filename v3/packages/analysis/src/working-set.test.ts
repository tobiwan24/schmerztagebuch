import { describe, expect, it } from 'vitest';
import { createIdGenerator, createTemplate, keyBetween, updateTemplate, type BlockDef, type Entry } from '@stb/core';
import { buildWorkingSet } from './working-set.js';

const clock = { now: () => Date.parse('2026-03-01T08:00:00Z') };
const { newId } = createIdGenerator(clock);

describe('Arbeitsset über Vorlagenversionen', () => {
  it('BLK-26: Auswertung und Verlauf zeigen Optionslabels der Eintragsversion, nie die Options-ID', () => {
    const [a, b] = [{ id: newId(), label: 'Übelkeit', color: 'blue' }, { id: newId(), label: 'Aura', color: 'red' }];
    const ms: BlockDef = { id: newId(), type: 'multiselect', label: 'Symptome', required: false, order: keyBetween(null, null), config: { options: [a, b], multiple: true } };
    const diaryId = newId();
    const t1 = createTemplate({ id: newId(), diaryId, name: 'M', order: keyBetween(null, null), blocks: [ms] }, clock);
    const renamed: BlockDef = { ...ms, config: { options: [{ ...a, label: 'Brechreiz' }], multiple: true } };
    const t2 = updateTemplate(t1, { blocks: [renamed] }, clock, [t1.version]);
    const iso = clock.now() && new Date(clock.now()).toISOString();
    const entry: Entry = {
      id: newId(), diaryId, templateId: t1.template.id, templateVersion: 1, occurredAt: iso, recordedAt: iso, updatedAt: iso, authorId: 'u',
      values: { [ms.id]: [a.id, b.id] }, tags: [], meta: { source: 'app', timezone: 'Europe/Berlin' }, hlc: '0000000000001:0000:dev1',
    };
    const ws = buildWorkingSet({
      entries: [entry], templates: [t2.state.template], versions: [t1.version, t2.state.version],
      diaries: [{ id: diaryId, settings: { timezone: 'Europe/Berlin' } }],
    });
    const field = ws.entries[0]!.fields[0]!;
    expect(field.optionLabels).toEqual(['Übelkeit', 'Aura']);
    expect(field.display).toBe('Übelkeit, Aura');
    expect(field.display).not.toContain(a.id);
  });
});
