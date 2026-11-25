// DK-Rotation im Owner-Client (Spec 03/09, A-092, A-119, M22.3). Reihenfolge:
//   1. Plan: neuer DK, Wraps nur für die aktiven Mitglieder → `POST rotate` (atomar auf dem Server).
//   2. Ab hier **zustandslos**: Schlüssel vom Server laden (aktueller DK + vorheriger aus `prevDkWrap`), alle Records und Anhänge in
//      der alten Epoche umstellen. Was zu tun ist, folgt allein aus der Epoche im Envelope — ein Neustart setzt an derselben Stelle fort.
//   3. `rotate/complete`; der Server lehnt ab, solange noch etwas in der alten Epoche liegt.
// Nichts wird überschrieben, was sich nicht mit dem Gegenschlüssel prüfen ließ (siehe `@stb/crypto` rotation.ts).
import { importPublicKey, planDkRotation, reencryptBlobs, runReencrypt, type EpochKeys } from '@stb/crypto';
import { encodeDkWrap } from '../auth/account-api.js';
import type { SyncTransport } from '../sync/transport.js';
import { RotationApiError, type RotationApi } from './rotation-api.js';

export class RotationError extends Error {
  constructor(readonly code: 'key-epoch-mismatch' | 'member-without-key' | 'previous-key-missing' | 'no-blob-transport', message?: string) {
    super(message ?? code);
    this.name = 'RotationError';
  }
}

export interface RotationProgress {
  diaryId: string;
  phase: 'start' | 'records' | 'blobs' | 'complete';
  done: number;
  total: number;
}

export interface RotationDeps {
  api: RotationApi;
  /** Aktive Mitglieder mit Identity-Public-Key (Owner eingeschlossen). */
  members(diaryId: string): Promise<{ principalId: string; identityPub: string | null }[]>;
  transport: SyncTransport;
  keys: {
    get(diaryId: string): Promise<{ key: CryptoKey; keyEpoch: number }>;
    forEpoch(diaryId: string, keyEpoch: number): Promise<CryptoKey | undefined>;
    /** Schlüssel (aktuell + vorherige Epoche) vom Server neu laden und in die Sitzung setzen. */
    refresh(diaryId: string): Promise<void>;
  };
  onProgress?: (p: RotationProgress) => void;
  signal?: AbortSignal;
  /** Höchstens so viele Durchgänge Umstellen + Abschluss (Standard 3). */
  maxRounds?: number;
}

export type RotationOutcome =
  | { status: 'done'; keyEpoch: number }
  | { status: 'incomplete'; failedRecords: number; failedBlobs: number; pendingRecords: number; pendingBlobs: number };

/** Record-Arten mit Blob-Inhalt (Blob-ID = Record-ID): Anhänge und Übungsmedien (RDM-033). */
const BLOB_KINDS: ReadonlySet<string> = new Set(['attachmentMeta', 'exerciseMedia']);

export async function rotateDiary(deps: RotationDeps, diaryId: string): Promise<RotationOutcome> {
  const { api, keys } = deps;
  let state = await api.state(diaryId);
  if (!state.rotating) {
    let cur = await keys.get(diaryId);
    if (cur.keyEpoch !== state.keyEpoch) {
      await keys.refresh(diaryId);
      cur = await keys.get(diaryId);
      if (cur.keyEpoch !== state.keyEpoch) throw new RotationError('key-epoch-mismatch');
    }
    const members = await deps.members(diaryId);
    if (members.length === 0 || members.some((m) => !m.identityPub)) throw new RotationError('member-without-key');
    const plan = await planDkRotation({
      diaryId, fromEpoch: state.keyEpoch, oldDk: cur.key,
      members: await Promise.all(members.map(async (m) => ({ principalId: m.principalId, publicKey: await importPublicKey(m.identityPub!) }))),
    });
    try {
      await api.rotate(diaryId, {
        fromEpoch: plan.fromEpoch,
        wraps: plan.wraps.map((w) => ({ principalId: w.principalId, wrappedDk: encodeDkWrap(w.wrap) })),
        prevDkWrap: plan.prevDkWrap,
      });
    } catch (e) {
      // Läuft schon eine Rotation (anderes Gerät/früherer Versuch), wird sie unten fortgesetzt; alles andere ist ein Fehler.
      if (!(e instanceof RotationApiError && e.code === 'rotation-running')) throw e;
    }
  }
  // Ab hier immer vom Server-Stand ausgehen (neu angelegt oder fortgesetzt)
  await keys.refresh(diaryId);
  state = await api.state(diaryId);
  if (!state.rotating) return { status: 'done', keyEpoch: state.keyEpoch };
  const total = state.pendingRecords + state.pendingBlobs;
  deps.onProgress?.({ diaryId, phase: 'start', done: 0, total });

  const cur = await keys.get(diaryId);
  if (cur.keyEpoch !== state.keyEpoch) throw new RotationError('key-epoch-mismatch');
  const prev = await keys.forEpoch(diaryId, cur.keyEpoch - 1);
  if (!prev) throw new RotationError('previous-key-missing');
  const epochKeys: EpochKeys = { diaryId, from: { epoch: cur.keyEpoch - 1, key: prev }, to: { epoch: cur.keyEpoch, key: cur.key } };

  const blobIds = new Set<string>();
  const transport = {
    async pull(since: number) {
      const page = await deps.transport.pull({ diaryId, since, limit: 500 });
      for (const r of page.records) if (BLOB_KINDS.has(r.kind)) blobIds.add(r.recordId);
      return { records: page.records.map((r) => ({ recordId: r.recordId, kind: r.kind, rev: r.rev, deleted: r.deleted, ciphertext: r.ciphertext })), nextSince: page.nextSince, hasMore: page.hasMore };
    },
    async push(ops: Parameters<SyncTransport['push']>[0]['ops']) {
      const { results } = await deps.transport.push({ diaryId, ops });
      return results.map((r) => (r.status === 'applied' ? { recordId: r.recordId, status: 'applied' as const } : { recordId: r.recordId, status: 'conflict' as const, server: r.server }));
    },
  };
  const { getBlob, putBlob } = deps.transport;
  if (!getBlob || !putBlob) throw new RotationError('no-blob-transport');

  let recordsDone = 0;
  let last: RotationOutcome = { status: 'incomplete', failedRecords: 0, failedBlobs: 0, pendingRecords: state.pendingRecords, pendingBlobs: state.pendingBlobs };
  for (let round = 0; round < (deps.maxRounds ?? 3); round++) {
    const rec = await runReencrypt({
      keys: epochKeys, transport, ...(deps.signal ? { signal: deps.signal } : {}),
      onProgress: (p) => deps.onProgress?.({ diaryId, phase: 'records', done: p.reencrypted, total }),
    });
    recordsDone = rec.reencrypted;
    const blobs = await reencryptBlobs({
      keys: epochKeys, ids: blobIds, transport: { get: (id) => getBlob(id), put: (id, ct) => putBlob(diaryId, id, ct) }, ...(deps.signal ? { signal: deps.signal } : {}),
      onProgress: (n) => deps.onProgress?.({ diaryId, phase: 'blobs', done: recordsDone + n, total }),
    });
    last = { status: 'incomplete', failedRecords: rec.failed.length, failedBlobs: blobs.failed.length, pendingRecords: 0, pendingBlobs: 0 };
    if (!rec.done || !blobs.done) return last; // Unlesbares nie anfassen und die Rotation nicht abschließen
    deps.onProgress?.({ diaryId, phase: 'complete', done: total, total });
    try {
      const r = await api.complete(diaryId);
      return { status: 'done', keyEpoch: r.keyEpoch };
    } catch (e) {
      if (!(e instanceof RotationApiError && e.code === 'rotation-incomplete')) throw e;
      last = { status: 'incomplete', failedRecords: 0, failedBlobs: 0, pendingRecords: 1, pendingBlobs: 0 };
    }
  }
  return last;
}
