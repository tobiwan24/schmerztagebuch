// Sync-Engine (Spec 04). Teil 1: Push. Ver-/Entschlüsselung mit dem DK passiert ausschließlich hier, unmittelbar
// vor dem Push bzw. nach dem Pull (Spec 02/04). Lokal bleibt `payload` im lokalen Codec.
import { encryptRecord } from '@stb/crypto';
import { PUSH_OPS_MAX, type PushOp, type PushResult } from '@stb/sync-protocol';
import type { StbDb, OutboxOp, LocalRecord } from '../data/db.js';
import type { CodecRegistry } from '../data/codec/registry.js';
import type { SyncTransport } from './transport.js';
import { createSingleFlight, type SingleFlight } from './single-flight.js';

/** Liefert den aktuellen Diary Key eines Tagebuchs (gehalten von `data/crypto-session.ts`, Spec 01). */
export interface DiaryKeyProvider {
  get(diaryId: string): Promise<{ key: CryptoKey; keyEpoch: number }>;
}

export interface SyncEngineDeps {
  db: StbDb;
  registry: CodecRegistry;
  transport: SyncTransport;
  keys: DiaryKeyProvider;
  /** Tagebücher, die synchronisiert werden (Modus `cloud-primary`). */
  diaryIds: () => Promise<string[]>;
}

/** Vorlagen (und Tagebuch-Metadaten) vor Einträgen, damit Einträge nie vor ihrer Vorlagenversion ankommen. */
const KIND_ORDER = ['diary', 'template', 'templateVersion'];
const kindRank = (kind: string) => {
  const i = KIND_ORDER.indexOf(kind);
  return i < 0 ? KIND_ORDER.length : i;
};

export interface PushSummary {
  applied: number;
  conflicts: Extract<PushResult, { status: 'conflict' }>[];
}

export interface SyncEngine {
  /** Ein vollständiger Lauf über alle Tagebücher; nie parallel (Single-Flight). */
  sync(): Promise<void>;
  pushDiary(diaryId: string): Promise<PushSummary>;
  /** Registriert Auslöser (`online`, `visibilitychange` → sichtbar). Rückgabe: Abmelden. */
  attachTriggers(target: EventTarget, isVisible?: () => boolean): () => void;
  readonly flight: SingleFlight;
}

const encoder = new TextEncoder();

export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const { db, registry, transport, keys } = deps;

  async function toPushOp(op: OutboxOp, rec: LocalRecord): Promise<PushOp> {
    const { key, keyEpoch } = await keys.get(op.diaryId);
    const payload = await registry.get(rec.codec).decode(rec.payload, { diaryId: rec.diaryId, kind: rec.kind, recordId: rec.id });
    const plaintext = encoder.encode(JSON.stringify(payload));
    const ciphertext = await encryptRecord(key, { diaryId: op.diaryId, kind: op.kind, recordId: op.recordId, keyEpoch }, plaintext);
    return { recordId: op.recordId, kind: op.kind, baseRev: op.baseRev, deleted: rec.deleted === 1, ciphertext };
  }

  async function pushDiary(diaryId: string): Promise<PushSummary> {
    const summary: PushSummary = { applied: 0, conflicts: [] };
    const pending = (await db.outbox.toArray())
      .filter((o) => o.diaryId === diaryId)
      .sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || (a.seq ?? 0) - (b.seq ?? 0));

    for (let i = 0; i < pending.length; i += PUSH_OPS_MAX) {
      const batch: { op: OutboxOp; snapshot: LocalRecord }[] = [];
      for (const op of pending.slice(i, i + PUSH_OPS_MAX)) {
        const rec = await db.records.get(op.recordId);
        if (rec) batch.push({ op, snapshot: rec });
      }
      if (!batch.length) continue;
      const ops = await Promise.all(batch.map((b) => toPushOp(b.op, b.snapshot)));
      const { results } = await transport.push({ diaryId, ops });

      await db.transaction('rw', db.records, db.outbox, async () => {
        for (const [n, result] of results.entries()) {
          const { op, snapshot } = batch[n]!;
          if (result.status === 'conflict') {
            summary.conflicts.push(result);
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
    return summary;
  }

  const flight = createSingleFlight(async () => {
    for (const diaryId of await deps.diaryIds()) await pushDiary(diaryId);
  });

  return {
    flight,
    sync: () => flight.trigger(),
    pushDiary,
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
