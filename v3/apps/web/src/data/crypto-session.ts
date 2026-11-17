// Einziges Modul, das entschlüsselte Schlüssel hält (Spec 01). Sitzung: UMK + DKs nur im Speicher (Spec 03 „Sitzung").
// „Auf diesem Gerät entsperrt bleiben": UMK wird mit einem **nicht-extrahierbaren** Device-Key (in IndexedDB) per AES-KW
// verpackt; Ablauf nach einstellbarer Dauer (Standard 7 Tage), sofort widerrufbar (CRY-12).
// Hinweis: Das ist Bequemlichkeit, kein Schutz gegen Zugriff auf den Gerätespeicher (lokale Daten sind ohne die Einstellung
// „Daten auf dem Gerät verschlüsseln“ unverschlüsselt).
import { LOCAL_DK_EPOCH, deriveLocalDiaryKey, fromBase64Url, toBase64Url } from '@stb/crypto';
import type { StbDb } from './db.js';

export const STAY_UNLOCKED_DEFAULT_DAYS = 7;
const DEVICE_KEY_ID = 'device-key';
const WRAP_ID = 'umk-device-wrap';
const DAY_MS = 86_400_000;

interface DeviceWrap {
  wrapped: string;
  expiresAt: number;
}

export interface CryptoSession {
  isUnlocked(): boolean;
  unlock(umk: CryptoKey): void;
  /** Sperren: alle Schlüssel aus dem Speicher verwerfen (der Device-Wrap bleibt, falls aktiv). */
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
  stayUnlocked(days?: number): Promise<void>;
  /** Beim App-Start: entsperrt aus dem Device-Wrap, falls gültig. Abgelaufen → Wrap löschen, gesperrt bleiben. */
  restore(): Promise<boolean>;
  /** Läuft „entsperrt bleiben“? Ablaufzeit oder `null` (nie aktiviert, widerrufen oder abgelaufen). */
  stayStatus(): Promise<{ expiresAt: number } | null>;
  forgetDevice(): Promise<void>;
}

export function createCryptoSession(db: StbDb, clock: { now(): number }): CryptoSession {
  let umk: CryptoKey | null = null;
  type DiaryKeyEntry = { key: CryptoKey; keyEpoch: number; previous?: { key: CryptoKey; keyEpoch: number } };
  const dks = new Map<string, DiaryKeyEntry>();
  const subtle = () => globalThis.crypto.subtle;

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

    async stayUnlocked(days = STAY_UNLOCKED_DEFAULT_DAYS) {
      const current = requireUmk();
      const deviceKey = await subtle().generateKey({ name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']);
      const wrapped = new Uint8Array(await subtle().wrapKey('raw', current, deviceKey, 'AES-KW'));
      const wrap: DeviceWrap = { wrapped: toBase64Url(wrapped), expiresAt: clock.now() + days * DAY_MS };
      await db.transaction('rw', db.device, db.keys, async () => {
        await db.device.put({ id: DEVICE_KEY_ID, value: deviceKey });
        await db.keys.put({ id: WRAP_ID, value: wrap });
      });
    },

    async restore() {
      const [deviceRow, wrapRow] = await Promise.all([db.device.get(DEVICE_KEY_ID), db.keys.get(WRAP_ID)]);
      const wrap = wrapRow?.value as DeviceWrap | undefined;
      if (!deviceRow || !wrap) return false;
      if (wrap.expiresAt <= clock.now()) {
        await session.forgetDevice();
        return false;
      }
      try {
        umk = await subtle().unwrapKey('raw', fromBase64Url(wrap.wrapped), deviceRow.value as CryptoKey, 'AES-KW', { name: 'AES-GCM', length: 256 }, true, [
          'encrypt',
          'decrypt',
        ]);
        return true;
      } catch {
        await session.forgetDevice();
        return false;
      }
    },

    async stayStatus() {
      const wrap = (await db.keys.get(WRAP_ID))?.value as DeviceWrap | undefined;
      if (!wrap) return null;
      if (wrap.expiresAt <= clock.now()) {
        await session.forgetDevice();
        return null;
      }
      return { expiresAt: wrap.expiresAt };
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
