// Kurzbefehl-Intake (Spec 08 „Abbildung auf Einträge", „Einrichtungshilfe"): pure Zuordnung und Prompt-Generator.
import { compareByOrder } from './fractional-index.js';
import { parseBlockValue } from './blocks/index.js';
import { uuidV7FromSeed } from './ids.js';
import type { BlockDef, TemplateVersion } from './templates.js';

/** Form des entsiegelten Kurzbefehl-Bodys (gleich `intakeBodySchema` in sync-protocol). */
/** Medikamenten-Position per Kurzbefehl (Block `medication`): Name genügt, der Rest ist optional. */
export interface IntakeMedication {
  name: string;
  dose?: number | string;
  unit?: string;
  at?: string;
  effect?: number | string;
}

export interface IntakeInput {
  templateId?: string;
  occurredAt?: string;
  text?: string;
  values?: Record<string, number | string | boolean | string[] | IntakeMedication | IntakeMedication[]>;
}

/** Groß/Klein-, Umlaut- und Satzzeichen-tolerante Form eines Labels („Übelkeit" = „uebelkeit" = „ubelkeit"). */
export function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]/g, '');
}

export interface IntakeMapping {
  values: Record<string, unknown>;
  /** Werte, die keinem Block zugeordnet werden konnten (landen in der Notiz). */
  unmatched: { key: string; value: unknown }[];
  /** Zugeordnete, aber ungültige Werte → Eingang statt Eintrag (VOI-07). */
  errors: { blockId: string; key: string; message: string }[];
  tags: string[];
  /** Notiztext, falls die Vorlage keinen textarea-Block hat. */
  note?: string;
}

const TRUE = new Set(['true', 'ja', 'yes', '1', 'x']);
const FALSE = new Set(['false', 'nein', 'no', '0', '']);

const toNumber = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN);

/** Positions-IDs ohne Uhr/Zufall: eindeutig je Position innerhalb des Blocks (genügt, Spec 02 verlangt UUID v7). */
const positionId = (i: number): string => uuidV7FromSeed(0, Uint8Array.from({ length: 10 }, (_, k) => (k === 1 ? i : k)));

type MedBlock = Extract<BlockDef, { type: 'medication' }>;

/** Namen oder Objekte → `items`; bekannte Namen werden dem Preset zugeordnet (Dosis/Einheit aus dem Preset), Rest frei. */
function medicationItems(b: MedBlock, raw: unknown): { ok: true; items: unknown[] } | { ok: false; message: string } {
  const list = Array.isArray(raw) ? raw : [raw];
  const items: unknown[] = [];
  for (const [i, r] of list.entries()) {
    const obj = typeof r === 'object' && r !== null ? (r as Record<string, unknown>) : { name: String(r) };
    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    if (!name) return { ok: false, message: 'Medikament ohne Name' };
    const preset = b.config.presets.find((p) => normalizeLabel(p.name) === normalizeLabel(name) || p.id === name);
    if (!preset && !b.config.allowFree) return { ok: false, message: `Medikament „${name}" gibt es nicht` };
    const dose = obj.dose !== undefined ? toNumber(obj.dose) : preset?.dose;
    const unit = typeof obj.unit === 'string' && obj.unit.trim() ? obj.unit.trim() : preset?.unit;
    const effect = obj.effect !== undefined ? toNumber(obj.effect) : undefined;
    items.push({
      id: positionId(i),
      ...(preset ? { presetId: preset.id } : {}),
      name: preset?.name ?? name,
      ...(dose !== undefined ? { dose } : {}),
      ...(unit !== undefined ? { unit } : {}),
      ...(typeof obj.at === 'string' ? { at: obj.at } : {}),
      ...(effect !== undefined ? { effect } : {}),
    });
  }
  return { ok: true, items };
}

function convert(b: BlockDef, raw: unknown): { ok: true; value: unknown } | { ok: false; message: string } {
  const fail = (message: string) => ({ ok: false as const, message });
  let candidate: unknown;
  switch (b.type) {
    case 'slider': {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw.replace(',', '.')) : NaN;
      candidate = n;
      break;
    }
    case 'checkbox': {
      const s = typeof raw === 'boolean' ? String(raw) : String(raw).trim().toLowerCase();
      if (TRUE.has(s)) candidate = { checked: true };
      else if (FALSE.has(s)) candidate = { checked: false };
      else return fail(`„${String(raw)}" ist kein Ja/Nein`);
      break;
    }
    case 'multiselect': {
      const labels = Array.isArray(raw) ? raw : [String(raw)];
      const ids: string[] = [];
      for (const l of labels) {
        const opt = b.config.options.find((o) => normalizeLabel(o.label) === normalizeLabel(String(l)) || o.id === l);
        if (!opt) return fail(`Option „${String(l)}" gibt es nicht`);
        if (!ids.includes(opt.id)) ids.push(opt.id);
      }
      candidate = ids;
      break;
    }
    case 'text':
      candidate = String(raw);
      break;
    case 'textarea':
      candidate = { text: String(raw) };
      break;
    case 'date':
      candidate = b.config.mode === 'duration' ? { minutes: Number(raw) } : { at: String(raw) };
      break;
    case 'medication': {
      const m = medicationItems(b, raw);
      if (!m.ok) return fail(m.message);
      candidate = { items: m.items };
      break;
    }
    case 'bodymap':
      return fail('Körperkarte kann per Kurzbefehl nicht befüllt werden');
  }
  const parsed = parseBlockValue(b.type, b.config as never, candidate);
  return parsed.success ? { ok: true, value: parsed.data } : fail(parsed.error.issues[0]?.message ?? 'ungültig');
}

/** Bildet Kurzbefehl-Werte auf Blöcke einer Vorlagenversion ab (Block-ID, Label tolerant, Options-Labels). */
export function mapIntakeToValues(input: IntakeInput, version: TemplateVersion): IntakeMapping {
  const out: IntakeMapping = { values: {}, unmatched: [], errors: [], tags: [] };
  const byId = new Map(version.blocks.map((b) => [b.id, b]));
  const byLabel = new Map(version.blocks.map((b) => [normalizeLabel(b.label), b]));
  for (const [key, raw] of Object.entries(input.values ?? {})) {
    const block = byId.get(key) ?? byLabel.get(normalizeLabel(key));
    if (!block) {
      out.unmatched.push({ key, value: raw });
      continue;
    }
    const c = convert(block, raw);
    if (c.ok) out.values[block.id] = c.value;
    else out.errors.push({ blockId: block.id, key, message: c.message });
  }

  const lines = [input.text?.trim(), ...out.unmatched.map((u) => `${u.key}: ${Array.isArray(u.value) ? u.value.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ') : typeof u.value === 'object' ? JSON.stringify(u.value) : String(u.value)}`)].filter(
    (l): l is string => Boolean(l),
  );
  if (lines.length) {
    const noteBlock = [...version.blocks].sort(compareByOrder).find((b) => b.type === 'textarea');
    if (noteBlock) {
      const existing = (out.values[noteBlock.id] as { text?: string } | undefined)?.text;
      out.values[noteBlock.id] = { ...(out.values[noteBlock.id] as object | undefined), text: [existing, ...lines].filter(Boolean).join('\n') };
    } else {
      out.tags.push('Kurzbefehl');
      out.note = lines.join('\n');
    }
  }
  return out;
}

/** Kopierbarer Prompt für das Modell im Kurzbefehl: beschreibt das JSON-Ziel aus der aktuellen Vorlagenversion. */
export function buildShortcutPrompt(templateName: string, version: TemplateVersion): string {
  const blocks = [...version.blocks].sort(compareByOrder).map((b) => {
    const base = { id: b.id, label: b.label, type: b.type, ...(b.description ? { description: b.description } : {}) };
    switch (b.type) {
      case 'slider':
        return { ...base, value: 'Zahl', min: b.config.min, max: b.config.max, step: b.config.step, ...(b.config.unit ? { unit: b.config.unit } : {}) };
      case 'multiselect':
        return { ...base, value: b.config.multiple ? 'Liste von Optionen' : 'eine Option', options: b.config.options.map((o) => o.label) };
      case 'checkbox':
        return { ...base, value: 'true oder false' };
      case 'date':
        return { ...base, value: b.config.mode === 'duration' ? 'Minuten (Zahl)' : 'ISO-Datum/Zeit' };
      case 'medication':
        return { ...base, value: 'Liste von Medikamenten (Name oder {name, dose?, unit?, at?, effect?})', presets: b.config.presets.map((p) => p.name) };
      case 'bodymap':
        return { ...base, value: 'nicht per Kurzbefehl — weglassen' };
      default:
        return { ...base, value: 'Text' };
    }
  });
  const schema = { template: templateName, blocks };
  return [
    `Wandle das Diktat in JSON für die Vorlage „${templateName}" um.`,
    'Antworte nur mit einem JSON-Objekt der Form {"occurredAt"?: ISO-Zeitpunkt, "text"?: string, "values": {<Block-ID>: Wert}}.',
    'Verwende als Schlüssel in "values" die Block-ID; lass Blöcke weg, zu denen nichts gesagt wurde. Halte Bereiche (min/max/step) ein',
    'und nimm bei Optionen nur die genannten Bezeichnungen. Alles Übrige kommt in "text".',
    '',
    '```json',
    JSON.stringify(schema, null, 2),
    '```',
  ].join('\n');
}
