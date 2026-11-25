import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  createIntegrationCredentials,
  generateIntegrationToken,
  hashIntegrationToken,
  parseAccessString,
  encodeAccessString,
} from './integration.js';
import { generateDiaryKey, encryptRecord, decryptRecord } from './envelope.js';
import { unwrapDkForMember, generateIdentityEcdhKeyPair, exportPublicKey } from './share.js';
import { CryptoError } from './errors.js';

const ctx = { diaryId: '0190a1b2-0000-7000-8000-0000000000d1', keyEpoch: 1 };
const raw = async (k: CryptoKey) => new Uint8Array(await crypto.subtle.exportKey('raw', k));
async function code(p: Promise<unknown>): Promise<string> {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(CryptoError);
  return (e as CryptoError).code;
}

describe('Integrationsschlüssel (M24.1)', () => {
  it('CRY-23: Zugangsstring enthält Token und Schlüssel; der DK-Wrap lässt sich mit dem Schlüssel daraus entpacken und entschlüsselt Records', async () => {
    const dk = await generateDiaryKey();
    const c = await createIntegrationCredentials(dk, ctx, 'https://stb.example');
    const access = await parseAccessString(c.accessString);
    expect(access.token).toBe(c.token);
    expect(access.diaryId).toBe(ctx.diaryId);
    expect(access.origin).toBe('https://stb.example');
    expect(access.publicKey).toBe(c.publicKey);
    expect(await exportPublicKey(access.keyPair.publicKey)).toBe(c.publicKey);
    const got = await unwrapDkForMember(c.wrap, access.keyPair, ctx);
    expect(await raw(got)).toEqual(await raw(dk));
    const aad = { ...ctx, kind: 'entry', recordId: '0190a1b2-0000-7000-8000-0000000000e1' };
    const ct = await encryptRecord(dk, aad, new TextEncoder().encode('hallo'));
    expect(new TextDecoder().decode(await decryptRecord(got, aad, ct))).toBe('hallo');
  });

  it('CRY-23: der Wrap ist an Tagebuch und Epoche gebunden und für andere Schlüssel unbrauchbar', async () => {
    const dk = await generateDiaryKey();
    const c = await createIntegrationCredentials(dk, ctx);
    const access = await parseAccessString(c.accessString);
    expect(await code(unwrapDkForMember(c.wrap, access.keyPair, { ...ctx, keyEpoch: 2 }))).toBe('unwrap-failed');
    expect(await code(unwrapDkForMember(c.wrap, await generateIdentityEcdhKeyPair(), ctx))).toBe('unwrap-failed');
  });

  it('CRY-23: Token hat Präfix und 256 Bit; der Hash ist SHA-256 base64url wie auf dem Server; der Server-Eingabewert enthält den Token nie', async () => {
    const t = generateIntegrationToken();
    expect(t).toMatch(/^stbi_[A-Za-z0-9_-]{43}$/);
    expect(generateIntegrationToken()).not.toBe(t);
    expect(await hashIntegrationToken(t)).toBe(createHash('sha256').update(t).digest('base64url'));
    const c = await createIntegrationCredentials(await generateDiaryKey(), ctx);
    expect(c.tokenHash).toBe(await hashIntegrationToken(c.token));
    // Was zum Server geht (Hash, öffentlicher Schlüssel, Wrap) enthält weder Token noch privaten Schlüssel
    expect(JSON.stringify({ h: c.tokenHash, p: c.publicKey, w: c.wrap })).not.toContain(c.token);
  });

  it('CRY-23: Format stbi1.<Inhalt>.<Prüfsumme>; Tippfehler, Kürzung und fremdes Format → invalid-access-string', async () => {
    const c = await createIntegrationCredentials(await generateDiaryKey(), ctx);
    expect(c.accessString).toMatch(/^stbi1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{8}$/);
    const [p, payload, sum] = c.accessString.split('.') as [string, string, string];
    const flip = (s: string) => s.slice(0, 10) + (s[10] === 'A' ? 'B' : 'A') + s.slice(11);
    expect(await code(parseAccessString(`${p}.${flip(payload)}.${sum}`))).toBe('invalid-access-string');
    expect(await code(parseAccessString(`${p}.${payload}.${flip(sum)}`))).toBe('invalid-access-string');
    expect(await code(parseAccessString(c.accessString.slice(0, -3)))).toBe('invalid-access-string');
    expect(await code(parseAccessString(`stbi2.${payload}.${sum}`))).toBe('invalid-access-string');
    expect(await code(parseAccessString(''))).toBe('invalid-access-string');
    // Leerraum um den String (Einfügen aus der Zwischenablage) ist erlaubt
    expect((await parseAccessString(`  ${c.accessString}\n`)).token).toBe(c.token);
  });

  it('CRY-23: gültige Prüfsumme, aber ungültiger Inhalt (kein Token, falscher Schlüssel) → invalid-access-string', async () => {
    const c = await createIntegrationCredentials(await generateDiaryKey(), ctx);
    const access = await parseAccessString(c.accessString);
    const other = await generateIdentityEcdhKeyPair();
    // Prüfsumme neu berechnen lassen: encodeAccessString mit manipuliertem Token
    const noToken = await encodeAccessString({ ...access, token: 'kein-token' });
    expect(await code(parseAccessString(noToken))).toBe('invalid-access-string');
    // Schlüssel und öffentlicher Schlüssel passen nicht zusammen: Parsen gelingt, Entpacken des Wraps nicht
    const mismatched = await parseAccessString(await encodeAccessString({ ...access, keyPair: other }));
    expect(await code(unwrapDkForMember(c.wrap, mismatched.keyPair, ctx))).toBe('unwrap-failed');
  });
});
