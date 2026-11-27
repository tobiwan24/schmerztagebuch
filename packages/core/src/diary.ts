// Tagebuch (Spec 02 „Entitäten"): Name, Art, Einstellungen für Wetter, Schnelleintrag und Zeitzone.
import { z } from 'zod';
import type { Clock } from './env.js';
import { idSchema, isoDateTime } from './blocks/index.js';

export const DIARY_SUBJECTS = ['human', 'animal', 'other'] as const;
/** RDM-034: `library` = verstecktes Tagebuch für den persönlichen Vorlagenkatalog (nie geteilt, nicht im Umschalter). */
export const DIARY_PURPOSES = ['diary', 'library'] as const;
export type DiaryPurpose = (typeof DIARY_PURPOSES)[number];
export const SHORTCUT_ASK = ['required', 'all'] as const;
export type ShortcutAsk = (typeof SHORTCUT_ASK)[number];

export const diarySettingsSchema = z.strictObject({
  weather: z.strictObject({
    enabled: z.boolean(),
    location: z.strictObject({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), label: z.string() }).optional(),
    gpsDefault: z.boolean(),
  }),
  quickEntryTemplateId: idSchema.optional(),
  quickEntryBlockIds: z.array(idSchema).optional(),
  /** RDM-028 P2: Vorlagen, für die die Start-Seite einen eigenen Schnell-Knopf zeigt (Reihenfolge der Vorlagenliste). */
  quickTemplateIds: z.array(idSchema).optional(),
  /** FEAT-024: Was der Kurzbefehl nachfragt — nur Pflichtfelder oder alle leeren Felder (fehlt = alle). Reist im Manifest mit. */
  shortcutAsk: z.enum(SHORTCUT_ASK).optional(),
  timezone: z.string().min(1),
});
export type DiarySettings = z.infer<typeof diarySettingsSchema>;

export const diarySchema = z.strictObject({
  id: idSchema,
  name: z.string().trim().min(1),
  subject: z.enum(DIARY_SUBJECTS),
  icon: z.string().optional(),
  color: z.string().optional(),
  createdAt: isoDateTime,
  settings: diarySettingsSchema,
  /** Ab M14 (DM-14): Stempel für die Konfliktauflösung per HLC; ältere Tagebücher haben sie nicht. */
  updatedAt: isoDateTime.optional(),
  hlc: z.string().min(1).optional(),
  /** Fehlt = `diary` (RDM-034, DM-20). */
  purpose: z.enum(DIARY_PURPOSES).optional(),
});
export type Diary = z.infer<typeof diarySchema>;

/** Bibliothek = persönlicher Vorlagenkatalog (RDM-034). */
export const isLibraryDiary = (d: Pick<Diary, 'purpose'>): boolean => d.purpose === 'library';
export type DiarySubject = Diary['subject'];

/** Neues Tagebuch mit Standard-Einstellungen: Wetter aus, bis ein fester Ort gesetzt ist (Spec 05), GPS aus. Mit `location`: Ort gerundet, Wetter an. */
export function createDiary(input: { id: string; name: string; subject: DiarySubject; timezone: string; location?: { lat: number; lon: number; label: string }; purpose?: DiaryPurpose }, clock: Clock): Diary {
  return diarySchema.parse({
    id: input.id,
    name: input.name,
    subject: input.subject,
    ...(input.purpose === 'library' ? { purpose: 'library' } : {}),
    createdAt: new Date(clock.now()).toISOString(),
    settings: {
      weather: input.location
        ? { enabled: true, gpsDefault: false, location: { lat: roundCoordinate(input.location.lat), lon: roundCoordinate(input.location.lon), label: input.location.label } }
        : { enabled: false, gpsDefault: false },
      timezone: input.timezone,
    },
  });
}

export interface DiarySettingsPatch {
  name?: string;
  timezone?: string;
  weather?: {
    enabled?: boolean;
    gpsDefault?: boolean;
    /** `null` entfernt den festen Ort. */
    location?: { lat: number; lon: number; label: string } | null;
  };
  /** `null` = Standardregel (Spec 05 „Schnelleintrag"). */
  quickEntryTemplateId?: string | null;
  quickEntryBlockIds?: string[] | null;
  /** `null` oder leeres Array löscht das Feld; Duplikate entfallen. */
  quickTemplateIds?: string[] | null;
  /** `null` = Standard (alle leeren Felder nachfragen). */
  shortcutAsk?: ShortcutAsk | null;
}

/** Orte werden nur auf 1 Dezimalstelle (≈ 10 km) gespeichert (Spec 05 „Wetter als Metadaten"). */
export const roundCoordinate = (n: number): number => Math.round(n * 10) / 10;

/**
 * Ändert Name, Zeitzone, Wetter und Schnelleintrag eines Tagebuchs und stempelt es mit `updatedAt`/`hlc` (DM-14).
 * Mit `templates` wird geprüft, dass die Schnelleintrag-Vorlage existiert und die Blöcke zu ihr gehören.
 */
export function updateDiarySettings(
  diary: Diary,
  patch: DiarySettingsPatch,
  stamp: { hlc: string; updatedAt: string },
  options: { templates?: readonly { id: string; blockIds: readonly string[] }[] } = {},
): Diary {
  const { weather: w, quickEntryTemplateId, quickEntryBlockIds, quickTemplateIds } = patch;
  const settings: Record<string, unknown> = { ...diary.settings };
  if (patch.timezone !== undefined) settings.timezone = patch.timezone;
  if (w) {
    const weather: Record<string, unknown> = { ...diary.settings.weather };
    if (w.enabled !== undefined) weather.enabled = w.enabled;
    if (w.gpsDefault !== undefined) weather.gpsDefault = w.gpsDefault;
    if (w.location === null) delete weather.location;
    else if (w.location) weather.location = { lat: roundCoordinate(w.location.lat), lon: roundCoordinate(w.location.lon), label: w.location.label };
    settings.weather = weather;
  }
  if (quickEntryTemplateId === null) delete settings.quickEntryTemplateId;
  else if (quickEntryTemplateId !== undefined) settings.quickEntryTemplateId = quickEntryTemplateId;
  if (quickEntryBlockIds === null) delete settings.quickEntryBlockIds;
  else if (quickEntryBlockIds !== undefined) settings.quickEntryBlockIds = quickEntryBlockIds;
  if (quickTemplateIds === null || quickTemplateIds?.length === 0) delete settings.quickTemplateIds;
  else if (quickTemplateIds !== undefined) settings.quickTemplateIds = [...new Set(quickTemplateIds)];
  if (patch.shortcutAsk === null) delete settings.shortcutAsk;
  else if (patch.shortcutAsk !== undefined) settings.shortcutAsk = patch.shortcutAsk;

  const templateId = settings.quickEntryTemplateId as string | undefined;
  const blockIds = settings.quickEntryBlockIds as string[] | undefined;
  if (blockIds?.length && !templateId) throw new RangeError('Schnelleintrag-Blöcke brauchen eine Vorlage');
  if (options.templates && templateId) {
    const t = options.templates.find((x) => x.id === templateId);
    if (!t) throw new RangeError('Schnelleintrag-Vorlage existiert nicht');
    const known = new Set(t.blockIds);
    if (blockIds?.some((id) => !known.has(id))) throw new RangeError('Schnelleintrag-Block gehört nicht zur Vorlage');
  }
  const quickIds = settings.quickTemplateIds as string[] | undefined;
  if (options.templates && quickIds?.some((id) => !options.templates!.some((x) => x.id === id))) throw new RangeError('Schnell-Knopf-Vorlage existiert nicht');
  return diarySchema.parse({ ...diary, ...(patch.name === undefined ? {} : { name: patch.name }), settings, updatedAt: stamp.updatedAt, hlc: stamp.hlc });
}
