// Codec `aes`: AES-GCM mit DK und AAD wie beim Server-Upload (Spec 03). In v3.0 nur für Tests (DM-09, DM-12) und
// als Vorbereitung der lokalen Verschlüsselung (v3.x).
import { decryptRecord, encryptRecord, parseEnvelope } from '@stb/crypto';
import type { PayloadCodec } from './types.js';

export function createAesCodec(dk: CryptoKey, currentKeyEpoch: () => number): PayloadCodec {
  return {
    id: 'aes',
    encode: async (obj, ctx) =>
      encryptRecord(dk, { ...ctx, keyEpoch: currentKeyEpoch() }, new TextEncoder().encode(JSON.stringify(obj))),
    decode: async (raw, ctx) => {
      if (typeof raw !== 'string') throw new TypeError('aes-Codec erwartet einen Chiffretext-String');
      const { keyEpoch } = parseEnvelope(raw);
      return JSON.parse(new TextDecoder().decode(await decryptRecord(dk, { ...ctx, keyEpoch }, raw))) as unknown;
    },
  };
}

/** Schlüssel je Tagebuch (passt zu `CryptoSession.keys`). */
export interface DiaryKeys {
  get(diaryId: string): Promise<{ key: CryptoKey; keyEpoch: number }>;
  /** Schlüssel einer bestimmten Epoche; `undefined`, wenn unbekannt. */
  forEpoch(diaryId: string, keyEpoch: number): Promise<CryptoKey | undefined>;
}

/**
 * Codec `aes` für die lokale Verschlüsselung (v3.x, DM-16): Schlüssel je Tagebuch aus der Sitzung; die Epoche steht im
 * Chiffretext, gelesen wird mit dem passenden Schlüssel. Ohne Schlüssel (gesperrt) → Fehler, nie Klartext.
 */
export function createDiaryAesCodec(keys: DiaryKeys): PayloadCodec {
  return {
    id: 'aes',
    encode: async (obj, ctx) => {
      const { key, keyEpoch } = await keys.get(ctx.diaryId);
      return encryptRecord(key, { ...ctx, keyEpoch }, new TextEncoder().encode(JSON.stringify(obj)));
    },
    decode: async (raw, ctx) => {
      if (typeof raw !== 'string') throw new TypeError('aes-Codec erwartet einen Chiffretext-String');
      const { keyEpoch } = parseEnvelope(raw);
      const key = await keys.forEpoch(ctx.diaryId, keyEpoch);
      if (!key) throw new Error(`Kein Schlüssel für Tagebuch ${ctx.diaryId}, Epoche ${keyEpoch}`);
      return JSON.parse(new TextDecoder().decode(await decryptRecord(key, { ...ctx, keyEpoch }, raw))) as unknown;
    },
  };
}
