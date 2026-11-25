// Editor-Domäne (Spec 05 „Vorlagen-Editor", BLK-22, A-037): Standard-Blöcke, Prüfung des Entwurfs,
// Umsortieren/Entfernen und Duplizieren einer Vorlage. Pure Funktionen; IDs und Uhr kommen von außen.
import type { Clock } from './env.js';
import type { IdGenerator } from './ids.js';
import { keyBetween, compareByOrder } from './fractional-index.js';
import { DEFAULT_BODYMAP_PRESET_ID } from './catalog.js';
import { createTemplate, type BlockDef, type TemplateState } from './templates.js';
import { DEFAULT_MEDICATION_UNITS, type BlockType } from './blocks/index.js';

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
    case 'medication':
      return { ...base, type, role: 'medication', config: { presets: [], units: [...DEFAULT_MEDICATION_UNITS], allowFree: true } };
    case 'exercise':
      return { ...base, type, role: 'activity', config: {} };
  }
}

export type DraftIssueCode =
  | 'NAME_EMPTY'
  | 'LABEL_EMPTY'
  | 'SLIDER_RANGE'
  | 'SLIDER_STEP'
  | 'OPTIONS_EMPTY'
  | 'OPTION_LABEL_EMPTY'
  | 'OPTION_LABEL_DUPLICATE'
  | 'PRESET_NAME_EMPTY'
  | 'PRESET_NAME_DUPLICATE'
  | 'VIDEO_URL_INVALID'
  | 'LEVEL_LABEL_EMPTY';

export interface DraftIssue {
  code: DraftIssueCode;
  /** Betroffener Block; fehlt bei `NAME_EMPTY`. */
  blockId?: string;
}

const isHttpsUrl = (s: string): boolean => {
  try {
    return new URL(s).protocol === 'https:';
  } catch {
    return false;
  }
};

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
    if (b.type === 'medication') {
      const seen = new Set<string>();
      let empty = false;
      let dup = false;
      for (const p of b.config.presets) {
        const n = p.name.trim().toLocaleLowerCase('de');
        if (n === '') empty = true;
        else if (seen.has(n)) dup = true;
        seen.add(n);
      }
      if (empty) issues.push({ code: 'PRESET_NAME_EMPTY', blockId: b.id });
      if (dup) issues.push({ code: 'PRESET_NAME_DUPLICATE', blockId: b.id });
    }
    if (b.type === 'exercise') {
      if (b.config.videoUrl !== undefined && !isHttpsUrl(b.config.videoUrl)) issues.push({ code: 'VIDEO_URL_INVALID', blockId: b.id });
      if (b.config.levels?.some((l) => l.label.trim() === '')) issues.push({ code: 'LEVEL_LABEL_EMPTY', blockId: b.id });
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

/** Schaltet `hideLabel` für einen Block (`id`) oder für alle um; „aus“ entfernt das Feld (kein `false` im Datensatz). */
export function setHideLabel(blocks: readonly BlockDef[], hide: boolean, id?: string): BlockDef[] {
  return blocks.map((b) => {
    if (id !== undefined && b.id !== id) return b;
    const { hideLabel: _drop, ...rest } = b;
    void _drop;
    return (hide ? { ...rest, hideLabel: true } : rest) as BlockDef;
  });
}

export function removeBlock(blocks: readonly BlockDef[], id: string): BlockDef[] {
  return sorted(blocks).filter((b) => b.id !== id);
}

export interface CopyBlocksOptions {
  /**
   * Eigene Body-Map-Bilder des Quell-Tagebuchs (RDM-034): zeigt `defaultPresetId` auf eines davon, fällt die Kopie auf
   * das Standardbild zurück (eigene Bilder sind Records des Tagebuchs und werden nicht mitkopiert).
   */
  ownBodymapImageIds?: ReadonlySet<string>;
  /**
   * Übungsmedien, die mitkopiert werden (RDM-034). Ohne Angabe bleiben Verweise unverändert (Kopie im selben Tagebuch);
   * mit Angabe bekommen enthaltene Medien eine neue ID (`mediaIds`), alle anderen Verweise entfallen.
   */
  copyableMediaIds?: ReadonlySet<string>;
}

export interface CopiedBlocks {
  blocks: BlockDef[];
  /** alte → neue Block-ID */
  idMap: Map<string, string>;
  /** alte → neue Übungsmedien-ID (nur mit `copyableMediaIds`) */
  mediaIds: Map<string, string>;
}

/** Neue IDs für Blöcke, Optionen, Medikamenten-Vorgaben und Übungs-Stufen (gemeinsam für Duplizieren und Vorlagenkatalog). */
export function copyBlocks(blocks: readonly BlockDef[], ids: IdGenerator, opts: CopyBlocksOptions = {}): CopiedBlocks {
  const idMap = new Map<string, string>();
  const mediaIds = new Map<string, string>();
  const media = (old: string | undefined): string | undefined => {
    if (old === undefined || !opts.copyableMediaIds) return old;
    if (!opts.copyableMediaIds.has(old)) return undefined;
    let id = mediaIds.get(old);
    if (!id) {
      id = ids.newId();
      mediaIds.set(old, id);
    }
    return id;
  };
  const out = blocks.map((b): BlockDef => {
    const id = ids.newId();
    idMap.set(b.id, id);
    if (b.type === 'multiselect') {
      return { ...b, id, config: { ...b.config, options: b.config.options.map((o) => ({ ...o, id: ids.newId() })) } };
    }
    if (b.type === 'medication') {
      return { ...b, id, config: { ...b.config, presets: b.config.presets.map((p) => ({ ...p, id: ids.newId() })) } };
    }
    if (b.type === 'bodymap' && opts.ownBodymapImageIds?.has(b.config.defaultPresetId)) {
      return { ...b, id, config: { ...b.config, defaultPresetId: DEFAULT_BODYMAP_PRESET_ID } };
    }
    if (b.type === 'exercise') {
      const { videoMediaId, steps, levels, ...rest } = b.config;
      const video = media(videoMediaId);
      const newSteps = steps?.flatMap((s) => {
        if (typeof s === 'string' || s.imageId === undefined) return [s];
        const imageId = media(s.imageId);
        if (imageId) return [{ ...s, imageId }];
        return s.text !== undefined ? [{ text: s.text }] : [];
      });
      return {
        ...b,
        id,
        config: {
          ...rest,
          ...(video !== undefined ? { videoMediaId: video } : {}),
          ...(newSteps !== undefined ? { steps: newSteps } : {}),
          ...(levels ? { levels: levels.map((l) => ({ ...l, id: ids.newId() })) } : {}),
        },
      };
    }
    return { ...b, id };
  });
  return { blocks: out, idMap, mediaIds };
}

/**
 * Kopie einer Vorlage: neue IDs für Vorlage, Blöcke, Optionen, Medikamenten-Vorgaben und Übungs-Stufen, Name „… (Kopie)", Version 1.
 * `nextOrder` = Order-Key der Vorlage direkt nach dem Original (oder `null`); die Kopie landet dazwischen.
 */
export function duplicateTemplate(source: TemplateState, ids: IdGenerator, clock: Clock, nextOrder: string | null): TemplateState {
  const { template, version } = source;
  const { blocks, idMap } = copyBlocks(version.blocks, ids);
  const quick = template.quickBlockIds?.flatMap((q) => idMap.get(q) ?? []);
  return createTemplate(
    {
      id: ids.newId(),
      diaryId: template.diaryId,
      name: `${template.name} (Kopie)`,
      ...(template.icon !== undefined ? { icon: template.icon } : {}),
      ...(template.color !== undefined ? { color: template.color } : {}),
      order: keyBetween(template.order, nextOrder),
      ...(quick?.length ? { quickBlockIds: quick } : {}),
      ...(template.purpose !== undefined ? { purpose: template.purpose } : {}),
      ...(template.functionPhases !== undefined ? { functionPhases: template.functionPhases } : {}),
      blocks,
    },
    clock,
  );
}
