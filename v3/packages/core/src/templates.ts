// Vorlagen, Vorlagenversionen und Einträge (Spec 02 „Entitäten" / „Versionierung von Vorlagen").
import { z } from 'zod';
import type { Clock } from './env.js';
import { isValidOrderKey } from './fractional-index.js';
import { blockModules, idSchema, isoDateTime, parseBlockValue, type BlockType } from './blocks/index.js';

export const ROLES = ['outcome', 'symptom', 'medication', 'trigger', 'activity', 'sleep', 'mood', 'function', 'note'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const orderKeySchema = z.string().refine(isValidOrderKey, { message: 'Ungültiger Order-Key' });

const blockDefBase = z.strictObject({
  id: idSchema,
  label: z.string().trim().min(1),
  description: z.string().optional(),
  required: z.boolean(),
  role: roleSchema.optional(),
  order: orderKeySchema,
});

const defFor = <K extends BlockType>(type: K) =>
  blockDefBase.extend({ type: z.literal(type), config: blockModules[type].config });

export const blockDefSchema = z.discriminatedUnion('type', [
  defFor('slider'),
  defFor('checkbox'),
  defFor('multiselect'),
  defFor('text'),
  defFor('textarea'),
  defFor('date'),
  defFor('bodymap'),
]);
export type BlockDef = z.infer<typeof blockDefSchema>;

const blockList = z
  .array(blockDefSchema)
  .refine((bs) => new Set(bs.map((b) => b.id)).size === bs.length, { message: 'Block-IDs müssen eindeutig sein' });

export const templateSchema = z.strictObject({
  id: idSchema,
  diaryId: idSchema,
  name: z.string().trim().min(1),
  icon: z.string().optional(),
  color: z.string().optional(),
  order: orderKeySchema,
  currentVersion: z.number().int().min(1),
  archived: z.boolean(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Template = z.infer<typeof templateSchema>;

/** Unveränderlich; jede Strukturänderung erzeugt eine neue Version. */
export const templateVersionSchema = z.strictObject({
  templateId: idSchema,
  version: z.number().int().min(1),
  blocks: blockList,
  createdAt: isoDateTime,
});
export type TemplateVersion = z.infer<typeof templateVersionSchema>;

export interface TemplateState {
  template: Template;
  version: TemplateVersion;
}

export type TemplateErrorCode = 'BLOCK_TYPE_CHANGE';

export class TemplateError extends Error {
  constructor(
    readonly code: TemplateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TemplateError';
  }
}

const isoNow = (clock: Clock): string => new Date(clock.now()).toISOString();

export interface NewTemplate {
  id: string;
  diaryId: string;
  name: string;
  icon?: string;
  color?: string;
  order: string;
  blocks: BlockDef[];
}

export function createTemplate(input: NewTemplate, clock: Clock): TemplateState {
  const now = isoNow(clock);
  const { blocks, ...meta } = input;
  const template = templateSchema.parse({ ...meta, currentVersion: 1, archived: false, createdAt: now, updatedAt: now });
  const version = templateVersionSchema.parse({ templateId: template.id, version: 1, blocks, createdAt: now });
  return { template, version };
}

export interface TemplatePatch {
  name?: string;
  icon?: string;
  color?: string;
  order?: string;
  archived?: boolean;
  blocks?: BlockDef[];
}

/** JSON mit sortierten Schlüsseln, ohne `undefined` — Grundlage des Strukturvergleichs. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const blocksKey = (blocks: readonly BlockDef[]): string =>
  canonical([...blocks].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));

/**
 * Wendet eine Änderung an. Name/Icon/Farbe/Order/Archiv ändern nur `Template`; jede Änderung an den Blöcken
 * (hinzufügen, entfernen, Label, Konfiguration, Rolle, Reihenfolge, …) erzeugt `TemplateVersion n+1`.
 * Typwechsel eines Blocks — gegenüber der aktuellen oder einer früheren Version (`history`) — wird abgelehnt (DM-07).
 */
export function updateTemplate(
  state: TemplateState,
  patch: TemplatePatch,
  clock: Clock,
  history: readonly TemplateVersion[] = [],
): { state: TemplateState; newVersion: boolean } {
  const now = isoNow(clock);
  const { blocks, ...meta } = patch;
  let version = state.version;
  let newVersion = false;

  if (blocks !== undefined) {
    const parsed = blockList.parse(blocks);
    const knownTypes = new Map<string, BlockType>();
    for (const v of [...history, state.version]) for (const b of v.blocks) knownTypes.set(b.id, b.type);
    for (const b of parsed) {
      const before = knownTypes.get(b.id);
      if (before !== undefined && before !== b.type) {
        throw new TemplateError('BLOCK_TYPE_CHANGE', `Block ${b.id}: Typwechsel ${before} → ${b.type} ist nicht erlaubt`);
      }
    }
    if (blocksKey(parsed) !== blocksKey(state.version.blocks)) {
      newVersion = true;
      version = templateVersionSchema.parse({
        templateId: state.template.id,
        version: state.version.version + 1,
        blocks: parsed,
        createdAt: now,
      });
    }
  }

  const template = templateSchema.parse({ ...state.template, ...meta, currentVersion: version.version, updatedAt: now });
  return { state: { template, version }, newVersion };
}

// ---------------------------------------------------------------------------------------------------------------
// Einträge

export const weatherSchema = z.strictObject({
  provider: z.literal('open-meteo'),
  fetchedAt: isoDateTime,
  observedAt: isoDateTime,
  temperatureC: z.number(),
  apparentTemperatureC: z.number(),
  pressureHpa: z.number(),
  pressureDelta24hHpa: z.number(),
  humidityPct: z.number(),
  precipitationMm: z.number(),
  cloudCoverPct: z.number(),
  windKmh: z.number(),
  weatherCode: z.number().int(),
});
export type Weather = z.infer<typeof weatherSchema>;

export const ENTRY_SOURCES = ['app', 'quick', 'shortcut', 'import', 'migration-v2'] as const;

export const entryMetaSchema = z.strictObject({
  source: z.enum(ENTRY_SOURCES),
  timezone: z.string().min(1),
  weather: weatherSchema.optional(),
  weatherPending: z.boolean().optional(),
  location: z
    .strictObject({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), origin: z.enum(['diary', 'gps']) })
    .optional(),
});
export type EntryMeta = z.infer<typeof entryMetaSchema>;

const isoDate = z.iso.date();

/**
 * Optionaler Zeitraum eines Eintrags (Spec 05 „Zeitangabe", ersetzt den v2-Datum-Block): entweder ganztägig
 * (beide ISO-Datum) oder mit Uhrzeiten (beide ISO-Zeitpunkt); Ende nicht vor Beginn. `occurredAt` = Beginn.
 */
export const entryPeriodSchema = z
  .union([z.strictObject({ start: isoDate, end: isoDate }), z.strictObject({ start: isoDateTime, end: isoDateTime })])
  .refine((p) => (p.start.length === 10 ? p.start <= p.end : Date.parse(p.start) <= Date.parse(p.end)), {
    message: 'Ende liegt vor dem Beginn',
    path: ['end'],
  });
export type EntryPeriod = z.infer<typeof entryPeriodSchema>;

export const entrySchema = z.strictObject({
  id: idSchema,
  diaryId: idSchema,
  templateId: idSchema,
  templateVersion: z.number().int().min(1),
  /** Zeitpunkt des Geschehens; vom Nutzer änderbar (Nachtragen). Bei Zeitraum = Beginn. */
  occurredAt: isoDateTime,
  period: entryPeriodSchema.optional(),
  recordedAt: isoDateTime,
  updatedAt: isoDateTime,
  authorId: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
  tags: z.array(z.string()),
  meta: entryMetaSchema,
  hlc: z.string().min(1),
});
export type Entry = z.infer<typeof entrySchema>;

/**
 * Eintragsschema gegen eine konkrete Vorlagenversion: jede Block-ID in `values` muss in dieser Version existieren
 * und ihr Wert zum Blocktyp/zur Konfiguration passen (DM-03). Pflichtfelder prüft das Formular (BLK-07), nicht das
 * Schema — Schnelleinträge dürfen Felder offen lassen.
 */
export function entrySchemaFor(version: TemplateVersion) {
  const byId = new Map(version.blocks.map((b) => [b.id, b]));
  return entrySchema.superRefine((entry, ctx) => {
    if (entry.templateId !== version.templateId) {
      ctx.addIssue({ code: 'custom', path: ['templateId'], message: 'Eintrag gehört zu einer anderen Vorlage' });
    }
    if (entry.templateVersion !== version.version) {
      ctx.addIssue({ code: 'custom', path: ['templateVersion'], message: `Erwartet Version ${version.version}` });
    }
    for (const [blockId, raw] of Object.entries(entry.values)) {
      const def = byId.get(blockId);
      if (!def) {
        ctx.addIssue({ code: 'custom', path: ['values', blockId], message: 'Block-ID existiert in dieser Vorlagenversion nicht' });
        continue;
      }
      // TS kann type/config einer Union nicht korrelieren; blockDefSchema garantiert die Paarung.
      const r = parseBlockValue(def.type, def.config as never, raw);
      if (!r.success) {
        for (const issue of r.error.issues) {
          ctx.addIssue({ code: 'custom', path: ['values', blockId, ...issue.path.map(String)], message: issue.message });
        }
      }
    }
  });
}
