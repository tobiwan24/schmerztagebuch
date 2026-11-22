import { describe, expect, it } from 'vitest';
import { instantiateCatalogTemplate, DEFAULT_BODYMAP_PRESET_ID } from './catalog.js';
import { createIdGenerator } from './ids.js';
import { keyBetween } from './fractional-index.js';
import {
  initialValues,
  isDirty,
  missingRequired,
  upgradeEntryVersion,
  duplicateEntryInput,
  nowTimeInput,
  timeInputFrom,
  timeToEntry,
  validateTime,
  valuesToSave,
  type FormSnapshot,
} from './entry-form.js';

const clock = { now: () => Date.parse('2026-03-01T08:00:00Z') };
const { newId } = createIdGenerator(clock);
const { template, version } = instantiateCatalogTemplate('general-pain', { id: newId(), diaryId: newId(), order: keyBetween(null, null), newId }, clock);
const [pain, bodymap, notes] = version.blocks;
const required = { ...version, blocks: version.blocks.map((b) => (b.id === pain!.id ? { ...b, required: true } : b)) };

describe('Eintragsformular-Logik', () => {
  it('Ausgangswerte: Body-Map mit vorausgewähltem Bild, Slider ohne Wert', () => {
    const v = initialValues(version);
    expect(v[bodymap!.id]).toEqual({ presetId: DEFAULT_BODYMAP_PRESET_ID, points: [] });
    expect(pain!.id in v).toBe(false);
  });

  it('Pflichtfelder: leerer Pflicht-Slider wird gemeldet, mit Wert nicht mehr', () => {
    expect(missingRequired(required, initialValues(required))).toEqual([pain!.id]);
    expect(missingRequired(required, { ...initialValues(required), [pain!.id]: 0 })).toEqual([]);
  });

  it('gespeichert werden nur nicht-leere Werte', () => {
    const values = { ...initialValues(version), [pain!.id]: 4, [notes!.id]: { text: '  ' } };
    expect(valuesToSave(version, values)).toEqual({ [pain!.id]: 4 });
  });

  it('Zeitpunkt in der Vergangenheit (Nachtragen) und Rundweg über den Eintrag', () => {
    const t = { mode: 'point', at: '2026-02-20T21:30' } as const;
    const e = timeToEntry(t);
    expect(e.period).toBeUndefined();
    expect(e.occurredAt).toBe(new Date('2026-02-20T21:30').toISOString());
    expect(timeInputFrom(e)).toEqual(t);
  });

  it('Zeitraum ganztägig und mit Uhrzeiten; occurredAt ist der Beginn; Ende vor Beginn wird abgelehnt', () => {
    const allDay = timeToEntry({ mode: 'period', start: '2026-03-02', end: '2026-03-04', withTime: false });
    expect(allDay.period).toEqual({ start: '2026-03-02', end: '2026-03-04' });
    expect(allDay.occurredAt).toBe(new Date('2026-03-02T00:00').toISOString());
    expect(timeInputFrom(allDay)).toEqual({ mode: 'period', start: '2026-03-02', end: '2026-03-04', withTime: false });

    const timed = { mode: 'period', start: '2026-03-02T08:00', end: '2026-03-02T18:30', withTime: true } as const;
    const e = timeToEntry(timed);
    expect(e.period).toEqual({ start: new Date('2026-03-02T08:00').toISOString(), end: new Date('2026-03-02T18:30').toISOString() });
    expect(timeInputFrom(e)).toEqual(timed);

    expect(validateTime({ mode: 'period', start: '2026-03-04', end: '2026-03-02', withTime: false })).toBe('end-before-start');
    expect(validateTime({ mode: 'period', start: '2026-03-04', end: '', withTime: false })).toBe('missing');
    expect(() => timeToEntry({ mode: 'point', at: '' })).toThrow(RangeError);
  });

  it('Dirty nur bei echter Änderung', () => {
    const base: FormSnapshot = { templateId: template.id, values: initialValues(version), time: nowTimeInput(clock.now()), tags: [] };
    expect(isDirty(base, { ...base, values: initialValues(version) })).toBe(false);
    expect(isDirty(base, { ...base, values: { ...base.values, [pain!.id]: 3 } })).toBe(true);
    expect(isDirty(base, { ...base, time: { mode: 'point', at: '2026-02-01T10:00' } })).toBe(true);
  });
});

describe('Version eines Eintrags beim Bearbeiten heben', () => {
  const bump = (blocks: typeof version.blocks): typeof version => ({ ...version, version: version.version + 1, blocks });

  it('BLK-27: alle Werte in der aktuellen Version gültig → Eintrag wird auf die aktuelle Version gehoben', () => {
    const entry = { templateId: version.templateId, templateVersion: 1, values: { [pain!.id]: 4 } };
    const extra = { id: newId(), type: 'text' as const, label: 'Neu', required: false, order: keyBetween(notes!.order, null), config: {} };
    expect(upgradeEntryVersion(entry, bump([...version.blocks, extra]))).toEqual({ upgraded: true, templateVersion: 2 });
  });

  it('BLK-27: entfernter Block mit Wert → Version bleibt (nichts geht verloren)', () => {
    const entry = { templateId: version.templateId, templateVersion: 1, values: { [pain!.id]: 4 } };
    expect(upgradeEntryVersion(entry, bump(version.blocks.filter((b) => b.id !== pain!.id)))).toEqual({ upgraded: false, templateVersion: 1 });
  });

  it('BLK-27: Wert in der aktuellen Version ungültig (Slider-Bereich verkleinert) → Version bleibt', () => {
    const entry = { templateId: version.templateId, templateVersion: 1, values: { [pain!.id]: 9 } };
    const narrowed = version.blocks.map((b) => (b.id === pain!.id && b.type === 'slider' ? { ...b, config: { ...b.config, max: 5 } } : b));
    expect(upgradeEntryVersion(entry, bump(narrowed))).toEqual({ upgraded: false, templateVersion: 1 });
  });

  it('BLK-27: Eintrag ohne Wert für entfernten Block wird gehoben; gleiche Version bleibt unverändert', () => {
    const entry = { templateId: version.templateId, templateVersion: 1, values: {} };
    expect(upgradeEntryVersion(entry, bump(version.blocks.filter((b) => b.id !== pain!.id))).upgraded).toBe(true);
    expect(upgradeEntryVersion(entry, version)).toEqual({ upgraded: false, templateVersion: 1 });
  });
});

describe('Eintrag duplizieren', () => {
  const entry = { templateId: template.id, templateVersion: version.version, tags: ['Arbeit'] };

  it('BLK-36: Werte und Tags werden übernommen, Anhänge nicht', () => {
    const values = { [pain!.id]: 4, [notes!.id]: { text: 'Hallo', attachmentIds: [newId()], events: [{ id: newId(), category: 'event', title: 'Sport' }] } };
    const out = duplicateEntryInput({ ...entry, values }, version, version);
    expect(out.tags).toEqual(['Arbeit']);
    expect(out.values[pain!.id]).toBe(4);
    const note = out.values[notes!.id] as { text: string; attachmentIds?: string[]; events: unknown[] };
    expect(note.text).toBe('Hallo');
    expect(note.attachmentIds).toBeUndefined();
    expect(note.events).toHaveLength(1);
  });

  it('BLK-36: Textarea nur mit Anhängen wird leer und entfällt', () => {
    const out = duplicateEntryInput({ ...entry, values: { [notes!.id]: { attachmentIds: [newId()] } } }, version, version);
    expect(notes!.id in out.values).toBe(false);
  });

  it('BLK-36: archivierte Felder und in der aktuellen Version ungültige Werte entfallen', () => {
    const current = { ...version, version: 2, blocks: version.blocks.filter((b) => b.id !== notes!.id).map((b) => (b.id === pain!.id ? { ...b, config: { ...b.config, max: 3 } } : b)) } as typeof version;
    const out = duplicateEntryInput({ ...entry, values: { [pain!.id]: 7, [notes!.id]: { text: 'weg' }, [bodymap!.id]: { presetId: DEFAULT_BODYMAP_PRESET_ID, points: [] } } }, version, current);
    expect(out.templateVersion).toBe(2);
    expect(pain!.id in out.values).toBe(false);
    expect(notes!.id in out.values).toBe(false);
  });
});
