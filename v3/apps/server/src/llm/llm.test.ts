import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { createIdGenerator, instantiateCatalogTemplate } from '@stb/core';
import { FakeProvider, LlmError, type LlmProvider, type LlmRequest } from '@stb/llm';
import { LLM_BODY_MAX_BYTES } from '@stb/sync-protocol';
import { openDatabase, type Db } from '../db.js';
import { migrate } from '../schema.js';
import { buildApp } from '../app.js';
import { loadConfig, ConfigError } from '../config.js';
import { headerAuth, TEST_AUTH_HEADER } from '../auth/test-auth.js';
import { LLM_RATE_LIMIT } from './routes.js';

const config = { rpId: 'localhost', allowedOrigins: ['http://localhost:5173'], databasePath: ':memory:', blobDir: '.', port: 0, host: '127.0.0.1' };
const MARKER = 'GEHEIMER-KLARTEXT-4711';

const clock = { now: () => 1_700_000_000_000 };
const { newId } = createIdGenerator(clock);
const state = instantiateCatalogTemplate('migraine', { id: newId(), diaryId: newId(), order: 'V', newId }, clock);
const painId = state.version.blocks[0]!.id;

let db: Db;
let app: FastifyInstance;
let logs: string[];
let now = 1_700_000_000_000;
const as = (user = 'olga') => ({ [TEST_AUTH_HEADER]: user });

async function setup(provider: LlmProvider | null, dailyTokens = 400) {
  logs = [];
  db = openDatabase(':memory:');
  migrate(db);
  const logStream = new Writable({ write(chunk, _enc, cb) { logs.push(String(chunk)); cb(); } });
  app = buildApp({
    config: { ...config, llm: { provider: 'ollama', dailyTokens, ollamaModel: 'm', anthropicModel: 'a' } },
    db, auth: headerAuth, now: () => now, logStream, llmProvider: provider,
  });
  await app.ready();
}
beforeEach(() => { now = 1_700_000_000_000; });
afterEach(async () => {
  await app.close();
  db.close();
});

const fillBody = (text = `Kopfschmerz ${MARKER}`) => ({ templateName: 'Migräne', version: state.version, text, now: '2026-11-16T10:00:00Z' });
const post = (path: string, payload: unknown, headers: Record<string, string> = as()) =>
  app.inject({ method: 'POST', url: `/api/v1/llm/${path}`, headers: { ...headers, 'content-type': 'application/json' }, payload: typeof payload === 'string' ? payload : JSON.stringify(payload) });
const changes = () => (db.prepare('SELECT total_changes() AS n').get() as { n: number }).n;

describe('LLM-Endpunkte', () => {
  it('VOI-13: ohne Anmeldung 401, bei LLM_PROVIDER=off 404/llm_disabled (alle vier Endpunkte)', async () => {
    await setup(null);
    expect((await post('fill', fillBody(), {})).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v1/llm/status' })).statusCode).toBe(401);
    for (const p of ['fill', 'roles', 'summary']) {
      const r = await post(p, fillBody());
      expect([r.statusCode, r.json()]).toEqual([404, { error: 'llm_disabled' }]);
    }
    const s = await app.inject({ method: 'GET', url: '/api/v1/llm/status', headers: as() });
    expect([s.statusCode, s.json()]).toEqual([404, { error: 'llm_disabled' }]);
  });

  it('VOI-13: status nennt Provider, Modell, Drittanbieter und Tagesverbrauch', async () => {
    await setup(new FakeProvider({ values: [] }, true));
    const s = await app.inject({ method: 'GET', url: '/api/v1/llm/status', headers: as() });
    expect(s.json()).toEqual({ provider: 'fake', model: 'fake-1', thirdParty: true, dailyTokens: 400, usedTokens: 0 });
  });

  it('VOI-13: fill liefert den Entwurf als Zuordnung Block-ID zu Wert; roles filtert unbekannte Blöcke; summary liefert Text', async () => {
    const fake = new FakeProvider((req: LlmRequest) => {
      const props = Object.keys((req.jsonSchema as { properties: object }).properties);
      if (props.includes('values')) return { values: [{ id: painId, value: 7 }] };
      if (props.includes('suggestions')) return { suggestions: [{ blockId: painId, role: 'outcome' }, { blockId: 'fremd', role: 'note' }] };
      return { summary: 'Kurz.' };
    });
    await setup(fake, 1_000_000);
    const fill = await post('fill', fillBody());
    expect([fill.statusCode, fill.json()]).toEqual([200, { values: { [painId]: 7 } }]);
    expect(fake.calls[0]!.messages[0]!.content).toContain(MARKER);
    const roles = await post('roles', { templateName: 'Migräne', version: state.version });
    expect(roles.json()).toEqual({ suggestions: [{ blockId: painId, role: 'outcome' }] });
    const sum = await post('summary', { period: 'Oktober', facts: [{ label: 'Mittel', value: '5' }] });
    expect(sum.json()).toEqual({ summary: 'Kurz.' });
  });

  it('VOI-13: keine DB-Schreibvorgänge', async () => {
    await setup(new FakeProvider({ values: [] }));
    const before = changes();
    await post('fill', fillBody());
    await app.inject({ method: 'GET', url: '/api/v1/llm/status', headers: as() });
    expect(changes()).toBe(before);
  });

  it('VOI-13: der Log-Stream enthält den Klartext-Marker nie (Erfolg, Provider-Fehler, ungültige Antwort, 400, 413)', async () => {
    let mode = 'ok';
    const provider: LlmProvider = {
      id: 'ollama', thirdParty: false, model: 'm',
      complete(req) {
        if (mode === 'throw') return Promise.reject(new LlmError('llm_unavailable', req.messages[0]!.content));
        return Promise.resolve({ data: mode === 'bad' ? { nope: MARKER } : { values: [] }, usage: { inputTokens: 1, outputTokens: 1 } });
      },
    };
    await setup(provider);
    expect((await post('fill', fillBody())).statusCode).toBe(200);
    mode = 'throw';
    const t = await post('fill', fillBody());
    expect(t.statusCode).toBe(503);
    mode = 'bad';
    const b = await post('fill', fillBody());
    expect([b.statusCode, b.json()]).toEqual([502, { error: 'llm_invalid_output' }]);
    expect((await post('fill', { text: MARKER })).statusCode).toBe(400);
    expect((await post('fill', fillBody('x'.repeat(LLM_BODY_MAX_BYTES) + MARKER))).statusCode).toBe(413);
    expect(logs.length).toBeGreaterThan(0);
    for (const l of logs) expect(l).not.toContain(MARKER);
    for (const r of [t, b]) expect(r.body).not.toContain(MARKER);
  });

  it('VOI-13: Body über 32 KB gibt 413, ungültige Form 400', async () => {
    await setup(new FakeProvider({ values: [] }));
    expect((await post('fill', fillBody('y'.repeat(LLM_BODY_MAX_BYTES)))).statusCode).toBe(413);
    expect((await post('fill', { text: 'x' })).statusCode).toBe(400);
    expect((await post('fill', 'kein json')).statusCode).toBe(400);
    expect((await post('summary', { period: 'x', facts: [] })).statusCode).toBe(400);
  });

  it('VOI-13: Provider-Fehler werden auf Statuscodes abgebildet (Refusal 422)', async () => {
    let code: 'llm_refused' | 'llm_truncated' = 'llm_refused';
    await setup({ id: 'ollama', thirdParty: false, model: 'm', complete: () => Promise.reject(new LlmError(code)) });
    const a = await post('fill', fillBody());
    expect([a.statusCode, a.json()]).toEqual([422, { error: 'llm_refused' }]);
    code = 'llm_truncated';
    expect((await post('fill', fillBody())).statusCode).toBe(502);
  });

  it('VOI-13: Rate-Limit 30/h je Nutzer (andere Nutzer unberührt), danach wieder frei', async () => {
    await setup(new FakeProvider({ summary: 's' }), 1_000_000);
    const body = { period: 'x', facts: [{ label: 'a', value: '1' }] };
    for (let i = 0; i < LLM_RATE_LIMIT.limit; i++) expect((await post('summary', body)).statusCode).toBe(200);
    const blocked = await post('summary', body);
    expect([blocked.statusCode, blocked.json()]).toEqual([429, { error: 'rate-limited' }]);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect((await post('summary', body, as('vic'))).statusCode).toBe(200);
    now += LLM_RATE_LIMIT.windowMs + 1;
    expect((await post('summary', body)).statusCode).toBe(200);
  });

  it('VOI-13: Tagesbudget in Tokens je Nutzer; am nächsten Tag zurückgesetzt', async () => {
    await setup(new FakeProvider({ summary: 'x'.repeat(400) }));
    const body = { period: 'x', facts: [{ label: 'a', value: '1' }] };
    expect((await post('summary', body)).statusCode).toBe(200); // verbraucht rund 250 Tokens je Aufruf
    expect((await post('summary', body)).statusCode).toBe(200); // Budget 400: vor dem Aufruf noch frei
    const over = await post('summary', body);
    expect([over.statusCode, over.json()]).toEqual([429, { error: 'llm_budget_exhausted' }]);
    expect((await post('summary', body, as('vic'))).statusCode).toBe(200);
    now += 24 * 60 * 60 * 1000;
    expect((await post('summary', body)).statusCode).toBe(200);
  });
});

describe('LLM-Konfiguration', () => {
  const base = { RP_ID: 'localhost', ALLOWED_ORIGINS: 'http://localhost:5173', DATABASE_PATH: 'x', BLOB_DIR: 'y' };

  it('VOI-13: Standard ist off; Ollama braucht OLLAMA_URL, Anthropic braucht ANTHROPIC_API_KEY', () => {
    expect(loadConfig(base).llm).toMatchObject({ provider: 'off', dailyTokens: 50_000, ollamaModel: 'qwen2.5:7b-instruct', anthropicModel: 'claude-opus-5-5' });
    expect(() => loadConfig({ ...base, LLM_PROVIDER: 'ollama' })).toThrow(/OLLAMA_URL/);
    expect(() => loadConfig({ ...base, LLM_PROVIDER: 'anthropic' })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => loadConfig({ ...base, LLM_PROVIDER: 'x' })).toThrow(ConfigError);
    expect(loadConfig({ ...base, LLM_PROVIDER: 'ollama', OLLAMA_URL: 'http://ollama:11434', LLM_DAILY_TOKENS: '1000' }).llm).toMatchObject({ provider: 'ollama', ollamaUrl: 'http://ollama:11434', dailyTokens: 1000 });
    expect(loadConfig({ ...base, LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' }).llm).toMatchObject({ provider: 'anthropic', anthropicApiKey: 'k' });
  });
});
