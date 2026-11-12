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
