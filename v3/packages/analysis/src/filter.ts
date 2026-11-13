// Filter (Spec 06 „Filter"): `FilterSpec` als zod-Schema und reine Filter-Engine über dem Arbeitsset.
// Semantik (A-025): Bedingungen sind UND-verknüpft, `anyOf` ist eine Ebene ODER-Gruppen. Eine Bedingung bezieht sich auf
// einen Block (`blockId`) oder auf alle Blöcke einer Rolle (`role`, vorlagenübergreifend). Fehlt ein Feld im Eintrag, gilt
// es als leer: `number`/`text`/`bodymap` treffen dann nicht, `option` mit `none` und `checkbox: false` treffen.
import { z } from 'zod';
import { roleSchema } from '@stb/core';
import { dayIn, WEATHER_FIELD_NAMES, type WorkingSet, type WsEntry, type WsField } from './working-set.js';

const isoDate = z.iso.date();
const withTarget = <T extends z.ZodRawShape>(shape: T) =>
  z.union([z.strictObject({ ...shape, blockId: z.string().min(1) }), z.strictObject({ ...shape, role: roleSchema })]);

export const conditionSchema = z.union([
  withTarget({ kind: z.literal('number'), op: z.enum(['<', '<=', '=', '>=', '>']), value: z.number().finite() }),
  z.strictObject({ kind: z.literal('number'), weatherField: z.enum(WEATHER_FIELD_NAMES as [string, ...string[]]), op: z.enum(['<', '<=', '=', '>=', '>']), value: z.number().finite() }),
  withTarget({ kind: z.literal('option'), optionIds: z.array(z.string().min(1)).min(1), mode: z.enum(['any', 'all', 'none']) }),
  withTarget({ kind: z.literal('checkbox'), checked: z.boolean() }),
  withTarget({ kind: z.literal('text'), contains: z.string().min(1) }),
  withTarget({ kind: z.literal('bodymap'), region: z.string().min(1).optional() }),
  z.strictObject({ kind: z.literal('event'), category: z.enum(['event', 'doctor']).optional() }),
  z.strictObject({ kind: z.literal('meta'), field: z.enum(['source', 'author']), value: z.string().min(1) }),
  z.strictObject({ kind: z.literal('meta'), field: z.literal('hasAttachment'), value: z.boolean() }),
]);
export type Condition = z.infer<typeof conditionSchema>;

export const RANGE_PRESETS = ['7d', '30d', '90d', '1y', 'all'] as const;

export const filterSpecSchema = z.strictObject({
  diaryIds: z.array(z.string().min(1)),
  templateIds: z.array(z.string().min(1)).optional(),
  range: z.union([
    z.strictObject({ preset: z.enum(RANGE_PRESETS) }),
    z.strictObject({ from: isoDate, to: isoDate }).refine((r) => r.from <= r.to, { message: 'Ende vor Beginn', path: ['to'] }),
  ]),
  text: z.string().trim().min(1).optional(),
  tags: z.strictObject({ mode: z.enum(['any', 'all']), values: z.array(z.string().min(1)).min(1) }).optional(),
  conditions: z.array(conditionSchema).optional(),
  anyOf: z.array(z.array(conditionSchema).min(1)).optional(),
});
export type FilterSpec = z.infer<typeof filterSpecSchema>;

/** Umlaut- und groß/klein-tolerante Normalform (Spec 06): `ä`≙`ae`, danach NFKD ohne Diakritika. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
}

const PRESET_DAYS: Record<Exclude<(typeof RANGE_PRESETS)[number], 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

/** Tag `YYYY-MM-DD` minus n Kalendertage (UTC-Arithmetik auf dem Datum, unabhängig von der Uhrzeit). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function inRange(e: WsEntry, spec: FilterSpec, nowMs: number, ws: WorkingSet): boolean {
  const r = spec.range;
  if ('from' in r) return e.day >= r.from && e.day <= r.to;
  if (r.preset === 'all') return true;
  // „Letzte N Tage" inkl. heute, „heute" in der Zeitzone des Tagebuchs des Eintrags
  const today = dayIn(nowMs, ws.timezones.get(e.diaryId) ?? 'UTC');
  return e.day >= addDays(today, -(PRESET_DAYS[r.preset] - 1)) && e.day <= today;
}

function fieldsFor(e: WsEntry, c: { blockId: string } | { role: string }): WsField[] {
  return 'blockId' in c ? e.fields.filter((f) => f.blockId === c.blockId) : e.fields.filter((f) => f.role === c.role);
}

const compare = (a: number, op: '<' | '<=' | '=' | '>=' | '>', b: number) =>
  op === '<' ? a < b : op === '<=' ? a <= b : op === '=' ? a === b : op === '>=' ? a >= b : a > b;

export function matchesCondition(e: WsEntry, c: Condition): boolean {
  switch (c.kind) {
    case 'number': {
      if ('weatherField' in c) {
        const v = e.weather[c.weatherField];
        return v !== undefined && compare(v, c.op, c.value);
      }
      return fieldsFor(e, c).some((f) => f.value.kind === 'numeric' && compare(f.value.value, c.op, c.value));
    }
    case 'option': {
      const selected = new Set(fieldsFor(e, c).flatMap((f) => (f.value.kind === 'options' ? f.value.optionIds : [])));
      if (c.mode === 'any') return c.optionIds.some((id) => selected.has(id));
      if (c.mode === 'all') return c.optionIds.every((id) => selected.has(id));
      return !c.optionIds.some((id) => selected.has(id));
    }
    case 'checkbox': {
      const checked = fieldsFor(e, c).some((f) => f.value.kind === 'event' && f.value.occurred);
      return checked === c.checked;
    }
    case 'text': {
      const needle = normalizeText(c.contains);
      return fieldsFor(e, c).some((f) => {
        const t = f.value.kind === 'text' ? f.value.text : f.value.kind === 'textEvents' ? (f.value.text ?? '') : '';
        return normalizeText(t).includes(needle);
      });
    }
    case 'bodymap':
      // Regionen werden aus den Preset-Definitionen abgeleitet, sobald diese existieren; bis dahin = Preset-ID (A-025).
      return fieldsFor(e, c).some((f) => f.value.kind === 'points' && f.value.points.length > 0 && (!c.region || f.value.presetId === c.region));
    case 'event':
      return e.fields.some((f) => f.value.kind === 'textEvents' && f.value.events.some((ev) => !c.category || ev.category === c.category));
    case 'meta':
      if (c.field === 'hasAttachment') return e.hasAttachment === c.value;
      return c.field === 'source' ? e.source === c.value : e.authorId === c.value;
  }
}

export interface FilterOptions {
  now: number;
  /** Volltextsuche (Spec 06: MiniSearch); Pflicht, wenn `spec.text` gesetzt ist. */
  search?: (text: string) => ReadonlySet<string>;
}

/** Wendet einen Filter an. Ergebnis in Arbeitsset-Reihenfolge (neueste zuerst). */
export function applyFilter(ws: WorkingSet, spec: FilterSpec, opts: FilterOptions): WsEntry[] {
  const s = filterSpecSchema.parse(spec);
  const diaries = new Set(s.diaryIds);
  const templates = s.templateIds ? new Set(s.templateIds) : null;
  let textHits: ReadonlySet<string> | null = null;
  if (s.text) {
    if (!opts.search) throw new Error('Volltextfilter ohne Suchindex');
    textHits = opts.search(s.text);
  }
  return ws.entries.filter((e) => {
    if (!diaries.has(e.diaryId)) return false;
    if (templates && !templates.has(e.templateId)) return false;
    if (!inRange(e, s, opts.now, ws)) return false;
    if (textHits && !textHits.has(e.id)) return false;
    if (s.tags) {
      const has = (t: string) => e.tags.includes(t);
      if (s.tags.mode === 'any' ? !s.tags.values.some(has) : !s.tags.values.every(has)) return false;
    }
    if (s.conditions && !s.conditions.every((c) => matchesCondition(e, c))) return false;
    if (s.anyOf && s.anyOf.length > 0 && !s.anyOf.some((g) => g.every((c) => matchesCondition(e, c)))) return false;
    return true;
  });
}

/**
 * Gespeicherter Filter (Spec 02 `SavedFilter`, Spec 06): synchronisiert, pro Tagebuch geteilt. `hlc`/`updatedAt` für die
 * Konfliktauflösung „ganzer Datensatz per HLC" (Spec 04, A-027).
 */
export const savedFilterSchema = z.strictObject({
  id: z.string().min(1),
  diaryId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  filter: filterSpecSchema,
  hlc: z.string().min(1),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type SavedFilter = z.infer<typeof savedFilterSchema>;

