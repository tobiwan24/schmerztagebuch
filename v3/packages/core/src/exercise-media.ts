// Übungsmedien (RDM-033, A-149): Video und Schrittbilder eines Übungsblocks. Metadaten als Record-`kind` `exerciseMedia`
// (gehören zur Vorlage, nicht zu einem Eintrag), Inhalt wie Anhänge im `blobs`-Store, auf dem Server verschlüsselt.
// Die Konfiguration des Übungsblocks verweist über `videoMediaId` und `steps[].imageId` darauf.
import { z } from 'zod';
import { idSchema, isoDateTime, type ExerciseConfig, type ExerciseStep } from './blocks/index.js';
import { ATTACHMENT_MAX_BYTES } from './attachment.js';

/** Größte erlaubte Datei: dasselbe Blob-Limit wie bei Anhängen (Spec 04: `/blobs` max. 20 MB). */
export const EXERCISE_MEDIA_MAX_BYTES = ATTACHMENT_MAX_BYTES;

/** Abspielbare Videoformate (iPhone `.mov`, Android/Desktop `.mp4`/`.webm`). */
export const EXERCISE_VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

export const exerciseMediaSchema = z.strictObject({
  id: idSchema,
  diaryId: idSchema,
  templateId: idSchema,
  kind: z.enum(['image', 'video']),
  mime: z.string().regex(/^[a-z]+\/[a-z0-9.+-]+$/),
  name: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().min(0).max(EXERCISE_MEDIA_MAX_BYTES),
  createdAt: isoDateTime,
});
export type ExerciseMedia = z.infer<typeof exerciseMediaSchema>;

export type ExerciseMediaCheck = { ok: true } | { ok: false; reason: 'tooLarge' | 'type' };

/** Bild (ohne SVG) bzw. Video in einem abspielbaren Format, jeweils bis `EXERCISE_MEDIA_MAX_BYTES` (BLK-54). */
export function checkExerciseMediaFile(kind: ExerciseMedia['kind'], file: { mime: string; sizeBytes: number }): ExerciseMediaCheck {
  const mime = file.mime.toLowerCase();
  const typeOk =
    kind === 'image'
      ? /^image\/[a-z0-9.+-]+$/.test(mime) && mime !== 'image/svg+xml'
      : (EXERCISE_VIDEO_MIMES as readonly string[]).includes(mime);
  if (!typeOk) return { ok: false, reason: 'type' };
  if (file.sizeBytes > EXERCISE_MEDIA_MAX_BYTES) return { ok: false, reason: 'tooLarge' };
  return { ok: true };
}

/** Text eines Schritts (alte Daten: reiner Text). */
export const stepText = (s: ExerciseStep): string => (typeof s === 'string' ? s : (s.text ?? ''));
/** Bild eines Schritts, falls vorhanden. */
export const stepImageId = (s: ExerciseStep): string | undefined => (typeof s === 'string' ? undefined : s.imageId);

/** Alle Medien-IDs, auf die eine Übungskonfiguration verweist. */
export function exerciseMediaIds(c: ExerciseConfig): string[] {
  const ids = (c.steps ?? []).map(stepImageId).filter((x): x is string => x !== undefined);
  return c.videoMediaId ? [c.videoMediaId, ...ids] : ids;
}
