// JSON v1 (`.stb.json`, Spec 07): selbstbeschreibend, vollständig, re-importierbar. Für einen verlustfreien Rundweg (EXP-02)
// werden die vollständigen Datensätze exportiert (A-028): Tagebuch inkl. Einstellungen, Vorlagen mit allen Versionen und
// vollständigen Block-Definitionen (Einheit, Skala, Optionen stehen in `config`), Einträge, gespeicherte Filter und
// eigene Body-Map-Bilder sowie Anhänge (Metadaten + Inhalt als Data-URL, A-032). Das Glossar erklärt jedes Feld auf Deutsch (auch für KI-Werkzeuge).
import { z } from 'zod';
import {
  attachmentMetaSchema, bodymapImageSchema, diarySchema, entrySchema, templateSchema, templateVersionSchema,
  type AttachmentMeta, type BodymapImage, type Diary, type Entry, type Template, type TemplateVersion,
} from '@stb/core';
import { applyFilter, buildWorkingSet, filterSpecSchema, savedFilterSchema, type FilterSpec, type SavedFilter } from '@stb/analysis';

export const EXPORT_FORMAT = 'stb-export';
export const EXPORT_FORMAT_VERSION = 1;

const exportTemplate = templateSchema.extend({ versions: z.array(templateVersionSchema.omit({ templateId: true })).min(1) });

export const exportDiarySchema = z.strictObject({
  diary: diarySchema,
  templates: z.array(exportTemplate),
  entries: z.array(entrySchema),
  savedFilters: z.array(savedFilterSchema),
  bodymapImages: z.array(bodymapImageSchema),
  /** Fehlt in Dateien vor A-032 → leer. */
  attachments: z.array(attachmentMetaSchema.extend({ dataUrl: z.string().regex(/^data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]*=*$/i) })).default([]),
});

/** Anhang im Export: Metadaten + Inhalt. */
export type ExportAttachment = AttachmentMeta & { dataUrl: string };

export const exportV1Schema = z.strictObject({
  format: z.literal(EXPORT_FORMAT),
  formatVersion: z.literal(EXPORT_FORMAT_VERSION),
  exportedAt: z.iso.datetime({ offset: true }),
  appVersion: z.string().min(1),
  filter: filterSpecSchema.optional(),
  diaries: z.array(exportDiarySchema),
  glossary: z.strictObject({
    blockTypes: z.record(z.string(), z.string()),
    roles: z.record(z.string(), z.string()),
    weatherFields: z.record(z.string(), z.string()),
  }),
});
export type ExportV1 = z.infer<typeof exportV1Schema>;
export type ExportDiary = z.infer<typeof exportDiarySchema>;

/** Veröffentlichtes JSON Schema (aus zod generiert, Spec 07). Liegt zusätzlich als Datei unter `schema/`. */
export function exportJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(exportV1Schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
}

export const GLOSSARY: ExportV1['glossary'] = {
  blockTypes: {
    slider: 'Zahlenwert auf einer Skala (min–max, Schrittweite, optional Einheit)',
    checkbox: 'Ja/Nein, optional mit Notiz',
    multiselect: 'Auswahl aus Optionen; Werte sind Options-IDs (Labels in der Vorlagenversion)',
    text: 'Kurzer Text',
    textarea: 'Freitext mit optionalen Ereignissen (Arzttermin/Ereignis) und Anhängen',
    date: 'Zeitpunkt, Zeitraum oder Dauer innerhalb eines Eintrags',
    bodymap: 'Körperkarte: Bild (Standard- oder eigenes Bild) und Markierungen mit normalisierten Koordinaten 0..1',
    medication: 'Medikamente: Liste von Positionen mit Name, optional Dosis (Zahl), Einheit, Uhrzeit (ISO) und Wirkung 0..10',
    exercise: 'Übung (Training): erledigt ja/nein, optional Sätze, Wiederholungen, Dauer in Sekunden, Stufe und Schmerz während der Übung 0..10',
  },
  roles: {
    outcome: 'Ergebniswert, z. B. Schmerzstärke', symptom: 'Begleitsymptom', medication: 'Medikament', trigger: 'Möglicher Auslöser (beschreibend)',
    activity: 'Aktivität', sleep: 'Schlaf', mood: 'Stimmung', function: 'Funktionsfähigkeit', note: 'Notiz',
  },
  weatherFields: {
    temperatureC: 'Lufttemperatur in °C', apparentTemperatureC: 'Gefühlte Temperatur in °C', pressureHpa: 'Luftdruck in hPa',
    pressureDelta24hHpa: 'Luftdruckänderung der letzten 24 h in hPa', humidityPct: 'Relative Luftfeuchte in %',
    precipitationMm: 'Niederschlag in mm', cloudCoverPct: 'Bewölkung in %', windKmh: 'Wind in km/h',
  },
};

export interface ExportSource {
  diaries: Diary[];
  templates: Template[];
  versions: TemplateVersion[];
  entries: Entry[];
  savedFilters: SavedFilter[];
  bodymapImages: BodymapImage[];
  /** Anhänge mit Inhalt (A-032); fehlt bei Quellen ohne Anhänge. */
  attachments?: ExportAttachment[];
}

/** Baut den JSON-v1-Export. Mit `filter` enthält er genau die Einträge des Filters und den Filter selbst (EXP-07). */
export function buildExport(src: ExportSource, opts: { appVersion: string; now: number; filter?: FilterSpec }): ExportV1 {
  let entries = src.entries;
  let diaries = src.diaries;
  if (opts.filter) {
    const ws = buildWorkingSet({ entries: src.entries, templates: src.templates, versions: src.versions, diaries: src.diaries });
    const ids = new Set(applyFilter(ws, opts.filter, { now: opts.now }).map((e) => e.id));
    entries = src.entries.filter((e) => ids.has(e.id));
    diaries = src.diaries.filter((d) => opts.filter!.diaryIds.includes(d.id));
  }
  const byOrder = (a: { order: string; id: string }, b: { order: string; id: string }) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : 1);
  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date(opts.now).toISOString(),
    appVersion: opts.appVersion,
    ...(opts.filter ? { filter: opts.filter } : {}),
    diaries: diaries.map((diary) => ({
      diary,
      templates: src.templates
        .filter((t) => t.diaryId === diary.id)
        .sort(byOrder)
        .map((t) => ({
          ...t,
          versions: src.versions
            .filter((v) => v.templateId === t.id)
            .sort((a, b) => a.version - b.version)
            .map((v) => ({ version: v.version, blocks: v.blocks, createdAt: v.createdAt })),
        })),
      entries: entries.filter((e) => e.diaryId === diary.id).sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0)),
      savedFilters: src.savedFilters.filter((f) => f.diaryId === diary.id),
      bodymapImages: src.bodymapImages.filter((i) => i.diaryId === diary.id),
      attachments: (src.attachments ?? []).filter((a) => a.diaryId === diary.id && entries.some((e) => e.id === a.entryId)),
    })),
    glossary: GLOSSARY,
  };
}

export type ImportErrorCode = 'not-json' | 'wrong-format' | 'newer-version' | 'invalid' | 'inconsistent';

export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode, readonly details: string[] = []) {
    super(code);
    this.name = 'ImportError';
  }
}

/** Prüft eine Importdatei vollständig (Schema + Referenzen). Wirft `ImportError` mit verständlichem Code (EXP-11). */
export function parseExport(text: string): ExportV1 {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError('not-json');
  }
  const head = raw as { format?: unknown; formatVersion?: unknown } | null;
  if (!head || typeof head !== 'object' || head.format !== EXPORT_FORMAT) throw new ImportError('wrong-format');
  if (typeof head.formatVersion === 'number' && head.formatVersion > EXPORT_FORMAT_VERSION) throw new ImportError('newer-version');
  const r = exportV1Schema.safeParse(raw);
  if (!r.success) throw new ImportError('invalid', r.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`));
  const problems = checkReferences(r.data);
  if (problems.length) throw new ImportError('inconsistent', problems.slice(0, 5));
  return r.data;
}

/** Referenzen innerhalb des Exports: Einträge → vorhandene Vorlagenversion, Vorlagen/Einträge → ihr Tagebuch. */
function checkReferences(doc: ExportV1): string[] {
  const out: string[] = [];
  for (const d of doc.diaries) {
    const versions = new Set(d.templates.flatMap((t) => t.versions.map((v) => `${t.id}#${v.version}`)));
    for (const t of d.templates) {
      if (t.diaryId !== d.diary.id) out.push(`Vorlage ${t.id}: gehört nicht zu Tagebuch ${d.diary.id}`);
      if (!t.versions.some((v) => v.version === t.currentVersion)) out.push(`Vorlage ${t.id}: aktuelle Version ${t.currentVersion} fehlt`);
    }
    for (const e of d.entries) {
      if (e.diaryId !== d.diary.id) out.push(`Eintrag ${e.id}: gehört nicht zu Tagebuch ${d.diary.id}`);
      if (!versions.has(`${e.templateId}#${e.templateVersion}`)) out.push(`Eintrag ${e.id}: Vorlagenversion fehlt`);
    }
    const entryIds = new Set(d.entries.map((e) => e.id));
    for (const a of d.attachments) {
      if (a.diaryId !== d.diary.id || !entryIds.has(a.entryId)) out.push(`Anhang ${a.id}: Eintrag fehlt`);
    }
  }
  return out;
}

/** Zurück zu Datensätzen (Import): Vorlagenversionen bekommen ihre `templateId` wieder. */
export function exportRecords(d: ExportDiary): { diary: Diary; templates: Template[]; versions: TemplateVersion[]; entries: Entry[]; savedFilters: SavedFilter[]; bodymapImages: BodymapImage[]; attachments: ExportAttachment[] } {
  return {
    diary: d.diary,
    templates: d.templates.map((t) => templateSchema.parse(Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'versions')))),
    versions: d.templates.flatMap((t) => t.versions.map((v) => ({ ...v, templateId: t.id }))),
    entries: d.entries,
    savedFilters: d.savedFilters,
    bodymapImages: d.bodymapImages,
    attachments: d.attachments,
  };
}
