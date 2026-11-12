import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TEMPLATE_CATALOG, instantiateCatalogTemplate } from './catalog.js';
import { createIdGenerator } from './ids.js';
import { keyBetween } from './fractional-index.js';
import { templateSchema, templateVersionSchema, type BlockDef } from './templates.js';

interface V2Block { type: string; label: string; min?: number; max?: number; step?: number; options?: string[] }
interface V2Template { id: string; name: string; icon: string; blocks: V2Block[] }

const v2: { templates: V2Template[] } = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../fixtures/v2/template-catalog.json', import.meta.url)), 'utf8'),
);

let t = 1_700_000_000_000;
const clock = { now: () => (t += 1) };
const { newId } = createIdGenerator(clock);
const diaryId = newId();

describe('Vorlagenkatalog', () => {
  it('BLK-16: jede v2-Katalogvorlage ist in v3 verfügbar (gleiche ID, Name, Icon)', () => {
    expect(TEMPLATE_CATALOG.map((c) => c.id)).toEqual(v2.templates.map((x) => x.id));
    for (const old of v2.templates) {
      const c = TEMPLATE_CATALOG.find((x) => x.id === old.id)!;
      expect(c.name).toBe(old.name);
      expect(c.icon).toBe(old.icon);
      expect(c.description.length).toBeGreaterThan(0);
    }
  });

  for (const old of v2.templates) {
    it(`BLK-16: ${old.id} erzeugt eine gültige Vorlage mit den v2-Blöcken (ohne Datum-Block, A-010)`, () => {
      const s = instantiateCatalogTemplate(old.id, { id: newId(), diaryId, order: keyBetween(null, null), newId }, clock);
      expect(templateSchema.safeParse(s.template).success).toBe(true);
      expect(templateVersionSchema.safeParse(s.version).success).toBe(true);
      expect(s.template).toMatchObject({ name: old.name, icon: old.icon, currentVersion: 1, diaryId });

      const expected = old.blocks.filter((b) => b.type !== 'date');
      const blocks = [...s.version.blocks].sort((a, b) => (a.order < b.order ? -1 : 1));
      expect(blocks.map((b) => [b.type, b.label])).toEqual(expected.map((b) => [b.type, b.label]));
      expected.forEach((e, i) => {
        const b = blocks[i]!;
        if (b.type === 'slider') expect(b.config).toMatchObject({ min: e.min, max: e.max, step: e.step });
        if (b.type === 'multiselect') expect(b.config.options.map((o) => o.label)).toEqual(e.options);
      });
    });
  }

  it('BLK-16: jede Instanz bekommt frische IDs (Blöcke und Optionen)', () => {
    const a = instantiateCatalogTemplate('headache', { id: newId(), diaryId, order: 'V', newId }, clock);
    const b = instantiateCatalogTemplate('headache', { id: newId(), diaryId, order: 'W', newId }, clock);
    const ids = (s: typeof a) => s.version.blocks.flatMap((x: BlockDef) => [x.id, ...(x.type === 'multiselect' ? x.config.options.map((o) => o.id) : [])]);
    const all = [...ids(a), ...ids(b)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('BLK-16: Schmerzstärke trägt die Rolle outcome (Standard für Schnelleintrag), Notizen die Rolle note', () => {
    for (const c of TEMPLATE_CATALOG) {
      const s = instantiateCatalogTemplate(c.id, { id: newId(), diaryId, order: 'V', newId }, clock);
      expect(s.version.blocks.find((b) => b.label === 'Schmerzstärke')?.role).toBe('outcome');
      expect(s.version.blocks.find((b) => b.label === 'Notizen')?.role).toBe('note');
    }
  });

  it('BLK-16: unbekannte Katalog-ID wirft', () => {
    expect(() => instantiateCatalogTemplate('gibt-es-nicht', { id: newId(), diaryId, order: 'V', newId }, clock)).toThrow();
  });
});
