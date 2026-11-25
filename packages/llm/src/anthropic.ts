// Anthropic-Provider (Spec 08, A-087). Structured Outputs über `output_config.format` (JSON-Schema), `effort: 'low'`
// für die Extraktion. Kein Thinking-Parameter, kein Prefill, kein erzwungenes `tool_choice`, keine Sampling-Parameter.
// Die Antwort wird erst nach `stop_reason` gelesen; Fehler werden über die typisierten SDK-Klassen abgebildet.
import Anthropic from '@anthropic-ai/sdk';
import { LlmError, type LlmProvider, type LlmRequest, type LlmResult } from './types.js';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Das, was der Provider vom SDK-Client braucht; Tests übergeben ein Objekt mit `vi.fn()`. */
export interface AnthropicMessageLike {
  stop_reason: string | null;
  stop_details?: { category?: string | null; explanation?: string | null } | null;
  content: { type: string; text?: string }[];
  usage: { input_tokens: number; output_tokens: number };
}
export interface AnthropicClientLike {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): PromiseLike<AnthropicMessageLike> };
  beta: { messages: { create(params: Anthropic.Beta.MessageCreateParamsNonStreaming): PromiseLike<AnthropicMessageLike> } };
}

export interface AnthropicOptions {
  /** Vorbereiteter Client (Tests). Ohne ihn wird aus `apiKey` einer erzeugt. */
  client?: AnthropicClientLike;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  /** Server-seitiger Refusal-Fallback; Standard: nur für `claude-opus-*` (Haiku unterstützt ihn nicht). */
  refusalFallback?: boolean;
}

/** Fehlerklassen des SDK → `LlmError` (spezifisch vor allgemein; nie Meldungstexte vergleichen oder weitergeben). */
export function mapAnthropicError(e: unknown): LlmError {
  if (e instanceof LlmError) return e;
  if (e instanceof Anthropic.BadRequestError) return new LlmError('llm_bad_request');
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new LlmError('llm_auth');
  if (e instanceof Anthropic.RateLimitError) return new LlmError('llm_rate_limited');
  if (e instanceof Anthropic.APIConnectionError) return new LlmError('llm_unavailable');
  if (e instanceof Anthropic.APIError) return e.status !== undefined && e.status >= 500 ? new LlmError('llm_unavailable', `http ${e.status}`) : new LlmError('llm_failed', `http ${e.status ?? 0}`);
  return new LlmError('llm_failed');
}

export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic';
  readonly thirdParty = true;
  readonly model: string;
  private readonly client: AnthropicClientLike;
  private readonly fallback: boolean;

  constructor(o: AnthropicOptions) {
    this.model = o.model ?? DEFAULT_ANTHROPIC_MODEL;
    const client = o.client ?? (new Anthropic({ apiKey: o.apiKey, timeout: o.timeoutMs ?? 60_000, maxRetries: 2 }) as unknown as AnthropicClientLike);
    if (!o.client && !o.apiKey) throw new LlmError('llm_auth', 'ANTHROPIC_API_KEY fehlt');
    this.client = client;
    this.fallback = o.refusalFallback ?? this.model.startsWith('claude-opus');
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    // Haiku bekommt kein `effort` (Parameter nicht für alle Modelle zugesichert, A-087).
    const effort = this.model.includes('haiku') ? {} : { effort: 'low' as const };
    const base = {
      model: this.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: req.messages,
      output_config: { format: { type: 'json_schema' as const, schema: req.jsonSchema }, ...effort },
    };
    let res: AnthropicMessageLike;
    try {
      res = this.fallback
        ? await this.client.beta.messages.create({ ...base, betas: [FALLBACK_BETA], fallbacks: 'default' })
        : await this.client.messages.create(base);
    } catch (e) {
      throw mapAnthropicError(e);
    }
    // stop_reason zuerst prüfen, erst dann den Inhalt lesen.
    if (res.stop_reason === 'refusal') throw new LlmError('llm_refused', res.stop_details?.category ?? undefined);
    if (res.stop_reason === 'max_tokens') throw new LlmError('llm_truncated');
    if (res.stop_reason !== 'end_turn' && res.stop_reason !== 'stop_sequence') throw new LlmError('llm_invalid_output', `stop_reason ${res.stop_reason ?? 'null'}`);
    const text = res.content.flatMap((b) => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : [])).join('');
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new LlmError('llm_invalid_output');
    }
    return { data, usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens } };
  }
}
