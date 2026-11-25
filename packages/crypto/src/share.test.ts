import { describe, it, expect } from 'vitest';
import { generateIdentityEcdhKeyPair, wrapDkForMember, unwrapDkForMember, exportPublicKey, importPublicKey } from './share.js';
import { generateDiaryKey, encryptRecord, decryptRecord } from './envelope.js';
import { CryptoError } from './errors.js';

const ctx = { diaryId: '0190a1b2-0000-7000-8000-0000000000d1', keyEpoch: 1 };
const raw = async (k: CryptoKey) => new Uint8Array(await crypto.subtle.exportKey('raw', k));

async function code(p: Promise<unknown>): Promise<string> {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(CryptoError);
  return (e as CryptoError).code;
}

describe('DK-Wrap per ECDH', () => {
  it('CRY-05: DK für ein zweites Schlüsselpaar verpacken und von diesem entpacken', async () => {
    const dk = await generateDiaryKey();
    const bob = await generateIdentityEcdhKeyPair();
    const wrap = await wrapDkForMember(dk, bob.publicKey, ctx);
    const got = await unwrapDkForMember(wrap, bob, ctx);
    expect(await raw(got)).toEqual(await raw(dk));
    // der entpackte DK entschlüsselt Records des Owners
    const aad = { ...ctx, kind: 'entry', recordId: '0190a1b2-0000-7000-8000-0000000000e1' };
    const ct = await encryptRecord(dk, aad, new TextEncoder().encode('hallo'));
    expect(new TextDecoder().decode(await decryptRecord(got, aad, ct))).toBe('hallo');
  });

  it('CRY-05: ein anderes Schlüsselpaar kann den Wrap nicht entpacken', async () => {
    const dk = await generateDiaryKey();
    const [bob, eve] = [await generateIdentityEcdhKeyPair(), await generateIdentityEcdhKeyPair()];
    const wrap = await wrapDkForMember(dk, bob.publicKey, ctx);
    expect(await code(unwrapDkForMember(wrap, eve, ctx))).toBe('unwrap-failed');
  });

  it('CRY-05: Wrap ist an Tagebuch und keyEpoch gebunden', async () => {
    const dk = await generateDiaryKey();
    const bob = await generateIdentityEcdhKeyPair();
    const wrap = await wrapDkForMember(dk, bob.publicKey, ctx);
    expect(await code(unwrapDkForMember(wrap, bob, { ...ctx, diaryId: '0190a1b2-0000-7000-8000-0000000000d2' }))).toBe('unwrap-failed');
    expect(await code(unwrapDkForMember(wrap, bob, { ...ctx, keyEpoch: 2 }))).toBe('unwrap-failed');
  });

  it('CRY-05: jeder Wrap nutzt einen neuen ephemeren Schlüssel; öffentlicher Schlüssel ist exportier-/importierbar', async () => {
    const dk = await generateDiaryKey();
    const bob = await generateIdentityEcdhKeyPair();
    const pub = await importPublicKey(await exportPublicKey(bob.publicKey));
    const [a, b] = [await wrapDkForMember(dk, pub, ctx), await wrapDkForMember(dk, pub, ctx)];
    expect(a.epk).not.toBe(b.epk);
    expect(a.wrapped).not.toBe(b.wrapped);
    expect(await raw(await unwrapDkForMember(b, bob, ctx))).toEqual(await raw(dk));
  });

  it('CRY-05: beschädigter Wrap → unwrap-failed', async () => {
    const bob = await generateIdentityEcdhKeyPair();
    const wrap = await wrapDkForMember(await generateDiaryKey(), bob.publicKey, ctx);
    expect(await code(unwrapDkForMember({ ...wrap, epk: 'AAAA' }, bob, ctx))).toBe('unwrap-failed');
  });
});
