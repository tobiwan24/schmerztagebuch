import { describe, expect, it } from 'vitest';
import type { BlockDef } from '@stb/core';
import { rolesPreview, usableSuggestions, withRole } from './roles';

const blocks = [
  { id: 'b1', type: 'slider', label: 'Schmerz', required: false, order: 'a0', config: { min: 0, max: 10, step: 1 } },
  { id: 'b2', type: 'text', label: 'Schlaf', description: 'Stunden', required: false, order: 'a1', config: {}, role: 'sleep' },
  { id: 'b3', type: 'text', label: 'Notiz', required: false, order: 'a2', config: {} },
] as unknown as BlockDef[];

describe('Rollenvorschläge', () => {
  it('BLK-53: unbekannte Blöcke, gleiche Rolle und Doppelte werden verworfen', () => {
    const r = usableSuggestions(blocks, {
      suggestions: [
        { blockId: 'b1', role: 'outcome', reason: 'Skala' }, { blockId: 'b1', role: 'mood' },
        { blockId: 'b2', role: 'sleep' }, { blockId: 'zz', role: 'note' }, { blockId: 'b3', role: 'note' },
      ],
    });
    expect(r).toEqual([{ blockId: 'b1', label: 'Schmerz', role: 'outcome', reason: 'Skala' }, { blockId: 'b3', label: 'Notiz', role: 'note' }]);
  });

  it('BLK-53: Übernehmen setzt nur die Rolle des einen Blocks; Vorschau nennt nur Bezeichnungen', () => {
    const next = withRole(blocks, 'b1', 'outcome');
    expect(next[0]!.role).toBe('outcome');
    expect(next.slice(1)).toEqual(blocks.slice(1));
    expect(rolesPreview(blocks)).toBe('Schmerz\nSchlaf (Stunden)\nNotiz');
  });
});
