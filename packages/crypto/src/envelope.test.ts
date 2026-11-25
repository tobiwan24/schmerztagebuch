import { describe, it, expect } from 'vitest';
import { encryptRecord, decryptRecord, parseEnvelope, generateDiaryKey, ENVELOPE_VERSION, buildAad, type RecordAad } from './envelope.js';
import { CryptoError } from './errors.js';
import { fromBase64Url, toBase64Url } from './encoding.js';

const aad: RecordAad = { diaryId: '0190a1b2-0000-7000-8000-000000000001', kind: 'entry', recordId: '0190a1b2-0000-7000-8000-000000000002', keyEpoch: 1 };
const plain = new TextEncoder().encode('{"marker":"STB-PLAINTEXT-MARKER-1"}');

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(CryptoError);
    return (e as CryptoError).code;
  }
  return 'kein Fehler';
}

describe('Record-Envelope', () => {
  it('CRY-01: Roundtrip mit korrekter AAD liefert den Klartext', async () => {
    const dk = await generateDiaryKey();
    const ct = await encryptRecord(dk, aad, plain);
    expect(ct).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(new TextDecoder().decode(fromBase64Url(ct))).not.toContain('STB-PLAINTEXT-MARKER');
    expect(await decryptRecord(dk, aad, ct)).toEqual(plain);
  });

  it('CRY-01: jeder Chiffretext nutzt einen neuen IV', async () => {
    const dk = await generateDiaryKey();
    const [a, b] = [await encryptRecord(dk, aad, plain), await encryptRecord(dk, aad, plain)];
    expect(a).not.toBe(b);
    expect(parseEnvelope(a).iv).not.toEqual(parseEnvelope(b).iv);
  });

  it('CRY-01: AAD-Format laut Spec 03', () => {
    expect(new TextDecoder().decode(buildAad(aad))).toBe(`stb/v3|${aad.diaryId}|entry|${aad.recordId}|1`);
  });

  it('CRY-02: Entschlüsselung schlägt fehl, wenn recordId, diaryId, kind oder keyEpoch abweichen', async () => {
    const dk = await generateDiaryKey();
    const ct = await encryptRecord(dk, aad, plain);
    for (const wrong of [
      { ...aad, recordId: '0190a1b2-0000-7000-8000-000000000099' },
      { ...aad, diaryId: '0190a1b2-0000-7000-8000-000000000098' },
      { ...aad, kind: 'template' },
      { ...aad, keyEpoch: 2 },
    ]) {
      expect(await codeOf(decryptRecord(dk, wrong, ct)), JSON.stringify(wrong)).toBe('decrypt-failed');
    }
  });

  it('CRY-02: falscher Schlüssel oder manipulierter Chiffretext schlagen fehl', async () => {
    const ct = await encryptRecord(await generateDiaryKey(), aad, plain);
    expect(await codeOf(decryptRecord(await generateDiaryKey(), aad, ct))).toBe('decrypt-failed');
    const bytes = fromBase64Url(ct);
    bytes[bytes.length - 1]! ^= 1;
    expect(await codeOf(decryptRecord(await generateDiaryKey(), aad, toBase64Url(bytes)))).toBe('decrypt-failed');
  });

  it('CRY-02: AAD-Felder mit Trennzeichen werden abgelehnt (keine Mehrdeutigkeit)', async () => {
    const dk = await generateDiaryKey();
    expect(await codeOf(encryptRecord(dk, { ...aad, kind: 'entry|x' }, plain))).toBe('invalid-aad');
    expect(await codeOf(encryptRecord(dk, { ...aad, keyEpoch: -1 }, plain))).toBe('invalid-aad');
  });

  it('CRY-03: Envelope enthält Version und keyEpoch', async () => {
    const dk = await generateDiaryKey();
    const ct = await encryptRecord(dk, { ...aad, keyEpoch: 0x01020304 }, plain);
    const env = parseEnvelope(ct);
    expect(env.version).toBe(ENVELOPE_VERSION);
    expect(env.keyEpoch).toBe(0x01020304);
    expect(env.iv).toHaveLength(12);
    const raw = fromBase64Url(ct);
    expect([...raw.subarray(0, 5)]).toEqual([ENVELOPE_VERSION, 1, 2, 3, 4]);
  });

  it('CRY-03: unbekannte Version wird mit klarer Fehlermeldung abgelehnt', async () => {
    const dk = await generateDiaryKey();
    const raw = fromBase64Url(await encryptRecord(dk, aad, plain));
    raw[0] = 99;
    const err = await decryptRecord(dk, aad, toBase64Url(raw)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CryptoError);
    expect((err as CryptoError).code).toBe('unsupported-version');
    expect((err as CryptoError).message).toContain('99');
  });

  it('CRY-03: zu kurzer oder kein base64url-Chiffretext wird als malformed abgelehnt', async () => {
    const dk = await generateDiaryKey();
    expect(await codeOf(decryptRecord(dk, aad, 'AQ'))).toBe('malformed-envelope');
    expect(await codeOf(decryptRecord(dk, aad, 'kein base64!'))).toBe('malformed-envelope');
  });
});
