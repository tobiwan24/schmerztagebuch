// Deterministischer Provider für Tests und E2E (kein Netz, keine Zufallswerte).
import type { LlmProvider, LlmRequest, LlmResult } from './types.js';

export type FakeResponder = unknown | ((req: LlmRequest) => unknown);

export class FakeProvider implements LlmProvider {
  readonly id = 'fake';
  readonly model = 'fake-1';
  readonly calls: LlmRequest[] = [];

  constructor(private readonly respond: FakeResponder = {}, readonly thirdParty = false) {}

  complete(req: LlmRequest): Promise<LlmResult> {
    this.calls.push(req);
    const data = typeof this.respond === 'function' ? (this.respond as (r: LlmRequest) => unknown)(req) : this.respond;
    const chars = (s: string) => Math.ceil(s.length / 4);
    return Promise.resolve({
      data,
      usage: { inputTokens: chars(req.system) + req.messages.reduce((n, m) => n + chars(m.content), 0), outputTokens: chars(JSON.stringify(data)) },
    });
  }
}
