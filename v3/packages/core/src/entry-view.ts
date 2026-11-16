// Anzeige eines Eintrags mit der aktuellen Vorlagenversion (Spec 02 „Versionierung von Vorlagen"):
// Werte werden über die Block-ID abgebildet; Blöcke, die es in der aktuellen Version nicht mehr gibt, erscheinen
// als „Archiviertes Feld" (nicht gelöscht).
import { compareByOrder } from './fractional-index.js';
import type { BlockDef, Entry, TemplateVersion } from './templates.js';

export interface EntryField {
  block: BlockDef;
  value: unknown;
  /** Block existiert in der aktuellen Version nicht mehr. */
  archived: boolean;
}

export function resolveEntryView(
  entry: Pick<Entry, 'templateId' | 'templateVersion' | 'values'>,
  entryVersion: TemplateVersion,
  currentVersion: TemplateVersion,
): EntryField[] {
  if (entryVersion.templateId !== entry.templateId || entryVersion.version !== entry.templateVersion) {
    throw new RangeError('Vorlagenversion passt nicht zum Eintrag');
  }
  if (currentVersion.templateId !== entry.templateId) throw new RangeError('Aktuelle Version gehört zu einer anderen Vorlage');

  const currentIds = new Set(currentVersion.blocks.map((b) => b.id));
  const entryBlocks = new Map(entryVersion.blocks.map((b) => [b.id, b]));
  // Label, Rolle und Reihenfolge kommen aus der aktuellen Version; die Konfiguration (z. B. Optionslabels) aus der
  // Version des Eintrags, gegen die der Wert gespeichert wurde (BLK-26).
  const withEntryConfig = (block: BlockDef): BlockDef => {
    const old = entryBlocks.get(block.id);
    return old && old.type === block.type && entry.values[block.id] !== undefined ? ({ ...block, config: old.config } as BlockDef) : block;
  };
  const current = [...currentVersion.blocks]
    .sort(compareByOrder)
    .map((block) => ({ block: withEntryConfig(block), value: entry.values[block.id], archived: false }));
  const archived = [...entryVersion.blocks]
    .filter((b) => !currentIds.has(b.id) && entry.values[b.id] !== undefined)
    .sort(compareByOrder)
    .map((block) => ({ block, value: entry.values[block.id], archived: true }));
  return [...current, ...archived];
}
