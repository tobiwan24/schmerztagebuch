// Sync-Engine (Spec 04): Push → (Konflikte) → Pull. Ver-/Entschlüsselung mit dem DK passiert ausschließlich hier, unmittelbar
// vor dem Push bzw. nach dem Pull (Spec 02/04). Lokal bleibt `payload` im lokalen Codec.
import { decryptRecord, encryptRecord, parseEnvelope } from '@stb/crypto';
import { deepEqual, type HlcClock } from '@stb/core';
import { PULL_LIMIT_MAX, PUSH_OPS_MAX, type PulledRecord, type PushOp, type PushResult } from '@stb/sync-protocol';
import type { StbDb, OutboxOp, LocalRecord } from '../data/db.js';
import type { CodecRegistry } from '../data/codec/registry.js';
import type { SyncTransport } from './transport.js';
import { createSingleFlight, type SingleFlight } from './single-flight.js';
import { resolveConflict, type Side } from './resolve.js';
import { renumberCollidedVersion } from './renumber.js';
import { KIND_ORDER, kindRank } from './order.js';

/** Liefert den aktuellen Diary Key eines Tagebuchs (gehalten von `data/crypto-session.ts`, Spec 01). */
export interface DiaryKeyProvider {
  get(diaryId: string): Promise<{ key: CryptoKey; keyEpoch: number }>;
}

export interface SyncEngineDeps {
  db: StbDb;
  registry: CodecRegistry;
  /** Lokaler Codec, mit dem gepullte Records gespeichert werden (v3.0: `plain`). */
  writeCodec: string;
  transport: SyncTransport;
  keys: DiaryKeyProvider;
  /** Tagebücher, die synchronisiert werden (Modus `cloud-primary`). */
  diaryIds: () => Promise<string[]>;
  /** Seitengröße beim Pull (≤ 500). */
  pullLimit?: number;
  /** ID-Erzeugung (UUID v7) für lokale ConflictLog-Records. */
  newId: () => string;
  clock: { now(): number };
  /** HLC des Geräts: `receive` für jeden empfangenen Stand, `tick` für zusammengeführte Ergebnisse (A-015). */
  hlc: HlcClock;
}

/** Lokale Record-Art für Server-Records, die sich nicht entschlüsseln ließen (Quarantäne statt Pull-Blockade). */
export const QUARANTINE_KIND = 'syncQuarantine';

const hlcOf = (payload: unknown): string | undefined =>
  payload && typeof payload === 'object' && typeof (payload as { hlc?: unknown }).hlc === 'string' ? (payload as { hlc: string }).hlc : undefined;

/** Höchstens so viele Push-Runden je Lauf (Konflikt → zusammenführen → erneut pushen). */
const MAX_PUSH_ROUNDS = 3;

export interface PushSummary {
  applied: number;
  /** Aufgelöste Konflikte (Ergebnis wurde erneut gepusht oder Serverstand übernommen). */
  resolved: number;
  /** Nicht automatisch auflösbare Konflikte (Op bleibt mit `lastError` stehen). */
  unresolved: string[];
}

type ConflictResult = Extract<PushResult, { status: 'conflict' }>;

export interface SyncEngine {
  /** Ein vollständiger Lauf über alle Tagebücher; nie parallel (Single-Flight). */
  sync(): Promise<void>;
  pushDiary(diaryId: string): Promise<PushSummary>;
  pullDiary(diaryId: string): Promise<{ applied: number; skippedPending: number }>;
  /** Ausstehende Anhang-Inhalte eines Tagebuchs verschlüsselt hochladen (A-032). Rückgabe: Anzahl hochgeladen. */
  uploadBlobs(diaryId: string): Promise<number>;
  /** Anhang-Inhalt vom Server laden und entschlüsseln; `undefined`, wenn der Server ihn nicht hat. */
  downloadBlob(diaryId: string, id: string): Promise<Uint8Array<ArrayBuffer> | undefined>;
  /** Registriert Auslöser (`online`, `visibilitychange` → sichtbar). Rückgabe: Abmelden. */
  attachTriggers(target: EventTarget, isVisible?: () => boolean): () => void;
  readonly flight: SingleFlight;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const { db, registry, transport, keys } = deps;

  async function toPushOp(op: OutboxOp, rec: LocalRecord): Promise<PushOp> {
    const { key, keyEpoch } = await keys.get(op.diaryId);
    const payload = await registry.get(rec.codec).decode(rec.payload, { diaryId: rec.diaryId, kind: rec.kind, recordId: rec.id });
    const plaintext = encoder.encode(JSON.stringify(payload));
    const ciphertext = await encryptRecord(key, { diaryId: op.diaryId, kind: op.kind, recordId: op.recordId, keyEpoch }, plaintext);
    return { recordId: op.recordId, kind: op.kind, baseRev: op.baseRev, deleted: rec.deleted === 1, ciphertext };
  }

  async function decryptServer(diaryId: string, kind: string, recordId: string, ciphertext: string): Promise<unknown> {
    const { key } = await keys.get(diaryId);
    const { keyEpoch } = parseEnvelope(ciphertext);
    return JSON.parse(decoder.decode(await decryptRecord(key, { diaryId, kind, recordId, keyEpoch }, ciphertext))) as unknown;
  }

  /** Konflikt auflösen und lokal schreiben; die Op bleibt (mit `baseRev = server.rev`) für die nächste Runde stehen. */
  async function handleConflict(op: OutboxOp, c: ConflictResult, summary: PushSummary): Promise<void> {
    const rec = await db.records.get(op.recordId);
    if (!rec || op.seq === undefined) return;
    if (c.server.ciphertext === null) {
      if (op.baseRev === 0) {
        // Schon als neu gepusht und trotzdem abgelehnt: nicht endlos wiederholen.
        await db.outbox.update(op.seq, { lastError: 'rejected-as-new', attempts: op.attempts + 1 });
        summary.unresolved.push(`${rec.id}: rejected-as-new`);
        return;
      }
      // Server kennt den Record (noch) nicht: als neu pushen.
      await db.transaction('rw', db.records, db.outbox, async () => {
        await db.records.update(rec.id, { rev: 0 });
        await db.outbox.update(op.seq!, { baseRev: 0 });
      });
      summary.resolved++;
      return;
    }
    const ctx = { diaryId: rec.diaryId, kind: rec.kind, recordId: rec.id };
    const codec = registry.get(rec.codec);
    const serverPayload = await decryptServer(rec.diaryId, rec.kind, rec.id, c.server.ciphertext);
    const serverHlc = hlcOf(serverPayload);
    if (serverHlc) deps.hlc.receive(serverHlc);
    const local: Side = { payload: await codec.decode(rec.payload, ctx), deleted: rec.deleted === 1 };
    const base: Side | undefined = rec.base === undefined ? undefined : { payload: await codec.decode(rec.base, ctx), deleted: false };
    const server: Side = { payload: serverPayload, deleted: c.server.deleted };
    // Kollidierende Vorlagenversion: eigene Version unter der nächsten freien Nummer neu anlegen (A-016, A-039).
    if (rec.kind === 'templateVersion' && !local.deleted && !server.deleted && !deepEqual(local, server)) {
      const applied = await renumberCollidedVersion(
        { db, registry, writeCodec: deps.writeCodec, hlc: deps.hlc, clock: deps.clock }, op, rec,
        local.payload as Parameters<typeof renumberCollidedVersion>[3], { payload: serverPayload, rev: c.server.rev, deleted: c.server.deleted },
      );
      if (applied) summary.resolved++;
      return;
    }
    const r = resolveConflict(rec.kind, base, local, server);
    if (r.kind === 'unresolvable') {
      await db.outbox.update(op.seq, { lastError: r.reason, attempts: op.attempts + 1 });
      summary.unresolved.push(`${rec.id}: ${r.reason}`);
      return;
    }
    const writeCodec = registry.get(deps.writeCodec);
    // Zusammengeführtes Ergebnis ist eine neue Änderung → neuer HLC über beiden Seiten (A-015).
    const merged = !r.adoptServer && hlcOf(r.result.payload) ? { ...(r.result.payload as object), hlc: deps.hlc.tick() } : r.result.payload;
    const [mergedEnc, serverEnc] = await Promise.all([writeCodec.encode(merged, ctx), writeCodec.encode(serverPayload, ctx)]);
    const logs = await Promise.all(r.conflicts.map(async (conflict) => {
      const id = deps.newId();
      const payload = { id, recordId: rec.id, kind: rec.kind, losingPayload: conflict, resolvedAt: new Date(deps.clock.now()).toISOString(), seenByUser: false };
      return { id, payload: await writeCodec.encode(payload, { diaryId: rec.diaryId, kind: 'conflictLog', recordId: id }) };
    }));
    let stale = false;
    await db.transaction('rw', db.records, db.outbox, async () => {
      // Während der Auflösung lokal erneut geändert? Dann nichts überschreiben; die nächste Runde löst neu auf.
      const [nowRec, nowOp] = await Promise.all([db.records.get(rec.id), db.outbox.get(op.seq!)]);
      if (!nowRec || !nowOp || nowRec.localUpdatedAt !== rec.localUpdatedAt || nowOp.createdAt !== op.createdAt) {
        stale = true;
        return;
      }
      await db.records.update(rec.id, {
        payload: r.adoptServer ? serverEnc : mergedEnc, deleted: r.result.deleted ? 1 : 0, codec: writeCodec.id,
        rev: c.server.rev, base: serverEnc, localUpdatedAt: deps.clock.now(),
      });
      if (r.adoptServer) await db.outbox.delete(op.seq!);
      else await db.outbox.update(op.seq!, { baseRev: c.server.rev, op: r.result.deleted ? 'delete' : 'upsert' });
      // ConflictLog ist lokal und wird nicht synchronisiert (Spec 02) — daher ohne Outbox.
      for (const l of logs) {
        await db.records.put({ id: l.id, diaryId: rec.diaryId, kind: 'conflictLog', rev: 0, deleted: 0, codec: writeCodec.id, payload: l.payload, localUpdatedAt: deps.clock.now() });
      }
    });
    if (!stale) summary.resolved++;
  }

  async function pushDiary(diaryId: string): Promise<PushSummary> {
    const summary: PushSummary = { applied: 0, resolved: 0, unresolved: [] };
    for (let round = 0; round < MAX_PUSH_ROUNDS; round++) {
      const conflicts = await pushOnce(diaryId, summary);
      if (!conflicts.length) break;
      for (const { op, result } of conflicts) await handleConflict(op, result, summary);
    }
    return summary;
  }

  async function pushOnce(diaryId: string, summary: PushSummary): Promise<{ op: OutboxOp; result: ConflictResult }[]> {
    const conflicts: { op: OutboxOp; result: ConflictResult }[] = [];
    const pending = (await db.outbox.toArray())
      .filter((o) => o.diaryId === diaryId && !o.lastError)
      .sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || (a.seq ?? 0) - (b.seq ?? 0));

    // Strukturdaten (Tagebuch, Vorlage, Vorlagenversion) zuerst; Einträge erst, wenn sie ohne offene Kollision durch sind
    // (sonst gingen sie mit einer Version hinaus, die gleich umnummeriert wird, Spec 04, A-039).
    const structure = pending.filter((o) => kindRank(o.kind) < KIND_ORDER.length);
    await pushList(structure);
    if (!conflicts.length) await pushList(pending.filter((o) => kindRank(o.kind) >= KIND_ORDER.length));
    return conflicts;

    async function pushList(pending: OutboxOp[]) {
    for (let i = 0; i < pending.length; i += PUSH_OPS_MAX) {
      const batch: { op: OutboxOp; snapshot: LocalRecord }[] = [];
      for (const op of pending.slice(i, i + PUSH_OPS_MAX)) {
        const rec = await db.records.get(op.recordId);
        if (rec) batch.push({ op, snapshot: rec });
      }
      if (!batch.length) continue;
      const allOps = await Promise.all(batch.map((b) => toPushOp(b.op, b.snapshot)));
      // Große Payloads (Bilder, Anhänge): Anfragen zusätzlich nach Größe teilen (Server-Body-Limit 8 MB).
      for (const [from, to] of sizeGroups(allOps, PUSH_BYTES_MAX)) {
        const group = batch.slice(from, to);
        const { results } = await transport.push({ diaryId, ops: allOps.slice(from, to) });
        await applyPushResults(group, results);
      }
    }
    }

    async function applyPushResults(group: { op: OutboxOp; snapshot: LocalRecord }[], results: PushResult[]) {
      await db.transaction('rw', db.records, db.outbox, async () => {
        for (const [n, result] of results.entries()) {
          const { op, snapshot } = group[n]!;
          if (result.status === 'conflict') {
            conflicts.push({ op, result });
            continue;
          }
          summary.applied++;
          // `base` = genau der gepushte Stand (3-Wege-Merge, Spec 04); `rev` vom Server.
          const current = await db.records.get(op.recordId);
          if (current) await db.records.update(op.recordId, { rev: result.rev, base: snapshot.payload });
          const stillPending = op.seq === undefined ? undefined : await db.outbox.get(op.seq);
          if (stillPending && stillPending.createdAt === op.createdAt) {
            await db.outbox.delete(op.seq!);
          } else if (stillPending) {
            // Während des Pushs erneut geändert: Op bleibt, setzt aber auf dem bestätigten Stand auf.
            await db.outbox.update(op.seq!, { baseRev: result.rev });
          }
        }
      });
    }
  }

  /**
   * Holt alle Records mit `seq > cursor`, seitenweise. Pro Seite: erst entschlüsseln und kodieren (außerhalb der
   * Transaktion, WebCrypto), dann Records **und** Cursor gemeinsam schreiben — bricht etwas ab, bleibt der Cursor auf der
   * letzten vollständig angewendeten Seite (SYN-07, SYN-08). Records mit ausstehender lokaler Op werden nicht
   * überschrieben; der nächste Push meldet den Konflikt und führt zusammen.
   */
  async function pullDiary(diaryId: string): Promise<{ applied: number; skippedPending: number }> {
    const limit = Math.min(deps.pullLimit ?? PULL_LIMIT_MAX, PULL_LIMIT_MAX);
    const codec = registry.get(deps.writeCodec);
    let applied = 0;
    let skippedPending = 0;
    let cursor = (await db.sync_state.get(diaryId))?.cursor ?? 0;
    for (;;) {
      const page = await transport.pull({ diaryId, since: cursor, limit });
      const { key } = await keys.get(diaryId);
      type Decoded = { r: PulledRecord; payload: unknown; encoded: unknown } | { r: PulledRecord; error: string; encoded: unknown };
      const decoded: Decoded[] = await Promise.all(page.records.map(async (r: PulledRecord): Promise<Decoded> => {
        try {
          const { keyEpoch } = parseEnvelope(r.ciphertext);
          const plain = await decryptRecord(key, { diaryId, kind: r.kind, recordId: r.recordId, keyEpoch }, r.ciphertext);
          const payload = JSON.parse(decoder.decode(plain)) as unknown;
          const encoded = await codec.encode(payload, { diaryId, kind: r.kind, recordId: r.recordId });
          return { r, payload, encoded };
        } catch (e) {
          // Nicht entschlüsselbar (fremder/kaputter Chiffretext): in Quarantäne, Pull läuft weiter (Review Befund 5).
          const error = e instanceof Error ? e.message : String(e);
          const info = { recordId: r.recordId, kind: r.kind, seq: r.seq, rev: r.rev, error, at: new Date(deps.clock.now()).toISOString() };
          return { r, error, encoded: await codec.encode(info, { diaryId, kind: QUARANTINE_KIND, recordId: `q:${r.recordId}` }) };
        }
      }));
      for (const d of decoded) {
        const h = 'payload' in d ? hlcOf(d.payload) : undefined;
        if (h) deps.hlc.receive(h);
      }
      let switchedToLocal = false;
      await db.transaction('rw', db.records, db.outbox, db.sync_state, async () => {
        // Wurde inzwischen auf local-only gewechselt, nichts mehr anwenden und den Modus nicht überschreiben.
        const state = await db.sync_state.get(diaryId);
        if (state?.mode === 'local-only') {
          switchedToLocal = true;
          return;
        }
        for (const d of decoded) {
          const { r, encoded } = d;
          if (!('payload' in d)) {
            await db.records.put({ id: `q:${r.recordId}`, diaryId, kind: QUARANTINE_KIND, rev: 0, deleted: 0, codec: codec.id, payload: encoded, localUpdatedAt: deps.clock.now() });
            continue;
          }
          const { payload } = d;
          if (await db.outbox.where('recordId').equals(r.recordId).count()) {
            skippedPending++;
            continue;
          }
          const occurredAt = r.kind === 'entry' && payload && typeof (payload as { occurredAt?: unknown }).occurredAt === 'string'
            ? (payload as { occurredAt: string }).occurredAt
            : undefined;
          await db.records.put({
            id: r.recordId, diaryId, kind: r.kind, rev: r.rev, deleted: r.deleted ? 1 : 0, codec: codec.id,
            payload: encoded, base: encoded, localUpdatedAt: deps.clock.now(),
            ...(occurredAt === undefined ? {} : { occurredAt }),
          });
          applied++;
        }
        await db.sync_state.put({ diaryId, cursor: page.nextSince, mode: state?.mode ?? 'cloud-primary' });
      });
      if (switchedToLocal) break;
      cursor = page.nextSince;
      if (!page.hasMore) break;
    }
    return { applied, skippedPending };
  }

  const BLOB_KIND = 'blob';

  async function uploadBlobs(diaryId: string): Promise<number> {
    if (!transport.putBlob) return 0;
    const queued = await db.blob_outbox.where('diaryId').equals(diaryId).toArray();
    if (!queued.length) return 0;
    const { key, keyEpoch } = await keys.get(diaryId);
    let n = 0;
    for (const row of queued) {
      const blob = await db.blobs.get(row.id);
      if (blob) {
        const bytes = blob.data instanceof Uint8Array ? (blob.data as Uint8Array<ArrayBuffer>) : new Uint8Array(await blob.data.arrayBuffer());
        const ct = await encryptRecord(key, { diaryId, kind: BLOB_KIND, recordId: row.id, keyEpoch }, bytes);
        await transport.putBlob(diaryId, row.id, ct);
        n++;
      }
      await db.blob_outbox.delete(row.id);
    }
    return n;
  }

  async function downloadBlob(diaryId: string, id: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
    if (!transport.getBlob) return undefined;
    const ct = await transport.getBlob(id);
    if (ct === null) return undefined;
    const { keyEpoch } = parseEnvelope(ct);
    const { key } = await keys.get(diaryId);
    return decryptRecord(key, { diaryId, kind: BLOB_KIND, recordId: id, keyEpoch }, ct);
  }

  const flight = createSingleFlight(async () => {
    // Ein Fehler in einem Tagebuch (offline, entfernt → 403, …) hält die anderen nicht auf (Review Befund 6).
    const errors: unknown[] = [];
    for (const diaryId of await deps.diaryIds()) {
      try {
        await pushDiary(diaryId);
        await uploadBlobs(diaryId);
        await pullDiary(diaryId);
      } catch (e) {
        errors.push(e);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, `Sync in ${errors.length} Tagebüchern fehlgeschlagen`);
  });

  return {
    flight,
    sync: () => flight.trigger(),
    pushDiary,
    pullDiary,
    uploadBlobs,
    downloadBlob,
    attachTriggers(target, isVisible = () => true) {
      const run = () => {
        flight.trigger().catch(() => undefined); // Fehler zeigt der Sync-Status (SYN-14); Backoff folgt.
      };
      const onVisibility = () => {
        if (isVisible()) run();
      };
      target.addEventListener('online', run);
      target.addEventListener('visibilitychange', onVisibility);
      return () => {
        target.removeEventListener('online', run);
        target.removeEventListener('visibilitychange', onVisibility);
      };
    },
  };
}

/** Ungefähre Obergrenze der Push-Anfrage in Bytes (JSON), unter dem Server-Body-Limit von 8 MB. */
export const PUSH_BYTES_MAX = 6 * 1024 * 1024;

/** Teilt Ops in aufeinanderfolgende Gruppen `[from, to)` mit höchstens `maxBytes` (eine zu große Op bildet eine eigene Gruppe). */
export function sizeGroups(ops: readonly unknown[], maxBytes: number): [number, number][] {
  const groups: [number, number][] = [];
  let start = 0;
  let size = 0;
  ops.forEach((op, i) => {
    const n = JSON.stringify(op).length;
    if (i > start && size + n > maxBytes) {
      groups.push([start, i]);
      start = i;
      size = 0;
    }
    size += n;
  });
  if (ops.length > start) groups.push([start, ops.length]);
  return groups;
}
