// EXP-28: `apps/mcp` — die vier Tools über einen In-Process-MCP-Client gegen den Export-Fixture (echter In-Process-Server,
// echtes client-sdk). Nur lesend: keine Schreib-Tools, alle Tools mit `readOnlyHint`; der Server lehnt Schreiben ohnehin ab (CRY-24).
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildWorkingSet, applyFilter, createSearchIndex, periodStats, type NumericTarget } from '@stb/analysis';
import { buildExport, exportFixture, FIXTURE_EXPORT_NOW } from '@stb/export';
import { createIntegrationCredentials } from '@stb/crypto';
import { connectIntegration, type FetchLike } from '@stb/client-sdk';
import { createMcpServer } from '../../apps/mcp/src/server.js';
import { applyImport, planImport } from '../../apps/web/src/data/import-export.js';
import { TEST_AUTH_HEADER } from '../../apps/server/src/auth/test-auth.js';
import { createDevice, fixture, startServer } from '../sync/harness.js';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0).reverse()) await c();
});

function injectFetch(app: FastifyInstance): FetchLike {
  return async (input, init) => {
    const res = await app.inject({ method: (init?.method ?? 'GET') as 'GET', url: input.replace(/^https?:\/\/[^/]+/, ''), headers: init?.headers ?? {} });
    return { ok: res.statusCode < 400, status: res.statusCode, headers: { get: (n) => (res.headers[n.toLowerCase()] as string | undefined) ?? null }, json: async () => res.json() };
  };
}

const NOW = Date.parse('2026-02-15T12:00:00.000Z');

async function setup() {
  const f = await fixture();
  const source = exportFixture();
  const diaryId = source.diaries[0]!.id;
  const server = await startServer(diaryId);
  closers.push(server.close);
  server.db.prepare("INSERT INTO users (id, username, created_at) VALUES ('alice', 'alice', 0)").run();
  const device = await createDevice({ app: server.app, user: 'alice', diaryId, dk: f.dk, clock: f.clock });
  closers.push(device.close);
  await applyImport(device.records, await planImport(device.records, buildExport(source, { appVersion: 't', now: FIXTURE_EXPORT_NOW }), { newId: f.newId }));
  await device.engine.sync();

  const creds = await createIntegrationCredentials(f.dk, { diaryId, keyEpoch: 1 }, 'https://stb.example');
  const created = await server.app.inject({
    method: 'POST', url: `/api/v1/diaries/${diaryId}/integrations`, headers: { [TEST_AUTH_HEADER]: 'alice' },
    payload: { nameCt: 'ct', publicKey: creds.publicKey, tokenHash: creds.tokenHash, wrappedDk: JSON.stringify(creds.wrap), keyEpoch: 1 },
  });
  const integrationId = (created.json() as { id: string }).id;

  const sdk = await connectIntegration({ accessString: creds.accessString, fetch: injectFetch(server.app) });
  const mcp = createMcpServer({ client: sdk, now: () => NOW, syncIntervalMs: 0 });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([mcp.connect(a), client.connect(b)]);
  closers.push(async () => { await client.close(); });

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as { type: string; text: string }[])[0]!.text;
    return { isError: r.isError === true, text, data: r.isError ? null : (JSON.parse(text) as Record<string, any>) }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  // Erwartung direkt aus dem Fixture (ohne MCP, ohne Verschlüsselung)
  const ws = buildWorkingSet({ entries: source.entries, templates: source.templates, versions: source.versions, diaries: source.diaries });
  return { client, call, source, ws, diaryId, server, integrationId };
}

describe('apps/mcp (stdio-Server, hier über InMemoryTransport)', () => {
  it('EXP-28: genau vier Tools, alle nur lesend — es gibt kein Schreib-Tool', async () => {
    const { client } = await setup();
    const tools = (await client.listTools()).tools;
    expect(tools.map((t) => t.name).sort()).toEqual(['get_entry', 'list_diaries', 'search_entries', 'stats']);
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint, t.name).toBe(true);
      expect(t.annotations?.destructiveHint, t.name).toBe(false);
    }
  });

  it('EXP-28: list_diaries liefert Tagebuch, Vorlagen, Anzahl und Zeitraum des Fixtures', async () => {
    const { call, source, ws, diaryId } = await setup();
    const { data } = await call('list_diaries');
    const d = data!['diaries'][0];
    expect(d.id).toBe(diaryId);
    expect(d.name).toBe(source.diaries[0]!.name);
    expect(d.entryCount).toBe(ws.entries.length);
    expect(d.templates.map((t: { id: string }) => t.id).sort()).toEqual(source.templates.map((t) => t.id).sort());
    const days = ws.entries.map((e) => e.day).sort();
    expect([d.firstDay, d.lastDay]).toEqual([days[0], days.at(-1)]);
    expect(data!['notReadable']).toBe(0);
  });

  it('EXP-28: search_entries — alle, nach Text (Umlaut-tolerant), Zeitraum, Tag, Limit; Eingaben werden geprüft', async () => {
    const { call, client, ws, source, diaryId } = await setup();
    const all = (await call('search_entries')).data!;
    expect(all['total']).toBe(ws.entries.length);
    expect(all['entries'].map((e: { id: string }) => e.id)).toEqual(ws.entries.slice(0, 20).map((e) => e.id)); // neueste zuerst

    const text = (await call('search_entries', { text: 'uebelkeit' })).data!;
    const idx = createSearchIndex(ws);
    const expected = applyFilter(ws, { diaryIds: [diaryId], range: { preset: 'all' }, text: 'uebelkeit' }, { now: NOW, search: (t) => idx.search(t) });
    expect(expected.length).toBeGreaterThan(0);
    expect(text['entries'].map((e: { id: string }) => e.id)).toEqual(expected.map((e) => e.id));

    const range = (await call('search_entries', { from: '2026-02-03', to: '2026-02-04' })).data!;
    expect(range['entries'].every((e: { day: string }) => e.day >= '2026-02-03' && e.day <= '2026-02-04')).toBe(true);
    expect(range['total']).toBe(ws.entries.filter((e) => e.day >= '2026-02-03' && e.day <= '2026-02-04').length);

    const tagged = (await call('search_entries', { tags: ['arbeit'] })).data!;
    expect(tagged['total']).toBe(source.entries.filter((e) => e.tags.includes('arbeit')).length);

    const limited = (await call('search_entries', { limit: 2 })).data!;
    expect(limited).toMatchObject({ total: ws.entries.length, returned: 2 });

    expect((await call('search_entries', { from: '2026-02-03' })).isError).toBe(true);
    expect((await call('search_entries', { from: '2026-02-05', to: '2026-02-03' })).isError).toBe(true);
    // Argumente außerhalb des Schemas (limit > 100) werden abgelehnt, der Server bleibt benutzbar
    const bad = await client.callTool({ name: 'search_entries', arguments: { limit: 1000 } }).catch(() => ({ isError: true }));
    expect(bad.isError).toBe(true);
    expect((await call('list_diaries')).isError).toBe(false);
  });

  it('EXP-28: get_entry liefert Felder mit Beschriftung und Wert; unbekannte ID ist ein Fehler', async () => {
    const { call, source, ws } = await setup();
    const target = ws.entries.find((e) => e.tags.includes('arbeit'))!;
    const { data } = await call('get_entry', { id: target.id });
    expect(data).toMatchObject({ id: target.id, occurredAt: target.occurredAt, tags: ['arbeit'], source: 'app' });
    expect(data!['fields'].map((f: { label: string; value: string }) => [f.label, f.value])).toEqual(target.fields.map((f) => [f.label, f.display]));
    expect(JSON.stringify(data)).toContain('Übelkeit'); // Freitext kommt entschlüsselt an
    expect(source.entries.some((e) => e.id === target.id)).toBe(true);
    const missing = await call('get_entry', { id: 'gibt-es-nicht' });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain('Kein Eintrag');
  });

  it('EXP-28: stats entspricht periodStats der Analyse (Standard: outcome, 30 Tage bis heute) samt Vorperiode und Hinweis', async () => {
    const { call, ws } = await setup();
    const target: NumericTarget = { role: 'outcome' };
    const { data } = await call('stats');
    expect(data!['range']).toEqual({ from: '2026-01-17', to: '2026-02-15' });
    expect(data!['current']).toEqual(JSON.parse(JSON.stringify(periodStats(ws.entries, target, { from: '2026-01-17', to: '2026-02-15' }))));
    expect(data!['current'].n).toBeGreaterThan(0);
    expect(data!['previousRange']).toEqual({ from: '2025-12-18', to: '2026-01-16' });
    expect(data!['note']).toContain('keine Diagnose');
    expect(data!['fewData']).toBe(true);

    const custom = (await call('stats', { from: '2026-02-01', to: '2026-02-28', threshold: 6 })).data!;
    expect(custom['current']).toEqual(JSON.parse(JSON.stringify(periodStats(ws.entries, target, { from: '2026-02-01', to: '2026-02-28' }, { threshold: 6 }))));
    expect(custom['current'].daysAtOrAbove).toBeGreaterThanOrEqual(1);
    expect((await call('stats', { from: '2026-03-01', to: '2026-02-01' })).isError).toBe(true);
  });

  it('EXP-28: nach dem Widerruf melden die Tools verständlich, dass der Zugang ungültig ist', async () => {
    const { call, server, diaryId, integrationId } = await setup();
    expect((await call('list_diaries')).isError).toBe(false);
    const revoke = await server.app.inject({ method: 'DELETE', url: `/api/v1/diaries/${diaryId}/integrations/${integrationId}`, headers: { [TEST_AUTH_HEADER]: 'alice' } });
    expect(revoke.statusCode).toBe(204);
    const r = await call('list_diaries');
    expect(r.isError).toBe(true);
    expect(r.text).toContain('widerrufen');
  });
});
