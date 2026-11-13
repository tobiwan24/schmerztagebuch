// Recovery bzw. „Gerät hinzufügen" per Backup-Code im Konto-Modus (Spec 03; DECISIONS A-023).
// start: Benutzername + Backup-Auth-Token (HKDF aus dem Code, Server vergleicht nur den Hash) → verpackte Schlüssel
//        (Backup-Wrap, Identity) + Optionen für einen **neuen Passkey** dieses Geräts.
// finish: neuer Passkey verifiziert → zusätzlicher UMK-Wrap; Backup-Wrap und Verifier werden ersetzt (neuer Code).
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { generateRegistrationOptions, verifyRegistrationResponse, type RegistrationResponseJSON } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import type { Db } from '../db.js';
import { consumeChallenge, createChallenge } from './challenges.js';
import { AuthFlowError, hashBackupAuth, insertDevice, userKeys, type NewDevice, type RpConfig, type UserKey } from './webauthn.js';

const RECOVERY_KEYS = new Set(['identity-pub', 'identity-priv-enc', 'umk-wrap-backup']);

export async function recoveryStart(db: Db, rp: RpConfig, input: { username: string; backupAuth: string }, now: number) {
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(input.username) as { id: string } | undefined;
  const verifier = user
    ? (db.prepare("SELECT blob FROM user_keys WHERE user_id = ? AND kind = 'backup-verifier'").get(user.id) as { blob: string } | undefined)
    : undefined;
  const given = Buffer.from(hashBackupAuth(input.backupAuth));
  // Gleiche Antwort für unbekannten Nutzer und falschen Code (keine Benutzernamen-Aufzählung).
  if (!user || !verifier || verifier.blob.length !== given.length || !timingSafeEqual(Buffer.from(verifier.blob), given)) {
    throw new AuthFlowError('wrong-backup-code');
  }
  const ch = createChallenge(db, { purpose: 'recovery', userId: user.id }, now);
  const existing = db.prepare('SELECT id FROM credentials WHERE user_id = ?').all(user.id) as { id: string }[];
  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpId,
    userName: input.username,
    userID: new TextEncoder().encode(user.id),
    challenge: isoBase64URL.toBuffer(ch.challenge),
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    excludeCredentials: existing.map((c) => ({ id: c.id })),
  });
  return { challengeId: ch.id, options, keys: userKeys(db, user.id).filter((k) => RECOVERY_KEYS.has(k.kind)) };
}

export async function recoveryFinish(
  db: Db,
  rp: RpConfig,
  input: { challengeId: string; response: RegistrationResponseJSON; keys: UserKey[]; device: NewDevice },
  now: number,
): Promise<{ userId: string; deviceId: string }> {
  let challenge: { challenge: string; userId: string | null };
  try {
    challenge = consumeChallenge(db, input.challengeId, 'recovery', now);
  } catch {
    throw new AuthFlowError('challenge-expired');
  }
  const userId = challenge.userId;
  if (!userId) throw new AuthFlowError('challenge-expired');
  let v;
  try {
    v = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: rp.origins,
      expectedRPID: rp.rpId,
      requireUserVerification: true,
    });
  } catch {
    throw new AuthFlowError('verification-failed');
  }
  if (!v.verified || !v.registrationInfo) throw new AuthFlowError('verification-failed');
  const cred = v.registrationInfo.credential;
  const key = (kind: string) => input.keys.find((k) => k.kind === kind);
  const passkeyWrap = key('umk-wrap-passkey');
  const backupWrap = key('umk-wrap-backup');
  const verifier = key('backup-verifier');
  if (!passkeyWrap || !backupWrap || !verifier) throw new AuthFlowError('verification-failed');
  const deviceId = randomUUID();
  db.transaction(() => {
    db.prepare('INSERT INTO credentials (id, user_id, public_key, counter, transports, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      cred.id, userId, isoBase64URL.fromBuffer(cred.publicKey), cred.counter, JSON.stringify(cred.transports ?? []), now,
    );
    db.prepare("INSERT INTO user_keys (user_id, kind, credential_id, blob) VALUES (?, 'umk-wrap-passkey', ?, ?)").run(userId, cred.id, passkeyWrap.blob);
    db.prepare("DELETE FROM user_keys WHERE user_id = ? AND kind IN ('umk-wrap-backup', 'backup-verifier')").run(userId);
    db.prepare("INSERT INTO user_keys (user_id, kind, credential_id, blob) VALUES (?, 'umk-wrap-backup', '', ?)").run(userId, backupWrap.blob);
    db.prepare("INSERT INTO user_keys (user_id, kind, credential_id, blob) VALUES (?, 'backup-verifier', '', ?)").run(userId, hashBackupAuth(verifier.blob));
    insertDevice(db, deviceId, userId, input.device, now);
  })();
  return { userId, deviceId };
}
