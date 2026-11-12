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
