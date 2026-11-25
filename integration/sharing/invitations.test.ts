import { describe, it, expect, afterEach } from 'vitest';
import {
  createInvitationSecret, encryptInvitation, decryptInvitation, invitationMac, generateDiaryKey, generateIdentityEcdhKeyPair,
  exportPublicKey, unwrapDkForMember, type MemberDkWrap,
} from '@stb/crypto';
import { TEST_AUTH_HEADER } from '../../apps/server/src/auth/test-auth.js';
import { confirmAcceptances, type InvitationApi } from '../../apps/web/src/sharing/invitations.js';
import { startServer } from '../sync/harness.js';

const D = 'diary-share';
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0).reverse()) await c();
});

async function setup() {
  const server = await startServer(D, ['olga']);
  closers.push(server.close);
  const as = (u: string) => ({ [TEST_AUTH_HEADER]: u });
  const api: InvitationApi = {
    async listPending(diaryId) {
      return (await server.app.inject({ method: 'GET', url: `/api/v1/diaries/${diaryId}/invitations`, headers: as('olga') })).json();
    },
    async confirm(diaryId, invitationId, wrappedDk) {
      const r = await server.app.inject({ method: 'POST', url: `/api/v1/diaries/${diaryId}/members`, headers: as('olga'), payload: { invitationId, wrappedDk } });
      if (r.statusCode !== 201) throw new Error(`confirm ${r.statusCode}`);
    },
  };
  const dk = await generateDiaryKey();
  const secret = createInvitationSecret();
  const ciphertext = await encryptInvitation({ diaryName: 'Ich', role: 'editor', inviterName: 'Olga' }, secret);
  const created = await server.app.inject({ method: 'POST', url: `/api/v1/diaries/${D}/invitations`, headers: as('olga'), payload: { role: 'editor', ciphertext } });
  const invitationId = (created.json() as { id: string }).id;
  // Eingeladene Person: liest die Einladung mit dem secret aus dem Link, nimmt mit eigenem Key + MAC an.
  const bob = await generateIdentityEcdhKeyPair();
  const fetched = (await server.app.inject({ method: 'GET', url: `/api/v1/invitations/${invitationId}` })).json() as { ciphertext: string };
  expect(await decryptInvitation(fetched.ciphertext, secret)).toMatchObject({ diaryName: 'Ich', role: 'editor' });
  const bobPub = await exportPublicKey(bob.publicKey);
  const accepted = await server.app.inject({
    method: 'POST', url: `/api/v1/invitations/${invitationId}/accept`, headers: as('bob'), payload: { identityPub: bobPub, mac: await invitationMac(secret, bobPub) },
  });
  expect(accepted.statusCode).toBe(204);
  return { server, api, dk, secret, invitationId, bob };
}

describe('Einladungen: Owner-Client', () => {
  it('SHR-03: Annahme mit vom Server ausgetauschtem identityPub (falsche HMAC) wird abgelehnt; kein DK-Wrap entsteht', async () => {
    const { server, api, dk, secret, invitationId } = await setup();
    // Server tauscht den Identity-Key gegen einen eigenen aus
    const eve = await exportPublicKey((await generateIdentityEcdhKeyPair()).publicKey);
    server.db.prepare('UPDATE invitations SET identity_pub = ? WHERE id = ?').run(eve, invitationId);

    const outcome = await confirmAcceptances(api, D, dk, { diaryId: D, keyEpoch: 1 }, async (id) => (id === invitationId ? secret : undefined));
    expect(outcome).toEqual([{ invitationId, status: 'rejected', reason: 'mac-mismatch' }]);
    expect(server.db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE principal_id = 'bob'").get()).toEqual({ n: 0 });
  });

  it('SHR-03: echte Annahme wird bestätigt; nur die eingeladene Person kann den DK entpacken', async () => {
    const { server, api, dk, secret, invitationId, bob } = await setup();
    const outcome = await confirmAcceptances(api, D, dk, { diaryId: D, keyEpoch: 1 }, async () => secret);
    expect(outcome).toEqual([{ invitationId, status: 'confirmed', principalId: 'bob' }]);
    const row = server.db.prepare("SELECT role, wrapped_dk FROM memberships WHERE principal_id = 'bob'").get() as { role: string; wrapped_dk: string };
    expect(row.role).toBe('editor');
    const got = await unwrapDkForMember(JSON.parse(row.wrapped_dk) as MemberDkWrap, bob, { diaryId: D, keyEpoch: 1 });
    const raw = async (k: CryptoKey) => new Uint8Array(await crypto.subtle.exportKey('raw', k));
    expect(await raw(got)).toEqual(await raw(dk));
  });

  it('SHR-03: Annahme ohne lokal bekanntes secret wird nicht bestätigt', async () => {
    const { server, api, dk, invitationId } = await setup();
    const outcome = await confirmAcceptances(api, D, dk, { diaryId: D, keyEpoch: 1 }, async () => undefined);
    expect(outcome).toEqual([{ invitationId, status: 'rejected', reason: 'unknown-invitation' }]);
    expect(server.db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE principal_id = 'bob'").get()).toEqual({ n: 0 });
  });
});
