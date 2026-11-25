import { describe, it, expect } from 'vitest';
import {
  createInvitationSecret, encryptInvitation, decryptInvitation, invitationMac, verifyInvitationMac, safetyNumber, updateVerification,
} from './invitation.js';
import { generateIdentityEcdhKeyPair, exportPublicKey } from './share.js';

describe('Einladung', () => {
  it('SHR-03: Chiffretext der Einladung nur mit dem secret lesbar; MAC bindet den Identity-Key', async () => {
    const secret = createInvitationSecret();
    const ct = await encryptInvitation({ diaryName: 'Ich', role: 'editor', inviterName: 'Tobi' }, secret);
    expect(await decryptInvitation(ct, secret)).toEqual({ diaryName: 'Ich', role: 'editor', inviterName: 'Tobi' });
    await expect(decryptInvitation(ct, createInvitationSecret())).rejects.toMatchObject({ code: 'decrypt-failed' });

    const bob = await exportPublicKey((await generateIdentityEcdhKeyPair()).publicKey);
    const eve = await exportPublicKey((await generateIdentityEcdhKeyPair()).publicKey);
    const mac = await invitationMac(secret, bob);
    expect(await verifyInvitationMac(secret, bob, mac)).toBe(true);
    expect(await verifyInvitationMac(secret, eve, mac)).toBe(false); // vom Server ausgetauschter Key
    expect(await verifyInvitationMac(createInvitationSecret(), bob, mac)).toBe(false);
    expect(await verifyInvitationMac(secret, bob, 'kaputt')).toBe(false);
  });
});

describe('Sicherheitsnummer', () => {
  it('SHR-04: identisch auf beiden Seiten, 12 Gruppen à 5 Ziffern', async () => {
    const a = await exportPublicKey((await generateIdentityEcdhKeyPair()).publicKey);
    const b = await exportPublicKey((await generateIdentityEcdhKeyPair()).publicKey);
    const fromA = await safetyNumber(a, b);
    const fromB = await safetyNumber(b, a);
    expect(fromA).toEqual(fromB);
    expect(fromA).toHaveLength(12);
    for (const g of fromA) expect(g).toMatch(/^\d{5}$/);
  });

  it('SHR-04: ändert sich bei neuem Identity-Key; „verifiziert" wird dann entfernt', async () => {
    const a = await exportPublicKey((await generateIdentityEcdhKeyPair()).publicKey);
    const b1 = await exportPublicKey((await generateIdentityEcdhKeyPair()).publicKey);
    const b2 = await exportPublicKey((await generateIdentityEcdhKeyPair()).publicKey);
    const n1 = await safetyNumber(a, b1);
    const n2 = await safetyNumber(a, b2);
    expect(n2).not.toEqual(n1);

    const first = updateVerification(undefined, n1);
    expect(first).toMatchObject({ verified: false, changed: false });
    const verified = { safetyNumber: first.safetyNumber, verified: true };
    expect(updateVerification(verified, n1)).toMatchObject({ verified: true, changed: false });
    expect(updateVerification(verified, n2)).toMatchObject({ verified: false, changed: true, safetyNumber: n2.join(' ') });
  });
});
