// Anhänge (Spec 02 `Attachment`, A-032): Metadaten als Record `attachmentMeta` über das Record-Repository (Outbox/Sync
// wie Einträge), Inhalt im lokalen `blobs`-Store. Jeder neue Inhalt kommt in die Upload-Warteschlange `blob_outbox`;
// die Sync-Engine lädt ihn für Cloud-Tagebücher verschlüsselt hoch (lokal-only bleibt er liegen, bis umgestellt wird).
import { ATTACHMENT_MAX_BYTES, attachmentMetaSchema, checkAttachmentFile, type AttachmentMeta } from '@stb/core';
import type { StbDb } from '../db.js';
import type { RecordRepository } from './records.js';

export const ATTACHMENT_KIND = 'attachmentMeta';

export interface AttachmentInput {
  meta: AttachmentMeta;
  bytes: Uint8Array<ArrayBuffer>;
}

export interface AttachmentChanges {
  add: readonly AttachmentInput[];
  removeIds: readonly string[];
}

export interface AttachmentRepository {
  /** Anhänge eines Formulars speichern (BLK-30): erst alles prüfen (nichts wird geschrieben, wenn eine Datei unzulässig ist),
   *  dann Inhalte → Metadaten, zuletzt entfernte Anhänge löschen. Der Aufrufer speichert danach den Eintrag. */
  commit(changes: AttachmentChanges): Promise<void>;
  /** Anhang löschen: Metadaten als Tombstone (synchronisiert), lokaler Inhalt und offener Upload entfallen. */
  remove(id: string): Promise<void>;
  /** Inhalte zuerst, dann Metadaten (eine Transaktion je Schritt) — ein Abbruch hinterlässt höchstens einen verwaisten Blob. */
  saveMany(items: readonly AttachmentInput[]): Promise<void>;
  /** Nur Inhalte + Upload-Warteschlange (Metadaten schreibt der Aufrufer, z. B. ein Import-Plan). */
  saveBlobs(items: readonly AttachmentInput[]): Promise<void>;
  get(id: string): Promise<AttachmentMeta | undefined>;
  listForEntry(diaryId: string, entryId: string): Promise<AttachmentMeta[]>;
  listAll(): Promise<AttachmentMeta[]>;
  /** Lokaler Inhalt oder `undefined` (z. B. auf einem anderen Gerät noch nicht geladen). */
  data(id: string): Promise<Uint8Array<ArrayBuffer> | undefined>;
  /** Vom Server geladenen Inhalt lokal ablegen (ohne erneuten Upload). */
  storeDownloaded(id: string, bytes: Uint8Array<ArrayBuffer>): Promise<void>;
}

export function createAttachmentRepository(db: StbDb, records: RecordRepository, clock: { now(): number }): AttachmentRepository {
  async function saveBlobs(items: readonly AttachmentInput[]): Promise<void> {
    if (!items.length) return;
    const metas = items.map((i) => attachmentMetaSchema.parse(i.meta));
    await db.transaction('rw', db.blobs, db.blob_outbox, async () => {
      for (const [n, i] of items.entries()) {
        await db.blobs.put({ id: metas[n]!.id, data: i.bytes });
        await db.blob_outbox.put({ id: metas[n]!.id, diaryId: metas[n]!.diaryId, createdAt: clock.now() });
      }
    });
  }
  function check(items: readonly AttachmentInput[]): void {
    for (const { meta, bytes } of items) {
      const verdict = checkAttachmentFile({ mime: meta.mime, sizeBytes: Math.max(meta.sizeBytes, bytes.length) });
      if (!verdict.ok) throw new Error(`Anhang „${meta.name}“ abgelehnt: ${verdict.reason === 'tooLarge' ? `größer als ${ATTACHMENT_MAX_BYTES} Byte` : 'Typ nicht erlaubt'}`);
      if (verdict.kind !== meta.kind) throw new Error(`Anhang „${meta.name}“ abgelehnt: Art passt nicht zum Typ`);
    }
  }
  async function remove(id: string): Promise<void> {
    await records.remove(id);
    await db.transaction('rw', db.blobs, db.blob_outbox, async () => {
      await db.blobs.delete(id);
      await db.blob_outbox.delete(id);
    });
  }
  return {
    remove,
    async commit({ add, removeIds }) {
      check(add);
      if (add.length) await this.saveMany(add);
      for (const id of removeIds) await remove(id);
    },
    saveBlobs,
    async saveMany(items) {
      if (!items.length) return;
      check(items);
      await saveBlobs(items);
      await records.putMany(items.map(({ meta }) => ({ id: meta.id, diaryId: meta.diaryId, kind: ATTACHMENT_KIND, payload: attachmentMetaSchema.parse(meta) })));
    },
    async get(id) {
      const rec = await records.get(id);
      return rec && !rec.deleted && rec.kind === ATTACHMENT_KIND ? attachmentMetaSchema.parse(rec.payload) : undefined;
    },
    async listForEntry(diaryId, entryId) {
      return (await records.list(diaryId, ATTACHMENT_KIND)).map((r) => attachmentMetaSchema.parse(r.payload)).filter((m) => m.entryId === entryId);
    },
    async listAll() {
      return (await records.listKind(ATTACHMENT_KIND)).map((r) => attachmentMetaSchema.parse(r.payload));
    },
    async data(id) {
      const row = await db.blobs.get(id);
      if (!row) return undefined;
      return row.data instanceof Uint8Array ? (row.data as Uint8Array<ArrayBuffer>) : new Uint8Array(await row.data.arrayBuffer());
    },
    async storeDownloaded(id, bytes) {
      await db.blobs.put({ id, data: bytes });
    },
  };
}
