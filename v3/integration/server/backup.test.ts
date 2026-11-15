// Server-Backup (Spec 12 „Betrieb", QA-09): Snapshot per VACUUM INTO + Blob-Verzeichnis, Einspielen in einen frischen Server.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { openDatabase, type Db } from '../../apps/server/src/db.js';
import { migrate } from '../../apps/server/src/schema.js';
import { buildApp } from '../../apps/server/src/app.js';
import { headerAuth, TEST_AUTH_HEADER } from '../../apps/server/src/auth/test-auth.js';
import { createBackup, restoreBackup } from '../../apps/server/src/backup.js';

const D = 'diary-1';
const as = { [TEST_AUTH_HEADER]: 'olga' };
const dirs: string[] = [];
const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of cleanup.splice(0)) await c();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'stb-backup-'));
  dirs.push(d);
  return d;
}

async function server(dbPath: string, blobDir: string, seed: boolean): Promise<{ app: FastifyInstance; db: Db }> {
  const db = openDatabase(dbPath);
  migrate(db);
  if (seed) {
    db.prepare('INSERT INTO diaries (id, created_at) VALUES (?, 0)').run(D);
    db.prepare("INSERT INTO memberships (diary_id, principal_id, role, key_epoch, wrapped_dk, created_at) VALUES (?, 'olga', 'owner', 1, 'w', 0)").run(D);
  }
  const app = buildApp({ config: { rpId: 'localhost', allowedOrigins: ['http://localhost'], databasePath: dbPath, blobDir, port: 0, host: '127.0.0.1' }, db, auth: headerAuth });
  await app.ready();
  cleanup.push(async () => {
    await app.close();
    db.close();
  });
  return { app, db };
}

const push = (app: FastifyInstance, ids: string[]) =>
  app.inject({ method: 'POST', url: '/api/v1/sync/push', headers: as, payload: { diaryId: D, ops: ids.map((recordId) => ({ recordId, kind: 'entry', baseRev: 0, deleted: false, ciphertext: `ct-${recordId}` })) } });
const pull = async (app: FastifyInstance) => (await app.inject({ method: 'GET', url: `/api/v1/sync/pull?diaryId=${D}`, headers: as })).json() as { records: { recordId: string; rev: number; ciphertext: string }[] };

describe('Server-Backup', () => {
  it('QA-09: Backup-Skript erzeugt einen konsistenten Snapshot, der sich in einen frischen Server einspielen lässt', async () => {
    const a = tmp();
    const { app, db } = await server(join(a, 'stb.sqlite'), join(a, 'blobs'), true);
    expect((await push(app, ['e1', 'e2', 'e3'])).statusCode).toBe(200);
    expect((await app.inject({ method: 'PUT', url: `/api/v1/blobs/att-1?diaryId=${D}`, headers: { ...as, 'content-type': 'text/plain' }, payload: 'AQAAAAFCHIFFRE' })).statusCode).toBe(201);
    const before = await pull(app);

    const out = join(tmp(), 'backup-1');
    const r = createBackup(db, join(a, 'blobs'), out);
    // Nach dem Snapshot Geschriebenes gehört nicht dazu
    expect((await push(app, ['e4'])).statusCode).toBe(200);
    expect(() => createBackup(db, join(a, 'blobs'), out)).toThrow(/existiert bereits/);

    // frischer Server an anderem Ort
    const b = tmp();
    restoreBackup(r.dir, join(b, 'stb.sqlite'), join(b, 'blobs'));
    const restored = await server(join(b, 'stb.sqlite'), join(b, 'blobs'), false);
    expect(restored.db.pragma('integrity_check', { simple: true })).toBe('ok');
    const after = await pull(restored.app);
    expect(after.records).toEqual(before.records);
    expect(after.records.map((x) => x.recordId)).not.toContain('e4');
    const blob = await restored.app.inject({ method: 'GET', url: '/api/v1/blobs/att-1', headers: as });
    expect(blob.statusCode).toBe(200);
    expect(blob.body).toBe('AQAAAAFCHIFFRE');
    // der eingespielte Server arbeitet normal weiter
    expect((await push(restored.app, ['e5'])).statusCode).toBe(200);
  });
});
