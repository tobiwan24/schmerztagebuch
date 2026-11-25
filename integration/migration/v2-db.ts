// Test-Helfer: legt eine v2-`PainDiaryDB` mit dem echten v2-Schema (Dexie v21, Stores wie v2 `src/db.ts`) an.
import Dexie from 'dexie';
import type { V2Dump } from '@stb/core';

export async function createV2Database(dump: V2Dump, name = 'PainDiaryDB'): Promise<void> {
  const db = new Dexie(name);
  db.version(21).stores({
    templates: '++id, name, order, syncId',
    entries: '++id, templateId, timestamp, encrypted, *tags, syncId',
    settings: 'key',
  });
  await db.open();
  await db.table('templates').bulkPut(dump.templates);
  await db.table('entries').bulkPut(dump.entries.map((e) => ({ ...e, timestamp: new Date(e.timestamp) })));
  await db.table('settings').bulkPut(dump.settings);
  db.close();
}

/** Alle Stores roh auslesen (für den Byte-Vergleich vorher/nachher). */
export async function rawDump(name = 'PainDiaryDB'): Promise<{ version: number; stores: Record<string, unknown[]>; indexes: Record<string, string[]> }> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const stores: Record<string, unknown[]> = {};
  const indexes: Record<string, string[]> = {};
  for (const s of Array.from(db.objectStoreNames)) {
    const tx = db.transaction(s, 'readonly');
    const store = tx.objectStore(s);
    indexes[s] = Array.from(store.indexNames);
    stores[s] = await new Promise((resolve, reject) => {
      const r = store.getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  const version = db.version;
  db.close();
  return { version, stores, indexes };
}
