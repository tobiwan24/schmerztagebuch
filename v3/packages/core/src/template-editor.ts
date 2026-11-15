// Editor-Domäne (Spec 05 „Vorlagen-Editor", BLK-22, A-037): Standard-Blöcke, Prüfung des Entwurfs,
// Umsortieren/Entfernen und Duplizieren einer Vorlage. Pure Funktionen; IDs und Uhr kommen von außen.
import type { Clock } from './env.js';
import type { IdGenerator } from './ids.js';
import { keyBetween, compareByOrder } from './fractional-index.js';
import { DEFAULT_BODYMAP_PRESET_ID } from './catalog.js';
import { createTemplate, type BlockDef, type TemplateState } from './templates.js';
import type { BlockType } from './blocks/index.js';

/** Farbpalette für Multiselect-Optionen (Hex, wie die Katalogvorlagen). */
export const OPTION_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'] as const;

/** Neuer Block mit gültiger Standard-`config`; `afterOrder` = Order-Key des bisher letzten Blocks. Label ist zunächst leer. */
export function newBlock(type: BlockType, ids: IdGenerator, afterOrder: string | null = null): BlockDef {
  const base = { id: ids.newId(), label: '', required: false, order: keyBetween(afterOrder, null) };
  switch (type) {
    case 'slider':
      return { ...base, type, config: { min: 0, max: 10, step: 1 } };
    case 'checkbox':
      return { ...base, type, config: { withNote: false } };
    case 'multiselect':
      return { ...base, type, config: { multiple: true, options: [{ id: ids.newId(), label: 'Option 1', color: OPTION_COLORS[0] }] } };
    case 'text':
      return { ...base, type, config: {} };
    case 'textarea':
      return { ...base, type, config: { allowEvents: true, allowAttachments: true } };
    case 'date':
      return { ...base, type, config: { mode: 'date' } };
    case 'bodymap':
      return { ...base, type, config: { defaultPresetId: DEFAULT_BODYMAP_PRESET_ID } };
  }
}

export type DraftIssueCode =
  | 'NAME_EMPTY'
  | 'LABEL_EMPTY'
  | 'SLIDER_RANGE'
  | 'SLIDER_STEP'
  | 'OPTIONS_EMPTY'
  | 'OPTION_LABEL_EMPTY'
  | 'OPTION_LABEL_DUPLICATE';

export interface DraftIssue {
  code: DraftIssueCode;
  /** Betroffener Block; fehlt bei `NAME_EMPTY`. */
  blockId?: string;
}

/** Prüft einen Entwurf vor dem Speichern; leere Liste = speicherbar. */
export function validateTemplateDraft(draft: { name?: string; blocks: readonly BlockDef[] }): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (draft.name !== undefined && draft.name.trim() === '') issues.push({ code: 'NAME_EMPTY' });
  for (const b of draft.blocks) {
    if (b.label.trim() === '') issues.push({ code: 'LABEL_EMPTY', blockId: b.id });
    if (b.type === 'slider') {
      const { min, max, step } = b.config;
      if (!(max > min)) issues.push({ code: 'SLIDER_RANGE', blockId: b.id });
      const span = max - min;
      if (!(step > 0) || (span > 0 && Math.abs(Math.round(span / step) * step - span) > 1e-9)) {
        issues.push({ code: 'SLIDER_STEP', blockId: b.id });
      }
    }
    if (b.type === 'multiselect') {
      if (b.config.options.length === 0) issues.push({ code: 'OPTIONS_EMPTY', blockId: b.id });
      const seen = new Set<string>();
      let empty = false;
      let dup = false;
      for (const o of b.config.options) {
        const l = o.label.trim().toLocaleLowerCase('de');
        if (l === '') empty = true;
        else if (seen.has(l)) dup = true;
        seen.add(l);
      }
      if (empty) issues.push({ code: 'OPTION_LABEL_EMPTY', blockId: b.id });
      if (dup) issues.push({ code: 'OPTION_LABEL_DUPLICATE', blockId: b.id });
    }
  }
  return issues;
}

const sorted = (blocks: readonly BlockDef[]): BlockDef[] => [...blocks].sort(compareByOrder);

/** Verschiebt einen Block an die Position `toIndex` (0-basiert, in der Liste ohne ihn); nur dessen Order-Key ändert sich. */
export function moveBlock(blocks: readonly BlockDef[], id: string, toIndex: number): BlockDef[] {
  const list = sorted(blocks);
  const block = list.find((b) => b.id === id);
  if (!block) return list;
  const rest = list.filter((b) => b.id !== id);
  const i = Math.max(0, Math.min(toIndex, rest.length));
  const order = keyBetween(rest[i - 1]?.order ?? null, rest[i]?.order ?? null);
  return [...rest.slice(0, i), { ...block, order }, ...rest.slice(i)];
}

export function removeBlock(blocks: readonly BlockDef[], id: string): BlockDef[] {
  return sorted(blocks).filter((b) => b.id !== id);
}

/**
 * Kopie einer Vorlage: neue IDs für Vorlage, Blöcke und Optionen, Name „… (Kopie)", Version 1.
 * `nextOrder` = Order-Key der Vorlage direkt nach dem Original (oder `null`); die Kopie landet dazwischen.
 */
export function duplicateTemplate(source: TemplateState, ids: IdGenerator, clock: Clock, nextOrder: string | null): TemplateState {
  const { template, version } = source;
  const blocks = version.blocks.map((b): BlockDef => {
    const id = ids.newId();
    if (b.type === 'multiselect') {
      return { ...b, id, config: { ...b.config, options: b.config.options.map((o) => ({ ...o, id: ids.newId() })) } };
    }
    return { ...b, id };
  });
  return createTemplate(
    {
      id: ids.newId(),
      diaryId: template.diaryId,
      name: `${template.name} (Kopie)`,
      ...(template.icon !== undefined ? { icon: template.icon } : {}),
      ...(template.color !== undefined ? { color: template.color } : {}),
      order: keyBetween(template.order, nextOrder),
      blocks,
    },
    clock,
  );
}
