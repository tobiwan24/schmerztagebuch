import { describe, it, expect } from 'vitest';
import { AUTH_ERROR_CODES, authErrorText, toAuthErrorCode } from './errors.js';

describe('Fehlermeldungen', () => {
  it('CRY-11: jeder Fehlercode aus Spec 03 hat einen eigenen, handlungsorientierten deutschen Text', () => {
    expect([...AUTH_ERROR_CODES].sort()).toEqual([
      'challenge-expired', 'no-credential', 'prf-unsupported', 'server-unreachable', 'unwrap-failed',
      'webauthn-cancelled', 'webauthn-not-allowed', 'wrong-backup-code', 'wrong-password',
    ]);
    const texts = AUTH_ERROR_CODES.map((c) => authErrorText(c));
    expect(new Set(texts.map((t) => t.title + t.action)).size).toBe(AUTH_ERROR_CODES.length);
    for (const t of texts) {
      expect(t.title.length).toBeGreaterThan(5);
      expect(t.action.length).toBeGreaterThan(5);
    }
  });

  for (const code of AUTH_ERROR_CODES) {
    it(`CRY-11: Snapshot für ${code}`, () => {
      expect(authErrorText(code)).toMatchSnapshot();
    });
  }

  it('CRY-11: Browser-/Krypto-Fehler werden auf Codes abgebildet, nie auf ein generisches false', () => {
    expect(toAuthErrorCode(new DOMException('x', 'NotAllowedError'), { gesture: true })).toBe('webauthn-cancelled');
    expect(toAuthErrorCode(new DOMException('x', 'NotAllowedError'), { gesture: false })).toBe('webauthn-not-allowed');
    expect(toAuthErrorCode(new DOMException('x', 'InvalidStateError'))).toBe('no-credential');
    expect(toAuthErrorCode(new TypeError('Failed to fetch'))).toBe('server-unreachable');
    expect(toAuthErrorCode({ code: 'unwrap-failed' }, { factor: 'password' })).toBe('wrong-password');
    expect(toAuthErrorCode({ code: 'unwrap-failed' }, { factor: 'backup' })).toBe('wrong-backup-code');
    expect(toAuthErrorCode({ code: 'unwrap-failed' })).toBe('unwrap-failed');
    expect(toAuthErrorCode({ code: 'challenge-expired' })).toBe('challenge-expired');
    expect(toAuthErrorCode(new Error('prf-unsupported'))).toBe('prf-unsupported');
  });
});
