// Arbeitsset (Spec 06): Einträge mit aufgelösten Vorlagenversionen und Normalform je Wert (`toAnalysis`, Spec 05).
// Werte werden über die Block-ID der **Eintragsversion** gelesen — so bleiben Werte entfernter Blöcke auswertbar (DM-08).
import { analyzeBlockValue, displayValue, type AnalysisValue, type BlockDef, type Entry, type Role, type Template, type TemplateVersion } from '@stb/core';

export type AttachmentKind = 'image' | 'pdf';

export interface WsField {
  blockId: string;
  type: BlockDef['type'];
  role?: Role;
  /** Label der aktuellen Version (falls der Block dort noch existiert), sonst der Eintragsversion. */
  label: string;
  archived: boolean;
  value: AnalysisValue;
  display: string;
  /** Labels gewählter Optionen (Suche, Häufigkeiten). */
  optionLabels: string[];
}

/** Schlüssel eines Medikaments für Häufigkeiten, Filter und Medikamententage: der Name ohne Groß/Klein (Spec 06, „je Name"). */
export const medicationKey = (name: string): string => name.trim().toLowerCase();

export interface WsEntry {
  id: string;
  diaryId: string;
  templateId: string;
  templateName: string;
  occurredAt: string;
  /** Kalendertag `YYYY-MM-DD` in der Zeitzone des Tagebuchs (Spec 06 „Aggregation"). */
  day: string;
  tags: string[];
  source: Entry['meta']['source'];
  authorId: string;
  hasAttachment: boolean;
  /** Arten der Anhänge laut `attachmentMeta` (ohne Duplikate; leer, solange die Metadaten fehlen). */
  attachmentKinds: AttachmentKind[];
  fields: WsField[];
  weather: Record<string, number>;
}

export interface WorkingSet {
  entries: WsEntry[];
  byId: Map<string, WsEntry>;
  /** Zeitzone je Tagebuch (für Zeiträume relativ zu „heute"). */
  timezones: Map<string, string>;
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();
/** Kalendertag eines Zeitpunkts in einer Zeitzone (`en-CA` liefert ISO-Reihenfolge). */
export function dayIn(iso: string | number, timeZone: string): string {
  let f = dayFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    dayFormatters.set(timeZone, f);
  }
  return f.format(typeof iso === 'number' ? iso : new Date(iso));
}

const WEATHER_FIELDS = ['temperatureC', 'apparentTemperatureC', 'pressureHpa', 'pressureDelta24hHpa', 'humidityPct', 'precipitationMm', 'cloudCoverPct', 'windKmh'] as const;
export type WeatherField = (typeof WEATHER_FIELDS)[number];
export const WEATHER_FIELD_NAMES: readonly WeatherField[] = WEATHER_FIELDS;

export interface WorkingSetInput {
  entries: readonly Entry[];
  templates: readonly Template[];
  versions: readonly TemplateVersion[];
  diaries: readonly { id: string; settings: { timezone: string } }[];
  /** Anhang-Metadaten (`attachmentMeta`); bestimmen `attachmentKinds`. */
  attachments?: readonly { entryId: string; kind: AttachmentKind }[];
}

export function buildWorkingSet(input: WorkingSetInput): WorkingSet {
  const versionKey = (templateId: string, v: number) => `${templateId}#${v}`;
  const versions = new Map(input.versions.map((v) => [versionKey(v.templateId, v.version), v]));
  const templates = new Map(input.templates.map((t) => [t.id, t]));
  const timezones = new Map(input.diaries.map((d) => [d.id, d.settings.timezone]));
  const currentBlocks = new Map<string, Map<string, BlockDef>>();
  for (const t of input.templates) {
    const cur = versions.get(versionKey(t.id, t.currentVersion));
    if (cur) currentBlocks.set(t.id, new Map(cur.blocks.map((b) => [b.id, b])));
  }

  const kindsByEntry = new Map<string, Set<AttachmentKind>>();
  for (const a of input.attachments ?? []) kindsByEntry.set(a.entryId, (kindsByEntry.get(a.entryId) ?? new Set<AttachmentKind>()).add(a.kind));

  const entries: WsEntry[] = [];
  for (const e of input.entries) {
    const version = versions.get(versionKey(e.templateId, e.templateVersion));
    if (!version) continue; // Version fehlt (noch nicht synchronisiert) — nicht auswertbar, aber kein Absturz
    const current = currentBlocks.get(e.templateId);
    const fields: WsField[] = [];
    for (const def of version.blocks) {
      const raw = e.values[def.id];
      if (raw === undefined) continue;
      const value = analyzeBlockValue(def.type, def.config as never, raw as never);
      if (!value) continue; // leer → zählt nicht (Spec 06)
      const cur = current?.get(def.id);
      const labelDef = cur ?? def;
      const optionLabels =
        value.kind === 'options' && def.type === 'multiselect'
          ? value.optionIds.map((id) => def.config.options.find((o) => o.id === id)?.label).filter((l): l is string => !!l)
          : value.kind === 'medications'
            ? value.items.map((i) => i.name)
            : [];
      fields.push({
        blockId: def.id, type: def.type, label: labelDef.label, archived: !cur, value, display: displayValue(def, raw), optionLabels,
        ...((cur ?? def).role ? { role: (cur ?? def).role } : {}),
      });
    }
    const weather: Record<string, number> = {};
    for (const k of WEATHER_FIELDS) {
      const v = e.meta.weather?.[k];
      if (typeof v === 'number') weather[k] = v;
    }
    entries.push({
      id: e.id, diaryId: e.diaryId, templateId: e.templateId, templateName: templates.get(e.templateId)?.name ?? '', occurredAt: e.occurredAt,
      day: dayIn(e.occurredAt, timezones.get(e.diaryId) ?? e.meta.timezone), tags: e.tags, source: e.meta.source, authorId: e.authorId,
      hasAttachment: kindsByEntry.has(e.id) || fields.some((f) => f.value.kind === 'textEvents' && f.value.attachmentCount > 0),
      attachmentKinds: [...(kindsByEntry.get(e.id) ?? [])].sort(), fields, weather,
    });
  }
  entries.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));
  return { entries, byId: new Map(entries.map((e) => [e.id, e])), timezones };
}
