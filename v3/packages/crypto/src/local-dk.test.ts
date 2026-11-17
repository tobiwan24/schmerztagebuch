import { describe, it, expect } from 'vitest';
import { deriveLocalDiaryKey, LOCAL_DK_EPOCH } from './local-dk.js';
import { generateUmk } from './umk.js';
import { decryptRecord, encryptRecord } from './envelope.js';

const raw = async (k: CryptoKey) => new Uint8Array(await crypto.subtle.exportKey('raw', k));
const aad = (diaryId: string) => ({ diaryId, kind: 'entry', recordId: 'r1', keyEpoch: LOCAL_DK_EPOCH });

describe('DK für lokale Tagebücher (A-125)', () => {
  it('A-125: deterministisch je UMK und Tagebuch, verschieden bei anderem Tagebuch oder anderer UMK', async () => {
    const umk = await generateUmk();
    const a1 = await raw(await deriveLocalDiaryKey(umk, 'diary-a'));
    expect(a1).toHaveLength(32);
    expect(await raw(await deriveLocalDiaryKey(umk, 'diary-a'))).toEqual(a1);
    expect(await raw(await deriveLocalDiaryKey(umk, 'diary-b'))).not.toEqual(a1);
    expect(await raw(await deriveLocalDiaryKey(await generateUmk(), 'diary-a'))).not.toEqual(a1);
    expect(a1).not.toEqual(await raw(umk));
  });

  it('A-125: der abgeleitete Schlüssel verschlüsselt (Epoche 1) und ist extrahierbar (für den Wrap beim Wechsel ins Konto)', async () => {
    const umk = await generateUmk();
    const dk = await deriveLocalDiaryKey(umk, 'diary-a');
    const ct = await encryptRecord(dk, aad('diary-a'), new TextEncoder().encode('geheim'));
    // Ein zweiter, aus dem exportierten DK neu importierter Schlüssel (wie nach dem Wrap) liest dasselbe.
    const again = await crypto.subtle.importKey('raw', await raw(dk), { name: 'AES-GCM' }, false, ['decrypt']);
    expect(new TextDecoder().decode(await decryptRecord(again, aad('diary-a'), ct))).toBe('geheim');
  });
});
