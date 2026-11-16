import { describe, it, expect } from 'vitest';
import { createIdGenerator } from './ids.js';
import { keyBetween } from './fractional-index.js';
import {
  createTemplate,
  updateTemplate,
  entrySchemaFor,
  templateVersionSchema,
  blockDefSchema,
  TemplateError,
  type BlockDef,
  type TemplateState,
} from './templates.js';

let t = 1_700_000_000_000;
const clock = { now: () => (t += 1000) };
const { newId } = createIdGenerator(clock);
const diaryId = newId();

function sliderBlock(label = 'Schmerz'): BlockDef {
  return { id: newId(), type: 'slider', label, required: true, role: 'outcome', order: keyBetween(null, null), config: { min: 0, max: 10, step: 1 } };
}

function base(): TemplateState {
  const s = sliderBlock();
  const note: BlockDef = { id: newId(), type: 'text', label: 'Notiz', required: false, order: keyBetween(s.order, null), config: {} };
  return createTemplate({ id: newId(), diaryId, name: 'Kopfschmerz', order: keyBetween(null, null), blocks: [s, note] }, clock);
}

function entryFor(state: TemplateState, values: Record<string, unknown>) {
  const now = new Date(clock.now()).toISOString();
  return {
    id: newId(), diaryId, templateId: state.template.id, templateVersion: state.version.version,
    occurredAt: now, recordedAt: now, updatedAt: now, authorId: 'user-1',
    values, tags: [], meta: { source: 'app', timezone: 'Europe/Berlin' }, hlc: '0000000000001:0000:dev1',
  };
}

describe('Vorlagen und Versionen', () => {
  it('DM-06: neue Vorlage startet mit Version 1 und gültiger TemplateVersion', () => {
    const s = base();
    expect(s.template.currentVersion).toBe(1);
    expect(s.version.version).toBe(1);
    expect(templateVersionSchema.safeParse(s.version).success).toBe(true);
  });

  it('DM-06: Block hinzufügen erzeugt eine neue TemplateVersion', () => {
    const s = base();
    const added = sliderBlock('Müdigkeit');
    const r = updateTemplate(s, { blocks: [...s.version.blocks, { ...added, order: keyBetween(s.version.blocks[1]!.order, null) }] }, clock);
    expect(r.newVersion).toBe(true);
    expect(r.state.version.version).toBe(2);
    expect(r.state.template.currentVersion).toBe(2);
    expect(r.state.version.blocks).toHaveLength(3);
  });

  it('DM-06: Block entfernen und umbenennen erzeugen jeweils eine neue Version', () => {
    const s = base();
    const removed = updateTemplate(s, { blocks: s.version.blocks.slice(0, 1) }, clock);
    expect(removed.newVersion).toBe(true);
    const renamed = updateTemplate(s, { blocks: s.version.blocks.map((b, i) => (i === 0 ? { ...b, label: 'Schmerzstärke' } : b)) }, clock);
    expect(renamed.newVersion).toBe(true);
    expect(renamed.state.version.version).toBe(2);
  });

  it('DM-06: Konfiguration, Rolle oder Block-Reihenfolge ändern erzeugt eine neue Version', () => {
    const s = base();
    const [a, b] = s.version.blocks as [BlockDef, BlockDef];
    expect(updateTemplate(s, { blocks: [{ ...a, config: { min: 0, max: 5, step: 1 } }, b] }, clock).newVersion).toBe(true);
    expect(updateTemplate(s, { blocks: [{ ...a, role: 'symptom' }, b] }, clock).newVersion).toBe(true);
    expect(updateTemplate(s, { blocks: [{ ...a, order: keyBetween(b.order, null) }, b] }, clock).newVersion).toBe(true);
  });

  it('BLK-43: hideLabel ist optional im Schema; Umschalten erzeugt eine neue Version (Label-Darstellung ist Struktur)', () => {
    const s = base();
    const [a, b] = s.version.blocks as [BlockDef, BlockDef];
    expect(blockDefSchema.safeParse({ ...a, hideLabel: true }).success).toBe(true);
    expect(blockDefSchema.safeParse({ ...a, hideLabel: 'ja' }).success).toBe(false);
    const hidden = updateTemplate(s, { blocks: [{ ...a, hideLabel: true }, b] }, clock);
    expect(hidden.newVersion).toBe(true);
    expect(hidden.state.version.blocks[0]).toMatchObject({ hideLabel: true });
    const back = updateTemplate(hidden.state, { blocks: [a, b] }, clock);
    expect(back.newVersion).toBe(true);
    expect(back.state.version.blocks[0]).not.toHaveProperty('hideLabel');
  });

  it('DM-06: Name/Icon/Farbe/Order ändern erzeugt keine neue Version', () => {
    const s = base();
    const r = updateTemplate(s, { name: 'Migräne', icon: 'brain', color: '#123456', order: keyBetween(s.template.order, null) }, clock);
    expect(r.newVersion).toBe(false);
    expect(r.state.version).toBe(s.version);
    expect(r.state.template).toMatchObject({ name: 'Migräne', icon: 'brain', currentVersion: 1 });
    expect(r.state.template.updatedAt > s.template.updatedAt).toBe(true);
  });

  it('DM-06: unveränderte Blöcke (auch in anderer Array-Reihenfolge) erzeugen keine neue Version', () => {
    const s = base();
    const r = updateTemplate(s, { blocks: [...s.version.blocks].reverse().map((b) => ({ ...b })) }, clock);
    expect(r.newVersion).toBe(false);
  });

  it('DM-07: Typwechsel eines bestehenden Blocks wird abgelehnt', () => {
    const s = base();
    const [a, b] = s.version.blocks as [BlockDef, BlockDef];
    const changed = { ...a, type: 'text', config: {} } as BlockDef;
    expect(() => updateTemplate(s, { blocks: [changed, b] }, clock)).toThrow(TemplateError);
    try {
      updateTemplate(s, { blocks: [changed, b] }, clock);
    } catch (e) {
      expect((e as TemplateError).code).toBe('BLOCK_TYPE_CHANGE');
    }
  });

  it('DM-07: Typwechsel auch über eine frühere Version hinweg (Block entfernt, gleiche ID mit anderem Typ wieder hinzugefügt) wird abgelehnt', () => {
    const s = base();
    const [a, b] = s.version.blocks as [BlockDef, BlockDef];
    const v2 = updateTemplate(s, { blocks: [b] }, clock).state;
    expect(() => updateTemplate(v2, { blocks: [b, { ...a, type: 'checkbox', config: { withNote: false } } as BlockDef] }, clock, [s.version])).toThrow(TemplateError);
  });

  it('DM-06: ungültige Blockdefinitionen und doppelte Block-IDs werden abgelehnt', () => {
    const s = base();
    const [a] = s.version.blocks as [BlockDef];
    expect(() => updateTemplate(s, { blocks: [a, { ...a }] }, clock)).toThrow();
    expect(() => updateTemplate(s, { blocks: [{ ...a, config: { min: 5, max: 1, step: 1 } }] }, clock)).toThrow();
  });
});

describe('Einträge', () => {
  it('DM-03: gültiger Eintrag wird akzeptiert', () => {
    const s = base();
    const [slider, note] = s.version.blocks as [BlockDef, BlockDef];
    const r = entrySchemaFor(s.version).safeParse(entryFor(s, { [slider.id]: 6, [note.id]: 'nach Sport' }));
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it('DM-03: Eintrag mit Block-ID, die in der referenzierten Version nicht existiert, wird abgelehnt', () => {
    const s = base();
    const [slider] = s.version.blocks as [BlockDef];
    const r = entrySchemaFor(s.version).safeParse(entryFor(s, { [slider.id]: 6, [newId()]: 3 }));
    expect(r.success).toBe(false);
  });

  it('DM-03: optionaler Zeitraum (ganztägig oder mit Uhrzeiten) wird akzeptiert', () => {
    const s = base();
    const schema = entrySchemaFor(s.version);
    const e = entryFor(s, {});
    expect(schema.safeParse({ ...e, period: { start: '2026-03-01', end: '2026-03-03' } }).success).toBe(true);
    expect(schema.safeParse({ ...e, period: { start: '2026-03-01', end: '2026-03-01' } }).success).toBe(true);
    expect(schema.safeParse({ ...e, period: { start: '2026-03-01T08:00:00+01:00', end: '2026-03-01T11:30:00+01:00' } }).success).toBe(true);
    // Nachtragen: vergangener Zeitpunkt ohne Zeitraum
    expect(schema.safeParse({ ...e, occurredAt: '2025-12-24T18:00:00+01:00' }).success).toBe(true);
  });

  it('DM-03: Zeitraum mit Ende vor Beginn oder gemischten Formaten wird abgelehnt', () => {
    const s = base();
    const schema = entrySchemaFor(s.version);
    const e = entryFor(s, {});
    expect(schema.safeParse({ ...e, period: { start: '2026-03-03', end: '2026-03-01' } }).success).toBe(false);
    expect(schema.safeParse({ ...e, period: { start: '2026-03-01T12:00:00Z', end: '2026-03-01T11:00:00Z' } }).success).toBe(false);
    expect(schema.safeParse({ ...e, period: { start: '2026-03-01', end: '2026-03-02T10:00:00Z' } }).success).toBe(false);
    expect(schema.safeParse({ ...e, period: { start: '2026-03-01' } }).success).toBe(false);
  });

  it('DM-03: ungültiger Blockwert, falsche Version oder Vorlage werden abgelehnt', () => {
    const s = base();
    const [slider] = s.version.blocks as [BlockDef];
    const schema = entrySchemaFor(s.version);
    expect(schema.safeParse(entryFor(s, { [slider.id]: 11 })).success).toBe(false);
    expect(schema.safeParse({ ...entryFor(s, { [slider.id]: 1 }), templateVersion: 2 }).success).toBe(false);
    expect(schema.safeParse({ ...entryFor(s, { [slider.id]: 1 }), templateId: newId() }).success).toBe(false);
    expect(schema.safeParse({ ...entryFor(s, { [slider.id]: 1 }), meta: { source: 'fax', timezone: 'UTC' } }).success).toBe(false);
  });

  it('Schnelleintrag-Auswahl der Vorlage ändert keine Version und lässt sich entfernen', () => {
    const s = base();
    const id = s.version.blocks[0]!.id;
    const set = updateTemplate(s, { quickBlockIds: [id] }, clock);
    expect(set.newVersion).toBe(false);
    expect(set.state.template.quickBlockIds).toEqual([id]);
    const cleared = updateTemplate(set.state, { quickBlockIds: null }, clock);
    expect(cleared.state.template.quickBlockIds).toBeUndefined();
    expect(cleared.state.template.currentVersion).toBe(1);
  });
});
