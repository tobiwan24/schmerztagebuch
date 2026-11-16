import { describe, it, expect } from 'vitest';
import { FakeProvider, LlmError, type LlmRequest } from './index.js';

const req: LlmRequest = { system: 'System', messages: [{ role: 'user', content: 'Hallo Welt' }], jsonSchema: { type: 'object' }, maxTokens: 100 };

describe('FakeProvider', () => {
  it('antwortet deterministisch mit festen Daten und zählt Tokens aus der Länge', async () => {
    const p = new FakeProvider({ a: 1 });
    const first = await p.complete(req);
    expect(first).toEqual(await p.complete(req));
    expect(first.data).toEqual({ a: 1 });
    expect(first.usage).toEqual({ inputTokens: 2 + 3, outputTokens: 2 });
    expect(p.calls).toHaveLength(2);
    expect([p.id, p.thirdParty]).toEqual(['fake', false]);
  });

  it('kann die Antwort aus der Anfrage berechnen und als Drittanbieter auftreten', async () => {
    const p = new FakeProvider((r) => ({ echo: r.messages[0]?.content }), true);
    expect((await p.complete(req)).data).toEqual({ echo: 'Hallo Welt' });
    expect(p.thirdParty).toBe(true);
  });

  it('LlmError trägt Code und nie mehr als den Code samt Detail in der Meldung', () => {
    const e = new LlmError('llm_refused', 'safety');
    expect([e.code, e.message, e.name]).toEqual(['llm_refused', 'llm_refused: safety', 'LlmError']);
    expect(new LlmError('llm_failed').message).toBe('llm_failed');
  });
});
