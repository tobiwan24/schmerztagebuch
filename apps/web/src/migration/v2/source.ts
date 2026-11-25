// v2-Datenbank `PainDiaryDB` nur lesend öffnen (Spec 11, Schritt 1). Bewusst rohes IndexedDB statt Dexie: Öffnen ohne
// Versionsangabe löst nie ein Schema-Upgrade aus, alle Zugriffe laufen in `readonly`-Transaktionen. Existiert die
// Datenbank nicht, wird das Anlegen im `upgradeneeded` abgebrochen — v3 erzeugt keine leere v2-Datenbank (MIG-02).
import type { V2Template } from '@stb/core';
import type { V2Settings } from './crypto';

export const V2_DB_NAME = 'PainDiaryDB';

export interface V2EntryRow {
  id: number;
  templateId: number;
  timestamp: string;
  encrypted: boolean;
  data: string;
  tags?: string[];
  editedAt?: string;
  encryptionVersion?: number;
  encryptionSource?: 'cloud' | 'local';
  syncId?: string;
  updatedAt?: string;
  deleted?: boolean;
}

export interface V2Snapshot {
  /** IndexedDB-Version (Dexie: Schema × 10, also 210 für v21). */
  idbVersion: number;
  templates: V2Template[];
  entries: V2EntryRow[];
  settings: V2Settings & Record<string, string | undefined>;
}

export interface V2Counts {
  templates: number;
  entries: number;
  encryptedEntries: number;
  /** Einträge, die nur mit dem v2-Cloud-Schlüssel lesbar sind. */
  cloudEntries: number;
  hasPassword: boolean;
  cloudSync: boolean;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB-Fehler'));
  });
}

/** Öffnet `PainDiaryDB` ohne Upgrade; `null`, wenn sie auf diesem Gerät nicht existiert. */
export function openV2Database(factory: IDBFactory = indexedDB): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    let created = false;
    const req = factory.open(V2_DB_NAME);
    req.onupgradeneeded = () => {
      // Nur bei nicht vorhandener DB (Version 0 → 1): Anlegen abbrechen.
      created = true;
      req.transaction?.abort();
    };
    req.onsuccess = () => {
      if (created) {
        req.result.close();
        resolve(null);
      } else resolve(req.result);
    };
    req.onerror = (ev) => {
      if (created) {
        ev.preventDefault();
        resolve(null);
      } else reject(req.error ?? new Error('PainDiaryDB ließ sich nicht öffnen'));
    };
    req.onblocked = () => reject(new Error('PainDiaryDB ist blockiert (v2 in einem anderen Tab offen?)'));
  });
}

async function readAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  if (!db.objectStoreNames.contains(store)) return [];
  return request(db.transaction(store, 'readonly').objectStore(store).getAll() as IDBRequest<T[]>);
}

const toIso = (v: unknown): string => {
  const d = v instanceof Date ? v : new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
};

/** Liest alle drei Stores vollständig (nur lesend). */
export async function readV2Snapshot(factory: IDBFactory = indexedDB): Promise<V2Snapshot | null> {
  const db = await openV2Database(factory);
  if (!db) return null;
  try {
    const [templates, rawEntries, settingRows] = await Promise.all([
      readAll<V2Template>(db, 'templates'),
      readAll<Record<string, unknown>>(db, 'entries'),
      readAll<{ key: string; value: string }>(db, 'settings'),
    ]);
    const entries = rawEntries.map((e) => ({ ...e, timestamp: toIso(e.timestamp) }) as V2EntryRow);
    const settings = Object.fromEntries(settingRows.map((s) => [s.key, s.value])) as V2Snapshot['settings'];
    return { idbVersion: db.version, templates, entries, settings };
  } finally {
    db.close();
  }
}

/** Zählung für die Erkennung (MIG-01): nur nicht gelöschte Vorlagen und Einträge. */
export function countV2(s: V2Snapshot): V2Counts {
  const live = s.entries.filter((e) => !e.deleted);
  return {
    templates: s.templates.filter((t) => !t.deleted).length,
    entries: live.length,
    encryptedEntries: live.filter((e) => e.encrypted).length,
    cloudEntries: live.filter((e) => e.encrypted && e.encryptionSource === 'cloud').length,
    hasPassword: !!(s.settings.passwordTest || s.settings.passwordTestV2),
    cloudSync: s.settings.cloudSyncEnabled === 'true',
  };
}
