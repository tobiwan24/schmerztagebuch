// Erkennen und Lesen der v2-Datenbank (Spec 11, Schritt 1): korrekte Zählung, keinerlei Veränderung.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildV2Dump, canonical, plainV2Source } from '@stb/core';
import { countV2, openV2Database, readV2Snapshot, V2_DB_NAME } from '../../apps/web/src/migration/v2/source.js';
import { decodeV2Snapshot } from '../../apps/web/src/migration/v2/decode.js';
import { createV2Database, rawDump } from './v2-db.js';

async function deleteDb(name: string) {
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase(name);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}

afterEach(async () => deleteDb(V2_DB_NAME));

describe('v2-Datenbank erkennen', () => {
  it('MIG-01: v3 erkennt eine PainDiaryDB (Schema v21) und zählt Vorlagen und Einträge korrekt', async () => {
    const dump = buildV2Dump();
    await createV2Database(dump);
    const snap = (await readV2Snapshot())!;
    expect(snap.idbVersion).toBe(210);
    expect(snap.templates).toHaveLength(4);
    expect(snap.entries).toHaveLength(10);
    // Zeitstempel (in v2 als Date gespeichert) kommen als ISO-Text
    expect(snap.entries.find((e) => e.id === 1)!.timestamp).toBe('2026-03-02T07:15:00.000Z');
    expect(countV2(snap)).toEqual({
      templates: 2, // 2 gelöschte Vorlagen zählen nicht
      entries: 9, // 1 gelöschter Eintrag zählt nicht
      encryptedEntries: 1,
      cloudEntries: 0,
      hasPassword: false,
      cloudSync: false,
    });
  });

  it('MIG-02: Öffnen und Lesen verändert die v2-DB nicht (alle Stores byte-gleich, Schema-Version bleibt 21)', async () => {
    await createV2Database(buildV2Dump());
    const before = await rawDump();
    await readV2Snapshot();
    await readV2Snapshot();
    const db = await openV2Database();
    db!.close();
    const after = await rawDump();
    expect(after.version).toBe(210);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it('MIG-02: ohne v2-Daten wird keine leere PainDiaryDB angelegt', async () => {
    expect(await readV2Snapshot()).toBeNull();
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).not.toContain(V2_DB_NAME);
  });

  it('Schnappschuss aus der DB ergibt dieselbe Transformations-Eingabe wie die Fixture (gelöschte nicht entschlüsselt)', async () => {
    const dump = buildV2Dump();
    await createV2Database(dump);
    const src = await decodeV2Snapshot((await readV2Snapshot())!, {});
    const expected = plainV2Source(dump);
    const strip = (x: typeof src) => ({ templates: x.templates, entries: x.entries.filter((e) => !e.deleted).map((e) => ({ ...e, deleted: undefined })) });
    expect(canonical(strip(src))).toBe(canonical(strip({ ...expected, entries: expected.entries.map((e) => (e.id === 10 ? { ...e, decryptError: 'v2-Passwort fehlt' } : e)) })));
  });
});
