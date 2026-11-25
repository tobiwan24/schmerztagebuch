// Anhänge über den Sync (A-032): Metadaten als Record, Inhalt verschlüsselt über /blobs; Server sieht keinen Klartext.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ATTACHMENT_MAX_BYTES, type AttachmentMeta } from '@stb/core';
import { createDevice, fixture, startServer } from './harness.js';

const MARKER = 'STB-PLAINTEXT-MARKER-ANHANG';

let ctx: Awaited<ReturnType<typeof fixture>>;
let server: Awaited<ReturnType<typeof startServer>>;
const devices: { close(): Promise<void> }[] = [];

beforeEach(async () => {
  ctx = await fixture();
  server = await startServer(ctx.diaryId);
});
afterEach(async () => {
  for (const d of devices.splice(0)) await d.close();
  await server.close();
});

async function device() {
  const d = await createDevice({ app: server.app, user: 'alice', diaryId: ctx.diaryId, dk: ctx.dk, clock: ctx.clock });
  devices.push(d);
  return d;
}

const meta = (name: string, bytes: Uint8Array): AttachmentMeta => ({
  id: ctx.newId(),
  diaryId: ctx.diaryId,
  entryId: ctx.newId(),
  kind: 'pdf',
  mime: 'application/pdf',
  name,
  sizeBytes: bytes.length,
  createdAt: '2026-03-05T18:00:00.000Z',
});

describe('Anhänge im Sync', () => {
  it('Gerät A lädt den Inhalt verschlüsselt hoch, Gerät B sieht die Metadaten und lädt den Inhalt bei Bedarf', async () => {
    const a = await device();
    const b = await device();
    const bytes = new TextEncoder().encode(`%PDF-1.4 ${MARKER} ${'x'.repeat(20_000)}`);
    const m = meta('Befund.pdf', bytes);
    await a.attachments.saveMany([{ meta: m, bytes }]);
    expect(await a.db.blob_outbox.count()).toBe(1);

    await a.engine.sync();
    expect(await a.db.blob_outbox.count()).toBe(0);
    // Server: eine Datei, nur Chiffretext
    const files = readdirSync(join(server.blobDir, ctx.diaryId));
    expect(files).toEqual([m.id]);
    const stored = readFileSync(join(server.blobDir, ctx.diaryId, m.id), 'utf8');
    expect(stored).not.toContain(MARKER);

    await b.engine.sync();
    expect(await b.attachments.get(m.id)).toEqual(m);
    expect(await b.attachments.data(m.id)).toBeUndefined();
    const downloaded = await b.engine.downloadBlob(ctx.diaryId, m.id);
    expect(downloaded && new TextDecoder().decode(downloaded)).toBe(new TextDecoder().decode(bytes));
    expect(await b.engine.downloadBlob(ctx.diaryId, ctx.newId())).toBeUndefined();
  });

  it('offline gespeicherte Anhänge bleiben in der Warteschlange und werden beim nächsten Sync hochgeladen', async () => {
    const a = await device();
    const bytes = new TextEncoder().encode('Foto');
    const m = { ...meta('Foto.jpg', bytes), kind: 'image' as const, mime: 'image/jpeg' };
    a.wire.offline = true;
    await a.attachments.saveMany([{ meta: m, bytes }]);
    await expect(a.engine.sync()).rejects.toThrow();
    expect(await a.db.blob_outbox.count()).toBe(1);
    a.wire.offline = false;
    await a.engine.sync();
    expect(await a.db.blob_outbox.count()).toBe(0);
    expect(server.db.prepare('SELECT COUNT(*) AS n FROM blobs').get()).toEqual({ n: 1 });
  });

  it('BLK-30: Speichern schreibt Inhalt und Metadaten, Entfernen löscht Metadaten (Tombstone, synchronisiert) und lokalen Inhalt', async () => {
    const a = await device();
    const b = await device();
    const bytes = new TextEncoder().encode('%PDF-1.4 Befund');
    const m = meta('Befund.pdf', bytes);
    await a.attachments.commit({ add: [{ meta: m, bytes }], removeIds: [] });
    expect(await a.attachments.listForEntry(m.diaryId, m.entryId)).toEqual([m]);
    expect(await a.attachments.data(m.id)).toBeDefined();
    await a.engine.sync();
    await b.engine.sync();
    expect(await b.attachments.get(m.id)).toEqual(m);

    await a.attachments.commit({ add: [], removeIds: [m.id] });
    expect(await a.attachments.get(m.id)).toBeUndefined();
    expect(await a.attachments.data(m.id)).toBeUndefined();
    expect(await a.db.blob_outbox.count()).toBe(0);
    await a.engine.sync();
    await b.engine.sync();
    expect(await b.attachments.get(m.id)).toBeUndefined();
  });

  it('BLK-30: zu große oder unzulässige Dateien werden abgelehnt, ohne dass etwas geschrieben wird', async () => {
    const a = await device();
    const ok = new TextEncoder().encode('Foto');
    const good = { ...meta('Foto.jpg', ok), kind: 'image' as const, mime: 'image/jpeg' };
    const bad = { ...meta('Notiz.txt', ok), mime: 'text/plain' };
    await expect(a.attachments.commit({ add: [{ meta: good, bytes: ok }, { meta: bad, bytes: ok }], removeIds: [] })).rejects.toThrow(/Anhang/);
    const huge = { ...meta('Groß.pdf', ok), sizeBytes: ATTACHMENT_MAX_BYTES + 1 };
    await expect(a.attachments.commit({ add: [{ meta: huge, bytes: ok }], removeIds: [] })).rejects.toThrow(/Anhang/);
    // Größe der Bytes zählt, nicht die behauptete Größe
    const lying = { ...meta('Lüge.pdf', ok), sizeBytes: 1 };
    await expect(a.attachments.commit({ add: [{ meta: lying, bytes: new Uint8Array(ATTACHMENT_MAX_BYTES + 1) }], removeIds: [] })).rejects.toThrow(/Anhang/);
    expect(await a.db.records.count()).toBe(0);
    expect(await a.db.blobs.count()).toBe(0);
    expect(await a.db.blob_outbox.count()).toBe(0);
  });

  it('BLK-30: wird das Formular verworfen (nichts übergeben), bleiben records, blobs und blob_outbox leer', async () => {
    const a = await device();
    await a.attachments.commit({ add: [], removeIds: [] });
    expect(await a.db.records.count()).toBe(0);
    expect(await a.db.blobs.count()).toBe(0);
    expect(await a.db.blob_outbox.count()).toBe(0);
  });
});
