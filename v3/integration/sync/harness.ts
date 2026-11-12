// Test-Harness: echter Server (In-Memory-SQLite, fastify.inject) + Web-Datenschicht (fake-indexeddb) + Sync-Engine.
// Liegt außerhalb von apps/*, weil apps einander nicht importieren dürfen (Spec 01).
import 'fake-indexeddb/auto';
import type { FastifyInstance } from 'fastify';
import { createIdGenerator, type Clock } from '@stb/core';
import { generateDiaryKey } from '@stb/crypto';
import type { PullQuery, PushRequest } from '@stb/sync-protocol';
import { openDatabase, type Db } from '../../apps/server/src/db.js';
import { migrate } from '../../apps/server/src/schema.js';
import { buildApp } from '../../apps/server/src/app.js';
import { headerAuth, TEST_AUTH_HEADER } from '../../apps/server/src/auth/test-auth.js';
import { StbDb } from '../../apps/web/src/data/db.js';
import { plainCodec } from '../../apps/web/src/data/codec/plain.js';
import { createCodecRegistry } from '../../apps/web/src/data/codec/registry.js';
import { createRecordRepository } from '../../apps/web/src/data/repositories/records.js';
import { createDiaryRepository } from '../../apps/web/src/data/repositories/diary.js';
import { createSyncEngine } from '../../apps/web/src/sync/engine.js';
import type { SyncTransport } from '../../apps/web/src/sync/transport.js';

const serverConfig = { rpId: 'localhost', allowedOrigins: ['http://localhost:5173'], databasePath: ':memory:', blobDir: '.', port: 0, host: '127.0.0.1' };

export interface Wire {
  pushes: PushRequest[];
  pulls: PullQuery[];
  /** Simuliert Offline: jede Anfrage schlägt fehl. */
  offline: boolean;
}

export async function startServer(diaryId: string, users: string[] = ['alice']): Promise<{ app: FastifyInstance; db: Db; close(): Promise<void> }> {
  const db = openDatabase(':memory:');
  migrate(db);
  db.prepare('INSERT INTO diaries (id, created_at) VALUES (?, 0)').run(diaryId);
  for (const u of users) {
    db.prepare("INSERT INTO memberships (diary_id, principal_id, role, key_epoch, wrapped_dk, created_at) VALUES (?, ?, 'owner', 1, 'w', 0)").run(diaryId, u);
  }
  const app = buildApp({ config: serverConfig, db, auth: headerAuth });
  await app.ready();
  return { app, db, async close() { await app.close(); db.close(); } };
}

export function injectTransport(app: FastifyInstance, user: string, wire: Wire): SyncTransport {
  return {
    async push(req) {
      if (wire.offline) throw new TypeError('Failed to fetch');
      wire.pushes.push(JSON.parse(JSON.stringify(req)) as PushRequest);
      const res = await app.inject({ method: 'POST', url: '/api/v1/sync/push', headers: { [TEST_AUTH_HEADER]: user }, payload: req });
      if (res.statusCode !== 200) throw new Error(`push HTTP ${res.statusCode}`);
      return res.json();
    },
    async pull(q) {
      if (wire.offline) throw new TypeError('Failed to fetch');
      wire.pulls.push(q);
      const res = await app.inject({ method: 'GET', url: `/api/v1/sync/pull?diaryId=${q.diaryId}&since=${q.since}&limit=${q.limit}`, headers: { [TEST_AUTH_HEADER]: user } });
      if (res.statusCode !== 200) throw new Error(`pull HTTP ${res.statusCode}`);
      return res.json();
    },
  };
}

let dbCounter = 0;

/** Ein Gerät: eigene lokale DB, Repositories, Engine; alle Geräte eines Tests teilen DK und Server. */
export async function createDevice(opts: { app: FastifyInstance; user: string; diaryId: string; dk: CryptoKey; clock: Clock }) {
  const wire: Wire = { pushes: [], pulls: [], offline: false };
  const db = new StbDb(`stb-v3-int-${++dbCounter}`);
  await db.open();
  const registry = createCodecRegistry([plainCodec]);
  const records = createRecordRepository(db, { registry, writeCodec: 'plain', clock: opts.clock, outbox: true });
  const repo = createDiaryRepository(records);
  const engine = createSyncEngine({
    db, registry, transport: injectTransport(opts.app, opts.user, wire),
    keys: { get: async () => ({ key: opts.dk, keyEpoch: 1 }) },
    diaryIds: async () => [opts.diaryId],
  });
  return { db, repo, records, engine, wire, async close() { db.close(); await db.delete(); } };
}

export async function fixture() {
  let t = 1_700_000_000_000;
  const clock = { now: () => (t += 1000) };
  const { newId } = createIdGenerator(clock);
  const diaryId = newId();
  const dk = await generateDiaryKey();
  return { clock, newId, diaryId, dk };
}
