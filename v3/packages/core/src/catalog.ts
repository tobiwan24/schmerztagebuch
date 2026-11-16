// Vorlagenkatalog, portiert aus v2 `src/data/templateCatalog.ts` (Spec 05 „Vorlagen", BLK-16).
// Katalog-IDs, Namen und Icons bleiben gleich. Der v2-Pflicht-Block „Datum" wird kein Block: Zeitpunkt (Nachtragen)
// und Zeitraum sind Eigenschaften jedes Eintrags (`occurredAt`/`period`, DECISIONS A-010). Rollen sind neu (Spec 02)
// und ermöglichen den Standard-Schnelleintrag.
import type { Clock } from './env.js';
import { keyBetween } from './fractional-index.js';
import { DEFAULT_MEDICATION_UNITS } from './blocks/index.js';
import { createTemplate, type BlockDef, type Role, type TemplateState } from './templates.js';

/** v2-Standard-Preset der Body-Map (ID aus v2 `bodymapPresets.ts` übernommen, Migration ordnet darüber zu). */
export const DEFAULT_BODYMAP_PRESET_ID = 'default-koerper-vorderseite';

type BlockSpec =
  | { type: 'slider'; label: string; role?: Role; min?: number; max?: number; step?: number }
  | { type: 'multiselect'; label: string; role?: Role; options: [label: string, color: string][] }
  | { type: 'medication'; label: string; role?: Role; presets: [name: string, dose: number, unit: string, color: string][] }
  | { type: 'bodymap'; label: string; role?: Role }
  | { type: 'textarea'; label: string; role?: Role };

export interface CatalogEntry {
  id: string;
  name: string;
  icon: string;
  description: string;
  blocks: readonly BlockSpec[];
}

const pain: BlockSpec = { type: 'slider', label: 'Schmerzstärke', role: 'outcome' };
const notes: BlockSpec = { type: 'textarea', label: 'Notizen', role: 'note' };

export const TEMPLATE_CATALOG: readonly CatalogEntry[] = [
  {
    id: 'general-pain',
    name: 'Allgemeines Schmerz-Tagebuch',
    icon: 'Activity',
    description: 'Schmerzstärke, Körperkarte und Notizen',
    blocks: [pain, { type: 'bodymap', label: 'Schmerzlokalisation' }, notes],
  },
  {
    id: 'chronic-pain',
    name: 'Chronischer Schmerz',
    icon: 'HeartPulse',
    description: 'Schmerzstärke, Funktion, Schlaf, Stimmung',
    blocks: [
      pain,
      { type: 'slider', label: 'Funktionsfähigkeit', role: 'function' },
      { type: 'slider', label: 'Schlafqualität', role: 'sleep' },
      { type: 'slider', label: 'Stimmung', role: 'mood' },
      notes,
    ],
  },
  {
    id: 'migraine',
    name: 'Migräne-Tracking',
    icon: 'Zap',
    description: 'Schmerzstärke, Begleitsymptome, Dauer, Auslöser',
    blocks: [
      pain,
      {
        type: 'multiselect', label: 'Begleitsymptome', role: 'symptom',
        options: [['Übelkeit', '#f97316'], ['Aura', '#8b5cf6'], ['Lichtempfindlichkeit', '#eab308'], ['Lärmempfindlichkeit', '#ef4444']],
      },
      { type: 'slider', label: 'Dauer (Stunden)', min: 0, max: 72, step: 1 },
      {
        type: 'multiselect', label: 'Auslöser', role: 'trigger',
        options: [['Stress', '#ef4444'], ['Schlafmangel', '#6366f1'], ['Wetter', '#3b82f6'], ['Hormone', '#ec4899'], ['Essen/Trinken', '#f97316']],
      },
      notes,
    ],
  },
  {
    id: 'headache',
    name: 'Kopfschmerz-Tagebuch',
    icon: 'Brain',
    description: 'Schmerzstärke, Schmerzart, Medikamente, Auslöser',
    blocks: [
      pain,
      {
        type: 'multiselect', label: 'Schmerzart', role: 'symptom',
        options: [['Dumpf', '#6b7280'], ['Pochend', '#ef4444'], ['Stechend', '#f97316'], ['Drückend', '#8b5cf6']],
      },
      {
        type: 'multiselect', label: 'Medikamente', role: 'medication',
        options: [['Ibuprofen', '#3b82f6'], ['Paracetamol', '#10b981'], ['Aspirin', '#f59e0b'], ['Triptan', '#6366f1']],
      },
      {
        type: 'multiselect', label: 'Auslöser', role: 'trigger',
        options: [['Stress', '#ef4444'], ['Schlafmangel', '#6366f1'], ['Bildschirm', '#0ea5e9'], ['Alkohol', '#f97316']],
      },
      notes,
    ],
  },
  // v3.x (M16): nutzt den Medikamenten-Block statt einer Auswahlliste (Spec 05, BLK-50).
  {
    id: 'pain-medication',
    name: 'Schmerztagebuch mit Medikamenten',
    icon: 'Pill',
    description: 'Schmerzstärke, Medikamente mit Dosis und Uhrzeit, Notizen',
    blocks: [
      pain,
      {
        type: 'medication', label: 'Medikamente', role: 'medication',
        presets: [['Ibuprofen', 400, 'mg', '#3b82f6'], ['Paracetamol', 500, 'mg', '#10b981'], ['Metamizol', 500, 'mg', '#f59e0b']],
      },
      notes,
    ],
  },
];

function toBlockDef(spec: BlockSpec, order: string, newId: () => string): BlockDef {
  const base = { id: newId(), label: spec.label, required: false, order, ...(spec.role ? { role: spec.role } : {}) };
  switch (spec.type) {
    case 'slider':
      return { ...base, type: 'slider', config: { min: spec.min ?? 0, max: spec.max ?? 10, step: spec.step ?? 1 } };
    case 'multiselect':
      return {
        ...base,
        type: 'multiselect',
        config: { multiple: true, options: spec.options.map(([label, color]) => ({ id: newId(), label, color })) },
      };
    case 'medication':
      return {
        ...base,
        type: 'medication',
        config: {
          presets: spec.presets.map(([name, dose, unit, color]) => ({ id: newId(), name, dose, unit, color })),
          units: [...DEFAULT_MEDICATION_UNITS],
          allowFree: true,
        },
      };
    case 'bodymap':
      return { ...base, type: 'bodymap', config: { defaultPresetId: DEFAULT_BODYMAP_PRESET_ID } };
    case 'textarea':
      return { ...base, type: 'textarea', config: { allowAttachments: true, allowEvents: true } };
  }
}

/** Legt aus einem Katalogeintrag eine neue Vorlage (Version 1) mit frischen IDs an. */
export function instantiateCatalogTemplate(
  catalogId: string,
  target: { id: string; diaryId: string; order: string; newId: () => string },
  clock: Clock,
): TemplateState {
  const entry = TEMPLATE_CATALOG.find((c) => c.id === catalogId);
  if (!entry) throw new RangeError(`Unbekannte Katalogvorlage: ${catalogId}`);
  let prev: string | null = null;
  const blocks = entry.blocks.map((spec) => {
    prev = keyBetween(prev, null);
    return toBlockDef(spec, prev, target.newId);
  });
  return createTemplate(
    { id: target.id, diaryId: target.diaryId, name: entry.name, icon: entry.icon, order: target.order, blocks },
    clock,
  );
}
