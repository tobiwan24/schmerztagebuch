export { CryptoError, type CryptoErrorCode } from './errors.js';
export { toBase64Url, fromBase64Url } from './encoding.js';
export { DOMAINS } from './domains.js';
export {
  ENVELOPE_VERSION,
  buildAad,
  generateDiaryKey,
  parseEnvelope,
  encryptRecord,
  decryptRecord,
  type RecordAad,
  type Envelope,
} from './envelope.js';
export { generateUmk, wrapUmk, unwrapUmk, deriveKek, PBKDF2_ITERATIONS, KDF_SALT_BYTES, type UmkFactor, type UmkWrap } from './umk.js';
export { normalizeBackupCode } from './backup-code.js';
