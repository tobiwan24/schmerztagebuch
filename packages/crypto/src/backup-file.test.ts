import { describe, expect, it } from 'vitest';
import { generateBackupCode } from './backup-code.js';
import { openBackupFile, readBackupHeader, sealBackupFile } from './backup-file.js';

describe('Backup-Datei', () => {
  it('Rundweg mit Backup-Code und mit Passwort; Header im Klartext, Inhalt nicht', async () => {
    const code = await generateBackupCode();
    const content = JSON.stringify({ note: 'STB-PLAINTEXT-MARKER-BACKUP Übelkeit' });
    const file = await sealBackupFile(content, { kind: 'backup-code', code }, '2026-03-01T00:00:00.000Z');
    expect(file).not.toContain('STB-PLAINTEXT-MARKER');
    expect(file).not.toContain('Übelkeit');
    expect(readBackupHeader(file)).toMatchObject({ format: 'stb-backup', version: 1, secret: 'backup-code', kdf: { name: 'PBKDF2', iterations: 600_000 } });
    expect(await openBackupFile(file, { kind: 'backup-code', code: code.toLowerCase().replace(/-/g, ' ') })).toBe(content);

    const pw = await sealBackupFile(content, { kind: 'password', password: 'geheimes Backup' }, '2026-03-01T00:00:00.000Z');
    expect(await openBackupFile(pw, { kind: 'password', password: 'geheimes Backup' })).toBe(content);
    await expect(openBackupFile(pw, { kind: 'password', password: 'falsch' })).rejects.toMatchObject({ code: 'wrong-password' });
  });

  it('falscher Code, anderes Geheimnis und manipulierter Header werden abgelehnt', async () => {
    const code = await generateBackupCode();
    const file = await sealBackupFile('{}', { kind: 'backup-code', code }, '2026-03-01T00:00:00.000Z');
    await expect(openBackupFile(file, { kind: 'backup-code', code: await generateBackupCode() })).rejects.toMatchObject({ code: 'wrong-backup-code' });
    await expect(openBackupFile(file, { kind: 'password', password: code })).rejects.toMatchObject({ code: 'wrong-password' });
    const tampered = JSON.stringify({ ...JSON.parse(file), createdAt: '2020-01-01T00:00:00.000Z' });
    await expect(openBackupFile(tampered, { kind: 'backup-code', code })).rejects.toMatchObject({ code: 'wrong-backup-code' });
    expect(() => readBackupHeader('{"format":"anders"}')).toThrow();
    expect(() => readBackupHeader(JSON.stringify({ ...JSON.parse(file), version: 2 }))).toThrow(/Version/);
  });
});
