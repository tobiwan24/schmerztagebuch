// Kurzbefehl-Manifest (Spec 08 „Manifest", FEAT-023): alle Vorlagen eines Tagebuchs als Beschreibung für den einen
// allgemeinen Kurzbefehl, dazu die Prüfung („Dry-Run") der erfassten Werte. Pure Logik ohne UI und ohne Uhr.
import { z } from 'zod';
import { canonical } from './canonical.js';
import { compareByOrder } from './fractional-index.js';
import { displayValue, isValueEmpty } from './entry-form.js';
import type { ShortcutAsk } from './diary.js';
import { buildShortcutPrompt, mapIntakeToValues, type IntakeInput } from './intake.js';
import { isNo, voiceFillable } from './intake-lines.js';
import { blockDefSchema, type BlockDef, type TemplateState, type TemplateVersion } from './templates.js';

/** Blocktypen, die der Kurzbefehl nicht befüllen kann (Körperkarte, Übung). */
const NOT_FILLABLE: ReadonlySet<BlockDef['type']> = new Set(['bodymap', 'exercise']);

export interface ManifestField {
  id: string;
  label: string;
  type: BlockDef['type'];
  required: boolean;
  /** Fragetext, den der Kurzbefehl vorliest, wenn das Feld fehlt oder ungültig ist. */
  question: string;
  options?: string[];
  min?: number;
  max?: number;
}

export interface ManifestTemplate {
  id: string;
  name: string;
  version: number;
  prompt: string;
  fields: ManifestField[];
}

export interface ShortcutManifest {
  v: 1;
  diary: string;
  defaultTemplateId: string | null;
  /** FEAT-024: Was `check` in `questions` nachfragt — nur Pflichtfelder oder alle leeren Felder (Tagebuch-Option). */
  ask: ShortcutAsk;
  templates: ManifestTemplate[];
}

/** Siegelinhalt: Manifest (geht an den Kurzbefehl) plus befüllbare Blöcke je Vorlage (bleibt auf dem Server für `check`). */
export interface ShortcutBundle {
  manifest: ShortcutManifest;
  blocks: Record<string, BlockDef[]>;
}

export interface CheckResult {
  missing: ManifestField[];
  /** `candidates` nur bei Zeilen (FEAT-024): ähnliche Optionen für „Meintest du …?“. */
  invalid: { field: string; message: string; candidates?: string[] }[];
  /**
   * FEAT-024: vorlesbare Rückfragen in Reihenfolge (ungültige zuerst, dann leere Felder je Modus). Der Kurzbefehl fragt jede
   * und hängt die Antwort als Zeile `label: Antwort` an.
   */
  questions: { label: string; question: string }[];
  summary: string;
}

const fillableBlocks = (version: TemplateVersion): BlockDef[] => [...version.blocks].sort(compareByOrder).filter((b) => !NOT_FILLABLE.has(b.type));

function question(b: BlockDef): string {
  switch (b.type) {
    case 'slider':
      return `${b.label}: Welcher Wert von ${b.config.min} bis ${b.config.max}${b.config.unit ? ` ${b.config.unit}` : ''}?`;
    case 'checkbox':
      return `${b.label}: Ja oder nein?`;
    case 'multiselect':
      return b.config.multiple ? `${b.label}: Welche Optionen treffen zu?` : `${b.label}: Welche Option trifft zu?`;
    case 'date':
      return b.config.mode === 'duration' ? `${b.label}: Wie viele Minuten?` : `${b.label}: Wann?`;
    case 'medication':
      return `${b.label}: Welches Medikament hast du genommen?`;
    default:
      return `${b.label}: Was möchtest du dazu sagen?`;
  }
}

function fieldOf(b: BlockDef): ManifestField {
  const base = { id: b.id, label: b.label, type: b.type, required: b.required === true, question: question(b) };
  switch (b.type) {
    case 'slider':
      return { ...base, min: b.config.min, max: b.config.max };
    case 'multiselect':
      return { ...base, options: b.config.options.map((o) => o.label) };
    case 'medication':
      return { ...base, options: b.config.presets.map((p) => p.name) };
    default:
      return base;
  }
}

/** Vorlagen, die der Kurzbefehl anbietet: aktive Vorlagen des Tagebuchs, ohne Trainingsvorlagen, in Vorlagen-Reihenfolge. */
const offered = (states: readonly TemplateState[]): TemplateState[] =>
  states.filter((s) => !s.template.archived && s.template.purpose !== 'training').sort((a, b) => compareByOrder(a.template, b.template));

export function buildShortcutBundle(diaryName: string, states: readonly TemplateState[], quickTemplateId?: string, ask: ShortcutAsk = 'all'): ShortcutBundle {
  const list = offered(states);
  const blocks: Record<string, BlockDef[]> = {};
  const templates = list.map((s): ManifestTemplate => {
    const fillable = fillableBlocks(s.version);
    blocks[s.template.id] = fillable;
    return {
      id: s.template.id,
      name: s.template.name,
      version: s.version.version,
      prompt: buildShortcutPrompt(s.template.name, { ...s.version, blocks: fillable }),
      fields: fillable.map(fieldOf),
    };
  });
  const defaultTemplateId = templates.find((t) => t.id === quickTemplateId)?.id ?? templates[0]?.id ?? null;
  return { manifest: { v: 1, diary: diaryName, defaultTemplateId, ask, templates }, blocks };
}

export const buildShortcutManifest = (diaryName: string, states: readonly TemplateState[], quickTemplateId?: string, ask: ShortcutAsk = 'all'): ShortcutManifest =>
  buildShortcutBundle(diaryName, states, quickTemplateId, ask).manifest;

/** Vorlagenversion (nur befüllbare Blöcke) für `checkIntake` aus dem Siegelinhalt; unbekannte Vorlage oder defekte Blöcke → `null`. */
export function versionFromBundle(bundle: Pick<ShortcutBundle, 'blocks'>, templateId: string): TemplateVersion | null {
  const raw = Object.hasOwn(bundle.blocks, templateId) ? bundle.blocks[templateId] : undefined;
  const parsed = z.array(blockDefSchema).safeParse(raw);
  return parsed.success ? { templateId, version: 1, blocks: parsed.data, createdAt: new Date(0).toISOString() } : null;
}

/** Rückfrage mit den Optionen (Kurzname bevorzugt, weil leichter zu sprechen). */
function spokenQuestion(b: BlockDef): string {
  const names = b.type === 'multiselect' ? b.config.options.map((o) => o.short ?? o.label) : b.type === 'medication' ? b.config.presets.map((p) => p.name) : [];
  return names.length ? `${question(b)} ${names.join(', ')}.` : question(b);
}

/**
 * Prüft erfasste Werte, ohne etwas zu speichern: fehlende und ungültige Felder, Rückfragen (`questions`) und vorlesbare
 * Zusammenfassung. `ask` = Tagebuch-Option; ohne Sprachmodell (`Sprachmodell: nein`) werden immer alle leeren Felder gefragt.
 */
export function checkIntake(input: IntakeInput, version: TemplateVersion, opts: { ask?: ShortcutAsk } = {}): CheckResult {
  const blocks = fillableBlocks(version);
  const fieldIds = new Set(blocks.map((b) => b.id));
  const mapping = mapIntakeToValues(input, version);
  const invalid: CheckResult['invalid'] = [
    ...mapping.errors.filter((e) => fieldIds.has(e.blockId)).map((e) => ({ field: e.blockId, message: e.message })),
    ...mapping.lineErrors.filter((e) => fieldIds.has(e.blockId)).map((e) => ({ field: e.blockId, message: e.message, candidates: e.candidates })),
  ];
  const invalidIds = new Set(invalid.map((i) => i.field));
  const empty = blocks.filter((b) => !invalidIds.has(b.id) && (mapping.values[b.id] === undefined || isValueEmpty(b, mapping.values[b.id])));
  const missing = empty.map(fieldOf);
  const ask = mapping.dictation?.model !== undefined && isNo(mapping.dictation.model) ? 'all' : (opts.ask ?? 'all');
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const questions = [
    ...invalid.map((i) => byId.get(i.field)!).filter(voiceFillable).map((b) => ({ label: b.label, question: `${invalid.find((i) => i.field === b.id)!.message} ${spokenQuestion(b)}` })),
    ...empty.filter((b) => voiceFillable(b) && (ask === 'all' || b.required)).map((b) => ({ label: b.label, question: spokenQuestion(b) })),
  ];
  const parts = blocks
    .filter((b) => mapping.values[b.id] !== undefined)
    .map((b) => ({ b, text: displayValue(b, mapping.values[b.id]) }))
    .filter((p) => p.text !== '')
    .map((p) => `${p.b.label}: ${p.text}`);
  return { missing, invalid, questions, summary: parts.length ? `${parts.join('. ')}.` : 'Keine Angaben.' };
}

/** Stabiler (nicht kryptografischer) Hash zur Änderungserkennung; Schlüsselreihenfolge egal (cyrb53 über `canonical`). */
export function manifestHash(value: unknown): string {
  const s = canonical(value);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
