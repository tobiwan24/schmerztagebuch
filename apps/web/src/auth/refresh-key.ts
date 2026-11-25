// Schlüssel eines Tagebuchs vom Server neu laden (M22, SHR-13). Eigenes Modul, damit es erst bei Bedarf (Epochenwechsel, `409 stale-epoch`) geladen wird.
import { openIdentityKey } from '@stb/crypto';
import type { StbDb } from '../data/db.js';
import { loadDiaryKeys } from '../sharing/epoch-keys.js';
import type { RotationApi } from '../sharing/rotation-api.js';
import type { AccountApi } from './account-api.js';
import type { CloudAccount } from './cloud-account.js';

const dkRowId = (diaryId: string) => `dk:${diaryId}`;

interface DkRow {
  diaryId: string;
  keyEpoch: number;
  wrappedDk: string;
}

export type SetDiaryKey = (diaryId: string, key: CryptoKey, keyEpoch: number, previous?: { key: CryptoKey; keyEpoch: number }) => void;

/**
 * Schlüssel eines Tagebuchs vom Server neu laden (M22, SHR-13): eigener Wrap der aktuellen Epoche, während einer Rotation zusätzlich
 * der vorherige DK. Speichert den Wrap lokal (nur bei höherer Epoche) und setzt die Schlüssel in der Sitzung. `false`: keine Mitgliedschaft mehr.
 */
export async function refreshDiaryKey(
  db: StbDb,
  api: Pick<AccountApi, 'listDiaries'>,
  rotation: Pick<RotationApi, 'state'>,
  account: CloudAccount,
  umk: CryptoKey,
  diaryId: string,
  setKey: SetDiaryKey,
): Promise<boolean> {
  const identity = await openIdentityKey(umk, account.cloud.identityPublicKey, account.cloud.identitySealed);
  const loaded = await loadDiaryKeys(
    { membership: async (id) => (await api.listDiaries()).find((m) => m.diaryId === id), rotation: (id) => rotation.state(id) },
    identity,
    diaryId,
  );
  if (!loaded) return false;
  const stored = (await db.keys.get(dkRowId(diaryId)))?.value as DkRow | undefined;
  if (!stored || stored.keyEpoch <= loaded.keyEpoch) await db.keys.put({ id: dkRowId(diaryId), value: { diaryId, keyEpoch: loaded.keyEpoch, wrappedDk: loaded.wrappedDk } satisfies DkRow });
  setKey(diaryId, loaded.key, loaded.keyEpoch, loaded.previous);
  return true;
}
