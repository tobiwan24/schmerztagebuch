// Schlüssel eines Tagebuchs vom Server holen (M22, SHR-13): aktueller DK aus dem eigenen Wrap, während einer Rotation zusätzlich
// der vorherige DK aus `prevDkWrap` (Records beider Epochen lesbar). Wird nach einem Epochenwechsel und bei `409 stale-epoch` genutzt.
import { openPreviousDk, unwrapDkForMember } from '@stb/crypto';
import { decodeDkWrap } from '../auth/account-api.js';
import type { RotationServerState } from './rotation-api';

export interface EpochKeyApi {
  /** Eigene Mitgliedschaft (aktueller Wrap); `undefined`, wenn nicht (mehr) Mitglied. */
  membership(diaryId: string): Promise<{ keyEpoch: number; wrappedDk: string } | undefined>;
  rotation(diaryId: string): Promise<Pick<RotationServerState, 'keyEpoch' | 'rotating' | 'fromEpoch' | 'prevDkWrap'>>;
}

export interface LoadedDiaryKeys {
  key: CryptoKey;
  keyEpoch: number;
  wrappedDk: string;
  previous?: { key: CryptoKey; keyEpoch: number };
}

export async function loadDiaryKeys(api: EpochKeyApi, identity: CryptoKeyPair, diaryId: string): Promise<LoadedDiaryKeys | undefined> {
  const m = await api.membership(diaryId);
  if (!m) return undefined;
  const key = await unwrapDkForMember(decodeDkWrap(m.wrappedDk), identity, { diaryId, keyEpoch: m.keyEpoch });
  const out: LoadedDiaryKeys = { key, keyEpoch: m.keyEpoch, wrappedDk: m.wrappedDk };
  if (m.keyEpoch > 1) {
    const s = await api.rotation(diaryId);
    if (s.rotating && s.keyEpoch === m.keyEpoch && s.fromEpoch === m.keyEpoch - 1 && s.prevDkWrap) {
      out.previous = { keyEpoch: s.fromEpoch, key: await openPreviousDk(key, { diaryId, fromEpoch: s.fromEpoch, toEpoch: s.keyEpoch }, s.prevDkWrap) };
    }
  }
  return out;
}
