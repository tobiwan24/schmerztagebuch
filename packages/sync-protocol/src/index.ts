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

const intakeTemplateId = z.string().min(1).max(128);
const intakeOccurredAt = z.iso.datetime({ offset: true });
const intakeValueKey = z.string().min(1).max(200);

/**
 * Tolerante Annahme (FEAT-024: „Server ignoriert Unpassendes statt abzubrechen“): unbekannte Schlüssel, ein ungültiges
 * `occurredAt`, eine ungültige `templateId` und unpassende `values`-Einträge fallen weg; `lines` als Liste wird zu Text.
 * Kein Objekt bleibt unverändert (→ Fehler).
 */
function tolerantIntakeBody(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (intakeTemplateId.safeParse(r.templateId).success) out.templateId = r.templateId;
  if (intakeOccurredAt.safeParse(r.occurredAt).success) out.occurredAt = r.occurredAt;
  if (typeof r.text === 'string') out.text = r.text;
  if (typeof r.lines === 'string') out.lines = r.lines;
  else if (Array.isArray(r.lines) && r.lines.every((l) => typeof l === 'string')) out.lines = r.lines.join('\n');
  if (typeof r.values === 'object' && r.values !== null && !Array.isArray(r.values)) {
    out.values = Object.fromEntries(Object.entries(r.values).filter(([k, v]) => intakeValueKey.safeParse(k).success && intakeValue.safeParse(v).success));
  }
  return out;
}

export const intakeBodySchema = z.preprocess(
  tolerantIntakeBody,
  z
    .strictObject({
      templateId: intakeTemplateId.optional(),
      occurredAt: intakeOccurredAt.optional(),
      text: z.string().optional(),
      values: z.record(intakeValueKey, intakeValue).optional(),
      /** Zeilenformat (FEAT-024): „Feld: Wert“ je Zeile; reservierte Zeilen `Diktat:` und `Sprachmodell:`. */
      lines: z.string().max(INTAKE_BODY_MAX_BYTES).optional(),
    })
    // Ohne Text, Werte oder Zeilen gibt es nichts zu übernehmen.
    .refine((b) => b.text !== undefined || b.values !== undefined || b.lines !== undefined, { message: 'leerer Body' }),
);
export type IntakeBody = z.output<typeof intakeBodySchema>;

export const intakeKeyRequestSchema = z.strictObject({
  /** ECDH-P-256-Public-Key (raw, base64url). */
  publicKey: z.string().min(1).max(256),
  /** SHA-256(token) als base64url — das Token selbst erreicht den Server erst beim Intake. */
  tokenHash: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
// Kurzbefehl-Manifest (FEAT-023, A-153): die App lädt das mit dem Intake-Token versiegelte Manifest hoch (nur Siegel, ≤ 64 KB).
export const INTAKE_MANIFEST_MAX_CHARS = 64 * 1024;
export const manifestUploadSchema = z.strictObject({
  seal: z.strictObject({
    v: z.literal(1),
    iv: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
    ct: z.string().regex(/^[A-Za-z0-9_-]+$/).max(INTAKE_MANIFEST_MAX_CHARS),
  }),
});
export type ManifestUpload = z.infer<typeof manifestUploadSchema>;

/** Antwort von `POST /api/v1/intake/:diaryId/check` (Dry-Run, speichert nichts). */
const manifestFieldSchema = z.looseObject({ id: z.string(), label: z.string(), type: z.string(), required: z.boolean(), question: z.string() });
export const intakeCheckResponseSchema = z.strictObject({
  templateId: z.string(),
  missing: z.array(manifestFieldSchema),
  invalid: z.array(z.strictObject({ field: z.string(), message: z.string(), candidates: z.array(z.string()).optional() })),
  /** FEAT-024: Rückfragen in Reihenfolge; der Kurzbefehl hängt die Antwort als Zeile `label: Antwort` an. */
  questions: z.array(z.strictObject({ label: z.string(), question: z.string() })),
  summary: z.string(),
});
export type IntakeCheckResponse = z.infer<typeof intakeCheckResponseSchema>;

export { mergeEntry, type EntrySide, type MergeConflict, type EntryMergeResult } from './merge.js';

// ---------------------------------------------------------------------------------------------------------------
// Anhänge (Spec 04 `/blobs`): Chiffretext im Envelope-Format (base64url, Record-Art `blob`), Klartext max. 20 MB.

export const BLOB_MAX_BYTES = 20 * 1024 * 1024;
/** Envelope-Kopf (17) + GCM-Tag (16), base64url ohne Padding. */
export const BLOB_CIPHERTEXT_MAX_CHARS = Math.ceil(((BLOB_MAX_BYTES + 33) * 4) / 3);
export const blobIdSchema = z.string().regex(/^[A-Za-z0-9-]{1,128}$/);
export const blobQuerySchema = z.strictObject({ diaryId: z.string().min(1).max(128) });
// Arzt-Link (Spec 07, M18): nur Chiffretext; die ID erzeugt der Client (A-102), der Schluessel verlaesst das Geraet nie.
/** Obergrenze fuer den Chiffretext eines Berichts (Zeichen, base64url), entspricht "<= 10 MB". */
export const SHARE_CIPHERTEXT_MAX_CHARS = 10 * 1024 * 1024;
export const SHARE_EXPIRY_DAYS_MAX = 30;
export const SHARE_EXPIRY_DAYS_DEFAULT = 14;
export const SHARE_MAX_VIEWS_MAX = 20;
export const SHARE_MAX_VIEWS_DEFAULT = 5;
export const shareIdSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);
export const createShareRequestSchema = z.strictObject({
  id: shareIdSchema,
  ciphertext: z.string().regex(/^[A-Za-z0-9_-]+$/).min(1).max(SHARE_CIPHERTEXT_MAX_CHARS),
  expiresInDays: z.number().int().min(1).max(SHARE_EXPIRY_DAYS_MAX).default(SHARE_EXPIRY_DAYS_DEFAULT),
  maxViews: z.number().int().min(1).max(SHARE_MAX_VIEWS_MAX).default(SHARE_MAX_VIEWS_DEFAULT),
});
export type CreateShareRequest = z.input<typeof createShareRequestSchema>;
export const shareStatusSchema = z.enum(['active', 'expired', 'exhausted', 'revoked']);
export type ShareStatus = z.infer<typeof shareStatusSchema>;
export const shareInfoSchema = z.strictObject({
  id: shareIdSchema,
  createdAt: z.number().int(),
  expiresAt: z.number().int(),
  maxViews: z.number().int(),
  views: z.number().int(),
  status: shareStatusSchema,
});
export type ShareInfo = z.infer<typeof shareInfoSchema>;
export const sharesListResponseSchema = z.strictObject({ shares: z.array(shareInfoSchema) });
export const shareFetchResponseSchema = z.strictObject({ ciphertext: z.string(), expiresAt: z.number().int(), viewsLeft: z.number().int() });
export type ShareFetchResponse = z.infer<typeof shareFetchResponseSchema>;
// Integrationen (Spec 03/07, M24, A-127): nur lesend. Der Client erzeugt Token und Hash; der Server speichert Hash, öffentlichen
// Schlüssel, DK-Wrap und den verschlüsselten Namen — nie den Token selbst.
export const INTEGRATION_TOKEN_PREFIX = 'stbi_';
export const INTEGRATIONS_PER_DIARY_MAX = 10;
export const integrationIdSchema = z.string().min(1).max(64);
export const createIntegrationRequestSchema = z.strictObject({
  nameCt: z.string().min(1).max(16_384),
  /** ECDH-P-256, roh, base64url (65 Byte). */
  publicKey: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
  /** SHA-256 des Tokens, base64url (43 Zeichen). */
  tokenHash: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  wrappedDk: z.string().min(1).max(16_384),
  keyEpoch: z.number().int().min(1),
});
export type CreateIntegrationRequest = z.infer<typeof createIntegrationRequestSchema>;
export const integrationInfoSchema = z.strictObject({
  id: integrationIdSchema,
  nameCt: z.string(),
  createdAt: z.number().int(),
  lastUsedAt: z.number().int().nullable(),
  revokedAt: z.number().int().nullable(),
});
export type IntegrationInfo = z.infer<typeof integrationInfoSchema>;
export const integrationRecordsQuerySchema = z.strictObject({
  since: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(PULL_LIMIT_MAX).default(PULL_LIMIT_MAX),
});
export type IntegrationRecordsQuery = z.infer<typeof integrationRecordsQuerySchema>;
/** Records (nur Chiffretext) plus der DK-Wrap der Integration und die Epoche, für die er gilt. */
export const integrationRecordsResponseSchema = pullResponseSchema.extend({
  diaryId: z.string(),
  keyEpoch: z.number().int().min(1),
  wrappedDk: z.string(),
});
export type IntegrationRecordsResponse = z.infer<typeof integrationRecordsResponseSchema>;
export { planVersionRenumber, type RenumberInput, type RenumberPlan } from './renumber.js';
export * from './llm.js';
