import { describe, it, expect, vi } from 'vitest';
import { OllamaProvider, type LlmRequest } from './index.js';

const req: LlmRequest = { system: 'SYS', messages: [{ role: 'user', content: 'Diktat' }], jsonSchema: { type: 'object' }, maxTokens: 200 };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const provider = (fetchFn: (url: string, init?: RequestInit) => Promise<Response>, extra: { timeoutMs?: number } = {}) =>
  new OllamaProvider({ baseUrl: 'http://ollama:11434/', model: 'qwen2.5:7b-instruct', fetch: fetchFn as typeof fetch, ...extra });

describe('OllamaProvider', () => {
  it('VOI-12: sendet /api/chat mit Modell, JSON-Schema als format, ohne Streaming, mit Timeout; liest Antwort und Tokens', async () => {
    const f = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => json(200, { message: { content: '{"a":1}' }, done_reason: 'stop', prompt_eval_count: 9, eval_count: 4 }));
    const p = provider(f);
    expect([p.id, p.thirdParty, p.model]).toEqual(['ollama', false, 'qwen2.5:7b-instruct']);
    expect(await p.complete(req)).toEqual({ data: { a: 1 }, usage: { inputTokens: 9, outputTokens: 4 } });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('http://ollama:11434/api/chat');
    expect(init?.method).toBe('POST');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init?.body as string)).toEqual({
      model: 'qwen2.5:7b-instruct', stream: false, format: { type: 'object' }, options: { num_predict: 200, temperature: 0 },
      messages: [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'Diktat' }],
    });
  });

  it('VOI-12: Fehlerabbildung für Netz/Timeout, 429, 5xx, 4xx, abgeschnitten und ungültige Antworten', async () => {
    const fail = async (f: () => Promise<Response>) => provider(f).complete(req).then(() => null, (e: { code: string }) => e.code);
    expect(await fail(() => Promise.reject(new TypeError('fetch failed')))).toBe('llm_unavailable');
    expect(await fail(() => Promise.reject(new DOMException('timeout', 'TimeoutError')))).toBe('llm_unavailable');
    expect(await fail(async () => json(429, {}))).toBe('llm_rate_limited');
    expect(await fail(async () => json(503, {}))).toBe('llm_unavailable');
    expect(await fail(async () => json(404, { error: 'model not found' }))).toBe('llm_bad_request');
    expect(await fail(async () => json(200, { message: { content: '{"a"' }, done_reason: 'length' }))).toBe('llm_truncated');
    expect(await fail(async () => json(200, { message: { content: 'kein json' }, done_reason: 'stop' }))).toBe('llm_invalid_output');
    expect(await fail(async () => json(200, { message: {} }))).toBe('llm_invalid_output');
    expect(await fail(async () => new Response('<html>', { status: 200 }))).toBe('llm_invalid_output');
  });

  it('VOI-12: fehlende Token-Zahlen zählen als 0; der Standard-Timeout lässt sich überschreiben', async () => {
    const p = provider(async () => json(200, { message: { content: '[]' } }), { timeoutMs: 1000 });
    expect(await p.complete(req)).toEqual({ data: [], usage: { inputTokens: 0, outputTokens: 0 } });
  });
});
