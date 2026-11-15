// Einladungsablauf im Client (Spec 09 „Einladung"). Das Geheimnis steht nur im URL-Fragment und lokal beim Owner
// (Record `invitationSecret`, mit dem DK verschlüsselt synchronisiert — so kann jedes Owner-Gerät bestätigen).
import { createInvitationSecret, decryptInvitation, encryptInvitation, invitationMac, type InvitationDetails } from '@stb/crypto';
import type { RecordRepository } from '../data/repositories/records.js';
import type { SharingApi } from './api.js';

export const INVITATION_SECRET_KIND = 'invitationSecret';

export interface InvitationSecretRecord {
  id: string;
  diaryId: string;
  secret: string;
  role: 'editor' | 'viewer';
  createdAt: string;
}

/** Owner: Einladung anlegen → Link `/invite#<id>.<secret>`. */
export async function createInvitationLink(
  api: SharingApi,
  records: RecordRepository,
  input: { diaryId: string; role: 'editor' | 'viewer'; diaryName: string; inviterName: string; origin: string; now: () => number },
): Promise<{ id: string; link: string }> {
  const secret = createInvitationSecret();
  const ciphertext = await encryptInvitation({ diaryName: input.diaryName, role: input.role, inviterName: input.inviterName }, secret);
  const { id } = await api.createInvitation(input.diaryId, { role: input.role, ciphertext });
  const rec: InvitationSecretRecord = { id, diaryId: input.diaryId, secret, role: input.role, createdAt: new Date(input.now()).toISOString() };
  await records.put({ id, diaryId: input.diaryId, kind: INVITATION_SECRET_KIND, payload: rec });
  return { id, link: `${input.origin}/invite#${id}.${secret}` };
}

/** Fragment `<id>.<secret>` zerlegen. */
export function parseInviteFragment(hash: string): { id: string; secret: string } | null {
  const m = /^#?([A-Za-z0-9-]{1,128})\.([A-Za-z0-9_-]{16,64})$/.exec(hash);
  return m ? { id: m[1]!, secret: m[2]! } : null;
}

/** Eingeladene Person: Einladung lesen und mit dem Geheimnis entschlüsseln (Tagebuch, Rolle, wer einlädt). */
export async function openInvitation(api: SharingApi, id: string, secret: string): Promise<InvitationDetails & { diaryId: string; expiresAt: number }> {
  const inv = await api.readInvitation(id);
  return { ...(await decryptInvitation(inv.ciphertext, secret)), diaryId: inv.diaryId, expiresAt: inv.expiresAt };
}

/** Eingeladene Person: annehmen — eigener Identity-Key, per HMAC an das Geheimnis gebunden. */
export async function acceptInvitationWith(api: SharingApi, id: string, secret: string, identityPub: string): Promise<void> {
  await api.acceptInvitation(id, { identityPub, mac: await invitationMac(secret, identityPub) });
}

/** Geheimnis einer eigenen Einladung (für `confirmAcceptances`). */
export async function invitationSecretFor(records: RecordRepository, invitationId: string): Promise<string | undefined> {
  const rec = await records.get(invitationId);
  return rec && !rec.deleted && rec.kind === INVITATION_SECRET_KIND ? (rec.payload as InvitationSecretRecord).secret : undefined;
}
