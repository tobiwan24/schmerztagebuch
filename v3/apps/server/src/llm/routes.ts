// LLM-Endpunkte (Spec 08, A-086): angemeldet, Body <= 32 KB, 30/h je Nutzer, Tagesbudget in Tokens.
// Der Klartext liegt nur im RAM dieser Anfrage: keine DB-Schreibvorgänge, kein Logging, Fehlerantworten ohne Inhalte.
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodType } from 'zod';
import {
  buildFillRequest, buildRolesRequest, buildSummaryRequest, LlmError, parseFillResult, rolesResultSchema, summaryResultSchema,
  type LlmErrorCode, type LlmProvider, type LlmRequest,
} from '@stb/llm';
import {
  LLM_BODY_MAX_BYTES, llmFillRequestSchema, llmRolesRequestSchema, llmSummaryRequestSchema, type LlmStatus,
} from '@stb/sync-protocol';
import type { Db } from '../db.js';
import type { AuthProvider } from '../auth/types.js';
import { requirePrincipal } from '../auth/require.js';
import { createRateLimiter } from '../rate-limit.js';

export const LLM_RATE_LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 };

const HTTP_STATUS: Record<LlmErrorCode, number> = {
  llm_refused: 422, llm_unavailable: 503, llm_rate_limited: 503,
  llm_bad_request: 502, llm_auth: 502, llm_truncated: 502, llm_invalid_output: 502, llm_failed: 502,
};

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface LlmRouteDeps {
  db: Db;
  auth: AuthProvider;
  now: () => number;
  provider: LlmProvider | null;
  dailyTokens: number;
}

export function registerLlmRoutes(app: FastifyInstance, { auth, now, provider, dailyTokens }: LlmRouteDeps): void {
  const limiter = createRateLimiter(LLM_RATE_LIMIT);
  // Tagesverbrauch je Nutzer (nur im RAM, geht beim Neustart verloren; bewusst keine Persistenz).
  const usage = new Map<string, { day: string; tokens: number }>();
  const used = (userId: string) => {
    const u = usage.get(userId);
    return u && u.day === dayKey(now()) ? u.tokens : 0;
  };

  const fail = (reply: FastifyReply, code: number, error: string) => reply.code(code).send({ error });

  async function gate(req: Parameters<typeof requirePrincipal>[1], reply: FastifyReply) {
    void reply.header('cache-control', 'no-store');
    const p = await requirePrincipal(auth, req, reply);
    if (!p) return null;
    if (!provider) {
      void fail(reply, 404, 'llm_disabled');
      return null;
    }
    return { p, provider };
  }

  app.get('/api/v1/llm/status', async (req, reply) => {
    const g = await gate(req, reply);
    if (!g) return reply;
    const status: LlmStatus = {
      provider: g.provider.id as LlmStatus['provider'], model: g.provider.model, thirdParty: g.provider.thirdParty,
      dailyTokens, usedTokens: used(g.p.userId),
    };
    return status;
  });

  function post<T>(path: string, schema: ZodType<T>, build: (b: T) => LlmRequest, parse: (data: unknown, b: T) => unknown): void {
    app.post(path, { bodyLimit: LLM_BODY_MAX_BYTES }, async (req, reply) => {
      const g = await gate(req, reply);
      if (!g) return reply;
      const body = schema.safeParse(req.body);
      if (!body.success) return fail(reply, 400, 'invalid-request');
      const rl = limiter.hit(g.p.userId, now());
      if (!rl.allowed) {
        void reply.header('retry-after', String(Math.ceil(rl.retryAfterMs / 1000)));
        return fail(reply, 429, 'rate-limited');
      }
      if (used(g.p.userId) >= dailyTokens) return fail(reply, 429, 'llm_budget_exhausted');
      try {
        const result = await g.provider.complete(build(body.data));
        const day = dayKey(now());
        usage.set(g.p.userId, { day, tokens: used(g.p.userId) + result.usage.inputTokens + result.usage.outputTokens });
        let out: unknown;
        try {
          out = parse(result.data, body.data);
        } catch {
          throw new LlmError('llm_invalid_output');
        }
        return out;
      } catch (e) {
        // Nur der Fehlercode geht zurück; weder Prompt noch Antwort noch Meldungstext des Providers.
        const code: LlmErrorCode = e instanceof LlmError ? e.code : 'llm_failed';
        return fail(reply, HTTP_STATUS[code], code);
      }
    });
  }

  post('/api/v1/llm/fill', llmFillRequestSchema, (b) => buildFillRequest({ templateName: b.templateName, version: b.version, text: b.text, now: b.now }), (d) => parseFillResult(d));
  post('/api/v1/llm/roles', llmRolesRequestSchema, (b) => buildRolesRequest({ templateName: b.templateName, version: b.version }), (d, b) => {
    const r = rolesResultSchema.parse(d);
    const ids = new Set(b.version.blocks.map((x) => x.id));
    return { suggestions: r.suggestions.filter((s) => ids.has(s.blockId)) };
  });
  post('/api/v1/llm/summary', llmSummaryRequestSchema, (b) => buildSummaryRequest(b), (d) => summaryResultSchema.parse(d));
}
