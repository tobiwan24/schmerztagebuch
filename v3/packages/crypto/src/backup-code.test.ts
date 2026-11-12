import { describe, it, expect } from 'vitest';
import { generateBackupCode, parseBackupCode, normalizeBackupCode, BACKUP_CODE_ENTROPY_BITS } from './backup-code.js';
import { CryptoError } from './errors.js';

const FORMAT = /^[A-Z2-7]{8}(-[A-Z2-7]{8}){3}$/;

describe('Backup-Code', () => {
  it('CRY-07: 128 Bit Entropie, Format Base32 in 8er-Gruppen', async () => {
    expect(BACKUP_CODE_ENTROPY_BITS).toBe(128);
    const codes = await Promise.all(Array.from({ length: 200 }, () => generateBackupCode()));
    for (const c of codes) expect(c).toMatch(FORMAT);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('CRY-07: erzeugte Codes bestehen die Prüfung', async () => {
    const c = await generateBackupCode();
    expect(await parseBackupCode(c)).toBe(normalizeBackupCode(c));
  });

  it('CRY-07: Prüfung ist tolerant gegenüber Leerzeichen, Bindestrichen und Kleinschreibung', async () => {
    const c = await generateBackupCode();
    const messy = `  ${c.toLowerCase().replace(/-/g, ' ').replace(/(.{4})/g, '$1 ')}  `;
    expect(await parseBackupCode(messy)).toBe(normalizeBackupCode(c));
  });

  it('CRY-07: Tippfehler, falsche Länge oder fremde Zeichen → wrong-backup-code', async () => {
    const c = normalizeBackupCode(await generateBackupCode());
    const typo = (c[0] === 'A' ? 'B' : 'A') + c.slice(1);
    for (const bad of [typo, c.slice(1), `${c}A`, `${c.slice(0, -1)}1`, '']) {
      const e = await parseBackupCode(bad).then(() => null, (x: unknown) => x);
      expect(e, bad).toBeInstanceOf(CryptoError);
      expect((e as CryptoError).code).toBe('wrong-backup-code');
    }
  });
});
