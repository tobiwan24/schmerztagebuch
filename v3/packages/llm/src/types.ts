// LLM-Schnittstelle (Spec 08, M19). Die Provider laufen nur im Server; der Web-Build enthält sie nie (ARC-07).

/** Nur Nutzer-Nachrichten: kein Assistant-Prefill (die Anthropic-API lehnt ihn ab). */
export interface LlmMessage {
  role: 'user';
  content: string;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  /** JSON-Schema der Antwort (Structured Outputs bzw. Ollama `format`). */
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResult {
  /** Geparstes JSON — nie vertrauenswürdig, der Aufrufer prüft es mit zod. */
  data: unknown;
  usage: LlmUsage;
}

export interface LlmProvider {
  readonly id: string;
  /** `true`: Daten verlassen den eigenen Server (Drittanbieter). */
  readonly thirdParty: boolean;
  readonly model: string;
  complete(req: LlmRequest): Promise<LlmResult>;
}

export type LlmErrorCode =
  | 'llm_bad_request'
  | 'llm_auth'
  | 'llm_rate_limited'
  | 'llm_unavailable'
  | 'llm_refused'
  | 'llm_truncated'
  | 'llm_invalid_output'
  | 'llm_failed';

/** Fehler der Provider. Die Meldung enthält nie Prompt oder Antwort (keine Inhalte in Logs). */
export class LlmError extends Error {
  constructor(readonly code: LlmErrorCode, readonly detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'LlmError';
  }
}
