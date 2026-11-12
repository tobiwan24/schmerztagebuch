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
