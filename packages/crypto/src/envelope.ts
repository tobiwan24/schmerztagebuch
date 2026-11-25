// Envelope-Format aller Chiffretexte (Spec 03):
//   Ciphertext = base64url( version[1] | keyEpoch[4, BE] | iv[12] | gcm-ciphertext+tag )
//   AAD        = utf8("stb/v3|" + diaryId + "|" + kind + "|" + recordId + "|" + keyEpoch)
import { CryptoError } from './errors.js';
import { fromBase64Url, toBase64Url, utf8 } from './encoding.js';

export const ENVELOPE_VERSION = 1;
const HEADER = 1 + 4 + 12;
const TAG = 16;

export interface RecordAad {
  diaryId: string;
  kind: string;
  recordId: string;
  keyEpoch: number;
}

export interface Envelope {
  version: number;
  keyEpoch: number;
  iv: Uint8Array<ArrayBuffer>;
  body: Uint8Array<ArrayBuffer>;
}

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

function checkAad(a: RecordAad): void {
  for (const [k, v] of [['diaryId', a.diaryId], ['kind', a.kind], ['recordId', a.recordId]] as const) {
    if (!v || v.includes('|')) throw new CryptoError('invalid-aad', `AAD-Feld ${k} ist leer oder enthält "|"`);
  }
  if (!Number.isInteger(a.keyEpoch) || a.keyEpoch < 0 || a.keyEpoch > 0xffffffff) {
    throw new CryptoError('invalid-aad', `keyEpoch muss eine 32-Bit-Ganzzahl ≥ 0 sein: ${a.keyEpoch}`);
  }
}

export function buildAad(a: RecordAad): Uint8Array<ArrayBuffer> {
  checkAad(a);
  return utf8(`stb/v3|${a.diaryId}|${a.kind}|${a.recordId}|${a.keyEpoch}`);
}

/** Neuer Diary Key (AES-GCM-256). Extrahierbar, damit er per AES-KW verpackt werden kann (Spec 03). */
export function generateDiaryKey(): Promise<CryptoKey> {
  return subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/** Zerlegt einen Chiffretext. Unbekannte Version → `unsupported-version`, zu kurz/kaputt → `malformed-envelope`. */
export function parseEnvelope(ciphertext: string): Envelope {
  const raw = fromBase64Url(ciphertext);
  if (raw.length < 1) throw new CryptoError('malformed-envelope', 'Leerer Chiffretext');
  const version = raw[0]!;
  if (version !== ENVELOPE_VERSION) {
    throw new CryptoError('unsupported-version', `Unbekannte Envelope-Version ${version} (unterstützt: ${ENVELOPE_VERSION})`);
  }
  if (raw.length < HEADER + TAG) throw new CryptoError('malformed-envelope', 'Chiffretext ist zu kurz');
  const keyEpoch = new DataView(raw.buffer, raw.byteOffset + 1, 4).getUint32(0, false);
  return { version, keyEpoch, iv: raw.slice(5, HEADER), body: raw.slice(HEADER) };
}

export async function encryptRecord(key: CryptoKey, aad: RecordAad, plaintext: Uint8Array<ArrayBuffer>): Promise<string> {
  const additionalData = buildAad(aad);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const body = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData }, key, plaintext));
  const out = new Uint8Array(HEADER + body.length);
  out[0] = ENVELOPE_VERSION;
  new DataView(out.buffer).setUint32(1, aad.keyEpoch, false);
  out.set(iv, 5);
  out.set(body, HEADER);
  return toBase64Url(out);
}

/** Entschlüsselt; jede Abweichung in Schlüssel, AAD (inkl. keyEpoch) oder Chiffretext → `decrypt-failed`. */
export async function decryptRecord(key: CryptoKey, aad: RecordAad, ciphertext: string): Promise<Uint8Array<ArrayBuffer>> {
  const additionalData = buildAad(aad);
  const env = parseEnvelope(ciphertext);
  if (env.keyEpoch !== aad.keyEpoch) {
    throw new CryptoError('decrypt-failed', `keyEpoch des Chiffretexts (${env.keyEpoch}) passt nicht zur AAD (${aad.keyEpoch})`);
  }
  try {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: env.iv, additionalData }, key, env.body));
  } catch {
    throw new CryptoError('decrypt-failed', 'Entschlüsselung fehlgeschlagen (Schlüssel, Datensatzbindung oder Daten passen nicht)');
  }
}
