// Einheitentests des SDK mit gefälschtem `fetch` (der Test gegen den echten In-Process-Server steht in integration/client-sdk).
import { describe, it, expect } from 'vitest';
import { createIntegrationCredentials, encryptRecord, generateDiaryKey } from '@stb/crypto';
import { connectIntegration, IntegrationApiError, type FetchLike } from './client.js';

const D = '0190a1b2-0000-7000-8000-0000000000d1';
const AT = '2026-03-01T08:00:00.000Z';
// Kurznamen → UUID v7 (Einträge werden gegen das Schema geprüft)
const U = (s: string) => `0190a1b2-0000-7000-8000-${[...s].map((c) => c.charCodeAt(0).toString(16)).join('').padStart(12, '0')}`;
const T = U('t1');

const entry = (id: string, at = AT) => ({
  id: U(id), diaryId: D, templateId: T, templateVersion: 1, occurredAt: at, recordedAt: at, updatedAt: at, authorId: 'u', values: {}, tags: [],
  meta: { source: 'app', timezone: 'Europe/Berlin' }, hlc: `1:0000:x`,
});

async function setup() {
  const dk = await generateDiaryKey();
  const creds = await createIntegrationCredentials(dk, { diaryId: D, keyEpoch: 1 }, 'https://stb.example');
  const enc = (recordId: string, kind: string, payload: unknown, keyEpoch = 1, key: CryptoKey = dk) =>
    encryptRecord(key, { diaryId: D, kind, recordId, keyEpoch }, new TextEncoder().encode(JSON.stringify(payload)));
  return { dk, creds, enc };
}

type Rec = { recordId: string; kind: string; rev: number; seq: number; deleted: boolean; ciphertext: string };
const page = (creds: { wrap: unknown }, records: Rec[], over: Record<string, unknown> = {}) => ({
  diaryId: D, keyEpoch: 1, wrappedDk: JSON.stringify(creds.wrap), records, nextSince: records.at(-1)?.seq ?? 0, hasMore: false, ...over,
});
const rec = (recordId: string, kind: string, seq: number, ciphertext: string, deleted = false): Rec => ({ recordId, kind, rev: 1, seq, deleted, ciphertext });

const reply = (status: number, body: unknown, headers: Record<string, string> = {}): ReturnType<FetchLike> =>
  Promise.resolve({ ok: status < 400, status, headers: { get: (n) => headers[n.toLowerCase()] ?? null }, json: async () => body });

describe('client-sdk (Einheit)', () => {
  it('Server-Adresse: baseUrl überschreibt den Zugangsstring; Anfrage mit Bearer-Token, ohne Schrägstrich-Doppelung', async () => {
    const { creds } = await setup();
    const urls: string[] = [];
    const fetch: FetchLike = (url, init) => {
      urls.push(url);
      expect(init?.headers?.authorization).toBe(`Bearer ${creds.token}`);
      return reply(200, page(creds, []));
    };
    await (await connectIntegration({ accessString: creds.accessString, fetch })).sync();
    await (await connectIntegration({ accessString: creds.accessString, baseUrl: 'https://anders.example/', fetch, pageSize: 10 })).sync();
    expect(urls).toEqual(['https://stb.example/api/v1/integration/records?since=0&limit=500', 'https://anders.example/api/v1/integration/records?since=0&limit=10']);
  });

  it('Nicht lesbare Records landen unter skipped (nie geraten): manipuliert, andere Epoche, ungültiges Schema', async () => {
    const { creds, enc, dk } = await setup();
    const good = await enc('e1', 'entry', entry('e1'));
    const tampered = good.slice(0, -4) + (good.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    const otherKey = await enc('e3', 'entry', entry('e3'), 1, await generateDiaryKey());
    const wrongEpoch = await enc('e4', 'entry', entry('e4'), 2, dk);
    const invalid = await enc('e5', 'entry', { id: U('e5'), nur: 'unsinn' });
    const wrongAad = await enc('andere-id', 'entry', entry('e6'));
    const fetch: FetchLike = () =>
      reply(200, page(creds, [rec('e1', 'entry', 1, good), rec('e2', 'entry', 2, tampered), rec('e3', 'entry', 3, otherKey), rec('e4', 'entry', 4, wrongEpoch), rec('e5', 'entry', 5, invalid), rec('e6', 'entry', 6, wrongAad)]));
    const client = await connectIntegration({ accessString: creds.accessString, fetch });
    const summary = await client.sync();
    expect(summary).toEqual({ fetched: 6, skipped: 4, pages: 1 }); // ungültiges Schema (e5) zeigt erst der Schnappschuss
    const snap = client.snapshot();
    expect(snap.entries.map((e) => e.id)).toEqual([U('e1')]);
    const reasons = Object.fromEntries(snap.skipped.map((s) => [s.recordId, s.reason]));
    expect(reasons).toEqual({ e2: 'decrypt-failed', e3: 'decrypt-failed', e4: 'epoch-mismatch', e6: 'decrypt-failed', e5: 'invalid' });
  });

  it('Cursor rückt erst nach dem Anwenden vor; ein Fehler auf Seite 2 lässt die Anfrage ab Seite 2 wiederholen', async () => {
    const { creds, enc } = await setup();
    const p1 = page(creds, [rec('e1', 'entry', 1, await enc('e1', 'entry', entry('e1')))], { hasMore: true });
    const p2 = page(creds, [rec('e2', 'entry', 2, await enc('e2', 'entry', entry('e2', '2026-03-02T08:00:00.000Z')))]);
    const sinces: number[] = [];
    let fail = true;
    const fetch: FetchLike = (url) => {
      const since = Number(/since=(\d+)/.exec(url)![1]);
      sinces.push(since);
      if (since === 0) return reply(200, p1);
      if (fail) {
        fail = false;
        return reply(500, {});
      }
      return reply(200, p2);
    };
    const client = await connectIntegration({ accessString: creds.accessString, fetch, pageSize: 1 });
    await expect(client.sync()).rejects.toMatchObject({ code: 'server-error', status: 500 });
    expect(client.snapshot().entries.map((e) => e.id)).toEqual([U('e1')]);
    await client.sync();
    expect(sinces).toEqual([0, 1, 1]);
    expect(client.snapshot().entries.map((e) => e.id)).toEqual([U('e1'), U('e2')]);
  });

  it('Gelöschte Records entfernen den Stand; ein später lesbarer Record entfernt den skipped-Eintrag', async () => {
    const { creds, enc } = await setup();
    const c1 = await enc('e1', 'entry', entry('e1'));
    const answers = [
      page(creds, [rec('e1', 'entry', 1, c1), rec('e2', 'entry', 2, 'kaputt')]),
      page(creds, [rec('e1', 'entry', 3, '', true), rec('e2', 'entry', 4, '', true)]),
    ];
    const client = await connectIntegration({ accessString: creds.accessString, fetch: () => reply(200, answers.shift()) });
    await client.sync();
    expect(client.snapshot().entries).toHaveLength(1);
    expect(client.snapshot().skipped.map((s) => s.recordId)).toEqual(['e2']);
    await client.sync();
    expect(client.snapshot().entries).toEqual([]);
    expect(client.snapshot().skipped).toEqual([]);
  });

  it('Schnappschuss ordnet Einträge nach Zeitpunkt (bei Gleichstand nach ID) und trennt die Arten', async () => {
    const { creds, enc } = await setup();
    const items = [entry('b', AT), entry('a', AT), entry('c', '2026-02-01T08:00:00.000Z')];
    const records = await Promise.all(items.map(async (e, i) => rec(e.id, 'entry', i + 1, await enc(e.id, 'entry', e))));
    records.push(rec('x1', 'savedFilter', 9, await enc('x1', 'savedFilter', { egal: 1 })));
    const client = await connectIntegration({ accessString: creds.accessString, fetch: () => reply(200, page(creds, records)) });
    await client.sync();
    const snap = client.snapshot();
    expect(snap.entries.map((e) => e.id)).toEqual([U('c'), U('a'), U('b')]);
    expect(snap.diary).toBeUndefined();
    expect(snap.templates).toEqual([]);
  });

  it('HTTP-Fehler werden unterschieden: 401, 403, 429 mit retry-after, ungültige Antwort, falsches Tagebuch, Netzwerk', async () => {
    const { creds } = await setup();
    const run = (fetch: FetchLike) => connectIntegration({ accessString: creds.accessString, fetch }).then((c) => c.sync());
    await expect(run(() => reply(401, {}))).rejects.toMatchObject({ code: 'unauthenticated', status: 401 });
    await expect(run(() => reply(403, {}))).rejects.toMatchObject({ code: 'forbidden', status: 403 });
    await expect(run(() => reply(429, {}, { 'retry-after': '12' }))).rejects.toMatchObject({ code: 'rate-limited', retryAfterSec: 12 });
    await expect(run(() => reply(429, {}))).rejects.toMatchObject({ code: 'rate-limited', retryAfterSec: undefined });
    await expect(run(() => reply(200, { unsinn: true }))).rejects.toMatchObject({ code: 'bad-response' });
    await expect(run(() => reply(200, page(creds, [], { diaryId: 'anderes' })))).rejects.toMatchObject({ code: 'bad-response' });
    const net = await run(() => Promise.reject(new TypeError('Failed to fetch'))).catch((e: unknown) => e);
    expect(net).toBeInstanceOf(IntegrationApiError);
    expect(net).toMatchObject({ code: 'network', message: 'Failed to fetch' });
    const nonError = await run(() => Promise.reject('kaputt')).catch((e: unknown) => e);
    expect(nonError).toMatchObject({ code: 'network' });
  });

  it('Der DK wird einmal entpackt und bei unverändertem Wrap wiederverwendet; ein falscher Wrap → unwrap-failed', async () => {
    const { creds, enc } = await setup();
    const p = page(creds, [rec('e1', 'entry', 1, await enc('e1', 'entry', entry('e1')))]);
    const client = await connectIntegration({ accessString: creds.accessString, fetch: () => reply(200, p) });
    await client.sync();
    await client.sync();
    expect(client.snapshot().entries).toHaveLength(1);
    const other = await createIntegrationCredentials(await generateDiaryKey(), { diaryId: D, keyEpoch: 1 });
    const wrong = await connectIntegration({ accessString: creds.accessString, fetch: () => reply(200, page(other, [])) });
    await expect(wrong.sync()).rejects.toMatchObject({ code: 'unwrap-failed' });
  });

  it('Standard-fetch: ohne eigene Funktion wird globalThis.fetch genutzt; ein Abbruchsignal wird durchgereicht', async () => {
    const { creds } = await setup();
    const original = globalThis.fetch;
    const ctl = new AbortController();
    let seen: AbortSignal | undefined;
    globalThis.fetch = (async (_u: string, init?: { signal?: AbortSignal }) => {
      seen = init?.signal;
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => page(creds, []) };
    }) as unknown as typeof fetch;
    try {
      await (await connectIntegration({ accessString: creds.accessString, signal: ctl.signal })).sync();
    } finally {
      globalThis.fetch = original;
    }
    expect(seen).toBe(ctl.signal);
  });
});
