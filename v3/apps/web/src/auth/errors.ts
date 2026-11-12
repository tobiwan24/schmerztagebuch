// Verbindlich unterscheidbare Fehlercodes (Spec 03 „Fehlermeldungen"): jeder hat einen eigenen, handlungsorientierten
// Text (CRY-11). Fehler werden nie zu einem generischen `false` reduziert.
import { de } from '@/i18n/de';

export const AUTH_ERROR_CODES = [
  'webauthn-cancelled',
  'webauthn-not-allowed',
  'prf-unsupported',
  'no-credential',
  'server-unreachable',
  'challenge-expired',
  'wrong-backup-code',
  'wrong-password',
  'unwrap-failed',
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export function authErrorText(code: AuthErrorCode): { title: string; action: string } {
  return de.authErrors[code];
}

/**
 * Bildet Fehler aus WebAuthn, Netzwerk und Krypto auf einen Code ab. `gesture`: ob der Aufruf direkt aus einer
 * Nutzeraktion kam (NotAllowedError ohne Geste = verlorene Geste statt Abbruch). `factor`: welcher Faktor entpackt wurde.
 */
export function toAuthErrorCode(e: unknown, ctx: { gesture?: boolean; factor?: 'passkey' | 'password' | 'backup' } = {}): AuthErrorCode {
  const name = e instanceof DOMException ? e.name : undefined;
  if (name === 'NotAllowedError' || name === 'AbortError') return ctx.gesture === false ? 'webauthn-not-allowed' : 'webauthn-cancelled';
  if (name === 'InvalidStateError' || name === 'NotFoundError') return 'no-credential';
  if (name === 'NotSupportedError') return 'prf-unsupported';
  if (e instanceof TypeError) return 'server-unreachable';
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : e instanceof Error ? e.message : '';
  if (code === 'unwrap-failed') return ctx.factor === 'password' ? 'wrong-password' : ctx.factor === 'backup' ? 'wrong-backup-code' : 'unwrap-failed';
  if ((AUTH_ERROR_CODES as readonly string[]).includes(code)) return code as AuthErrorCode;
  return 'unwrap-failed';
}
