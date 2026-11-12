// Lokale Datenbank `stb-v3` (Spec 02 „Lokale Speicherung"). Nur Repositories, Codecs und die Sync-Engine greifen zu.
import { Dexie, type EntityTable, type Table } from 'dexie';

/**
 * Lokaler Datensatz. Außerhalb von `payload`/`base` stehen nur nicht-sensible Index-Felder;
 * `occurredAt` ist das einzige fachliche Index-Feld (Zeitraum-Abfragen).
 */
export interface LocalRecord {
  id: string;
  diaryId: string;
  kind: string;
  /** Vom Server vergeben/bestätigt; 0 = noch nie synchronisiert. */
  rev: number;
  /** 0/1 statt boolean (in IndexedDB indexierbar). */
  deleted: 0 | 1;
  /** ID des PayloadCodecs, mit dem `payload`/`base` kodiert sind (`plain`, später `aes`). */
  codec: string;
  payload: unknown;
  /** Zuletzt synchronisierte Version für den 3-Wege-Merge (Spec 04). */
  base?: unknown;
  localUpdatedAt: number;
  occurredAt?: string;
}

/** Ausstehende Operation (Spec 04 „Outbox"). Pro `recordId` höchstens eine. */
export interface OutboxOp {
  seq?: number;
  recordId: string;
  diaryId: string;
  kind: string;
  op: 'upsert' | 'delete';
  baseRev: number;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

export interface KeyRow {
  id: string;
  value: unknown;
}

export interface SyncStateRow {
  diaryId: string;
  cursor: number;
  mode: 'local-only' | 'cloud-primary';
}

export class StbDb extends Dexie {
  records!: EntityTable<LocalRecord, 'id'>;
  outbox!: EntityTable<OutboxOp, 'seq'>;
  blobs!: Table<{ id: string; data: Blob | Uint8Array }, string>;
  keys!: EntityTable<KeyRow, 'id'>;
  sync_state!: EntityTable<SyncStateRow, 'diaryId'>;
  device!: EntityTable<KeyRow, 'id'>;

  constructor(name = 'stb-v3') {
    super(name);
    this.version(1).stores({
      records: 'id, [diaryId+kind], [diaryId+occurredAt], localUpdatedAt',
      outbox: '++seq, recordId',
      blobs: 'id',
      keys: 'id',
      sync_state: 'diaryId',
      device: 'id',
    });
  }
}
