// ARC-08: `@stb/client-sdk` gegen den In-Process-Server — anmelden (Zugangsstring), Pull in Seiten, Entschlüsseln, typisierte
// Einträge. Die Daten kommen von einem echten Gerät (Web-Datenschicht + Sync-Engine), der Server sieht nur Chiffretext.
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildExport, exportFixture, FIXTURE_EXPORT_NOW } from '@stb/export';
import { createIntegrationCredentials, generateDiaryKey, parseAccessString } from '@stb/crypto';
import { connectIntegration, IntegrationApiError, type FetchLike } from '@stb/client-sdk';
import { applyImport, collectExportSource, planImport } from '../../apps/web/src/data/import-export.js';
import { TEST_AUTH_HEADER } from '../../apps/server/src/auth/test-auth.js';
import { createDevice, fixture, startServer } from '../sync/harness.js';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0).reverse()) await c();
});

interface Call {
  url: string;
  headers: Record<string, string>;
}

/** `fetch` des SDK → `fastify.inject` (kein Netzwerk). */
function injectFetch(app: FastifyInstance, calls: Call[] = []): FetchLike {
  return async (input, init) => {
    const url = input.replace(/^https?:\/\/[^/]+/, '');
    calls.push({ url, headers: init?.headers ?? {} });
    const res = await app.inject({ method: (init?.method ?? 'GET') as 'GET', url, headers: init?.headers ?? {} });
    return {
      ok: res.statusCode < 400,
      status: res.statusCode,
      headers: { get: (n) => (res.headers[n.toLowerCase()] as string | undefined) ?? null },
      json: async () => res.json(),
    };
  };
}

const sinceOf = (c: Call) => Number(/since=(\d+)/.exec(c.url)![1]);

async function setup() {
  const f = await fixture();
  const source = exportFixture();
  const diaryId = source.diaries[0]!.id;
  const server = await startServer(diaryId);
  closers.push(server.close);
  server.db.prepare("INSERT INTO users (id, username, created_at) VALUES ('alice', 'alice', 0)").run(); // Integrationen gehören einem Konto
  const device = await createDevice({ app: server.app, user: 'alice', diaryId, dk: f.dk, clock: f.clock });
  closers.push(device.close);
  await applyImport(device.records, await planImport(device.records, buildExport(source, { appVersion: 't', now: FIXTURE_EXPORT_NOW }), { newId: f.newId }));
  await device.engine.sync();
  const owned = await collectExportSource(device.repo);

  const creds = await createIntegrationCredentials(f.dk, { diaryId, keyEpoch: 1 }, 'https://stb.example');
  const created = await server.app.inject({
    method: 'POST', url: `/api/v1/diaries/${diaryId}/integrations`, headers: { [TEST_AUTH_HEADER]: 'alice' },
    payload: { nameCt: 'ct', publicKey: creds.publicKey, tokenHash: creds.tokenHash, wrappedDk: JSON.stringify(creds.wrap), keyEpoch: 1 },
  });
  expect(created.statusCode).toBe(201);
  return { f, device, source: owned, diaryId, server, creds, integrationId: (created.json() as { id: string }).id };
}

const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => (a.id < b.id ? -1 : 1));

describe('client-sdk gegen den In-Process-Server', () => {
  it('ARC-08: anmelden, in Seiten pullen, entschlüsseln — Tagebuch, Vorlagen und Einträge kommen typisiert und unverändert an', async () => {
    const { source, diaryId, server, creds } = await setup();
    const calls: Call[] = [];
    const client = await connectIntegration({ accessString: creds.accessString, fetch: injectFetch(server.app, calls), pageSize: 2 });
    expect(client.diaryId).toBe(diaryId);
    expect(calls).toEqual([]); // anmelden = Zugangsstring prüfen, noch keine Anfrage

    const summary = await client.sync();
    expect(summary.pages).toBeGreaterThan(1);
    expect(summary.skipped).toBe(0);
    expect(calls.every((c) => c.headers.authorization === `Bearer ${creds.token}`)).toBe(true);
    // der Cursor steigt von Seite zu Seite
    const sinces = calls.map(sinceOf);
    expect(sinces[0]).toBe(0);
    expect(sinces).toEqual([...sinces].sort((a, b) => a - b));
    expect(new Set(sinces).size).toBe(sinces.length);

    const snap = client.snapshot();
    expect(snap.skipped).toEqual([]);
    expect(snap.diary).toEqual(source.diaries[0]);
    expect(byId(snap.templates)).toEqual(byId(source.templates));
    expect(snap.versions.map((v) => `${v.templateId}:${v.version}`).sort()).toEqual(source.versions.map((v) => `${v.templateId}:${v.version}`).sort());
    expect(byId(snap.entries)).toEqual(byId(source.entries));
    const times = snap.entries.map((e) => e.occurredAt);
    expect(times).toEqual([...times].sort()); // nach Zeitpunkt sortiert

    // zweiter Lauf: nur Abgleich ab dem Cursor, nichts Neues
    const again = await client.sync();
    expect(again.fetched).toBe(0);
    expect(client.snapshot().entries).toHaveLength(snap.entries.length);
  });

  it('ARC-08: gelöschte Einträge verschwinden beim nächsten Lauf; der Server speichert nur Chiffretext', async () => {
    const { f, device, source, server, creds, diaryId } = await setup();
    const client = await connectIntegration({ accessString: creds.accessString, fetch: injectFetch(server.app), pageSize: 3 });
    await client.sync();
    const before = client.snapshot().entries.length;

    const victim = (await device.repo.listEntries(diaryId))[0]!;
    await device.repo.deleteEntry(victim.id, { hlc: `${f.clock.now()}:0000:t`, updatedAt: new Date(f.clock.now()).toISOString() });
    await device.engine.sync();
    const res = await client.sync();
    expect(res.fetched).toBeGreaterThan(0);
    const after = client.snapshot();
    expect(after.entries).toHaveLength(before - 1);
    expect(after.entries.find((e) => e.id === victim.id)).toBeUndefined();

    const raw = JSON.stringify(server.db.prepare('SELECT ciphertext FROM records').all());
    expect(raw).not.toContain(source.diaries[0]!.name);
    expect(raw).not.toContain(victim.id);
  });

  it('ARC-08: Fehler sind unterscheidbar — widerrufen, beschädigter Zugangsstring, fehlende Server-Adresse, Netzwerk', async () => {
    const { server, creds, diaryId, integrationId } = await setup();
    const client = await connectIntegration({ accessString: creds.accessString, fetch: injectFetch(server.app) });
    await client.sync();
    const revoke = await server.app.inject({ method: 'DELETE', url: `/api/v1/diaries/${diaryId}/integrations/${integrationId}`, headers: { [TEST_AUTH_HEADER]: 'alice' } });
    expect(revoke.statusCode).toBe(204);
    await expect(client.sync()).rejects.toMatchObject({ code: 'unauthenticated', status: 401 });

    await expect(connectIntegration({ accessString: creds.accessString.slice(0, -2) })).rejects.toMatchObject({ code: 'invalid-access-string' });
    // Zugangsstring ohne Adresse und ohne baseUrl
    const bare = await createIntegrationCredentials(await generateDiaryKey(), { diaryId, keyEpoch: 1 });
    expect((await parseAccessString(bare.accessString)).origin).toBeUndefined();
    await expect(connectIntegration({ accessString: bare.accessString })).rejects.toMatchObject({ code: 'no-base-url' });
    const offline = await connectIntegration({
      accessString: bare.accessString,
      baseUrl: 'https://x.example/',
      fetch: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const err = await offline.sync().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(IntegrationApiError);
    expect(err).toMatchObject({ code: 'network' });
  });
});
