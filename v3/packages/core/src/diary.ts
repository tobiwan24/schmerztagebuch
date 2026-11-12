// Tagebuch (Spec 02 „Entitäten"): Name, Art, Einstellungen für Wetter, Schnelleintrag und Zeitzone.
import { z } from 'zod';
import type { Clock } from './env.js';
import { idSchema, isoDateTime } from './blocks/index.js';

export const DIARY_SUBJECTS = ['human', 'animal', 'other'] as const;

export const diarySettingsSchema = z.strictObject({
  weather: z.strictObject({
    enabled: z.boolean(),
    location: z.strictObject({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), label: z.string() }).optional(),
    gpsDefault: z.boolean(),
  }),
  quickEntryTemplateId: idSchema.optional(),
  quickEntryBlockIds: z.array(idSchema).optional(),
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
});
export type Diary = z.infer<typeof diarySchema>;
export type DiarySubject = Diary['subject'];

/** Neues Tagebuch mit Standard-Einstellungen: Wetter aus, bis ein fester Ort gesetzt ist (Spec 05), GPS aus. */
export function createDiary(input: { id: string; name: string; subject: DiarySubject; timezone: string }, clock: Clock): Diary {
  return diarySchema.parse({
    id: input.id,
    name: input.name,
    subject: input.subject,
    createdAt: new Date(clock.now()).toISOString(),
    settings: { weather: { enabled: false, gpsDefault: false }, timezone: input.timezone },
  });
}
