import { generateUUID } from '../utils/uuid';
import type { Block } from '../types/blocks';

export interface TemplateCatalogEntry {
  id: string;
  name: string;
  icon: string;
  description: string;
  createBlocks: () => Block[];
}

/** Pflicht-Datum-Block – nicht löschbar */
function makeDateBlock(): Block {
  return {
    id: generateUUID(),
    type: 'date',
    label: 'Datum',
    hideLabelInDiary: false,
    isDeletable: false,
    value: undefined,
  };
}

/** Optionaler Notizen-Block */
function makeNotesBlock(): Block {
  return {
    id: generateUUID(),
    type: 'textarea',
    label: 'Notizen',
    hideLabelInDiary: false,
    isDeletable: true,
    value: undefined,
  };
}

/** Generischer Schmerzstärke-Slider */
function makePainSlider(label = 'Schmerzstärke'): Block {
  return {
    id: generateUUID(),
    type: 'slider',
    label,
    hideLabelInDiary: false,
    isDeletable: true,
    value: undefined,
    min: 0,
    max: 10,
    step: 1,
    dashboard: { enabled: true, type: 'pain' },
  };
}

/** Generischer Slider ohne Dashboard-Typ */
function makeSlider(label: string, min = 0, max = 10, step = 1): Block {
  return {
    id: generateUUID(),
    type: 'slider',
    label,
    hideLabelInDiary: false,
    isDeletable: true,
    value: undefined,
    min,
    max,
    step,
    dashboard: { enabled: true },
  };
}

/** MultiSelect-Block mit vordefinierten Optionen */
function makeMultiSelect(label: string, options: { text: string; color: string }[]): Block {
  return {
    id: generateUUID(),
    type: 'multiselect',
    label,
    hideLabelInDiary: false,
    isDeletable: true,
    value: undefined,
    multiSelectOptions: options,
    dashboard: { enabled: false },
  };
}

export const TEMPLATE_CATALOG: TemplateCatalogEntry[] = [
  {
    id: 'general-pain',
    name: 'Allgemeines Schmerz-Tagebuch',
    icon: 'Activity',
    description: 'Datum, Schmerzstärke und Notizen',
    createBlocks: () => [
      makeDateBlock(),
      makePainSlider(),
      makeNotesBlock(),
    ],
  },
  {
    id: 'chronic-pain',
    name: 'Chronischer Schmerz',
    icon: 'HeartPulse',
    description: 'Schmerzstärke, Funktion, Schlaf, Stimmung',
    createBlocks: () => [
      makeDateBlock(),
      makePainSlider(),
      makeSlider('Funktionsfähigkeit'),
      makeSlider('Schlafqualität'),
      makeSlider('Stimmung'),
      makeNotesBlock(),
    ],
  },
  {
    id: 'migraine',
    name: 'Migräne-Tracking',
    icon: 'Zap',
    description: 'Schmerzstärke, Begleitsymptome, Dauer, Auslöser',
    createBlocks: () => [
      makeDateBlock(),
      makePainSlider(),
      makeMultiSelect('Begleitsymptome', [
        { text: 'Übelkeit', color: '#f97316' },
        { text: 'Aura', color: '#8b5cf6' },
        { text: 'Lichtempfindlichkeit', color: '#eab308' },
        { text: 'Lärmempfindlichkeit', color: '#ef4444' },
      ]),
      makeSlider('Dauer (Stunden)', 0, 72, 1),
      makeMultiSelect('Auslöser', [
        { text: 'Stress', color: '#ef4444' },
        { text: 'Schlafmangel', color: '#6366f1' },
        { text: 'Wetter', color: '#3b82f6' },
        { text: 'Hormone', color: '#ec4899' },
        { text: 'Essen/Trinken', color: '#f97316' },
      ]),
      makeNotesBlock(),
    ],
  },
  {
    id: 'headache',
    name: 'Kopfschmerz-Tagebuch',
    icon: 'Brain',
    description: 'Schmerzstärke, Schmerzart, Medikamente, Auslöser',
    createBlocks: () => [
      makeDateBlock(),
      makePainSlider(),
      makeMultiSelect('Schmerzart', [
        { text: 'Dumpf', color: '#6b7280' },
        { text: 'Pochend', color: '#ef4444' },
        { text: 'Stechend', color: '#f97316' },
        { text: 'Drückend', color: '#8b5cf6' },
      ]),
      makeMultiSelect('Medikamente', [
        { text: 'Ibuprofen', color: '#3b82f6' },
        { text: 'Paracetamol', color: '#10b981' },
        { text: 'Aspirin', color: '#f59e0b' },
        { text: 'Triptan', color: '#6366f1' },
      ]),
      makeMultiSelect('Auslöser', [
        { text: 'Stress', color: '#ef4444' },
        { text: 'Schlafmangel', color: '#6366f1' },
        { text: 'Bildschirm', color: '#0ea5e9' },
        { text: 'Alkohol', color: '#f97316' },
      ]),
      makeNotesBlock(),
    ],
  },
];
