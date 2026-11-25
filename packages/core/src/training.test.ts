import { describe, it, expect } from 'vitest';
import { createIdGenerator } from './ids.js';
import { keyBetween } from './fractional-index.js';
import {
  createTemplate,
  templateSchema,
  updateTemplate,
  type BlockDef,
  type Entry,
  type TemplateState,
} from './templates.js';
import { duplicateTemplate } from './template-editor.js';
import { currentFunctionPhase, parseFunctionPhases, trainingTemplatesFor } from './training.js';
import { validateTemplateDraft } from './template-editor.js';

let t = Date.parse('2026-03-01T08:00:00.000Z');
const clock = { now: () => (t += 1000) };
const { newId } = createIdGenerator(clock);
const diaryId = newId();

const functionBlock: BlockDef = {
  id: newId(), type: 'slider', label: 'Funktion', required: false, role: 'function', order: keyBetween(null, null),
  config: { min: 1, max: 5, step: 1 },
};
const painBlock: BlockDef = {
  id: newId(), type: 'slider', label: 'Schmerz', required: false, role: 'outcome', order: keyBetween(functionBlock.order, null),
  config: { min: 0, max: 10, step: 1 },
};
const diary = createTemplate({ id: newId(), diaryId, name: 'Tagebuch', order: keyBetween(null, null), blocks: [functionBlock, painBlock] }, clock);

const exercise = (): BlockDef => ({ id: newId(), type: 'exercise', label: 'Übung', required: false, role: 'activity', order: keyBetween(null, null), config: {} });
let lastOrder = diary.template.order;
const training = (name: string, extra: { functionPhases?: number[]; archived?: boolean; purpose?: 'diary' | 'training' } = {}): TemplateState => {
  lastOrder = keyBetween(lastOrder, null);
  const s = createTemplate({ id: newId(), diaryId, name, order: lastOrder, purpose: extra.purpose ?? 'training', ...(extra.functionPhases ? { functionPhases: extra.functionPhases } : {}), blocks: [exercise()] }, clock);
  return extra.archived ? updateTemplate(s, { archived: true }, clock).state : s;
};

const always = training('Immer');
const early = training('Phase 1 und 2', { functionPhases: [1, 2] });
const late = training('Phase 3', { functionPhases: [3] });
const archived = training('Archiviert', { archived: true });
const diaryOnly = training('Tagebuch-Vorlage', { purpose: 'diary' });
const all = [diary, always, early, late, archived, diaryOnly];

function entry(at: string, values: Record<string, unknown>, state: TemplateState = diary): Entry {
  return {
    id: newId(), diaryId, templateId: state.template.id, templateVersion: state.version.version,
    occurredAt: at, recordedAt: at, updatedAt: at, authorId: 'u', values, tags: [],
    meta: { source: 'app', timezone: 'Europe/Berlin' }, hlc: '0000000000001:0000:dev1',
  };
}

describe('Training', () => {
  it('BLK-52: purpose und functionPhases sind optional und rückwärtskompatibel im Schema', () => {
    const { purpose: _p, functionPhases: _f, ...legacy } = diary.template as Record<string, unknown>;
    void _p; void _f;
    expect(templateSchema.safeParse(legacy).success).toBe(true);
    expect(templateSchema.safeParse({ ...legacy, purpose: 'training', functionPhases: [1, 2] }).success).toBe(true);
    expect(templateSchema.safeParse({ ...legacy, purpose: 'sport' }).success).toBe(false);
    expect(templateSchema.safeParse({ ...legacy, functionPhases: ['1'] }).success).toBe(false);
    expect(diary.template.purpose).toBeUndefined();
  });

  it('BLK-52: updateTemplate setzt und entfernt purpose/functionPhases ohne neue Version; Kopie übernimmt sie', () => {
    const r = updateTemplate(diary, { purpose: 'training', functionPhases: [2] }, clock);
    expect(r.newVersion).toBe(false);
    expect(r.state.template.purpose).toBe('training');
    expect(r.state.template.functionPhases).toEqual([2]);
    const copy = duplicateTemplate(r.state, { newId }, clock, null);
    expect(copy.template.purpose).toBe('training');
    expect(copy.template.functionPhases).toEqual([2]);
    const cleared = updateTemplate(r.state, { purpose: null, functionPhases: null }, clock).state.template;
    expect(cleared.purpose).toBeUndefined();
    expect(cleared.functionPhases).toBeUndefined();
  });

  it('BLK-52: aktuelle Funktionsphase = jüngster Wert der Rolle function', () => {
    const entries = [
      entry('2026-03-01T08:00:00.000Z', { [functionBlock.id]: 1, [painBlock.id]: 9 }),
      entry('2026-03-05T08:00:00.000Z', { [functionBlock.id]: 3 }),
      entry('2026-03-03T08:00:00.000Z', { [functionBlock.id]: 2 }),
      entry('2026-03-09T08:00:00.000Z', { [painBlock.id]: 7 }), // ohne function-Wert: zählt nicht
    ];
    expect(currentFunctionPhase(entries, [diary.version])).toBe(3);
    expect(currentFunctionPhase([], [diary.version])).toBeNull();
    expect(currentFunctionPhase(entries.slice(3), [diary.version])).toBeNull();
  });

  it('BLK-52: trainingTemplatesFor wählt nach der jüngsten function-Rolle (Fixture)', () => {
    const names = (r: ReturnType<typeof trainingTemplatesFor>) => r.templates.map((s) => s.template.name);
    const e = (phase: number) => [entry('2026-03-05T08:00:00.000Z', { [functionBlock.id]: phase })];
    expect(names(trainingTemplatesFor(all, e(1)))).toEqual(['Immer', 'Phase 1 und 2']);
    expect(names(trainingTemplatesFor(all, e(2)))).toEqual(['Immer', 'Phase 1 und 2']);
    expect(names(trainingTemplatesFor(all, e(3)))).toEqual(['Immer', 'Phase 3']);
    expect(trainingTemplatesFor(all, e(3)).phase).toBe(3);
    expect(names(trainingTemplatesFor(all, e(5)))).toEqual(['Immer']);
    // ohne Phasenangabe nur Vorlagen ohne Phasen
    const none = trainingTemplatesFor(all, []);
    expect(none.phase).toBeNull();
    expect(names(none)).toEqual(['Immer']);
  });

  it('BLK-52: leere functionPhases gelten als „immer“; frühere Vorlagenversionen lösen die Rolle auf', () => {
    const empty = training('Leer', { functionPhases: [] });
    expect(trainingTemplatesFor([empty], []).templates).toHaveLength(1);
    // Eintrag zu Version 1; aktuelle Version 2 ohne Rolle function → Auflösung über history
    const v2 = updateTemplate(diary, { blocks: [{ ...functionBlock, role: undefined } as BlockDef, painBlock] }, clock).state;
    const e = [entry('2026-03-05T08:00:00.000Z', { [functionBlock.id]: 3 }, diary)];
    expect(trainingTemplatesFor([v2, early, late], e).phase).toBeNull();
    expect(trainingTemplatesFor([v2, early, late], e, [diary.version]).phase).toBe(3);
  });

  it('Training: parseFunctionPhases liest Zahlenlisten, sortiert, ohne Doppelte; Unsinn ist ungültig', () => {
    expect(parseFunctionPhases('')).toEqual({ phases: [], invalid: false });
    expect(parseFunctionPhases('3, 1;2 2')).toEqual({ phases: [1, 2, 3], invalid: false });
    expect(parseFunctionPhases('1, x').invalid).toBe(true);
  });

  it('Training: Entwurfsprüfung meldet ungültigen Video-Link und leere Stufenbezeichnung', () => {
    const base = { id: newId(), type: 'exercise' as const, label: 'Übung', required: false, order: 'a' };
    const codes = (config: object) => validateTemplateDraft({ blocks: [{ ...base, config } as BlockDef] }).map((i) => i.code);
    expect(codes({})).toEqual([]);
    expect(codes({ videoUrl: 'https://example.org/v' })).toEqual([]);
    expect(codes({ videoUrl: 'http://example.org/v' })).toEqual(['VIDEO_URL_INVALID']);
    expect(codes({ videoUrl: 'abc' })).toEqual(['VIDEO_URL_INVALID']);
    expect(codes({ levels: [{ id: newId(), label: ' ' }] })).toEqual(['LEVEL_LABEL_EMPTY']);
  });
});
