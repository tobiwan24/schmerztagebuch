// Konto per Passkey (Spec 03 „Registrierung (cloud)", „Server-Auth"): Registrierung und Login mit WebAuthn
// (`userVerification: 'required'`, `residentKey: 'required'`), Challenges aus SQLite (TTL 5 min, pro Challenge-ID).
// Der Server speichert nur öffentliche Schlüssel und verpackte Schlüssel (Wraps) — nie UMK/DK im Klartext.
import { randomUUID } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import type { Db } from '../db.js';
import { consumeChallenge, createChallenge } from './challenges.js';

export const USER_KEY_KINDS = ['identity-pub', 'identity-priv-enc', 'umk-wrap-passkey', 'umk-wrap-backup'] as const;
export type UserKeyKind = (typeof USER_KEY_KINDS)[number];
export interface UserKey {
  kind: UserKeyKind;
  credentialId?: string;
  blob: string;
}

export interface RpConfig {
  rpId: string;
  rpName: string;
  origins: string[];
}

export type AuthFailure = 'challenge-expired' | 'username-taken' | 'verification-failed' | 'no-credential';
export class AuthFlowError extends Error {
  constructor(readonly code: AuthFailure) {
    super(code);
    this.name = 'AuthFlowError';
  }
}

export async function registrationOptions(db: Db, rp: RpConfig, username: string, now: number) {
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new AuthFlowError('username-taken');
  const userId = randomUUID();
  const ch = createChallenge(db, { purpose: 'register', userId }, now);
  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpId,
    userName: username,
    userID: new TextEncoder().encode(userId),
    challenge: isoBase64URL.toBuffer(ch.challenge),
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
  return { challengeId: ch.id, options };
}

export interface NewDevice {
  nameCt: string;
  publicKey: string;
}

export async function verifyRegistration(
  db: Db,
  rp: RpConfig,
  input: { challengeId: string; username: string; response: RegistrationResponseJSON; keys: UserKey[]; device: NewDevice },
  now: number,
): Promise<{ userId: string; deviceId: string }> {
  let challenge: { challenge: string; userId: string | null };
  try {
    challenge = consumeChallenge(db, input.challengeId, 'register', now);
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
  const deviceId = randomUUID();
  db.transaction(() => {
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(input.username)) throw new AuthFlowError('username-taken');
    db.prepare('INSERT INTO users (id, username, created_at) VALUES (?, ?, ?)').run(userId, input.username, now);
    db.prepare('INSERT INTO credentials (id, user_id, public_key, counter, transports, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      cred.id, userId, isoBase64URL.fromBuffer(cred.publicKey), cred.counter, JSON.stringify(cred.transports ?? []), now,
    );
    const putKey = db.prepare('INSERT INTO user_keys (user_id, kind, credential_id, blob) VALUES (?, ?, ?, ?)');
    for (const k of input.keys) putKey.run(userId, k.kind, k.kind === 'umk-wrap-passkey' ? (k.credentialId ?? cred.id) : '', k.blob);
    insertDevice(db, deviceId, userId, input.device, now);
  })();
  return { userId, deviceId };
}

export async function authenticationOptions(db: Db, rp: RpConfig, now: number) {
  const ch = createChallenge(db, { purpose: 'login' }, now);
  const options = await generateAuthenticationOptions({ rpID: rp.rpId, userVerification: 'required', challenge: isoBase64URL.toBuffer(ch.challenge) });
  return { challengeId: ch.id, options };
}

export async function verifyAuthentication(
  db: Db,
  rp: RpConfig,
  input: { challengeId: string; response: AuthenticationResponseJSON; device: NewDevice },
  now: number,
): Promise<{ userId: string; deviceId: string; keys: UserKey[] }> {
  let challenge: { challenge: string };
  try {
    challenge = consumeChallenge(db, input.challengeId, 'login', now);
  } catch {
    throw new AuthFlowError('challenge-expired');
  }
  const row = db.prepare('SELECT id, user_id, public_key, counter, transports FROM credentials WHERE id = ?').get(input.response.id) as
    | { id: string; user_id: string; public_key: string; counter: number; transports: string | null }
    | undefined;
  if (!row) throw new AuthFlowError('no-credential');
  let v;
  try {
    v = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: rp.origins,
      expectedRPID: rp.rpId,
      requireUserVerification: true,
      credential: {
        id: row.id,
        publicKey: isoBase64URL.toBuffer(row.public_key),
        counter: row.counter,
        transports: JSON.parse(row.transports ?? '[]') as AuthenticatorTransport[],
      },
    });
  } catch {
    throw new AuthFlowError('verification-failed');
  }
  if (!v.verified) throw new AuthFlowError('verification-failed');
  const deviceId = randomUUID();
  db.transaction(() => {
    db.prepare('UPDATE credentials SET counter = ?, last_used_at = ? WHERE id = ?').run(v.authenticationInfo.newCounter, now, row.id);
    insertDevice(db, deviceId, row.user_id, input.device, now);
  })();
  return { userId: row.user_id, deviceId, keys: userKeys(db, row.user_id) };
}

export function userKeys(db: Db, userId: string): UserKey[] {
  const rows = db.prepare('SELECT kind, credential_id, blob FROM user_keys WHERE user_id = ? ORDER BY kind, credential_id').all(userId) as {
    kind: UserKeyKind;
    credential_id: string;
    blob: string;
  }[];
  return rows.map((r) => ({ kind: r.kind, blob: r.blob, ...(r.credential_id ? { credentialId: r.credential_id } : {}) }));
}

function insertDevice(db: Db, id: string, userId: string, d: NewDevice, now: number): void {
  db.prepare('INSERT INTO devices (id, user_id, kind, name_ct, public_key, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, userId, 'device', d.nameCt, d.publicKey, now);
}

/** Legt ein Tagebuch mit dem Anlegenden als Owner an (DK verpackt für ihn, `key_epoch` 1). */
export function createDiary(db: Db, input: { diaryId: string; userId: string; wrappedDk: string }, now: number): 'ok' | 'exists' {
  return db.transaction(() => {
    if (db.prepare('SELECT 1 FROM diaries WHERE id = ?').get(input.diaryId)) return 'exists' as const;
    db.prepare('INSERT INTO diaries (id, created_at) VALUES (?, ?)').run(input.diaryId, now);
    db.prepare('INSERT INTO memberships (diary_id, principal_id, role, key_epoch, wrapped_dk, created_at) VALUES (?, ?, ?, 1, ?, ?)').run(
      input.diaryId, input.userId, 'owner', input.wrappedDk, now,
    );
    return 'ok' as const;
  })();
}
