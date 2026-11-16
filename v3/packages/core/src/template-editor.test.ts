import { describe, it, expect } from 'vitest';
import { createIdGenerator } from './ids.js';
import { createTemplate, blockDefSchema, templateVersionSchema, type BlockDef } from './templates.js';
import { keyBetween } from './fractional-index.js';
import { BLOCK_TYPES } from './blocks/index.js';
import { setHideLabel, newBlock, validateTemplateDraft, moveBlock, removeBlock, duplicateTemplate } from './template-editor.js';

let t = 1_700_000_000_000;
const clock = { now: () => (t += 1000) };
const ids = createIdGenerator(clock);

const labelled = (b: BlockDef, label = 'X'): BlockDef => ({ ...b, label });
const optionIds = (blocks: readonly BlockDef[]): string[] =>
  blocks.flatMap((b) => [b.id, ...(b.type === 'multiselect' ? b.config.options.map((o) => o.id) : [])]);

describe('Editor-Domäne', () => {
  it('BLK-43: setHideLabel schaltet einen Block oder alle um; „aus“ entfernt das Feld', () => {
    const a = labelled(newBlock('slider', ids));
    const b = labelled(newBlock('text', ids, a.order));
    const one = setHideLabel([a, b], true, a.id);
    expect(one.map((x) => x.hideLabel)).toEqual([true, undefined]);
    const all = setHideLabel([a, b], true);
    expect(all.every((x) => x.hideLabel === true)).toBe(true);
    const off = setHideLabel(all, false);
    expect(off.every((x) => !('hideLabel' in x))).toBe(true);
    expect(off).toEqual([a, b]);
    expect(all.every((x) => blockDefSchema.safeParse(x).success)).toBe(true);
  });

  it('BLK-22: newBlock liefert für alle 9 Typen einen gültigen Block mit Standard-config', () => {
    expect(BLOCK_TYPES).toHaveLength(9);
    let last: string | null = null;
    for (const type of BLOCK_TYPES) {
      const b = newBlock(type, ids, last);
      last = b.order;
      expect(b.type).toBe(type);
      expect(blockDefSchema.safeParse(labelled(b)).success).toBe(true);
    }
  });

  it('BLK-22: validateTemplateDraft meldet leeres Label, Slider-Bereich/-Schritt, Multiselect ohne/doppelte Option', () => {
    const slider = newBlock('slider', ids);
    const ms = newBlock('multiselect', ids, slider.order);
    expect(validateTemplateDraft({ name: 'A', blocks: [labelled(slider), labelled(ms)] })).toEqual([]);
    expect(validateTemplateDraft({ name: ' ', blocks: [] })).toEqual([{ code: 'NAME_EMPTY' }]);
    expect(validateTemplateDraft({ blocks: [slider] })).toEqual([{ code: 'LABEL_EMPTY', blockId: slider.id }]);

    const bad = (c: object) => ({ ...labelled(slider), config: { ...slider.config, ...c } }) as BlockDef;
    expect(validateTemplateDraft({ blocks: [bad({ min: 5, max: 5 })] }).map((i) => i.code)).toContain('SLIDER_RANGE');
    expect(validateTemplateDraft({ blocks: [bad({ step: 0 })] }).map((i) => i.code)).toContain('SLIDER_STEP');
    expect(validateTemplateDraft({ blocks: [bad({ step: 3 })] }).map((i) => i.code)).toContain('SLIDER_STEP');

    const none = { ...labelled(ms), config: { multiple: true, options: [] } } as BlockDef;
    expect(validateTemplateDraft({ blocks: [none] }).map((i) => i.code)).toEqual(['OPTIONS_EMPTY']);
    const opt = (label: string) => ({ id: ids.newId(), label, color: '#fff' });
    const dup = { ...labelled(ms), config: { multiple: true, options: [opt('Übelkeit'), opt(' übelkeit ')] } } as BlockDef;
    expect(validateTemplateDraft({ blocks: [dup] }).map((i) => i.code)).toEqual(['OPTION_LABEL_DUPLICATE']);
  });

  it('Medikamenten-Block: leere und doppelte Vorgaben-Namen werden gemeldet', () => {
    const med = labelled(newBlock('medication', ids), 'Medikamente');
    const preset = (name: string) => ({ id: ids.newId(), name, unit: 'mg', color: '#ef4444' });
    const mk = (names: string[]) => ({ ...med, config: { ...med.config, presets: names.map(preset) } }) as BlockDef;
    expect(validateTemplateDraft({ blocks: [mk(['Ibuprofen', 'Paracetamol'])] })).toEqual([]);
    expect(validateTemplateDraft({ blocks: [mk(['Ibuprofen', ' '])] }).map((i) => i.code)).toEqual(['PRESET_NAME_EMPTY']);
    expect(validateTemplateDraft({ blocks: [mk(['Ibuprofen', ' ibuprofen'])] }).map((i) => i.code)).toEqual(['PRESET_NAME_DUPLICATE']);
  });

  it('BLK-22: moveBlock und removeBlock ändern nur Order-Key bzw. entfernen den Block', () => {
    const a = labelled(newBlock('text', ids), 'A');
    const b = labelled(newBlock('text', ids, a.order), 'B');
    const c = labelled(newBlock('text', ids, b.order), 'C');
    const moved = moveBlock([a, b, c], c.id, 0);
    expect(moved.map((x) => x.label)).toEqual(['C', 'A', 'B']);
    expect(moved.find((x) => x.id === a.id)).toEqual(a);
    expect(moveBlock([a, b, c], a.id, 99).map((x) => x.label)).toEqual(['B', 'C', 'A']);
    expect(removeBlock([a, b, c], b.id).map((x) => x.label)).toEqual(['A', 'C']);
  });

  it('BLK-22: duplicateTemplate vergibt neue IDs (Vorlage, Blöcke, Optionen), Kopie-Name, Version 1, Order direkt nach dem Original', () => {
    const ms = labelled(newBlock('multiselect', ids), 'Symptome');
    const sl = labelled(newBlock('slider', ids, ms.order), 'Schmerz');
    const orig = createTemplate(
      { id: ids.newId(), diaryId: ids.newId(), name: 'Migräne', icon: 'Zap', color: '#ef4444', order: keyBetween(null, null), blocks: [ms, sl] },
      clock,
    );
    const next = keyBetween(orig.template.order, null);
    const copy = duplicateTemplate(orig, ids, clock, next);
    expect(copy.template.name).toBe('Migräne (Kopie)');
    expect(copy.template.id).not.toBe(orig.template.id);
    expect(copy.template.icon).toBe('Zap');
    expect(copy.template.currentVersion).toBe(1);
    expect(copy.version.version).toBe(1);
    expect(copy.template.order > orig.template.order && copy.template.order < next).toBe(true);
    expect(templateVersionSchema.safeParse(copy.version).success).toBe(true);
    const origIds = new Set(optionIds(orig.version.blocks));
    const copyIds = optionIds(copy.version.blocks);
    expect(copyIds).toHaveLength(origIds.size);
    expect(copyIds.some((id) => origIds.has(id))).toBe(false);
    expect(copy.version.blocks.map((b) => b.label)).toEqual(['Symptome', 'Schmerz']);
  });

  it('duplicateTemplate übernimmt die Schnelleintrag-Auswahl mit den neuen Block-IDs', () => {
    const sl = labelled(newBlock('slider', ids), 'Schmerz');
    const tx = labelled(newBlock('text', ids, sl.order), 'Notiz');
    const orig = createTemplate({ id: ids.newId(), diaryId: ids.newId(), name: 'T', order: keyBetween(null, null), quickBlockIds: [tx.id], blocks: [sl, tx] }, clock);
    const copy = duplicateTemplate(orig, ids, clock, null);
    expect(copy.template.quickBlockIds).toEqual([copy.version.blocks[1]!.id]);
  });
});
