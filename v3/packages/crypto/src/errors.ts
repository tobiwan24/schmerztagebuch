/**
 * Unterscheidbare Krypto-Fehler. Die nutzerseitigen Codes aus Spec 03 („Fehlermeldungen") werden in den Apps
 * auf deutsche Texte abgebildet; Fehler werden nie zu einem generischen `false` reduziert.
 */
export type CryptoErrorCode =
  | 'decrypt-failed'
  | 'unsupported-version'
  | 'malformed-envelope'
  | 'invalid-aad'
  | 'unwrap-failed'
  | 'wrong-backup-code'
  | 'wrong-password'
  | 'invalid-rotation';

export class CryptoError extends Error {
  constructor(
    readonly code: CryptoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CryptoError';
  }
}
