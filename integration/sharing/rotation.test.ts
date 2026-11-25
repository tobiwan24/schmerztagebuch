// SHR-13 (Client-Seite der DK-Rotation, A-119): echter Server (fastify.inject) + Sync-Engine + `rotateDiary`.
// Prüft zwei Epochen in der Sitzung, `409 stale-epoch` → neuen Wrap holen → erneut verschlüsseln, Fortsetzen nach Abbruch
// (Fehlerinjektion an jedem Transportaufruf) und dass ein entferntes Mitglied nichts Neues bekommt.
import { describe, it, expect, afterEach } from 'vitest';
import { createTemplate, keyBetween, type BlockDef, type Entry } from '@stb/core';
import { decryptRecord, encryptRecord, exportPublicKey, generateDiaryKey, generateIdentityEcdhKeyPair, parseEnvelope, wrapDkForMember } from '@stb/crypto';
import { TEST_AUTH_HEADER } from '../../apps/server/src/auth/test-auth.js';
import { encodeDkWrap } from '../../apps/web/src/auth/account-api.js';
import { loadDiaryKeys } from '../../apps/web/src/sharing/epoch-keys.js';
import { RotationApiError, type RotationApi } from '../../apps/web/src/sharing/rotation-api.js';
import { rotateDiary, type RotationDeps } from '../../apps/web/src/sharing/rotate.js';
import { EpochKeyError, type DiaryKeyProvider } from '../../apps/web/src/sync/engine.js';
import type { SyncTransport } from '../../apps/web/src/sync/transport.js';
import { createDevice, fixture, injectTransport, startServer, type Wire } from '../sync/harness.js';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0).reverse()) await c();
});

type Server = Awaited<ReturnType<typeof startServer>>;
interface Person {
  name: string;
  identity: CryptoKeyPair;
  pub: string;
}
type RotationKeys = RotationDeps['keys'];

async function person(name: string): Promise<Person> {
  const identity = await generateIdentityEcdhKeyPair();
  return { name, identity, pub: await exportPublicKey(identity.publicKey) };
}

/** Sitzungs-Schlüssel eines Geräts wie in `SyncContext`: aktueller + vorheriger DK, `refresh` lädt vom Server (Wrap + Rotationszustand). */
function session(server: Server, who: Person, initial: { key: CryptoKey; keyEpoch: number }) {
  let cur = initial;
  let prev: { key: CryptoKey; keyEpoch: number } | undefined;
  let refreshes = 0;
  const provider: DiaryKeyProvider & RotationKeys = {
    async get() {
      return cur;
    },
    async forEpoch(_id, epoch) {
      return cur.keyEpoch === epoch ? cur.key : prev?.keyEpoch === epoch ? prev.key : undefined;
    },
    async refresh(id) {
      refreshes++;
      const loaded = await loadDiaryKeys(
        {
          membership: async () => {
            const row = server.db
              .prepare('SELECT key_epoch, wrapped_dk FROM memberships WHERE diary_id = ? AND principal_id = ? AND revoked_at IS NULL')
              .get(id, who.name) as { key_epoch: number; wrapped_dk: string } | undefined;
            return row ? { keyEpoch: row.key_epoch, wrappedDk: row.wrapped_dk } : undefined;
          },
          rotation: async (i) => (await server.app.inject({ method: 'GET', url: `/api/v1/diaries/${i}/rotation`, headers: { [TEST_AUTH_HEADER]: who.name } })).json(),
        },
        who.identity,
        id,
      );
      if (!loaded) throw new Error('keine Mitgliedschaft');
      cur = { key: loaded.key, keyEpoch: loaded.keyEpoch };
      prev = loaded.previous;
    },
  };
  return { provider, refreshes: () => refreshes, epoch: () => cur.keyEpoch };
}

function rotationApi(server: Server, user: string): RotationApi {
  const h = { [TEST_AUTH_HEADER]: user };
  async function call<T>(method: 'GET' | 'POST', url: string, payload?: object): Promise<T> {
    const r = await server.app.inject({ method, url, headers: h, ...(payload ? { payload } : {}) });
    if (r.statusCode !== 200) throw new RotationApiError(r.statusCode, (r.json() as { error?: string }).error ?? `http-${r.statusCode}`);
    return r.json() as T;
  }
  return {
    state: (id) => call('GET', `/api/v1/diaries/${id}/rotation`),
    rotate: (id, body) => call('POST', `/api/v1/diaries/${id}/rotate`, body),
    complete: (id) => call('POST', `/api/v1/diaries/${id}/rotate/complete`),
  };
}

async function setup() {
  const f = await fixture();
  const olga = await person('olga');
  const bob = await person('bob');
  const eve = await person('eve');
  const server = await startServer(f.diaryId, ['olga']);
  const wrapFor = async (p: Person) => encodeDkWrap(await wrapDkForMember(f.dk, p.identity.publicKey, { diaryId: f.diaryId, keyEpoch: 1 }));
  server.db.prepare("UPDATE memberships SET wrapped_dk = ? WHERE principal_id = 'olga'").run(await wrapFor(olga));
  const add = async (p: Person, role: string, revoked: boolean) =>
    server.db
      .prepare('INSERT INTO memberships (diary_id, principal_id, role, key_epoch, wrapped_dk, created_at, revoked_at) VALUES (?, ?, ?, 1, ?, 0, ?)')
      .run(f.diaryId, p.name, role, await wrapFor(p), revoked ? 5 : null);
  await add(bob, 'editor', false);
  await add(eve, 'editor', true); // schon entfernt

  const sOlga = session(server, olga, { key: f.dk, keyEpoch: 1 });
  const sBob = session(server, bob, { key: f.dk, keyEpoch: 1 });
  const a = await createDevice({ app: server.app, user: 'olga', diaryId: f.diaryId, dk: f.dk, clock: f.clock, keys: sOlga.provider });
  const b = await createDevice({ app: server.app, user: 'bob', diaryId: f.diaryId, dk: f.dk, clock: f.clock, keys: sBob.provider });
  const close = async () => {
    await a.close();
    await b.close();
    await server.close();
  };

  const pain: BlockDef = { id: f.newId(), type: 'slider', label: 'Schmerz', required: false, order: keyBetween(null, null), config: { min: 0, max: 10, step: 1 } };
  const note: BlockDef = { id: f.newId(), type: 'text', label: 'Notiz', required: false, order: keyBetween(pain.order, null), config: {} };
  const tpl = createTemplate({ id: f.newId(), diaryId: f.diaryId, name: 'T', order: 'V', blocks: [pain, note] }, f.clock);
  await a.repo.saveTemplate(tpl);
  const entries: Entry[] = [];
  for (let i = 0; i < 5; i++) {
    const now = new Date(f.clock.now()).toISOString();
    const e: Entry = {
      id: f.newId(), diaryId: f.diaryId, templateId: tpl.template.id, templateVersion: 1, occurredAt: now, recordedAt: now, updatedAt: now,
      authorId: 'olga', values: { [pain.id]: i, [note.id]: `Notiz ${i} äöü` }, tags: [], meta: { source: 'app', timezone: 'Europe/Berlin' }, hlc: a.hlc.tick(),
    };
    entries.push(e);
    await a.repo.saveEntry(e);
  }
  // Anhang: Metadaten-Record + verschlüsselter Inhalt (Epoche 1)
  const metaId = f.newId();
  const img = new Uint8Array([1, 2, 3, 4, 5, 250]);
  await a.records.put({ id: metaId, diaryId: f.diaryId, kind: 'attachmentMeta', payload: { id: metaId, diaryId: f.diaryId, entryId: entries[0]!.id, name: 'x.png', mime: 'image/png', size: 6, createdAt: new Date().toISOString() } });
  await a.engine.sync();
  await injectTransport(server.app, 'olga', { pushes: [], pulls: [], offline: false }).putBlob!(f.diaryId, metaId, await encryptRecord(f.dk, { diaryId: f.diaryId, kind: 'blob', recordId: metaId, keyEpoch: 1 }, img));
  // Übungsmedium (RDM-033): eigener Record-Kind, Inhalt wie ein Anhang als Blob
  const mediaId = f.newId();
  const clip = new Uint8Array([0, 0, 0, 32, 102, 116, 121, 112]);
  await a.records.put({ id: mediaId, diaryId: f.diaryId, kind: 'exerciseMedia', payload: { id: mediaId, diaryId: f.diaryId, templateId: tpl.template.id, kind: 'video', mime: 'video/mp4', name: 'v.mp4', sizeBytes: 8, createdAt: new Date().toISOString() } });
  await a.engine.sync();
  await injectTransport(server.app, 'olga', { pushes: [], pulls: [], offline: false }).putBlob!(f.diaryId, mediaId, await encryptRecord(f.dk, { diaryId: f.diaryId, kind: 'blob', recordId: mediaId, keyEpoch: 1 }, clip));
  await b.engine.sync();
  const recordIds = (server.db.prepare('SELECT id FROM records WHERE diary_id = ? ORDER BY id').all(f.diaryId) as { id: string }[]).map((r) => r.id);
  return { ...f, olga, bob, eve, server, sOlga, sBob, a, b, tpl, entries, pain, note, close, metaId, img, mediaId, clip, recordIds };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

function deps(c: Ctx, transport: SyncTransport, extra: Partial<RotationDeps> = {}): RotationDeps {
  return {
    api: rotationApi(c.server, 'olga'),
    transport,
    keys: c.sOlga.provider,
    members: async () => [{ principalId: 'olga', identityPub: c.olga.pub }, { principalId: 'bob', identityPub: c.bob.pub }],
    ...extra,
  };
}

const rows = (c: Ctx) => c.server.db.prepare('SELECT id AS record_id, kind, ciphertext FROM records WHERE diary_id = ?').all(c.diaryId) as { record_id: string; kind: string; ciphertext: string }[];
const wire = (): Wire => ({ pushes: [], pulls: [], offline: false });
const epochOf = (ciphertext: string) => parseEnvelope(ciphertext).keyEpoch;

/** Jeder Record ist in seiner Epoche mit dem passenden Schlüssel lesbar (Klartext-JSON). */
async function allReadable(c: Ctx, keys: Record<number, CryptoKey>) {
  for (const r of rows(c)) {
    const epoch = epochOf(r.ciphertext);
    const plain = await decryptRecord(keys[epoch]!, { diaryId: c.diaryId, kind: r.kind, recordId: r.record_id, keyEpoch: epoch }, r.ciphertext);
    expect(() => JSON.parse(new TextDecoder().decode(plain)), r.record_id).not.toThrow();
  }
}

class Crash extends Error {}
/** Transport mit Absturz beim n-ten Aufruf, vor oder nach der Wirkung beim Server. */
function faulty(inner: SyncTransport, fault: { at: number; when: 'before' | 'after' } | undefined) {
  let calls = 0;
  const hit = async <T>(run: () => Promise<T>): Promise<T> => {
    calls++;
    const f = fault?.at === calls;
    if (f && fault.when === 'before') throw new Crash();
    const out = await run();
    if (f && fault.when === 'after') throw new Crash();
    return out;
  };
  const transport: SyncTransport = {
    push: (r) => hit(() => inner.push(r)),
    pull: (q) => hit(() => inner.pull(q)),
    putBlob: (d, i, c) => hit(() => inner.putBlob!(d, i, c)),
    getBlob: (i) => hit(() => inner.getBlob!(i)),
  };
  return { transport, calls: () => calls };
}

describe('DK-Rotation: Client (SHR-13)', () => {
  it('SHR-13: Rotation stellt alle Records und Anhänge um, Fortschritt wird gemeldet, Server schließt ab', async () => {
    const c = await setup();
    closers.push(c.close);
    const { img, metaId } = c;

    const progress: string[] = [];
    const out = await rotateDiary(deps(c, injectTransport(c.server.app, 'olga', wire()), { onProgress: (p) => progress.push(`${p.phase}:${p.done}/${p.total}`) }), c.diaryId);
    expect(out).toEqual({ status: 'done', keyEpoch: 2 });
    expect(progress[0]).toMatch(/^start:0\/\d+$/);
    expect(progress.at(-1)).toMatch(/^complete:/);
    expect(c.server.db.prepare('SELECT key_epoch, rotation_from FROM diaries WHERE id = ?').get(c.diaryId)).toEqual({ key_epoch: 2, rotation_from: null });
    const cur = await c.sOlga.provider.get(c.diaryId);
    expect(cur.keyEpoch).toBe(2);
    expect(rows(c).every((r) => epochOf(r.ciphertext) === 2)).toBe(true);
    await allReadable(c, { 2: cur.key });
    const stored = await injectTransport(c.server.app, 'olga', wire()).getBlob!(metaId);
    expect([...(await decryptRecord(cur.key, { diaryId: c.diaryId, kind: 'blob', recordId: metaId, keyEpoch: 2 }, stored!))]).toEqual([...img]);
    // Übungsmedien-Blobs werden ebenso umgestellt (RDM-033)
    const clip = await injectTransport(c.server.app, 'olga', wire()).getBlob!(c.mediaId);
    expect([...(await decryptRecord(cur.key, { diaryId: c.diaryId, kind: 'blob', recordId: c.mediaId, keyEpoch: 2 }, clip!))]).toEqual([...c.clip]);
    // lokal bleibt alles lesbar
    expect((await c.a.repo.getEntry(c.entries[2]!.id))?.values[c.note.id]).toBe('Notiz 2 äöü');
  });

  it('SHR-13: das verbleibende Mitglied synchronisiert nach der Rotation weiter (neuer Wrap, 409 stale-epoch → neu verschlüsselt)', async () => {
    const c = await setup();
    closers.push(c.close);
    // Bob hat eine lokale Änderung offen, bevor er von der Rotation erfährt
    await c.b.repo.saveEntry({ ...(await c.b.repo.getEntry(c.entries[1]!.id))!, values: { [c.pain.id]: 9, [c.note.id]: 'Bob nachher' }, hlc: c.b.hlc.tick() });
    expect(await rotateDiary(deps(c, injectTransport(c.server.app, 'olga', wire())), c.diaryId)).toMatchObject({ status: 'done' });
    expect(c.sBob.epoch()).toBe(1);

    // Bob pusht mit dem alten Schlüssel → 409, holt den neuen Wrap, verschlüsselt neu, sendet erneut
    await c.b.engine.sync();
    expect(c.sBob.epoch()).toBe(2);
    expect(c.sBob.refreshes()).toBeGreaterThan(0);
    expect(await c.b.db.outbox.count()).toBe(0);
    await c.a.engine.sync();
    expect((await c.a.repo.getEntry(c.entries[1]!.id))?.values[c.note.id]).toBe('Bob nachher');
    expect(rows(c).every((r) => epochOf(r.ciphertext) === 2)).toBe(true);
  });

  it('SHR-13: Mitglied liest während der Rotation beide Epochen (neuer Wrap + vorheriger DK), nichts landet in der Quarantäne', async () => {
    const c = await setup();
    closers.push(c.close);
    // Rotation nur starten (Abbruch beim ersten Transportaufruf), die Records bleiben zunächst in Epoche 1
    const f = faulty(injectTransport(c.server.app, 'olga', wire()), { at: 1, when: 'before' });
    await expect(rotateDiary(deps(c, f.transport), c.diaryId)).rejects.toBeInstanceOf(Crash);
    expect(c.server.db.prepare('SELECT rotation_from FROM diaries WHERE id = ?').get(c.diaryId)).toEqual({ rotation_from: 1 });
    // Olga schreibt in Epoche 2; Bob liest danach alles, auch die Records der Epoche 1
    await c.a.repo.saveEntry({ ...(await c.a.repo.getEntry(c.entries[0]!.id))!, values: { [c.pain.id]: 8, [c.note.id]: 'Olga neu' }, hlc: c.a.hlc.tick() });
    await c.a.engine.sync();
    await c.b.engine.sync();
    expect(c.sBob.epoch()).toBe(2);
    expect((await c.b.repo.getEntry(c.entries[0]!.id))?.values[c.note.id]).toBe('Olga neu');
    expect((await c.b.repo.getEntry(c.entries[3]!.id))?.values[c.note.id]).toBe('Notiz 3 äöü');
    expect(await c.b.db.records.where('[diaryId+kind]').equals([c.diaryId, 'syncQuarantine']).count()).toBe(0);
  });

  it('SHR-13: Fehlerinjektion — Abbruch an jedem Transportaufruf (vor/nach Serverwirkung), danach Fortsetzen nach „App-Neustart“ ohne Verlust', async () => {
    const probe = await setup();
    const counter = faulty(injectTransport(probe.server.app, 'olga', wire()), undefined);
    await rotateDiary(deps(probe, counter.transport), probe.diaryId);
    const total = counter.calls();
    expect(total).toBeGreaterThanOrEqual(4); // Pull, Push, Anhang laden, Anhang ersetzen
    await probe.close();

    for (let at = 1; at <= total; at++) {
      for (const when of ['before', 'after'] as const) {
        const c = await setup();
        try {
          const f = faulty(injectTransport(c.server.app, 'olga', wire()), { at, when });
          await rotateDiary(deps(c, f.transport), c.diaryId).catch((e: unknown) => {
            expect(e, `${at}/${when}`).toBeInstanceOf(Crash);
          });
          // nach dem Abbruch: alles lesbar (gemischte Epochen), nichts verloren
          const state = c.server.db.prepare('SELECT key_epoch FROM diaries WHERE id = ?').get(c.diaryId) as { key_epoch: number };
          const keys: Record<number, CryptoKey> = { 1: c.dk };
          if (state.key_epoch === 2) {
            await c.sOlga.provider.refresh(c.diaryId);
            keys[2] = (await c.sOlga.provider.get(c.diaryId)).key;
          }
          await allReadable(c, keys);
          expect(rows(c).map((r) => r.record_id).sort()).toEqual(c.recordIds);
          // „App-Neustart“: frische Sitzung nur mit dem gespeicherten (alten) Schlüssel, Fortsetzen
          const restarted = session(c.server, c.olga, { key: c.dk, keyEpoch: 1 });
          const out = await rotateDiary(deps(c, injectTransport(c.server.app, 'olga', wire()), { keys: restarted.provider }), c.diaryId);
          expect(out, `${at}/${when}`).toEqual({ status: 'done', keyEpoch: 2 });
          expect(rows(c).every((r) => epochOf(r.ciphertext) === 2)).toBe(true);
          const final = (await restarted.provider.get(c.diaryId)).key;
          await allReadable(c, { 2: final });
          const blob = await injectTransport(c.server.app, 'olga', wire()).getBlob!(c.metaId);
          expect([...(await decryptRecord(final, { diaryId: c.diaryId, kind: 'blob', recordId: c.metaId, keyEpoch: 2 }, blob!))], `${at}/${when}`).toEqual([...c.img]);
        } finally {
          await c.close();
        }
      }
    }
  }, 240_000);

  it('SHR-13: entferntes Mitglied bekommt keinen Wrap der neuen Epoche und keine neuen Daten (403)', async () => {
    const c = await setup();
    closers.push(c.close);
    // bob wird entfernt, dann rotiert olga (Wraps nur für olga)
    c.server.db.prepare("UPDATE memberships SET revoked_at = 9 WHERE principal_id = 'bob'").run();
    const members = async () => [{ principalId: 'olga', identityPub: c.olga.pub }];
    expect(await rotateDiary(deps(c, injectTransport(c.server.app, 'olga', wire()), { members }), c.diaryId)).toMatchObject({ status: 'done' });
    await c.a.repo.saveEntry({ ...(await c.a.repo.getEntry(c.entries[0]!.id))!, values: { [c.pain.id]: 1, [c.note.id]: 'nach dem Entfernen' }, hlc: c.a.hlc.tick() });
    await c.a.engine.sync();
    // bob: weder neuer Wrap noch Pull
    await expect(c.sBob.provider.refresh(c.diaryId)).rejects.toThrow();
    await expect(c.b.engine.pullDiary(c.diaryId)).rejects.toMatchObject({ status: 403 });
    expect((await c.b.repo.getEntry(c.entries[0]!.id))?.values[c.note.id]).toBe('Notiz 0 äöü');
    expect(c.server.db.prepare("SELECT key_epoch FROM memberships WHERE principal_id = 'bob'").get()).toEqual({ key_epoch: 1 });
  });

  it('SHR-13: Record einer unbekannten Epoche wird nie in die Quarantäne geschoben — Pull bricht ab, Cursor bleibt', async () => {
    const c = await setup();
    closers.push(c.close);
    const stranger = await generateDiaryKey();
    const id = c.newId();
    const ct = await encryptRecord(stranger, { diaryId: c.diaryId, kind: 'entry', recordId: id, keyEpoch: 7 }, new TextEncoder().encode('{}'));
    c.server.db.prepare('UPDATE diaries SET key_epoch = 7 WHERE id = ?').run(c.diaryId);
    await injectTransport(c.server.app, 'olga', wire()).push({ diaryId: c.diaryId, ops: [{ recordId: id, kind: 'entry', baseRev: 0, deleted: false, ciphertext: ct }] });
    const cursor = (await c.b.db.sync_state.get(c.diaryId))?.cursor;
    await expect(c.b.engine.pullDiary(c.diaryId)).rejects.toBeInstanceOf(EpochKeyError);
    expect(await c.b.db.records.where('[diaryId+kind]').equals([c.diaryId, 'syncQuarantine']).count()).toBe(0);
    expect((await c.b.db.sync_state.get(c.diaryId))?.cursor).toBe(cursor);
    expect(await c.b.db.records.get(id)).toBeUndefined();
  });
});
