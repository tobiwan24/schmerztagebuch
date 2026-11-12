import { describe, it, expect } from 'vitest';
import { generateUmk, wrapUmk, unwrapUmk, PBKDF2_ITERATIONS, KDF_SALT_BYTES, type UmkFactor } from './umk.js';
import { CryptoError } from './errors.js';
import { fromBase64Url } from './encoding.js';

const raw = async (k: CryptoKey) => new Uint8Array(await crypto.subtle.exportKey('raw', k));
const prf = (fill: number) => new Uint8Array(32).fill(fill);

async function code(p: Promise<unknown>): Promise<string> {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(CryptoError);
  return (e as CryptoError).code;
}

const factors: [string, UmkFactor, UmkFactor][] = [
  ['Passkey-PRF', { kind: 'passkey', prf: prf(7) }, { kind: 'passkey', prf: prf(8) }],
  ['Backup-Code', { kind: 'backup', code: 'ABCD EFGH IJKL MNOP QRST UVWX YZ23 4567' }, { kind: 'backup', code: 'ABCD EFGH IJKL MNOP QRST UVWX YZ23 4566' }],
  ['Passwort', { kind: 'password', password: 'korrekt pferd batterie' }, { kind: 'password', password: 'Korrekt pferd batterie' }],
];

describe('UMK-Wrap', () => {
  for (const [name, right, wrong] of factors) {
    it(`CRY-04: Wrap/Unwrap mit ${name}-KEK liefert dieselbe UMK`, async () => {
      const umk = await generateUmk();
      const wrap = await wrapUmk(umk, right);
      expect(wrap.factor).toBe(right.kind);
      expect(fromBase64Url(wrap.salt)).toHaveLength(KDF_SALT_BYTES);
      expect(await raw(await unwrapUmk(wrap, right))).toEqual(await raw(umk));
    });

    it(`CRY-04: falscher ${name} → unwrap-failed`, async () => {
      const wrap = await wrapUmk(await generateUmk(), right);
      expect(await code(unwrapUmk(wrap, wrong))).toBe('unwrap-failed');
    });
  }

  it('CRY-04: Backup-Code-Prüfung ist tolerant gegenüber Leerzeichen und Kleinschreibung', async () => {
    const umk = await generateUmk();
    const wrap = await wrapUmk(umk, { kind: 'backup', code: 'ABCD EFGH IJKL MNOP QRST UVWX YZ23 4567' });
    const k = await unwrapUmk(wrap, { kind: 'backup', code: ' abcdefgh-ijklmnop qrstuvwx yz234567 ' });
    expect(await raw(k)).toEqual(await raw(umk));
  });

  it('CRY-04: Faktor einer anderen Art oder manipulierter Wrap → unwrap-failed', async () => {
    const wrap = await wrapUmk(await generateUmk(), factors[0]![1]);
    expect(await code(unwrapUmk(wrap, factors[2]![1]))).toBe('unwrap-failed');
    const tampered = { ...wrap, wrapped: wrap.wrapped.slice(0, -2) + (wrap.wrapped.endsWith('AA') ? 'AB' : 'AA') };
    expect(await code(unwrapUmk(tampered, factors[0]![1]))).toBe('unwrap-failed');
  });

  it('CRY-04: dieselbe UMK lässt sich mit mehreren Faktoren parallel verpacken (Passkey + Backup-Code)', async () => {
    const umk = await generateUmk();
    const [a, b] = [await wrapUmk(umk, factors[0]![1]), await wrapUmk(umk, factors[1]![1])];
    expect(await raw(await unwrapUmk(a, factors[0]![1]))).toEqual(await raw(await unwrapUmk(b, factors[1]![1])));
  });

  it('CRY-04: PRF-Ausgabe muss 32 Byte haben', async () => {
    await expect(wrapUmk(await generateUmk(), { kind: 'passkey', prf: new Uint8Array(16) })).rejects.toThrow();
  });

  it('CRY-06: PBKDF2 nutzt mindestens 600.000 Iterationen, Salt 16 Byte', () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
    expect(KDF_SALT_BYTES).toBe(16);
  });
});
