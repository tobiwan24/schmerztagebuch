// Einziges Modul, das entschlüsselte Schlüssel hält (Spec 01). Sitzung: UMK + DKs nur im Speicher (Spec 03 „Sitzung").
// „Auf diesem Gerät entsperrt bleiben“ ist entfallen (RDM-035, A-151): beim Öffnen startet stattdessen der Passkey.
// Device-Key und -Wrap früherer Versionen räumt `forgetDevice` beim Start weg.
import { LOCAL_DK_EPOCH, deriveLocalDiaryKey } from '@stb/crypto';
import type { StbDb } from './db.js';

/** Schlüssel früherer Versionen („entsperrt bleiben“); werden nur noch gelöscht. */
const DEVICE_KEY_ID = 'device-key';
const WRAP_ID = 'umk-device-wrap';

export interface CryptoSession {
  isUnlocked(): boolean;
  unlock(umk: CryptoKey): void;
  /** Sperren: alle Schlüssel aus dem Speicher verwerfen. */
  lock(): void;
  umk(): CryptoKey;
  /** Setzt den aktuellen DK; während einer Rotation zusätzlich den vorherigen (Lesen in beiden Epochen, M22). */
  setDiaryKey(diaryId: string, key: CryptoKey, keyEpoch: number, previous?: { key: CryptoKey; keyEpoch: number }): void;
  /** Für die Sync-Engine (`DiaryKeyProvider`). */
  readonly keys: {
    get(diaryId: string): Promise<{ key: CryptoKey; keyEpoch: number }>;
    /**
     * Schlüssel einer bestimmten Epoche (aktuell oder vorherige); `undefined`, wenn unbekannt. Tagebücher ohne Konto-DK
     * (nur auf diesem Gerät) nutzen den aus der UMK abgeleiteten DK (Epoche 1, A-125).
     */
    forEpoch(diaryId: string, keyEpoch: number): Promise<CryptoKey | undefined>;
  };
  /** Löscht Device-Key und -Wrap früherer Versionen („entsperrt bleiben“), falls vorhanden. */
  forgetDevice(): Promise<void>;
}

export function createCryptoSession(db: StbDb): CryptoSession {
  let umk: CryptoKey | null = null;
  type DiaryKeyEntry = { key: CryptoKey; keyEpoch: number; previous?: { key: CryptoKey; keyEpoch: number } };
  const dks = new Map<string, DiaryKeyEntry>();

  const requireUmk = (): CryptoKey => {
    if (!umk) throw new Error('Gesperrt — bitte entsperren');
    return umk;
  };

  /**
   * Bekannter DK; sonst für Tagebücher, die nicht mit dem Konto synchronisiert werden (kein `cloud-primary`), der aus der
   * UMK abgeleitete lokale DK (A-125). Cloud-Tagebuch ohne geladenen DK → `undefined` (nie ein falscher Schlüssel).
   */
  const resolve = async (diaryId: string): Promise<DiaryKeyEntry | undefined> => {
    const current = requireUmk();
    const known = dks.get(diaryId);
    if (known) return known;
    if ((await db.sync_state.get(diaryId))?.mode === 'cloud-primary') return undefined;
    if (umk !== current) return undefined; // zwischenzeitlich gesperrt/gewechselt
    const derived: DiaryKeyEntry = { key: await deriveLocalDiaryKey(current, diaryId), keyEpoch: LOCAL_DK_EPOCH };
    // Während des Ableitens kann ein Konto-DK gesetzt worden sein: der hat Vorrang.
    return dks.get(diaryId) ?? (dks.set(diaryId, derived), derived);
  };

  const session: CryptoSession = {
    isUnlocked: () => umk !== null,
    unlock(k) {
      umk = k;
    },
    lock() {
      umk = null;
      dks.clear();
    },
    umk: requireUmk,
    setDiaryKey(diaryId, key, keyEpoch, previous) {
      requireUmk();
      // Gleiche Epoche erneut gesetzt (z. B. Wrap neu geladen): bisher bekannten Vorgänger behalten
      const kept = previous ?? (dks.get(diaryId)?.keyEpoch === keyEpoch ? dks.get(diaryId)?.previous : undefined);
      dks.set(diaryId, { key, keyEpoch, ...(kept ? { previous: kept } : {}) });
    },
    keys: {
      async get(diaryId) {
        const k = await resolve(diaryId);
        if (!k) throw new Error(`Kein Schlüssel für Tagebuch ${diaryId}`);
        return { key: k.key, keyEpoch: k.keyEpoch };
      },
      async forEpoch(diaryId, keyEpoch) {
        const k = await resolve(diaryId);
        if (k?.keyEpoch === keyEpoch) return k.key;
        return k?.previous?.keyEpoch === keyEpoch ? k.previous.key : undefined;
      },
    },

    async forgetDevice() {
      await db.transaction('rw', db.device, db.keys, async () => {
        await db.device.delete(DEVICE_KEY_ID);
        await db.keys.delete(WRAP_ID);
      });
    },
  };
  return session;
}
