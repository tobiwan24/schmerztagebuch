import { describe, it, expect } from 'vitest';
import type { LlmStatus } from '@stb/sync-protocol';
import { fetchLlmStatus, llmAvailability, LlmClientError, LLM_OPT_IN_KEY, readLlmOptIn, writeLlmOptIn } from './client';

const status: LlmStatus = { provider: 'ollama', model: 'qwen2.5:7b-instruct', thirdParty: false, dailyTokens: 50_000, usedTokens: 0 };
const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

describe('KI-Client', () => {
  it('VOI-16: Opt-in ist standardmäßig aus, wird nur mit 1 gespeichert und lässt sich zurücknehmen', () => {
    const s = memoryStorage();
    expect(readLlmOptIn(s)).toBe(false);
    writeLlmOptIn(true, s);
    expect(s.data.get(LLM_OPT_IN_KEY)).toBe('1');
    expect(readLlmOptIn(s)).toBe(true);
    writeLlmOptIn(false, s);
    expect(readLlmOptIn(s)).toBe(false);
    expect(s.data.size).toBe(0);
  });

  it('VOI-16: gesperrter Speicher → Opt-in bleibt aus, kein Fehler', () => {
    const broken = { getItem: () => { throw new Error('gesperrt'); }, setItem: () => { throw new Error('gesperrt'); }, removeItem: () => { throw new Error('gesperrt'); } };
    expect(readLlmOptIn(broken)).toBe(false);
    expect(() => writeLlmOptIn(true, broken)).not.toThrow();
  });

  it('VOI-16: Status 200 wird geprüft geliefert, 404 heißt aus (null), alles andere ist ein Fehler', async () => {
    expect(await fetchLlmStatus(() => Promise.resolve(json(status)))).toEqual(status);
    expect(await fetchLlmStatus(() => Promise.resolve(json({ error: 'llm_disabled' }, { status: 404 })))).toBeNull();
    await expect(fetchLlmStatus(() => Promise.resolve(json({}, { status: 401 })))).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(fetchLlmStatus(() => Promise.resolve(json({}, { status: 500 })))).rejects.toMatchObject({ code: 'failed' });
    await expect(fetchLlmStatus(() => Promise.resolve(json({ provider: 'x' })))).rejects.toMatchObject({ code: 'failed' });
    await expect(fetchLlmStatus(() => Promise.resolve(new Response('kein json', { status: 200 })))).rejects.toBeInstanceOf(LlmClientError);
    await expect(fetchLlmStatus(() => Promise.reject(new TypeError('Failed to fetch')))).rejects.toMatchObject({ code: 'offline' });
  });

  it('VOI-16: Status wird ohne Zugangsdaten im Query, mit Cookie und ohne Cache abgefragt', async () => {
    let seen: { url: string; init?: RequestInit } | undefined;
    await fetchLlmStatus((url, init) => {
      seen = { url: String(url), ...(init ? { init } : {}) };
      return Promise.resolve(json(status));
    });
    expect(seen).toMatchObject({ url: '/api/v1/llm/status', init: { credentials: 'include', cache: 'no-store' } });
  });

  it('VOI-16: KI-Knöpfe sind ausgeblendet ohne Konto, bei off/unbekanntem Status oder Opt-in aus; deaktiviert offline', () => {
    const base = { syncAttached: true, status, optIn: true, online: true };
    expect(llmAvailability(base)).toBe('enabled');
    expect(llmAvailability({ ...base, online: false })).toBe('disabled');
    expect(llmAvailability({ ...base, syncAttached: false })).toBe('hidden');
    expect(llmAvailability({ ...base, status: null })).toBe('hidden');
    expect(llmAvailability({ ...base, status: undefined })).toBe('hidden');
    expect(llmAvailability({ ...base, optIn: false })).toBe('hidden');
    expect(llmAvailability({ ...base, optIn: false, online: false })).toBe('hidden');
  });
});
