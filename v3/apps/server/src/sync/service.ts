// Sync-Logik (Spec 04): optimistische Nebenläufigkeit über `rev`, globale Reihenfolge über `seq`.
// Der Server sieht nur Chiffretext und kann nicht mergen — Konflikte löst der Client.
import type { PullQuery, PullResponse, PushRequest, PushResult } from '@stb/sync-protocol';
import type { Db } from '../db.js';
import { envelopeEpoch } from '../epoch.js';

interface RecordRow {
  id: string;
  diary_id: string;
  kind: string;
  rev: number;
  seq: number;
  deleted: number;
  ciphertext: string;
}

/** Wendet alle Ops in einer Transaktion an; jede Op wird einzeln übernommen oder als Konflikt gemeldet. */
export function applyPush(db: Db, req: PushRequest, now: number): PushResult[] {
  const get = db.prepare('SELECT id, diary_id, kind, rev, seq, deleted, ciphertext FROM records WHERE diary_id = ? AND id = ?');
  const nextSeq = db.prepare('UPDATE sync_counter SET seq = seq + 1 WHERE id = 1 RETURNING seq');
  const upsert = db.prepare(`
    INSERT INTO records (id, diary_id, kind, rev, seq, deleted, ciphertext, size, updated_at, key_epoch)
    VALUES (@id, @diaryId, @kind, @rev, @seq, @deleted, @ciphertext, @size, @now, @epoch)
    ON CONFLICT(diary_id, id) DO UPDATE SET rev = @rev, seq = @seq, deleted = @deleted, ciphertext = @ciphertext,
      size = @size, updated_at = @now, key_epoch = @epoch
  `);

  return db.transaction(() =>
    req.ops.map((op): PushResult => {
      const current = get.get(req.diaryId, op.recordId) as RecordRow | undefined;
      const conflict = (): PushResult => ({
        recordId: op.recordId,
        status: 'conflict',
        server: current
          ? { rev: current.rev, ciphertext: current.ciphertext, deleted: current.deleted === 1 }
          : { rev: 0, ciphertext: null, deleted: false },
      });
      // IDs sind pro Tagebuch eindeutig (Schema v6); eine andere Art unter derselben ID ist ein Konflikt.
      if (current && current.kind !== op.kind) return conflict();
      if ((current?.rev ?? 0) !== op.baseRev) return conflict();
      const { seq } = nextSeq.get() as { seq: number };
      const rev = op.baseRev + 1;
      upsert.run({
        id: op.recordId, diaryId: req.diaryId, kind: op.kind, rev, seq, deleted: op.deleted ? 1 : 0,
        ciphertext: op.ciphertext, size: op.ciphertext.length, now, epoch: envelopeEpoch(op.ciphertext),
      });
      return { recordId: op.recordId, status: 'applied', rev, seq };
    }),
  )();
}

export function pull(db: Db, q: PullQuery): PullResponse {
  const rows = db
    .prepare('SELECT id, kind, rev, seq, deleted, ciphertext FROM records WHERE diary_id = ? AND seq > ? ORDER BY seq LIMIT ?')
    .all(q.diaryId, q.since, q.limit + 1) as RecordRow[];
  const hasMore = rows.length > q.limit;
  const page = rows.slice(0, q.limit);
  return {
    records: page.map((r) => ({ recordId: r.id, kind: r.kind, rev: r.rev, seq: r.seq, deleted: r.deleted === 1, ciphertext: r.ciphertext })),
    nextSince: page.at(-1)?.seq ?? q.since,
    hasMore,
  };
}
