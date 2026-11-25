import { describe, expect, it } from 'vitest';
import { generateUmk } from './umk.js';
import { generateDiaryKey } from './envelope.js';
import { generateIdentityEcdhKeyPair, wrapDkForMember, unwrapDkForMember, importPublicKey } from './share.js';
import { openIdentityKey, sealIdentityKey } from './identity.js';

describe('Identity-Key mit UMK', () => {
  it('Rundweg: zweites Gerät öffnet den Identity-Key mit der UMK und damit den DK-Wrap', async () => {
    const umk = await generateUmk();
    const pair = await generateIdentityEcdhKeyPair();
    const { publicKey, sealed } = await sealIdentityKey(umk, pair);
    const dk = await generateDiaryKey();
    const wrap = await wrapDkForMember(dk, await importPublicKey(publicKey), { diaryId: 'd', keyEpoch: 1 });

    const opened = await openIdentityKey(umk, publicKey, sealed);
    const dk2 = await unwrapDkForMember(wrap, opened, { diaryId: 'd', keyEpoch: 1 });
    const raw = async (k: CryptoKey) => new Uint8Array(await crypto.subtle.exportKey('raw', k));
    expect(await raw(dk2)).toEqual(await raw(dk));
  });

  it('falsche UMK oder ausgetauschter Public Key → unwrap-failed', async () => {
    const umk = await generateUmk();
    const { publicKey, sealed } = await sealIdentityKey(umk, await generateIdentityEcdhKeyPair());
    await expect(openIdentityKey(await generateUmk(), publicKey, sealed)).rejects.toMatchObject({ code: 'unwrap-failed' });
    const other = await sealIdentityKey(umk, await generateIdentityEcdhKeyPair());
    await expect(openIdentityKey(umk, other.publicKey, sealed)).rejects.toMatchObject({ code: 'unwrap-failed' });
  });
});
