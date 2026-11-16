// LLM-Endpunkte (Spec 08, M19.3): Anfrage- und Antwortformen. Der Klartext liegt nur im RAM des Servers (A-086).
import { z } from 'zod';
import { ROLES, templateVersionSchema } from '@stb/core';

/** Obergrenze je Anfrage (Bytes), Spec 08. */
export const LLM_BODY_MAX_BYTES = 32 * 1024;
export const LLM_TEXT_MAX_CHARS = 8000;

export const llmFillRequestSchema = z.strictObject({
  templateName: z.string().min(1).max(200),
  version: templateVersionSchema,
  text: z.string().min(1).max(LLM_TEXT_MAX_CHARS),
  /** ISO-Zeitpunkt der Anfrage (für relative Angaben wie „gestern“). */
  now: z.string().min(1).max(40),
});
export type LlmFillRequest = z.infer<typeof llmFillRequestSchema>;

export const llmRolesRequestSchema = z.strictObject({
  templateName: z.string().min(1).max(200),
  version: templateVersionSchema,
});
export type LlmRolesRequest = z.infer<typeof llmRolesRequestSchema>;

export const llmSummaryRequestSchema = z.strictObject({
  period: z.string().min(1).max(100),
  facts: z.array(z.strictObject({ label: z.string().min(1).max(200), value: z.string().max(200) })).min(1).max(60),
  /** Nur, wenn der Nutzer Notizen ausdrücklich freigegeben hat. */
  notes: z.array(z.string().max(2000)).max(30).optional(),
});
export type LlmSummaryRequest = z.infer<typeof llmSummaryRequestSchema>;

export const llmStatusSchema = z.strictObject({
  provider: z.enum(['ollama', 'anthropic', 'fake']),
  model: z.string(),
  /** `true`: Daten verlassen den eigenen Server (Drittanbieter). */
  thirdParty: z.boolean(),
  dailyTokens: z.number().int(),
  usedTokens: z.number().int(),
});
export type LlmStatus = z.infer<typeof llmStatusSchema>;

/** Antwort auf `fill`: Block-ID → Rohwert (nie vertrauenswürdig, der Client prüft gegen die Block-Schemas). */
export const llmFillResponseSchema = z.object({
  occurredAt: z.string().optional(),
  text: z.string().optional(),
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])),
});
export type LlmFillResponse = z.infer<typeof llmFillResponseSchema>;

/** Antwort auf `roles`: Vorschläge je Block (der Server hat unbekannte Block-IDs bereits entfernt, der Client prüft erneut). */
export const llmRolesResponseSchema = z.object({
  suggestions: z.array(z.object({ blockId: z.string(), role: z.enum(ROLES), reason: z.string().optional() })),
});
export type LlmRolesResponse = z.infer<typeof llmRolesResponseSchema>;

/** Antwort auf `summary`: ein bearbeitbarer Text. */
export const llmSummaryResponseSchema = z.object({ summary: z.string().min(1) });
export type LlmSummaryResponse = z.infer<typeof llmSummaryResponseSchema>;
