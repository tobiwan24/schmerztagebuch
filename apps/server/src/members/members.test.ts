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
const patchFlag = (user: string, principal: string, canEditTemplates: boolean) =>
  app.inject({ method: 'PATCH', url: `/api/v1/diaries/${D}/members/${principal}`, headers: as(user), payload: { canEditTemplates } });
const remove = (user: string, principal: string) => app.inject({ method: 'DELETE', url: `/api/v1/diaries/${D}/members/${principal}`, headers: as(user) });

describe('Rollen beim Push', () => {
  it('SHR-05: viewer-Push wird mit 403 abgelehnt, viewer darf aber pullen', async () => {
    expect((await push('vic', [op('e1', 'entry')])).statusCode).toBe(403);
    expect((await pull('vic')).statusCode).toBe(200);
  });

  it('SHR-05: editor darf Einträge pushen', async () => {
    const r = await push('ed', [op('e1', 'entry'), op('a1', 'attachmentMeta'), op('k1', 'intakeKey')]);
    expect(r.statusCode).toBe(200);
    expect(r.json().results.map((x: { status: string }) => x.status)).toEqual(['applied', 'applied', 'applied']);
  });

  it('SHR-05: editor darf keine Vorlagen (template/templateVersion) und keine Tagebuch-Einstellungen pushen', async () => {
    for (const kind of ['template', 'templateVersion', 'diary', 'savedFilter']) {
      const r = await push('ed', [op(`x-${kind}`, kind)]);
      expect(r.statusCode, kind).toBe(403);
    }
    // gemischter Push mit einer verbotenen Op wird komplett abgelehnt, nichts wird geschrieben
    expect((await push('ed', [op('e2', 'entry'), op('t2', 'template')])).statusCode).toBe(403);
    expect(db.prepare('SELECT COUNT(*) AS n FROM records').get()).toEqual({ n: 0 });
  });

  it('SYN-19: ein Editor darf kein `dashboard` pushen (403, nichts geschrieben), der Owner schon', async () => {
    expect((await push('ed', [op('dash-1', 'dashboard')])).statusCode).toBe(403);
    expect((await push('vic', [op('dash-1', 'dashboard')])).statusCode).toBe(403);
    expect(db.prepare('SELECT COUNT(*) AS n FROM records').get()).toEqual({ n: 0 });
    const r = await push('olga', [op('dash-1', 'dashboard')]);
    expect(r.statusCode).toBe(200);
    expect(r.json().results[0].status).toBe('applied');
    expect((await pull('ed')).json().records.map((x: { recordId: string }) => x.recordId)).toContain('dash-1');
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

describe('Mitgliederliste', () => {
  it('liefert aktiven Mitgliedern Rolle, Benutzername und Identity-Key; Fremde und Entfernte bekommen 403', async () => {
    db.prepare("INSERT INTO users (id, username, created_at) VALUES ('olga', 'olga-name', 0)").run();
    db.prepare("INSERT INTO user_keys (user_id, kind, credential_id, blob) VALUES ('olga', 'identity-pub', '', 'pub-olga')").run();
    const list = await app.inject({ method: 'GET', url: `/api/v1/diaries/${D}/members`, headers: as('vic') });
    expect(list.statusCode).toBe(200);
    expect(list.headers['cache-control']).toBe('no-store');
    expect(list.json()).toEqual([
      { principalId: 'olga', role: 'owner', canEditTemplates: false, username: 'olga-name', identityPub: 'pub-olga' },
      { principalId: 'ed', role: 'editor', canEditTemplates: false, username: 'ed', identityPub: null },
      { principalId: 'vic', role: 'viewer', canEditTemplates: false, username: 'vic', identityPub: null },
    ]);
    expect((await app.inject({ method: 'GET', url: `/api/v1/diaries/${D}/members`, headers: as('mallory') })).statusCode).toBe(403);
    expect((await remove('olga', 'ed')).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/v1/diaries/${D}/members`, headers: as('ed') })).statusCode).toBe(403);
  });
});

describe('Flag canEditTemplates (SHR-14)', () => {
  it('SHR-14: ohne Flag 403, mit Flag darf der Editor template/templateVersion pushen, nicht diary/savedFilter/dashboard', async () => {
    expect((await push('ed', [op('t1', 'template')])).statusCode).toBe(403);
    expect((await patchFlag('olga', 'ed', true)).statusCode).toBe(200);
    const ok = await push('ed', [op('t1', 'template'), op('v1', 'templateVersion'), op('e1', 'entry')]);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().results.map((x: { status: string }) => x.status)).toEqual(['applied', 'applied', 'applied']);
    for (const kind of ['diary', 'savedFilter', 'dashboard', 'notificationRule']) {
      expect((await push('ed', [op(`x-${kind}`, kind)])).statusCode, kind).toBe(403);
    }
    // Entzug wirkt sofort
    expect((await patchFlag('olga', 'ed', false)).statusCode).toBe(200);
    expect((await push('ed', [op('t2', 'template')])).statusCode).toBe(403);
  });

  it('SHR-14: nur der Owner setzt das Flag, nur für Editoren; Viewer und Fremde bekommen es nie', async () => {
    expect((await patchFlag('ed', 'ed', true)).statusCode).toBe(403);
    expect((await patchFlag('vic', 'ed', true)).statusCode).toBe(403);
    expect((await patchFlag('olga', 'vic', true)).statusCode).toBe(409);
    expect((await patchFlag('olga', 'olga', true)).statusCode).toBe(409);
    expect((await patchFlag('olga', 'nobody', true)).statusCode).toBe(404);
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/diaries/${D}/members/ed`, headers: as('olga'), payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/diaries/${D}/members/ed`, headers: as('olga'), payload: { canEditTemplates: 'ja' } })).statusCode).toBe(400);
    expect(db.prepare("SELECT can_edit_templates AS f FROM memberships WHERE principal_id IN ('ed','vic','olga')").all()).toEqual([{ f: 0 }, { f: 0 }, { f: 0 }]);
  });

  it('SHR-14: Rollenwechsel setzt das Flag zurück; Flag erscheint in der Mitgliederliste', async () => {
    await patchFlag('olga', 'ed', true);
    const list = async () => (await app.inject({ method: 'GET', url: `/api/v1/diaries/${D}/members`, headers: as('olga') })).json() as { principalId: string; canEditTemplates: boolean }[];
    expect((await list()).find((m) => m.principalId === 'ed')?.canEditTemplates).toBe(true);
    // gleiche Rolle erneut setzen lässt das Flag unberührt
    expect((await patchRole('olga', 'ed', 'editor')).statusCode).toBe(200);
    expect((await list()).find((m) => m.principalId === 'ed')?.canEditTemplates).toBe(true);
    // Herabstufen und wieder zum Editor machen: Flag ist weg (Owner muss es neu erteilen)
    await patchRole('olga', 'ed', 'viewer');
    await patchRole('olga', 'ed', 'editor');
    expect((await list()).find((m) => m.principalId === 'ed')?.canEditTemplates).toBe(false);
    expect((await push('ed', [op('t3', 'template')])).statusCode).toBe(403);
  });

  it('SHR-14: Migration auf einer alten Datenbank (Schema 11) ergänzt die Spalte mit Standard 0', () => {
    const old = openDatabase(':memory:');
    migrate(old);
    old.exec('ALTER TABLE memberships DROP COLUMN can_edit_templates; ALTER TABLE intake_keys DROP COLUMN manifest');
    old.pragma('user_version = 11');
    old.prepare('INSERT INTO diaries (id, created_at) VALUES (?, 0)').run('x');
    old.prepare("INSERT INTO memberships (diary_id, principal_id, role, key_epoch, wrapped_dk, created_at) VALUES ('x', 'ed', 'editor', 1, 'w', 0)").run();
    migrate(old);
    expect(old.prepare("SELECT can_edit_templates AS f FROM memberships WHERE principal_id = 'ed'").get()).toEqual({ f: 0 });
    old.close();
  });
});
