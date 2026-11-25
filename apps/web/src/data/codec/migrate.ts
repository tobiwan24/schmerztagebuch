// Hintergrund-Migration der lokalen Verschlüsselung (v3.x, Spec 02, DM-17): schreibt Records von einem Codec auf einen
// anderen um (Standard `plain` → `aes`). Datenverlust ist das Hauptrisiko, deshalb:
//  - Jeder Record wird **vor** dem Überschreiben neu kodiert und mit dem Ziel-Codec zurückgelesen (Gegenprobe); weicht das
//    Ergebnis ab oder wirft ein Codec, bleibt der Record unverändert und wird als `failed` gemeldet.
//  - Geschrieben wird je Batch in einer Transaktion und nur, wenn der Record seit dem Lesen unverändert ist (sonst
//    `skipped`, im nächsten Durchgang erneut).
//  - Idempotent und fortsetzbar: ausgewählt werden nur Records mit dem Quell-Codec; ein Abbruch an beliebiger Stelle
//    hinterlässt einen lesbaren gemischten Bestand.
// Die Outbox enthält keine Payloads (nur Art, Operation, Revision), es gibt also nichts mitzuverschlüsseln; `base` wird
// gemeinsam mit `payload` umkodiert.
import type { LocalRecord, StbDb } from '../db.js';
import type { CodecRegistry } from './registry.js';
import { indexOccurredAt } from './index-fields.js';

export interface MigrationOptions {
  registry: CodecRegistry;
  from?: string;
  to?: string;
  batchSize?: number;
  /** Beendet nach dem laufenden Batch (Aufräumen/Abbruch durch den Nutzer). */
  signal?: AbortSignal;
  onProgress?: (p: { migrated: number; remaining: number }) => void;
}

export interface MigrationResult {
  migrated: number;
  /** Seit dem Lesen geändert — wird im nächsten Durchgang erneut versucht. */
  skipped: number;
  /** Nicht umkodierbar (Codec-Fehler oder Gegenprobe abweichend); der Record bleibt unverändert. */
  failed: { id: string; reason: string }[];
  /** Records, die noch den Quell-Codec haben. */
  remaining: number;
  aborted: boolean;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Anzahl der Records mit dem angegebenen Codec. */
export async function countByCodec(db: StbDb, codec: string): Promise<number> {
  return db.records.filter((r) => r.codec === codec).count();
}

export async function migrateRecords(db: StbDb, opts: MigrationOptions): Promise<MigrationResult> {
  const fromId = opts.from ?? 'plain';
  const toId = opts.to ?? 'aes';
  const batchSize = opts.batchSize ?? 50;
  const from = opts.registry.get(fromId);
  const to = opts.registry.get(toId);
  const result: MigrationResult = { migrated: 0, skipped: 0, failed: [], remaining: 0, aborted: false };
  const failedIds = new Set<string>();

  // Höchstens drei Durchgänge: Records, die während der Migration geändert wurden, kommen im nächsten wieder dran.
  for (let pass = 0; pass < 3; pass++) {
    const ids = (await db.records.filter((r) => r.codec === fromId && !failedIds.has(r.id)).primaryKeys()) as string[];
    if (!ids.length) break;
    let progress = 0;
    for (let i = 0; i < ids.length; i += batchSize) {
      if (opts.signal?.aborted) {
        result.aborted = true;
        break;
      }
      const rows = (await db.records.bulkGet(ids.slice(i, i + batchSize))).filter((r): r is LocalRecord => r !== undefined && r.codec === fromId);
      const prepared: { rec: LocalRecord; payload: unknown; base: unknown }[] = [];
      for (const rec of rows) {
        const ctx = { diaryId: rec.diaryId, kind: rec.kind, recordId: rec.id };
        try {
          const payloadObj = await from.decode(rec.payload, ctx);
          const payload = await to.encode(payloadObj, ctx);
          if (!same(await to.decode(payload, ctx), payloadObj)) throw new Error('Gegenprobe (payload) weicht ab');
          let base: unknown;
          if (rec.base !== undefined) {
            const baseObj = await from.decode(rec.base, ctx);
            base = await to.encode(baseObj, ctx);
            if (!same(await to.decode(base, ctx), baseObj)) throw new Error('Gegenprobe (base) weicht ab');
          }
          prepared.push({ rec, payload, base });
        } catch (e) {
          failedIds.add(rec.id);
          result.failed.push({ id: rec.id, reason: e instanceof Error ? e.message : String(e) });
        }
      }
      await db.transaction('rw', db.records, async () => {
        for (const { rec, payload, base } of prepared) {
          const cur = await db.records.get(rec.id);
          if (!cur || cur.codec !== fromId || cur.localUpdatedAt !== rec.localUpdatedAt || cur.rev !== rec.rev || !same(cur.payload, rec.payload) || !same(cur.base, rec.base)) {
            result.skipped++;
            continue;
          }
          const next: LocalRecord = { ...cur, codec: toId, payload };
          if (base !== undefined) next.base = base;
          const day = indexOccurredAt(toId, cur.occurredAt);
          if (day !== undefined) next.occurredAt = day;
          await db.records.put(next);
          result.migrated++;
          progress++;
        }
      });
      opts.onProgress?.({ migrated: result.migrated, remaining: ids.length - Math.min(ids.length, i + batchSize) });
    }
    if (result.aborted || progress === 0) break;
  }
  result.remaining = (await countByCodec(db, fromId));
  return result;
}
