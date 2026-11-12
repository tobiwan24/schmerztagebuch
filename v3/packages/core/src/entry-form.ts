// Fachlogik des Eintragsformulars (Spec 05 „Einträge"): Ausgangswerte, Pflichtfelder, Zeitangabe, Dirty-Vergleich.
// Rein und ohne UI, damit sie im Formular und in Tests identisch gilt.
import { blockModules, type BlockModule } from './blocks/index.js';
import { canonical } from './canonical.js';
import { compareByOrder } from './fractional-index.js';
import type { BlockDef, EntryPeriod, TemplateVersion } from './templates.js';

const moduleOf = (def: BlockDef) => blockModules[def.type] as unknown as BlockModule<unknown, unknown>;

export const sortedBlocks = (version: TemplateVersion): BlockDef[] => [...version.blocks].sort(compareByOrder);

export type FormValues = Record<string, unknown>;

/** Leerwerte aller Blöcke (z. B. Body-Map mit vorausgewähltem Bild, BLK-03). `undefined` bleibt weg. */
export function initialValues(version: TemplateVersion): FormValues {
  const out: FormValues = {};
  for (const def of version.blocks) {
    const v = moduleOf(def).emptyValue(def.config);
    if (v !== undefined) out[def.id] = v;
  }
  return out;
}

/** Anzeigetext eines Werts (Detailansicht); leer → ''. */
export function displayValue(def: BlockDef, value: unknown): string {
  const m = moduleOf(def);
  return value === undefined || m.isEmpty(value) ? '' : m.toDisplay(value, def.config);
}

export function isValueEmpty(def: BlockDef, value: unknown): boolean {
  return moduleOf(def).isEmpty(value);
}

/** IDs der Pflichtblöcke ohne Wert (BLK-07). */
export function missingRequired(version: TemplateVersion, values: FormValues): string[] {
  return sortedBlocks(version)
    .filter((def) => def.required && isValueEmpty(def, values[def.id]))
    .map((def) => def.id);
}

/** Nur nicht-leere Werte werden gespeichert (leere Felder zählen nicht in Analysen, Spec 06). */
export function valuesToSave(version: TemplateVersion, values: FormValues): FormValues {
  const out: FormValues = {};
  for (const def of version.blocks) {
    const v = values[def.id];
    if (v !== undefined && !isValueEmpty(def, v)) out[def.id] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Zeitangabe (Spec 05, A-010): Zeitpunkt (Nachtragen) oder Zeitraum mit/ohne Uhrzeit. Eingaben in Ortszeit des Geräts.

/** `YYYY-MM-DDTHH:mm` bzw. `YYYY-MM-DD` wie von `<input type="datetime-local">`/`<input type="date">`. */
export type TimeInput =
  | { mode: 'point'; at: string }
  | { mode: 'period'; start: string; end: string; withTime: false }
  | { mode: 'period'; start: string; end: string; withTime: true };

export type TimeError = 'missing' | 'end-before-start';

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toLocalInput = (iso: string): string => {
  const d = new Date(iso);
  return `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** Lokale Eingabe (`YYYY-MM-DD[THH:mm]`) → ISO-Zeitpunkt (UTC). */
const fromLocal = (s: string): string => new Date(s.length === 10 ? `${s}T00:00` : s).toISOString();

export function nowTimeInput(nowMs: number): TimeInput {
  return { mode: 'point', at: toLocalInput(new Date(nowMs).toISOString()) };
}

/** Zeitangabe eines vorhandenen Eintrags fürs Formular. */
export function timeInputFrom(entry: { occurredAt: string; period?: EntryPeriod }): TimeInput {
  const p = entry.period;
  if (!p) return { mode: 'point', at: toLocalInput(entry.occurredAt) };
  if (p.start.length === 10) return { mode: 'period', start: p.start, end: p.end, withTime: false };
  return { mode: 'period', start: toLocalInput(p.start), end: toLocalInput(p.end), withTime: true };
}

export function validateTime(t: TimeInput): TimeError | null {
  if (t.mode === 'point') return t.at ? null : 'missing';
  if (!t.start || !t.end) return 'missing';
  return Date.parse(fromLocal(t.end)) < Date.parse(fromLocal(t.start)) ? 'end-before-start' : null;
}

/** Zeitangabe → `occurredAt` (+ `period`). Bei Zeitraum ist `occurredAt` der Beginn. */
export function timeToEntry(t: TimeInput): { occurredAt: string; period?: EntryPeriod } {
  if (validateTime(t)) throw new RangeError('Ungültige Zeitangabe');
  if (t.mode === 'point') return { occurredAt: fromLocal(t.at) };
  if (!t.withTime) return { occurredAt: fromLocal(t.start), period: { start: t.start, end: t.end } };
  return { occurredAt: fromLocal(t.start), period: { start: fromLocal(t.start), end: fromLocal(t.end) } };
}

// ---------------------------------------------------------------------------------------------------------------
// Dirty-Vergleich (BLK-09, Lehre aus v2 ISS-029): Vergleich des Formularzustands mit dem Ausgangszustand.

export interface FormSnapshot {
  templateId: string;
  values: FormValues;
  time: TimeInput;
  tags: readonly string[];
}

export function isDirty(initial: FormSnapshot, current: FormSnapshot): boolean {
  return canonical(initial) !== canonical(current);
}
