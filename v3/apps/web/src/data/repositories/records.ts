// Generisches Record-Repository: kapselt Codec, Validierung und Outbox in einer Dexie-Transaktion (Spec 02).
// Validierung und Kodierung laufen **vor** der Transaktion — so bleibt die Transaktion frei von fremden Promises
// (WebCrypto), und ein Fehler darin hinterlässt nichts. Record und Outbox-Op werden gemeinsam geschrieben (DM-10).
import type { Clock } from '@stb/core';
import type { StbDb, LocalRecord, OutboxOp } from '../db.js';
import type { CodecRegistry } from '../codec/registry.js';

export interface RecordInput {
  id: string;
  diaryId: string;
  kind: string;
  payload: unknown;
  occurredAt?: string;
}

export interface DecodedRecord {
  id: string;
  diaryId: string;
  kind: string;
  rev: number;
  deleted: boolean;
  payload: unknown;
  occurredAt?: string;
}

export interface RecordRepository {
  put(input: RecordInput, opts?: { validate?: (payload: unknown) => void }): Promise<void>;
  remove(id: string): Promise<void>;
  get(id: string): Promise<DecodedRecord | undefined>;
  /** Nicht gelöschte Records eines Tagebuchs und einer Art. */
  list(diaryId: string, kind: string): Promise<DecodedRecord[]>;
}

export interface RecordRepositoryOptions {
  registry: CodecRegistry;
  /** Codec für neue Schreibvorgänge; gelesen wird immer mit `record.codec`. */
  writeCodec: string;
  clock: Clock;
  /** `false` im Modus `local-only` (Spec 04: Outbox wird nicht befüllt). */
  outbox: boolean;
}

export function createRecordRepository(db: StbDb, o: RecordRepositoryOptions): RecordRepository {
  async function enqueue(rec: LocalRecord, op: OutboxOp['op']): Promise<void> {
    if (!o.outbox) return;
    const pending = await db.outbox.where('recordId').equals(rec.id).first();
    if (pending?.seq !== undefined) {
      // neuere Op ersetzt ältere, baseRev bleibt die älteste (Spec 04)
      await db.outbox.update(pending.seq, { op, createdAt: o.clock.now(), attempts: 0 });
    } else {
      await db.outbox.add({ recordId: rec.id, diaryId: rec.diaryId, kind: rec.kind, op, baseRev: rec.rev, createdAt: o.clock.now(), attempts: 0 });
    }
  }

  async function decode(rec: LocalRecord): Promise<DecodedRecord> {
    const payload = await o.registry.get(rec.codec).decode(rec.payload, { diaryId: rec.diaryId, kind: rec.kind, recordId: rec.id });
    return {
      id: rec.id,
      diaryId: rec.diaryId,
      kind: rec.kind,
      rev: rec.rev,
      deleted: rec.deleted === 1,
      payload,
      ...(rec.occurredAt === undefined ? {} : { occurredAt: rec.occurredAt }),
    };
  }

  return {
    async put(input, opts) {
      opts?.validate?.(input.payload);
      const codec = o.registry.get(o.writeCodec);
      const encoded = await codec.encode(input.payload, { diaryId: input.diaryId, kind: input.kind, recordId: input.id });
      await db.transaction('rw', db.records, db.outbox, async () => {
        const existing = await db.records.get(input.id);
        if (existing && (existing.diaryId !== input.diaryId || existing.kind !== input.kind)) {
          throw new Error(`Record ${input.id}: diaryId/kind dürfen sich nicht ändern`);
        }
        const rec: LocalRecord = {
          id: input.id,
          diaryId: input.diaryId,
          kind: input.kind,
          rev: existing?.rev ?? 0,
          deleted: 0,
          codec: codec.id,
          payload: encoded,
          ...(existing?.base === undefined ? {} : { base: existing.base }),
          localUpdatedAt: o.clock.now(),
          ...(input.occurredAt === undefined ? {} : { occurredAt: input.occurredAt }),
        };
        await db.records.put(rec);
        await enqueue(rec, 'upsert');
      });
    },

    async remove(id) {
      await db.transaction('rw', db.records, db.outbox, async () => {
        const existing = await db.records.get(id);
        if (!existing) return;
        const rec: LocalRecord = { ...existing, deleted: 1, localUpdatedAt: o.clock.now() };
        await db.records.put(rec);
        await enqueue(rec, 'delete');
      });
    },

    async get(id) {
      const rec = await db.records.get(id);
      return rec ? decode(rec) : undefined;
    },

    async list(diaryId, kind) {
      const rows = await db.records.where('[diaryId+kind]').equals([diaryId, kind]).toArray();
      return Promise.all(rows.filter((r) => r.deleted === 0).map(decode));
    },
  };
}
