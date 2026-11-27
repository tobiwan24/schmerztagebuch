// Kurzbefehl-Intake (Spec 08 „Abbildung auf Einträge", „Einrichtungshilfe"): pure Zuordnung und Prompt-Generator.
import { compareByOrder } from './fractional-index.js';
import { parseBlockValue } from './blocks/index.js';
import { uuidV7FromSeed } from './ids.js';
import {
  RESERVED_LINES, buildLinePrompt, fieldHint, isNo, isYes, levenshtein, normalizeLabel, optionNames, parseGermanDate,
  parseGermanNumber, resolveOptions, similarOptions, softNorm, type NamedOption,
} from './intake-lines.js';
import type { BlockDef, TemplateVersion } from './templates.js';

export { normalizeLabel };

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
  /** Zeilenformat (FEAT-024): „Feld: Wert“ je Zeile, letzte Zeile je Feld gewinnt; reservierte Zeilen `Diktat:`, `Sprachmodell:`. */
  lines?: string;
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
  /**
   * Nicht passende Zeilen des Zeilenformats (unbekannte Option, ungültiger Wert): weiche Fehler — der Kurzbefehl fragt nach,
   * die Abholung ignoriert sie (die Zeilen bleiben in `dictation.lines`). `candidates` = ähnliche Optionen („Meintest du …?“).
   */
  lineErrors: { blockId: string; key: string; message: string; candidates: string[] }[];
  /** Rohdaten des Zeilenformats für `meta.dictation` (nur wenn `lines` geschickt wurde). */
  dictation?: { text: string; lines: string; model?: string };
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
        const opt = b.config.options.find((o) => o.id === l || optionNames(o).some((n) => normalizeLabel(n) === normalizeLabel(String(l))));
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
  const out: IntakeMapping = { values: {}, unmatched: [], errors: [], tags: [], lineErrors: [] };
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
  if (input.lines !== undefined) {
    // Zeilen überschreiben `values` desselben Felds (neuere Angabe), ihre Fehler sind weich (Rückfrage statt Eingang).
    const l = mapLines(input.lines, version);
    for (const [id, v] of Object.entries(l.values)) out.values[id] = v;
    const touched = new Set([...Object.keys(l.values), ...l.errors.map((e) => e.blockId)]);
    out.errors = out.errors.filter((e) => !touched.has(e.blockId));
    out.lineErrors = l.errors;
    out.dictation = { text: l.dictation ?? '', lines: input.lines, ...(l.model ? { model: l.model } : {}) };
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

/** Beschreibung der Blöcke einer Vorlagenversion für Modelle (ID, Label, Typ, Wertebereich, Optionen); gemeinsame Quelle für Kurzbefehl und LLM. */
export function describeBlocksForPrompt(version: TemplateVersion): Record<string, unknown>[] {
  return [...version.blocks].sort(compareByOrder).map((b) => {
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
}

/** Prompt für das Modell im Kurzbefehl (Zeilenformat, FEAT-024); steht je Vorlage im Manifest. */
export function buildShortcutPrompt(templateName: string, version: TemplateVersion): string {
  return buildLinePrompt(templateName, version);
}

// ---------------------------------------------------------------------------------------------------------------
// Zeilenformat (FEAT-024)

type LineError = IntakeMapping['lineErrors'][number];
type Resolved =
  | { ok: true; raw: unknown }
  | { ok: false; message: string; candidates: string[]; partial?: string[]; pending?: { ids: string[]; option: string } };

const optionList = (b: Extract<BlockDef, { type: 'multiselect' }>): NamedOption[] =>
  b.config.options.map((o) => ({ id: o.id, label: o.label, names: optionNames(o) }));

function unknownOptionMessage(token: string, candidates: string[]): string {
  const q = candidates.map((c) => `„${c}“`);
  const ask = q.length === 0 ? '' : q.length === 1 ? ` Meintest du ${q[0]}?` : ` Meintest du ${q.slice(0, -1).join(', ')} oder ${q.at(-1)}?`;
  return `Option „${token}“ gibt es nicht.${ask}`;
}

const notANumber = (value: string): Resolved => ({ ok: false, message: `„${value}“ ist keine eindeutige Zahl.`, candidates: [] });

/** Ein gesprochener Wert → Rohwert für `convert` (Zahlwort, Options-IDs, Datum …) oder weicher Fehler mit Kandidaten. */
function resolveLineValue(b: BlockDef, value: string): Resolved {
  switch (b.type) {
    case 'slider': {
      const n = parseGermanNumber(value);
      return Number.isNaN(n) ? notANumber(value) : { ok: true, raw: n };
    }
    case 'checkbox':
      return { ok: true, raw: isYes(value) ? true : isNo(value) ? false : value };
    case 'multiselect': {
      const options = optionList(b);
      const r = resolveOptions(value, options);
      if (!r.unknown.length) return r.ids.length ? { ok: true, raw: r.ids } : { ok: false, message: `„${value}“ passt zu keiner Option.`, candidates: [] };
      const rest = options.filter((o) => !r.ids.includes(o.id));
      const per = r.unknown.map((t) => ({ t, c: similarOptions(t, rest) }));
      const single = per.length === 1 && per[0]!.c.length === 1 ? rest.find((o) => o.label === per[0]!.c[0]) : undefined;
      return {
        ok: false,
        message: per.map((p) => unknownOptionMessage(p.t, p.c)).join(' '),
        candidates: [...new Set(per.flatMap((p) => p.c))],
        partial: r.ids,
        ...(single ? { pending: { ids: r.ids, option: single.id } } : {}),
      };
    }
    case 'medication': {
      // Namen trennen; bekannte Presets erkennt `medicationItems`, Unbekanntes bleibt freier Name (oder Fehler ohne allowFree).
      const r = resolveOptions(value, b.config.presets.map((p) => ({ id: p.name, label: p.name, names: [p.name] })));
      return { ok: true, raw: [...r.ids, ...r.unknown] };
    }
    case 'date': {
      if (b.config.mode === 'duration') {
        const n = parseGermanNumber(value);
        return Number.isNaN(n) ? notANumber(value) : { ok: true, raw: n };
      }
      if (b.config.mode === 'date') {
        const d = parseGermanDate(value);
        return d ? { ok: true, raw: d } : { ok: false, message: `„${value}“ ist kein vollständiges Datum.`, candidates: [] };
      }
      return { ok: true, raw: value };
    }
    default:
      return { ok: true, raw: value };
  }
}

/** Feld zu einem Zeilen-Label: tolerant gleich, sonst eindeutig ähnlich (Tippfehler) oder eindeutiges ganzes Wort des Feldnamens. */
function findBlockByLabel(label: string, blocks: readonly BlockDef[]): BlockDef | undefined {
  const n = normalizeLabel(label);
  if (!n) return undefined;
  const exact = blocks.find((b) => normalizeLabel(b.label) === n);
  if (exact) return exact;
  const near = blocks.filter((b) => {
    const bl = normalizeLabel(b.label);
    return (bl.length >= 5 && levenshtein(n, bl) <= 2) || (n.length >= 4 && softNorm(b.label).split(' ').includes(softNorm(label)));
  });
  return near.length === 1 ? near[0] : undefined;
}

const LEADING_JUNK = /^[\s\-*•"„“'0-9.)]+/;
const TRAILING_QUOTES = /["“”']+\s*$/;

/** Wertet die Zeilen aus: letzte Zeile je Feld gewinnt; „ja“/„nein“ beantwortet einen einzelnen Vorschlag der Zeile davor. */
function mapLines(lines: string, version: TemplateVersion): { values: Record<string, unknown>; errors: LineError[]; dictation?: string; model?: string } {
  const blocks = [...version.blocks].sort(compareByOrder).filter((b) => b.type !== 'bodymap' && b.type !== 'exercise');
  const reserved = { dictation: normalizeLabel(RESERVED_LINES.dictation), model: normalizeLabel(RESERVED_LINES.model) };
  let dictation: string | undefined;
  let model: string | undefined;
  const perBlock = new Map<string, { key: string; values: string[] }>();
  for (const rawLine of lines.split(/\r?\n/)) {
    const idx = rawLine.indexOf(':');
    if (idx < 1) continue; // Zeilen ohne Doppelpunkt werden ignoriert
    const key = rawLine.slice(0, idx).replace(LEADING_JUNK, '').replace(TRAILING_QUOTES, '').trim();
    const value = rawLine.slice(idx + 1).trim().replace(/^["„“]+|["“”]+$/g, '').trim();
    const nk = normalizeLabel(key);
    if (nk === reserved.dictation) {
      dictation ??= value; // erste Zeile gilt: die schreibt der Kurzbefehl selbst
      continue;
    }
    if (nk === reserved.model) {
      model ??= value;
      continue;
    }
    if (!value) continue;
    const block = findBlockByLabel(key, blocks);
    if (!block) continue; // unbekannte Zeile: nur in den Rohdaten (meta.dictation.lines), nicht in den Notizen
    // Vom Modell abgeschriebene Feldbeschreibung (Gerätetest 2026-11-26) ist keine Angabe.
    if (normalizeLabel(value) === normalizeLabel(fieldHint(block, blocks))) continue;
    const entry = perBlock.get(block.id) ?? { key, values: [] };
    entry.values.push(value);
    perBlock.set(block.id, entry);
  }
  const values: Record<string, unknown> = {};
  const errors: LineError[] = [];
  for (const b of blocks) {
    const entry = perBlock.get(b.id);
    if (!entry) continue;
    let state: Resolved | undefined;
    for (const v of entry.values) {
      const pending = state && !state.ok ? state.pending : undefined;
      if (pending && isYes(v)) state = { ok: true, raw: [...pending.ids, pending.option] };
      else if (pending && isNo(v)) state = pending.ids.length ? { ok: true, raw: pending.ids } : undefined;
      else state = resolveLineValue(b, v);
    }
    if (!state) continue;
    if (!state.ok) {
      errors.push({ blockId: b.id, key: entry.key, message: state.message, candidates: state.candidates });
      // Erkanntes behalten (Server ignoriert Unpassendes statt abzubrechen)
      const c = state.partial?.length ? convert(b, state.partial) : undefined;
      if (c?.ok) values[b.id] = c.value;
      continue;
    }
    const c = convert(b, state.raw);
    if (c.ok) values[b.id] = c.value;
    else errors.push({ blockId: b.id, key: entry.key, message: c.message, candidates: [] });
  }
  return { values, errors, ...(dictation !== undefined ? { dictation } : {}), ...(model !== undefined ? { model } : {}) };
}
