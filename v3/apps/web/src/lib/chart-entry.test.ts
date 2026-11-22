import { describe, expect, it } from 'vitest';
import type { BlockDef, TemplateState } from '@stb/core';
import { chartBlockId } from './chart-entry';

const base = { required: false, order: 'a0' };
const state = (blocks: BlockDef[], archived = false): TemplateState => ({
  template: { id: 't', diaryId: 'd', name: 'T', order: 'a0', currentVersion: 1, archived, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  version: { templateId: 't', version: 1, blocks, createdAt: '2026-01-01T00:00:00.000Z' },
});
const area = (allowAttachments: boolean, extra: Partial<BlockDef> = {}) =>
  ({ ...base, id: 'n', label: 'Notizen', type: 'textarea', config: { allowAttachments, allowEvents: false }, ...extra }) as BlockDef;
const slider = (required: boolean) => ({ ...base, id: 's', label: 'S', type: 'slider', required, config: { min: 0, max: 10, step: 1 } }) as BlockDef;

describe('chartBlockId (Vorlage für „Diagramm als Eintrag“)', () => {
  it('nimmt den Textarea-Block mit erlaubten Anhängen, Slider ohne Pflicht stört nicht', () => {
    expect(chartBlockId(state([slider(false), area(true)]))).toBe('n');
  });
  it('lehnt Vorlagen ohne Anhang-Erlaubnis, mit anderen Pflichtfeldern oder archivierte ab', () => {
    expect(chartBlockId(state([area(false)]))).toBeNull();
    expect(chartBlockId(state([slider(true), area(true)]))).toBeNull();
    expect(chartBlockId(state([area(true)], true))).toBeNull();
    expect(chartBlockId(state([slider(false)]))).toBeNull();
  });
});
