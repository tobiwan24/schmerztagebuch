import { describe, it, expect, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicProvider, DEFAULT_ANTHROPIC_MODEL, LlmError, mapAnthropicError, type AnthropicClientLike, type AnthropicMessageLike, type LlmRequest } from './index.js';

const req: LlmRequest = { system: 'SYS', messages: [{ role: 'user', content: 'Diktat' }], jsonSchema: { type: 'object', properties: { a: { type: 'number' } } }, maxTokens: 321 };
const ok = (over: Partial<AnthropicMessageLike> = {}): AnthropicMessageLike => ({
  stop_reason: 'end_turn', stop_details: null, content: [{ type: 'text', text: '{"a":1}' }], usage: { input_tokens: 11, output_tokens: 7 }, ...over,
});
function mock(res: AnthropicMessageLike | Error = ok()) {
  const respond = () => (res instanceof Error ? Promise.reject(res) : Promise.resolve(res));
  const create = vi.fn(respond);
  const betaCreate = vi.fn(respond);
  const client: AnthropicClientLike = { messages: { create }, beta: { messages: { create: betaCreate } } };
  return { client, create, betaCreate };
}
/** Die SDK-Fehlerklassen sind schwer zu konstruieren: Objekt mit dem passenden Prototyp. */
const sdkError = (cls: { prototype: object }, status?: number) => Object.assign(Object.create(cls.prototype) as Error, status === undefined ? {} : { status });
const run = (res: AnthropicMessageLike | Error, model?: string) => new AnthropicProvider({ client: mock(res).client, ...(model ? { model } : {}) }).complete(req);

describe('AnthropicProvider', () => {
  it('VOI-12: Standardmodell Opus über den Beta-Endpunkt mit Refusal-Fallback; Request-Form ohne verbotene Parameter', async () => {
    const m = mock();
    const p = new AnthropicProvider({ client: m.client });
    expect([p.id, p.thirdParty, p.model]).toEqual(['anthropic', true, DEFAULT_ANTHROPIC_MODEL]);
    expect(DEFAULT_ANTHROPIC_MODEL).toBe('claude-opus-5-5');
    const r = await p.complete(req);
    expect(r).toEqual({ data: { a: 1 }, usage: { inputTokens: 11, outputTokens: 7 } });
    expect(m.create).not.toHaveBeenCalled();
    const sent = m.betaCreate.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(sent).toMatchObject({
      model: 'claude-opus-5-5', max_tokens: 321, system: 'SYS', messages: [{ role: 'user', content: 'Diktat' }],
      output_config: { format: { type: 'json_schema', schema: req.jsonSchema }, effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    });
    for (const forbidden of ['thinking', 'temperature', 'top_p', 'top_k', 'tool_choice', 'tools', 'output_format']) expect(sent).not.toHaveProperty(forbidden);
    expect((sent.messages as { role: string }[]).every((x) => x.role === 'user')).toBe(true);
  });

  it('VOI-12: Haiku nutzt den normalen Endpunkt ohne Fallback und ohne effort; das Modell kommt aus der Konfiguration', async () => {
    const m = mock();
    await new AnthropicProvider({ client: m.client, model: 'claude-haiku-5-5' }).complete(req);
    expect(m.betaCreate).not.toHaveBeenCalled();
    const sent = m.create.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(sent.model).toBe('claude-haiku-5-5');
    expect(sent.output_config).toEqual({ format: { type: 'json_schema', schema: req.jsonSchema } });
    expect(sent).not.toHaveProperty('betas');
    // Fallback lässt sich auch bei anderen Modellen erzwingen
    const m2 = mock();
    await new AnthropicProvider({ client: m2.client, model: 'claude-sonnet-5-5', refusalFallback: true }).complete(req);
    expect(m2.betaCreate).toHaveBeenCalledTimes(1);
  });

  it('VOI-12: stop_reason refusal, max_tokens und unerwartete Werte werden vor dem Inhalt geprüft', async () => {
    const refusal = ok({ stop_reason: 'refusal', stop_details: { category: 'general_harms', explanation: 'x' }, content: [] });
    await expect(run(refusal)).rejects.toMatchObject({ code: 'llm_refused', detail: 'general_harms' });
    await expect(run(ok({ stop_reason: 'refusal' }))).rejects.toMatchObject({ code: 'llm_refused' });
    await expect(run(ok({ stop_reason: 'max_tokens' }))).rejects.toMatchObject({ code: 'llm_truncated' });
    await expect(run(ok({ stop_reason: 'tool_use' }))).rejects.toMatchObject({ code: 'llm_invalid_output' });
    await expect(run(ok({ stop_reason: null }))).rejects.toMatchObject({ code: 'llm_invalid_output' });
  });

  it('VOI-12: kaputtes oder fehlendes JSON ist ein Fehler, nie geraten; mehrere Textblöcke werden verbunden', async () => {
    await expect(run(ok({ content: [{ type: 'text', text: 'kein json' }] }))).rejects.toMatchObject({ code: 'llm_invalid_output' });
    await expect(run(ok({ content: [] }))).rejects.toMatchObject({ code: 'llm_invalid_output' });
    const split = ok({ content: [{ type: 'thinking' }, { type: 'text', text: '{"a":' }, { type: 'text', text: '2}' }] });
    expect((await run(split)).data).toEqual({ a: 2 });
  });

  it('VOI-12: SDK-Fehlerklassen werden auf Fehlercodes abgebildet (nie über Meldungstext)', async () => {
    const cases: [Error, string][] = [
      [sdkError(Anthropic.BadRequestError, 400), 'llm_bad_request'],
      [sdkError(Anthropic.AuthenticationError, 401), 'llm_auth'],
      [sdkError(Anthropic.PermissionDeniedError, 403), 'llm_auth'],
      [sdkError(Anthropic.RateLimitError, 429), 'llm_rate_limited'],
      [sdkError(Anthropic.APIConnectionError), 'llm_unavailable'],
      [sdkError(Anthropic.APIConnectionTimeoutError), 'llm_unavailable'],
      [sdkError(Anthropic.InternalServerError, 500), 'llm_unavailable'],
      [sdkError(Anthropic.APIError, 529), 'llm_unavailable'],
      [sdkError(Anthropic.APIError, 404), 'llm_failed'],
      [sdkError(Anthropic.APIError), 'llm_failed'],
      [new Error('Rate limit exceeded 429'), 'llm_failed'],
    ];
    for (const [err, code] of cases) {
      await expect(run(err)).rejects.toMatchObject({ code });
      expect(mapAnthropicError(err).code).toBe(code);
    }
    const own = new LlmError('llm_truncated');
    expect(mapAnthropicError(own)).toBe(own);
  });

  it('VOI-12: ohne Client braucht der Provider einen API-Schlüssel (nur per Env, Meldung ohne Schlüssel)', () => {
    expect(() => new AnthropicProvider({})).toThrow(/llm_auth/);
    const p = new AnthropicProvider({ apiKey: 'test-key-not-real', model: 'claude-sonnet-5-5', timeoutMs: 5000 });
    expect(p.model).toBe('claude-sonnet-5-5');
  });
});
