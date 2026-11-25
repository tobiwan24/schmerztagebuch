// Konfliktprotokoll (Spec 02 `ConflictLog`, UI-18): lokale Records der Art `conflictLog`, die die Sync-Engine beim
// Zusammenführen anlegt. Sie werden nicht synchronisiert — darum liest und schreibt dieses Repository direkt am Store,
// ohne Outbox. Der unterlegene Wert bleibt auf dem Gerät und wird nirgends exportiert.
import type { StbDb } from '../db.js';
import type { CodecRegistry } from '../codec/registry.js';

export const CONFLICT_KIND = 'conflictLog';

export interface ConflictItem {
  id: string;
  diaryId: string;
  /** ID des betroffenen Records (z. B. Eintrag). */
  recordId: string;
  /** Art des betroffenen Records (`entry`, `template`, …). */
  kind: string;
  /** Betroffenes Feld; `*` = ganzer Datensatz. */
  field: string;
  losingValue: unknown;
  resolvedAt: string;
  seen: boolean;
}

export interface ConflictRepository {
  /** Alle Protokolleinträge, neueste zuerst. */
  list(): Promise<ConflictItem[]>;
  unseenCount(): Promise<number>;
  /** Alle ungesehenen als gesehen markieren (lokal, ohne Outbox). */
  markAllSeen(): Promise<void>;
}

interface Payload {
  id: string;
  recordId: string;
  kind: string;
  losingPayload: { field?: string; losingValue?: unknown };
  resolvedAt: string;
  seenByUser: boolean;
}

export function createConflictRepository(db: StbDb, registry: CodecRegistry, writeCodec: string): ConflictRepository {
  async function list(): Promise<ConflictItem[]> {
    const rows = await db.records.filter((r) => r.kind === CONFLICT_KIND && r.deleted === 0).toArray();
    const items = await Promise.all(rows.map(async (r): Promise<ConflictItem> => {
      const p = (await registry.get(r.codec).decode(r.payload, { diaryId: r.diaryId, kind: r.kind, recordId: r.id })) as Payload;
      return { id: r.id, diaryId: r.diaryId, recordId: p.recordId, kind: p.kind, field: p.losingPayload?.field ?? '*', losingValue: p.losingPayload?.losingValue, resolvedAt: p.resolvedAt, seen: p.seenByUser };
    }));
    return items.sort((a, b) => b.resolvedAt.localeCompare(a.resolvedAt));
  }
  return {
    list,
    async unseenCount() {
      return (await list()).filter((c) => !c.seen).length;
    },
    async markAllSeen() {
      const rows = await db.records.filter((r) => r.kind === CONFLICT_KIND && r.deleted === 0).toArray();
      const codec = registry.get(writeCodec);
      for (const r of rows) {
        const p = (await registry.get(r.codec).decode(r.payload, { diaryId: r.diaryId, kind: r.kind, recordId: r.id })) as Payload;
        if (p.seenByUser) continue;
        const payload = await codec.encode({ ...p, seenByUser: true }, { diaryId: r.diaryId, kind: r.kind, recordId: r.id });
        await db.records.update(r.id, { payload, codec: writeCodec });
      }
    },
  };
}
