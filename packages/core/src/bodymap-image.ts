// Eigenes Body-Map-Bild eines Tagebuchs (Spec 05/02, A-024): verkleinertes JPEG als Data-URL im (verschlüsselten)
// Record-Payload, Record-`kind` `bodymapImage`. Auswahl über die Record-ID wie bei den Standardbildern (`presetId`).
import { z } from 'zod';
import { idSchema, isoDateTime } from './blocks/index.js';

/** Obergrenze für die Data-URL (~2 MB Zeichen); v2-Verkleinerung liefert typisch 100–400 KB. */
export const BODYMAP_IMAGE_MAX_CHARS = 2_000_000;

export const bodymapImageSchema = z.strictObject({
  id: idSchema,
  diaryId: idSchema,
  name: z.string().trim().min(1).max(80),
  dataUrl: z
    .string()
    .max(BODYMAP_IMAGE_MAX_CHARS)
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/, { message: 'Kein Bild als Data-URL' }),
  width: z.number().int().positive().max(4000),
  height: z.number().int().positive().max(4000),
  createdAt: isoDateTime,
});
export type BodymapImage = z.infer<typeof bodymapImageSchema>;
