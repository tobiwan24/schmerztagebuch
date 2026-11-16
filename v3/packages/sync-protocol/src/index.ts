// DTOs und zod-Schemas für Client ↔ Server (Spec 04 „Protokoll"). Payloads sind immer Chiffretext.
import { z } from 'zod';

export const PULL_LIMIT_MAX = 500;
export const PUSH_OPS_MAX = 500;
/** Obergrenze je Record-Chiffretext (Anhänge laufen separat über /blobs). */
export const CIPHERTEXT_MAX_CHARS = 1_000_000;

const recordKind = z.string().regex(/^[a-zA-Z]+$/).max(32);
const recordId = z.string().min(1).max(128);

export const pushOpSchema = z.strictObject({
  recordId,
  kind: recordKind,
  baseRev: z.number().int().min(0),
  deleted: z.boolean(),
  ciphertext: z.string().min(1).max(CIPHERTEXT_MAX_CHARS),
});
export type PushOp = z.infer<typeof pushOpSchema>;

export const pushRequestSchema = z.strictObject({
  diaryId: z.string().min(1).max(128),
  ops: z.array(pushOpSchema).min(1).max(PUSH_OPS_MAX),
});
export type PushRequest = z.infer<typeof pushRequestSchema>;

export const serverRecordStateSchema = z.strictObject({
  rev: z.number().int().min(0),
  /** `null`, wenn der Record auf dem Server (noch) nicht existiert. */
  ciphertext: z.string().nullable(),
  deleted: z.boolean(),
});

export const pushResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ recordId, status: z.literal('applied'), rev: z.number().int().min(1), seq: z.number().int().min(1) }),
  z.strictObject({ recordId, status: z.literal('conflict'), server: serverRecordStateSchema }),
]);
export type PushResult = z.infer<typeof pushResultSchema>;

export const pushResponseSchema = z.strictObject({ results: z.array(pushResultSchema) });
export type PushResponse = z.infer<typeof pushResponseSchema>;

export const pullQuerySchema = z.strictObject({
  diaryId: z.string().min(1).max(128),
  since: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(PULL_LIMIT_MAX).default(PULL_LIMIT_MAX),
});
export type PullQuery = z.infer<typeof pullQuerySchema>;

export const pulledRecordSchema = z.strictObject({
  recordId,
  kind: recordKind,
  rev: z.number().int().min(1),
  seq: z.number().int().min(1),
  deleted: z.boolean(),
  ciphertext: z.string(),
});
export type PulledRecord = z.infer<typeof pulledRecordSchema>;

export const pullResponseSchema = z.strictObject({
  records: z.array(pulledRecordSchema),
  nextSince: z.number().int().min(0),
  hasMore: z.boolean(),
});
export type PullResponse = z.infer<typeof pullResponseSchema>;

// ---------------------------------------------------------------------------------------------------------------
// Intake (Spec 08): Body des Kurzbefehls, max. 16 KB. Der Server prüft nur die Form und versiegelt sofort.

export const INTAKE_BODY_MAX_BYTES = 16 * 1024;

const intakeMedication = z.strictObject({
  name: z.string().min(1).max(200),
  dose: z.union([z.number(), z.string()]).optional(),
  unit: z.string().max(20).optional(),
  at: z.string().optional(),
  effect: z.union([z.number(), z.string()]).optional(),
});
const intakeValue = z.union([z.number(), z.string(), z.boolean(), z.array(z.string()), intakeMedication, z.array(intakeMedication)]);

export const intakeBodySchema = z.strictObject({
  templateId: z.string().min(1).max(128).optional(),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
  text: z.string().optional(),
  values: z.record(z.string().min(1).max(200), intakeValue).optional(),
});
export type IntakeBody = z.infer<typeof intakeBodySchema>;

export const intakeKeyRequestSchema = z.strictObject({
  /** ECDH-P-256-Public-Key (raw, base64url). */
  publicKey: z.string().min(1).max(256),
  /** SHA-256(token) als base64url — das Token selbst erreicht den Server erst beim Intake. */
  tokenHash: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export { mergeEntry, type EntrySide, type MergeConflict, type EntryMergeResult } from './merge.js';

// ---------------------------------------------------------------------------------------------------------------
// Anhänge (Spec 04 `/blobs`): Chiffretext im Envelope-Format (base64url, Record-Art `blob`), Klartext max. 20 MB.

export const BLOB_MAX_BYTES = 20 * 1024 * 1024;
/** Envelope-Kopf (17) + GCM-Tag (16), base64url ohne Padding. */
export const BLOB_CIPHERTEXT_MAX_CHARS = Math.ceil(((BLOB_MAX_BYTES + 33) * 4) / 3);
export const blobIdSchema = z.string().regex(/^[A-Za-z0-9-]{1,128}$/);
export const blobQuerySchema = z.strictObject({ diaryId: z.string().min(1).max(128) });
export { planVersionRenumber, type RenumberInput, type RenumberPlan } from './renumber.js';
