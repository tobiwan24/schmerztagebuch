// Persistierter Suchindex (Spec 06 „Erweiterungen v3.x“, M23, ANA-33, A-126): lokaler, verschlüsselter, nicht
// synchronisierter Stand in `device` (`search-index`). Verschlüsselt mit einem aus der UMK abgeleiteten Schlüssel
// (HKDF `stb/v3/search-index`) im Record-Envelope; nur sinnvoll, wenn „Daten auf dem Gerät verschlüsseln“ an ist.
// Jeder Fehler (anderer Schlüssel, Manipulation, altes Format) → kein Stand, der Index wird normal neu aufgebaut.
import { decryptRecord, deriveSearchIndexKey, encryptRecord } from '@stb/crypto';
import type { StbDb } from './db.js';

const ID = 'search-index';
const AAD = { diaryId: 'device', kind: 'searchIndex', recordId: ID, keyEpoch: 1 } as const;

interface Stored {
  v: 1;
  ct: string;
}

export async function saveSearchSnapshot(db: StbDb, umk: CryptoKey, snapshot: unknown): Promise<void> {
  const ct = await encryptRecord(await deriveSearchIndexKey(umk), AAD, new TextEncoder().encode(JSON.stringify(snapshot)));
  await db.device.put({ id: ID, value: { v: 1, ct } satisfies Stored });
}

/** Gespeicherter Stand oder `undefined` (nichts gespeichert, nicht entschlüsselbar, kaputt). */
export async function loadSearchSnapshot(db: StbDb, umk: CryptoKey): Promise<unknown> {
  const row = (await db.device.get(ID))?.value as Partial<Stored> | undefined;
  if (row?.v !== 1 || typeof row.ct !== 'string') return undefined;
  try {
    return JSON.parse(new TextDecoder().decode(await decryptRecord(await deriveSearchIndexKey(umk), AAD, row.ct))) as unknown;
  } catch {
    return undefined;
  }
}
