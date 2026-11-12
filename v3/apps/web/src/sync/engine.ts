// Sync-Engine (Spec 04): Push → (Konflikte) → Pull. Ver-/Entschlüsselung mit dem DK passiert ausschließlich hier, unmittelbar
// vor dem Push bzw. nach dem Pull (Spec 02/04). Lokal bleibt `payload` im lokalen Codec.
import { decryptRecord, encryptRecord, parseEnvelope } from '@stb/crypto';
import { PULL_LIMIT_MAX, PUSH_OPS_MAX, type PulledRecord, type PushOp, type PushResult } from '@stb/sync-protocol';
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
  /** Lokaler Codec, mit dem gepullte Records gespeichert werden (v3.0: `plain`). */
  writeCodec: string;
  transport: SyncTransport;
  keys: DiaryKeyProvider;
  /** Tagebücher, die synchronisiert werden (Modus `cloud-primary`). */
  diaryIds: () => Promise<string[]>;
  /** Seitengröße beim Pull (≤ 500). */
  pullLimit?: number;
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
  pullDiary(diaryId: string): Promise<{ applied: number; skippedPending: number }>;
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
      const decoded = await Promise.all(page.records.map(async (r: PulledRecord) => {
        const { keyEpoch } = parseEnvelope(r.ciphertext);
        const plain = await decryptRecord(key, { diaryId, kind: r.kind, recordId: r.recordId, keyEpoch }, r.ciphertext);
        const payload = JSON.parse(decoder.decode(plain)) as unknown;
        const encoded = await codec.encode(payload, { diaryId, kind: r.kind, recordId: r.recordId });
        return { r, payload, encoded };
      }));
      await db.transaction('rw', db.records, db.outbox, db.sync_state, async () => {
        for (const { r, payload, encoded } of decoded) {
          if (await db.outbox.where('recordId').equals(r.recordId).count()) {
            skippedPending++;
            continue;
          }
          const occurredAt = r.kind === 'entry' && payload && typeof (payload as { occurredAt?: unknown }).occurredAt === 'string'
            ? (payload as { occurredAt: string }).occurredAt
            : undefined;
          await db.records.put({
            id: r.recordId, diaryId, kind: r.kind, rev: r.rev, deleted: r.deleted ? 1 : 0, codec: codec.id,
            payload: encoded, base: encoded, localUpdatedAt: Date.now(),
            ...(occurredAt === undefined ? {} : { occurredAt }),
          });
          applied++;
        }
        await db.sync_state.put({ diaryId, cursor: page.nextSince, mode: 'cloud-primary' });
      });
      cursor = page.nextSince;
      if (!page.hasMore) break;
    }
    return { applied, skippedPending };
  }

  const flight = createSingleFlight(async () => {
    for (const diaryId of await deps.diaryIds()) {
      await pushDiary(diaryId);
      await pullDiary(diaryId);
    }
  });

  return {
    flight,
    sync: () => flight.trigger(),
    pushDiary,
    pullDiary,
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
