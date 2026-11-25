// Anhang-Metadaten (Spec 02 `Attachment`, A-032): Record-`kind` `attachmentMeta`, synchronisiert wie Einträge; der
// Inhalt liegt getrennt als Blob (lokal unverschlüsselt im `blobs`-Store wie alle lokalen Daten in v3.0, auf dem
// Server verschlüsselt mit dem Tagebuch-Schlüssel). Die Textarea referenziert Anhänge über `attachmentIds`.
import { z } from 'zod';
import { idSchema, isoDateTime } from './blocks/index.js';

/** Größte erlaubte Datei (Spec 04: `/blobs` max. 20 MB). */
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

export const attachmentMetaSchema = z.strictObject({
  id: idSchema,
  diaryId: idSchema,
  entryId: idSchema,
  kind: z.enum(['image', 'pdf']),
  mime: z.string().regex(/^[a-z]+\/[a-z0-9.+-]+$/),
  name: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().min(0).max(ATTACHMENT_MAX_BYTES),
  createdAt: isoDateTime,
});
export type AttachmentMeta = z.infer<typeof attachmentMetaSchema>;

const DATA_URL_RE = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+=*)$/i;

/** Data-URL → MIME + Bytes (`undefined`, wenn keine Base64-Data-URL). */
export function decodeDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array<ArrayBuffer> } | undefined {
  const m = DATA_URL_RE.exec(dataUrl);
  if (!m) return undefined;
  let bin: string;
  try {
    bin = atob(m[2]!);
  } catch {
    return undefined; // ungültiges Base64 — Aufrufer meldet den Anhang als unlesbar
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: m[1]!.toLowerCase(), bytes };
}

/** Bytes → Data-URL (Export, Anzeige). */
export function encodeDataUrl(mime: string, bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}

export type AttachmentCheck = { ok: true; kind: AttachmentMeta['kind'] } | { ok: false; reason: 'tooLarge' | 'type' };

/** Erlaubt sind Bilder (ohne SVG, wegen eingebettetem Skript) und PDF bis `ATTACHMENT_MAX_BYTES` (BLK-30). */
export function checkAttachmentFile(file: { mime: string; sizeBytes: number }): AttachmentCheck {
  const mime = file.mime.toLowerCase();
  const kind = mime === 'application/pdf' ? 'pdf' : /^image\/[a-z0-9.+-]+$/.test(mime) && mime !== 'image/svg+xml' ? 'image' : undefined;
  if (!kind) return { ok: false, reason: 'type' };
  if (file.sizeBytes > ATTACHMENT_MAX_BYTES) return { ok: false, reason: 'tooLarge' };
  return { ok: true, kind };
}
