// Owner-Seite des Einladungsablaufs (Spec 09): angenommene Einladungen prüfen und erst dann den DK verpacken.
// Passt die HMAC nicht zum gemeldeten Identity-Key (z. B. vom Server ausgetauscht), entsteht kein DK-Wrap (SHR-03).
import { importPublicKey, verifyInvitationMac, wrapDkForMember, type DkWrapContext } from '@stb/crypto';

export interface PendingAcceptance {
  id: string;
  role: 'editor' | 'viewer';
  acceptedBy: string;
  identityPub: string;
  mac: string;
}

export interface InvitationApi {
  listPending(diaryId: string): Promise<PendingAcceptance[]>;
  confirm(diaryId: string, invitationId: string, wrappedDk: string): Promise<void>;
}

export type AcceptanceOutcome =
  | { invitationId: string; status: 'confirmed'; principalId: string }
  | { invitationId: string; status: 'rejected'; reason: 'mac-mismatch' | 'unknown-invitation' };

/**
 * Prüft alle angenommenen Einladungen eines Tagebuchs und bestätigt die echten. `secretFor` liefert das lokal
 * gespeicherte Einladungs-Geheimnis (nur der Owner kennt es; der Server nie).
 */
export async function confirmAcceptances(
  api: InvitationApi,
  diaryId: string,
  dk: CryptoKey,
  ctx: DkWrapContext,
  secretFor: (invitationId: string) => Promise<string | undefined>,
): Promise<AcceptanceOutcome[]> {
  const out: AcceptanceOutcome[] = [];
  for (const a of await api.listPending(diaryId)) {
    const secret = await secretFor(a.id);
    if (!secret) {
      out.push({ invitationId: a.id, status: 'rejected', reason: 'unknown-invitation' });
      continue;
    }
    if (!(await verifyInvitationMac(secret, a.identityPub, a.mac))) {
      out.push({ invitationId: a.id, status: 'rejected', reason: 'mac-mismatch' });
      continue;
    }
    const wrap = await wrapDkForMember(dk, await importPublicKey(a.identityPub), ctx);
    await api.confirm(diaryId, a.id, JSON.stringify(wrap));
    out.push({ invitationId: a.id, status: 'confirmed', principalId: a.acceptedBy });
  }
  return out;
}
