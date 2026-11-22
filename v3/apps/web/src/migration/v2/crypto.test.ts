import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CryptoError } from '@stb/crypto';
import { decryptV1, decryptV2Entry, decryptWithKey, fromBase64, unlockV2Password, unwrapDekWithBackupCode, unwrapDekWithPrf } from './crypto';

// Mit dem Original-v2-Code erzeugt (fixtures/v2/crypto-vectors.json) — prüft Kompatibilität, nicht nur Symmetrie.
const V = JSON.parse(readFileSync(new URL('../../../../../fixtures/v2/crypto-vectors.json', import.meta.url), 'utf8')) as Record<string, string>;
const settings = { appSalt: V.appSalt!, passwordTest: V.passwordTest!, passwordTestV2: V.passwordTestV2! };
const noteOf = (blocks: { id: string; value?: unknown }[]) => blocks.find((b) => b.id === 'b-text')!.value;

async function rejects(p: Promise<unknown>, code: string) {
  const e = await p.then(
    () => undefined,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(CryptoError);
  expect((e as CryptoError).code).toBe(code);
}

describe('v2-Entschlüsselung (lesend portiert)', () => {
  it('MIG-03: alle drei v2-Varianten (v1-Format, v2-Format, Cloud-DEK) lassen sich entschlüsseln; falsches Passwort → wrong-password', async () => {
    // Passwort prüfen (passwordTestV2 bzw. passwordTest) und Schlüssel ableiten
    const local = await unlockV2Password(settings, V.password!);
    expect(local.sessionKey).toBeDefined();
    await rejects(unlockV2Password(settings, 'falsch'), 'wrong-password');
    // nur v1-Test vorhanden (alte Geräte ohne appSalt)
    expect((await unlockV2Password({ passwordTest: V.passwordTest! }, V.password!)).sessionKey).toBeUndefined();
    await rejects(unlockV2Password({ passwordTest: V.passwordTest! }, 'falsch'), 'wrong-password');

    // v1-Format (Salt pro Eintrag)
    const v1 = await decryptV2Entry({ encrypted: true, data: V.entryV1! }, { local });
    expect('blocks' in v1 && noteOf(v1.blocks)).toBe('STB-V2-V1');
    expect(JSON.parse(await decryptV1(V.entryV1!, V.password!))).toHaveLength(2);

    // v2-Format (Sitzungsschlüssel aus appSalt)
    const v2 = await decryptV2Entry({ encrypted: true, data: V.entryV2!, encryptionVersion: 2 }, { local });
    expect('blocks' in v2 && noteOf(v2.blocks)).toBe('STB-V2-V2');

    // Cloud-DEK — per Backup-Code und per Passkey-PRF entpackt
    const dekBackup = await unwrapDekWithBackupCode(V.wrappedDekBackup!, V.backupCode!.toLowerCase().replace(/-/g, ' '), V.kdfSalt!);
    const dekPrf = await unwrapDekWithPrf(V.wrappedDekPasskey!, fromBase64(V.prf!));
    for (const dek of [dekBackup, dekPrf]) {
      const c = await decryptV2Entry({ encrypted: true, data: V.entryCloud!, encryptionVersion: 2, encryptionSource: 'cloud' }, { dek, local });
      expect('blocks' in c && noteOf(c.blocks)).toBe('STB-V2-CLOUD');
    }
    // DEK hat Vorrang, Sitzungsschlüssel ist Rückfall (Alt-Eintrag mit lokalem Schlüssel bei Cloud-Gerät)
    const fallback = await decryptV2Entry({ encrypted: true, data: V.entryV2!, encryptionVersion: 2 }, { dek: dekBackup, local });
    expect('blocks' in fallback && noteOf(fallback.blocks)).toBe('STB-V2-V2');

    await rejects(unwrapDekWithBackupCode(V.wrappedDekBackup!, 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE-FFFFF-GGGG', V.kdfSalt!), 'wrong-backup-code');
    await rejects(unwrapDekWithPrf(V.wrappedDekPasskey!, new Uint8Array(32)), 'unwrap-failed');
    await rejects(decryptWithKey(V.entryCloud!, local.sessionKey!), 'decrypt-failed');
  });

  it('fehlende oder falsche Schlüssel liefern einen Grund statt eines Fehlers (blockiert andere Einträge nicht)', async () => {
    expect(await decryptV2Entry({ encrypted: true, data: V.entryCloud!, encryptionVersion: 2, encryptionSource: 'cloud' }, {})).toEqual({ error: 'Cloud-Schlüssel fehlt (v2-Anmeldung nötig)' });
    expect(await decryptV2Entry({ encrypted: true, data: V.entryV1! }, {})).toEqual({ error: 'v2-Passwort fehlt' });
    const local = await unlockV2Password(settings, V.password!);
    expect(await decryptV2Entry({ encrypted: true, data: V.entryCloud!, encryptionVersion: 2 }, { local })).toEqual({ error: 'nicht entschlüsselbar (falscher Schlüssel)' });
    expect(await decryptV2Entry({ encrypted: false, data: '{kaputt' }, {})).toEqual({ error: 'Daten unlesbar' });
    expect(await decryptV2Entry({ encrypted: false, data: '[]' }, {})).toEqual({ blocks: [] });
  });
});
