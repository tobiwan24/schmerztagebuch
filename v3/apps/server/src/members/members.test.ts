import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PushOp } from '@stb/sync-protocol';
import { openDatabase, type Db } from '../db.js';
import { migrate } from '../schema.js';
import { buildApp } from '../app.js';
import { headerAuth, TEST_AUTH_HEADER } from '../auth/test-auth.js';

const config = { rpId: 'localhost', allowedOrigins: ['http://localhost:5173'], databasePath: ':memory:', blobDir: '.', port: 0, host: '127.0.0.1' };
const D = 'diary-1';

let db: Db;
let app: FastifyInstance;

function member(principal: string, role: string) {
  db.prepare('INSERT INTO memberships (diary_id, principal_id, role, key_epoch, wrapped_dk, created_at) VALUES (?, ?, ?, 1, ?, 0)').run(D, principal, role, `w-${principal}`);
}

beforeEach(async () => {
  db = openDatabase(':memory:');
  migrate(db);
  db.prepare('INSERT INTO diaries (id, created_at) VALUES (?, 0)').run(D);
  member('olga', 'owner');
  member('ed', 'editor');
  member('vic', 'viewer');
  app = buildApp({ config, db, auth: headerAuth });
  await app.ready();
});
afterEach(async () => {
  await app.close();
  db.close();
});

const op = (recordId: string, kind: string, baseRev = 0): PushOp => ({ recordId, kind, baseRev, deleted: false, ciphertext: `ct-${recordId}` });
const as = (user: string) => ({ [TEST_AUTH_HEADER]: user });
const push = (user: string, ops: PushOp[]) => app.inject({ method: 'POST', url: '/api/v1/sync/push', headers: as(user), payload: { diaryId: D, ops } });
const pull = (user: string) => app.inject({ method: 'GET', url: `/api/v1/sync/pull?diaryId=${D}`, headers: as(user) });
const patchRole = (user: string, principal: string, role: string) =>
  app.inject({ method: 'PATCH', url: `/api/v1/diaries/${D}/members/${principal}`, headers: as(user), payload: { role } });
const remove = (user: string, principal: string) => app.inject({ method: 'DELETE', url: `/api/v1/diaries/${D}/members/${principal}`, headers: as(user) });

describe('Rollen beim Push', () => {
  it('SHR-05: viewer-Push wird mit 403 abgelehnt, viewer darf aber pullen', async () => {
    expect((await push('vic', [op('e1', 'entry')])).statusCode).toBe(403);
    expect((await pull('vic')).statusCode).toBe(200);
  });

  it('SHR-05: editor darf Einträge pushen', async () => {
    const r = await push('ed', [op('e1', 'entry'), op('a1', 'attachmentMeta')]);
    expect(r.statusCode).toBe(200);
    expect(r.json().results.map((x: { status: string }) => x.status)).toEqual(['applied', 'applied']);
  });

  it('SHR-05: editor darf keine Vorlagen (template/templateVersion) und keine Tagebuch-Einstellungen pushen', async () => {
    for (const kind of ['template', 'templateVersion', 'diary', 'intakeKey']) {
      const r = await push('ed', [op(`x-${kind}`, kind)]);
      expect(r.statusCode, kind).toBe(403);
    }
    // gemischter Push mit einer verbotenen Op wird komplett abgelehnt, nichts wird geschrieben
    expect((await push('ed', [op('e2', 'entry'), op('t2', 'template')])).statusCode).toBe(403);
    expect(db.prepare('SELECT COUNT(*) AS n FROM records').get()).toEqual({ n: 0 });
  });

  it('SHR-05: owner darf alle Arten pushen', async () => {
    const r = await push('olga', [op('t1', 'template'), op('v1', 'templateVersion'), op('e1', 'entry'), op('d1', 'diary')]);
    expect(r.statusCode).toBe(200);
  });
});

describe('Mitglieder verwalten', () => {
  it('SHR-06: letzter Owner kann sich nicht herabstufen', async () => {
    const r = await patchRole('olga', 'olga', 'editor');
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({ error: 'last-owner' });
  });

  it('SHR-06: letzter Owner kann nicht austreten', async () => {
    const r = await remove('olga', 'olga');
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({ error: 'last-owner' });
    expect((await pull('olga')).statusCode).toBe(200);
  });

  it('SHR-06: mit zweitem Owner darf ein Owner herabgestuft werden oder austreten', async () => {
    expect((await patchRole('olga', 'ed', 'owner')).statusCode).toBe(200);
    expect((await patchRole('ed', 'olga', 'viewer')).statusCode).toBe(200);
    expect((await patchRole('ed', 'ed', 'editor')).statusCode).toBe(409);
    expect((await patchRole('olga', 'olga', 'owner')).statusCode).toBe(403);
  });

  it('SHR-06: nur Owner ändern Rollen; Mitglieder dürfen nur selbst austreten', async () => {
    expect((await patchRole('ed', 'vic', 'editor')).statusCode).toBe(403);
    expect((await remove('ed', 'vic')).statusCode).toBe(403);
    expect((await remove('vic', 'vic')).statusCode).toBe(204);
    expect((await patchRole('olga', 'unbekannt', 'editor')).statusCode).toBe(404);
    expect((await patchRole('olga', 'ed', 'admin')).statusCode).toBe(400);
  });

  it('SHR-07: entferntes Mitglied erhält keine Records mehr und kann nicht pushen', async () => {
    await push('olga', [op('e1', 'entry')]);
    expect((await pull('ed')).json().records).toHaveLength(1);
    expect((await remove('olga', 'ed')).statusCode).toBe(204);
    expect((await pull('ed')).statusCode).toBe(403);
    expect((await push('ed', [op('e2', 'entry')])).statusCode).toBe(403);
    // erneutes Entfernen: nicht mehr Mitglied
    expect((await remove('olga', 'ed')).statusCode).toBe(404);
  });

  it('SHR-07: ausgetretenes Mitglied erhält keine Records mehr', async () => {
    expect((await remove('vic', 'vic')).statusCode).toBe(204);
    expect((await pull('vic')).statusCode).toBe(403);
  });
});
