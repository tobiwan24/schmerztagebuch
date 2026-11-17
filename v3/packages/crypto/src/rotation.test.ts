import { describe, it, expect } from 'vitest';
import { CryptoError } from './errors.js';
import { decryptRecord, encryptRecord, generateDiaryKey, parseEnvelope } from './envelope.js';
import { exportPublicKey, generateIdentityEcdhKeyPair, unwrapDkForMember } from './share.js';
import {
  openPreviousDk, planDkRotation, reencryptBlobs, reencryptRecord, runReencrypt, type BlobTransport,
  type EpochKeys, type ReencryptOp, type ReencryptResult, type ReencryptTransport, type RotationRecord,
} from './rotation.js';

const DIARY = '0190a1b2-0000-7000-8000-0000000000d1';
const raw = async (k: CryptoKey) => new Uint8Array(await crypto.subtle.exportKey('raw', k));
const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

async function code(p: Promise<unknown>): Promise<string> {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(CryptoError);
  return (e as CryptoError).code;
}

describe('DK-Rotation: Plan', () => {
  it('CRY-21: neue Epoche, Wraps nur für aktive Mitglieder, entferntes Mitglied bekommt keinen', async () => {
    const [owner, bob, eve] = [await generateIdentityEcdhKeyPair(), await generateIdentityEcdhKeyPair(), await generateIdentityEcdhKeyPair()];
    const oldDk = await generateDiaryKey();
    const plan = await planDkRotation({
      diaryId: DIARY, fromEpoch: 1, oldDk,
      members: [{ principalId: 'owner', publicKey: owner.publicKey }, { principalId: 'bob', publicKey: bob.publicKey }],
    });
    expect(plan.toEpoch).toBe(2);
    expect(plan.wraps.map((w) => w.principalId)).toEqual(['owner', 'bob']);
    // beide verbleibenden Mitglieder erhalten denselben neuen DK, gebunden an Epoche 2
    for (const [name, pair] of [['owner', owner], ['bob', bob]] as const) {
      const wrap = plan.wraps.find((w) => w.principalId === name)!.wrap;
      expect(await raw(await unwrapDkForMember(wrap, pair, { diaryId: DIARY, keyEpoch: 2 }))).toEqual(await raw(plan.newDk));
      expect(await code(unwrapDkForMember(wrap, pair, { diaryId: DIARY, keyEpoch: 1 }))).toBe('unwrap-failed');
    }
    // das entfernte Mitglied hat keinen Wrap und kann fremde Wraps nicht öffnen
    expect(await code(unwrapDkForMember(plan.wraps[1]!.wrap, eve, { diaryId: DIARY, keyEpoch: 2 }))).toBe('unwrap-failed');
    expect(await raw(plan.newDk)).not.toEqual(await raw(oldDk));
    expect(await exportPublicKey(owner.publicKey)).not.toBe(await exportPublicKey(eve.publicKey));
  });

  it('CRY-21: der alte DK ist unter dem neuen lesbar (zwei Epochen), mit falschem Schlüssel oder Kontext nicht', async () => {
    const owner = await generateIdentityEcdhKeyPair();
    const oldDk = await generateDiaryKey();
    const plan = await planDkRotation({ diaryId: DIARY, fromEpoch: 1, oldDk, members: [{ principalId: 'owner', publicKey: owner.publicKey }] });
    const prev = await openPreviousDk(plan.newDk, { diaryId: DIARY, fromEpoch: 1, toEpoch: 2 }, plan.prevDkWrap);
    expect(await raw(prev)).toEqual(await raw(oldDk));
    expect(await code(openPreviousDk(await generateDiaryKey(), { diaryId: DIARY, fromEpoch: 1, toEpoch: 2 }, plan.prevDkWrap))).toBe('decrypt-failed');
    expect(await code(openPreviousDk(plan.newDk, { diaryId: DIARY, fromEpoch: 2, toEpoch: 3 }, plan.prevDkWrap))).toBe('decrypt-failed');
  });

  it('CRY-21: ungültige Eingaben werden abgelehnt (keine Mitglieder, doppelte Mitglieder, Epoche 0)', async () => {
    const k = (await generateIdentityEcdhKeyPair()).publicKey;
    const oldDk = await generateDiaryKey();
    expect(await code(planDkRotation({ diaryId: DIARY, fromEpoch: 1, oldDk, members: [] }))).toBe('invalid-rotation');
    expect(await code(planDkRotation({ diaryId: DIARY, fromEpoch: 1, oldDk, members: [{ principalId: 'a', publicKey: k }, { principalId: 'a', publicKey: k }] }))).toBe('invalid-rotation');
    expect(await code(planDkRotation({ diaryId: DIARY, fromEpoch: 0, oldDk, members: [{ principalId: 'a', publicKey: k }] }))).toBe('invalid-rotation');
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// Re-Verschlüsselung gegen einen In-Memory-Server mit derselben Semantik wie der echte (rev/seq, baseRev-Konflikt)

interface Row { kind: string; rev: number; seq: number; deleted: boolean; ciphertext: string }

class FakeServer {
  rows = new Map<string, Row>();
  seq = 0;
  put(id: string, kind: string, ciphertext: string, deleted = false) {
    const cur = this.rows.get(id);
    this.rows.set(id, { kind, rev: (cur?.rev ?? 0) + 1, seq: ++this.seq, deleted, ciphertext });
  }
  pull(since: number, limit: number) {
    const all = [...this.rows].filter(([, r]) => r.seq > since).sort((a, b) => a[1].seq - b[1].seq);
    const page = all.slice(0, limit);
    return {
      records: page.map(([id, r]): RotationRecord => ({ recordId: id, kind: r.kind, rev: r.rev, deleted: r.deleted, ciphertext: r.ciphertext })),
      nextSince: page.at(-1)?.[1].seq ?? since,
      hasMore: all.length > limit,
    };
  }
  push(ops: ReencryptOp[]): ReencryptResult[] {
    return ops.map((op): ReencryptResult => {
      const cur = this.rows.get(op.recordId);
      if (!cur || cur.rev !== op.baseRev) {
        return { recordId: op.recordId, status: 'conflict', server: cur ? { rev: cur.rev, ciphertext: cur.ciphertext, deleted: cur.deleted } : { rev: 0, ciphertext: null, deleted: false } };
      }
      this.put(op.recordId, op.kind, op.ciphertext, op.deleted);
      return { recordId: op.recordId, status: 'applied' };
    });
  }
}

class Crash extends Error {}

/** Transport mit Fehlerinjektion: bricht beim n-ten Aufruf ab, wahlweise vor oder nach der Wirkung auf dem Server (Antwort verloren). */
function transportFor(server: FakeServer, fault?: { at: number; when: 'before' | 'after' }, pageSize = 4) {
  let calls = 0;
  const wrap = async <T>(run: () => T): Promise<T> => {
    calls++;
    const hit = fault?.at === calls;
    if (hit && fault.when === 'before') throw new Crash();
    const out = run();
    if (hit && fault.when === 'after') throw new Crash();
    return out;
  };
  const t: ReencryptTransport = {
    pull: (since) => wrap(() => server.pull(since, pageSize)),
    push: (ops) => wrap(() => server.push(ops)),
  };
  return { transport: t, calls: () => calls };
}

async function setup(count: number) {
  const oldDk = await generateDiaryKey();
  const newDk = await generateDiaryKey();
  const keys: EpochKeys = { diaryId: DIARY, from: { epoch: 1, key: oldDk }, to: { epoch: 2, key: newDk } };
  const server = new FakeServer();
  const plain = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    const id = `rec-${i}`;
    const kind = i % 3 === 0 ? 'template' : 'entry';
    const text = `Klartext ${i} äöü ${'x'.repeat(i)}`;
    plain.set(id, text);
    server.put(id, kind, await encryptRecord(oldDk, { diaryId: DIARY, kind, recordId: id, keyEpoch: 1 }, enc(text)), i === 7);
  }
  return { keys, server, plain };
}

/** Jeder Record muss in seiner jeweiligen Epoche mit dem passenden Schlüssel zum ursprünglichen Klartext lesbar sein. */
async function expectAllReadable(server: FakeServer, keys: EpochKeys, plain: Map<string, string>, expectEpoch?: number) {
  expect(server.rows.size).toBe(plain.size);
  for (const [id, row] of server.rows) {
    const epoch = parseEnvelope(row.ciphertext).keyEpoch;
    if (expectEpoch !== undefined) expect(epoch, id).toBe(expectEpoch);
    const key = epoch === keys.to.epoch ? keys.to.key : keys.from.key;
    expect(dec(await decryptRecord(key, { diaryId: DIARY, kind: row.kind, recordId: id, keyEpoch: epoch }, row.ciphertext)), id).toBe(plain.get(id));
  }
}

describe('DK-Rotation: Re-Verschlüsselung', () => {
  it('CRY-21: alle Records (auch Tombstones) landen in der neuen Epoche, Klartext unverändert, in Batches', async () => {
    const { keys, server, plain } = await setup(11);
    const { transport } = transportFor(server);
    const progress: number[] = [];
    const r = await runReencrypt({ keys, transport, batchSize: 3, onProgress: (p) => progress.push(p.reencrypted) });
    expect(r).toMatchObject({ reencrypted: 11, alreadyCurrent: 0, failed: [], done: true });
    expect(progress.at(-1)).toBe(11);
    await expectAllReadable(server, keys, plain, 2);
    // der alte Schlüssel öffnet nichts mehr in der neuen Epoche
    const any = [...server.rows][0]!;
    expect(await code(decryptRecord(keys.from.key, { diaryId: DIARY, kind: any[1].kind, recordId: any[0], keyEpoch: 2 }, any[1].ciphertext))).toBe('decrypt-failed');
  });

  it('CRY-21: idempotent — ein zweiter Lauf ändert nichts (keine Pushes, Revisionen bleiben)', async () => {
    const { keys, server, plain } = await setup(9);
    await runReencrypt({ keys, transport: transportFor(server).transport });
    const revs = JSON.stringify([...server.rows]);
    const again = await runReencrypt({ keys, transport: transportFor(server).transport });
    expect(again).toMatchObject({ reencrypted: 0, alreadyCurrent: 9, done: true });
    expect(JSON.stringify([...server.rows])).toBe(revs);
    await expectAllReadable(server, keys, plain, 2);
  });

  it('CRY-21: Fehlerinjektion — Abbruch an jeder Stelle (vor und nach der Serverwirkung), danach Fortsetzen ohne Verlust', async () => {
    const probe = await setup(10);
    const probeRun = transportFor(probe.server);
    await runReencrypt({ keys: probe.keys, transport: probeRun.transport, batchSize: 3 });
    const total = probeRun.calls();
    expect(total).toBeGreaterThan(6);

    for (let at = 1; at <= total; at++) {
      for (const when of ['before', 'after'] as const) {
        const { keys, server, plain } = await setup(10);
        const crashed = await runReencrypt({ keys, transport: transportFor(server, { at, when }).transport, batchSize: 3 }).then(() => null, (e: unknown) => e);
        expect(crashed, `Abbruch ${at}/${when}`).toBeInstanceOf(Crash);
        // mitten in der Rotation: gemischter Bestand, jeder Record liest sich noch mit dem Schlüssel seiner Epoche
        await expectAllReadable(server, keys, plain);
        // Fortsetzen (frischer Aufruf, kein gemerkter Zustand)
        const resumed = await runReencrypt({ keys, transport: transportFor(server).transport, batchSize: 3 });
        expect(resumed.done, `Fortsetzen ${at}/${when}`).toBe(true);
        expect(resumed.reencrypted + resumed.alreadyCurrent).toBe(10);
        await expectAllReadable(server, keys, plain, 2);
      }
    }
  });

  it('CRY-21: Konflikt (Mitglied schreibt währenddessen in der neuen Epoche) — dessen Stand bleibt erhalten', async () => {
    const { keys, server, plain } = await setup(6);
    const base = transportFor(server).transport;
    let injected = false;
    const transport: ReencryptTransport = {
      pull: base.pull,
      // vor dem ersten Push ändert ein anderes Mitglied rec-2 bereits mit dem neuen DK
      push: async (ops) => {
        if (!injected) {
          injected = true;
          const text = 'neuer Stand eines Mitglieds';
          plain.set('rec-2', text);
          server.put('rec-2', server.rows.get('rec-2')!.kind, await encryptRecord(keys.to.key, { diaryId: DIARY, kind: server.rows.get('rec-2')!.kind, recordId: 'rec-2', keyEpoch: 2 }, enc(text)));
        }
        return base.push(ops);
      },
    };
    const r = await runReencrypt({ keys, transport, batchSize: 100 });
    expect(r.done).toBe(true);
    await expectAllReadable(server, keys, plain, 2);
    expect(dec(await decryptRecord(keys.to.key, { diaryId: DIARY, kind: server.rows.get('rec-2')!.kind, recordId: 'rec-2', keyEpoch: 2 }, server.rows.get('rec-2')!.ciphertext))).toBe('neuer Stand eines Mitglieds');
  });

  it('CRY-21: Konflikt in der alten Epoche (Änderung nach dem Pull) wird im zweiten Durchgang aus dem Serverstand umgestellt', async () => {
    const { keys, server, plain } = await setup(5);
    const base = transportFor(server).transport;
    let injected = false;
    const transport: ReencryptTransport = {
      pull: base.pull,
      push: async (ops) => {
        if (!injected) {
          injected = true;
          const k = server.rows.get('rec-1')!.kind;
          plain.set('rec-1', 'zwischenzeitlich geändert');
          server.put('rec-1', k, await encryptRecord(keys.from.key, { diaryId: DIARY, kind: k, recordId: 'rec-1', keyEpoch: 1 }, enc('zwischenzeitlich geändert')));
        }
        return base.push(ops);
      },
    };
    const r = await runReencrypt({ keys, transport, batchSize: 100, maxPasses: 3 });
    expect(r).toMatchObject({ done: true, passes: 2 });
    await expectAllReadable(server, keys, plain, 2);
  });

  it('CRY-21: nicht entschlüsselbare oder fremde Records werden nie überschrieben und als fehlgeschlagen gemeldet (done=false)', async () => {
    const { keys, server, plain } = await setup(6);
    const strange = await encryptRecord(await generateDiaryKey(), { diaryId: DIARY, kind: 'entry', recordId: 'fremd', keyEpoch: 1 }, enc('fremd'));
    server.put('fremd', 'entry', strange);
    const epoch5 = await encryptRecord(keys.to.key, { diaryId: DIARY, kind: 'entry', recordId: 'zukunft', keyEpoch: 5 }, enc('zukunft'));
    server.put('zukunft', 'entry', epoch5);
    const r = await runReencrypt({ keys, transport: transportFor(server).transport });
    expect(r.done).toBe(false);
    expect(r.failed.map((f) => f.recordId).sort()).toEqual(['fremd', 'zukunft']);
    expect(server.rows.get('fremd')!.ciphertext).toBe(strange);
    expect(server.rows.get('zukunft')!.ciphertext).toBe(epoch5);
    expect(r.reencrypted).toBe(6);
    for (const id of plain.keys()) expect(parseEnvelope(server.rows.get(id)!.ciphertext).keyEpoch).toBe(2);
  });

  it('CRY-21: reencryptRecord — Gegenprobe vor dem Senden, AAD bleibt an Record gebunden', async () => {
    const { keys, server } = await setup(1);
    const rec = server.pull(0, 5).records[0]!;
    const op = (await reencryptRecord(rec, keys))!;
    expect(op.baseRev).toBe(rec.rev);
    expect(parseEnvelope(op.ciphertext).keyEpoch).toBe(2);
    expect(await reencryptRecord({ ...rec, ciphertext: op.ciphertext }, keys)).toBeNull();
    // gleicher Chiffretext unter einer anderen Record-ID lässt sich nicht umstellen
    expect(await code(reencryptRecord({ ...rec, recordId: 'anders' }, keys))).toBe('decrypt-failed');
  });

  it('CRY-21: neue Epoche muss genau eine größer sein; Abbruchsignal stoppt zwischen den Schritten', async () => {
    const { keys, server } = await setup(3);
    expect(await code(runReencrypt({ keys: { ...keys, to: { ...keys.to, epoch: 3 } }, transport: transportFor(server).transport }))).toBe('invalid-rotation');
    const ac = new AbortController();
    ac.abort();
    expect(await code(runReencrypt({ keys, transport: transportFor(server).transport, signal: ac.signal }))).toBe('invalid-rotation');
  });
});

describe('DK-Rotation: Anhänge', () => {
  const blobCt = (dk: CryptoKey, epoch: number, id: string, text: string) => encryptRecord(dk, { diaryId: DIARY, kind: 'blob', recordId: id, keyEpoch: epoch }, enc(text));

  async function blobSetup() {
    const oldDk = await generateDiaryKey();
    const newDk = await generateDiaryKey();
    const keys: EpochKeys = { diaryId: DIARY, from: { epoch: 1, key: oldDk }, to: { epoch: 2, key: newDk } };
    const store = new Map<string, string>();
    for (const id of ['b1', 'b2', 'b3']) store.set(id, await blobCt(oldDk, 1, id, `Bild ${id}`));
    return { keys, store };
  }
  const transport = (store: Map<string, string>, fault?: { at: number; when: 'before' | 'after' }) => {
    let calls = 0;
    const hit = async <T>(run: () => T): Promise<T> => {
      calls++;
      const f = fault?.at === calls;
      if (f && fault.when === 'before') throw new Error('Absturz');
      const out = run();
      if (f && fault.when === 'after') throw new Error('Absturz');
      return out;
    };
    const t: BlobTransport = { get: (id) => hit(() => store.get(id) ?? null), put: (id, ct) => hit(() => void store.set(id, ct)) };
    return t;
  };

  it('CRY-21: Anhänge landen in der neuen Epoche, idempotent, fehlende werden übersprungen', async () => {
    const { keys, store } = await blobSetup();
    const r = await reencryptBlobs({ keys, ids: ['b1', 'b2', 'b3', 'nie-hochgeladen'], transport: transport(store) });
    expect(r).toMatchObject({ reencrypted: 3, missing: 1, done: true });
    for (const [id, ct] of store) {
      expect(parseEnvelope(ct).keyEpoch).toBe(2);
      expect(dec(await decryptRecord(keys.to.key, { diaryId: DIARY, kind: 'blob', recordId: id, keyEpoch: 2 }, ct))).toBe(`Bild ${id}`);
    }
    const again = await reencryptBlobs({ keys, ids: ['b1', 'b2', 'b3'], transport: transport(store) });
    expect(again).toMatchObject({ reencrypted: 0, alreadyCurrent: 3, done: true });
  });

  it('CRY-21: Fehlerinjektion bei Anhängen — nach jedem Abbruch bleibt alles lesbar, Fortsetzen stellt den Rest um', async () => {
    for (let at = 1; at <= 8; at++) {
      for (const when of ['before', 'after'] as const) {
        const { keys, store } = await blobSetup();
        await reencryptBlobs({ keys, ids: ['b1', 'b2', 'b3'], transport: transport(store, { at, when }) }).catch(() => undefined);
        for (const [id, ct] of store) {
          const epoch = parseEnvelope(ct).keyEpoch;
          const key = epoch === 2 ? keys.to.key : keys.from.key;
          expect(dec(await decryptRecord(key, { diaryId: DIARY, kind: 'blob', recordId: id, keyEpoch: epoch }, ct)), `${at}/${when}/${id}`).toBe(`Bild ${id}`);
        }
        const r = await reencryptBlobs({ keys, ids: ['b1', 'b2', 'b3'], transport: transport(store) });
        expect(r.done).toBe(true);
        expect([...store.values()].every((ct) => parseEnvelope(ct).keyEpoch === 2)).toBe(true);
      }
    }
  });

  it('CRY-21: unlesbarer Anhang wird nie überschrieben und als fehlgeschlagen gemeldet', async () => {
    const { keys, store } = await blobSetup();
    const stranger = await blobCt(await generateDiaryKey(), 1, 'b2', 'fremd');
    store.set('b2', stranger);
    const r = await reencryptBlobs({ keys, ids: ['b1', 'b2', 'b3'], transport: transport(store) });
    expect(r.done).toBe(false);
    expect(r.failed.map((f) => f.id)).toEqual(['b2']);
    expect(store.get('b2')).toBe(stranger);
    expect(r.reencrypted).toBe(2);
  });
});
