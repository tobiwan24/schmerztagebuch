// Ollama-Provider (HTTP `/api/chat`, `format` = JSON-Schema, ohne Streaming). Läuft im eigenen Netz (kein Drittanbieter).
import { LlmError, type LlmProvider, type LlmRequest, type LlmResult } from './types.js';

export interface OllamaOptions {
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

interface OllamaChatResponse {
  message?: { content?: unknown };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider implements LlmProvider {
  readonly id = 'ollama';
  readonly thirdParty = false;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(o: OllamaOptions) {
    this.model = o.model;
    this.baseUrl = o.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = o.timeoutMs ?? 60_000;
    this.fetchFn = o.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: req.jsonSchema,
          options: { num_predict: req.maxTokens, temperature: 0 },
          messages: [{ role: 'system', content: req.system }, ...req.messages],
        }),
      });
    } catch {
      // Netzfehler und Zeitüberschreitung: der Server ist nicht erreichbar.
      throw new LlmError('llm_unavailable');
    }
    if (res.status === 429) throw new LlmError('llm_rate_limited');
    if (res.status >= 500) throw new LlmError('llm_unavailable', `http ${res.status}`);
    if (!res.ok) throw new LlmError('llm_bad_request', `http ${res.status}`);
    let body: OllamaChatResponse;
    try {
      body = (await res.json()) as OllamaChatResponse;
    } catch {
      throw new LlmError('llm_invalid_output');
    }
    if (body.done_reason === 'length') throw new LlmError('llm_truncated');
    const content = body.message?.content;
    if (typeof content !== 'string') throw new LlmError('llm_invalid_output');
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch {
      throw new LlmError('llm_invalid_output');
    }
    return { data, usage: { inputTokens: body.prompt_eval_count ?? 0, outputTokens: body.eval_count ?? 0 } };
  }
}
