// WebAuthn-Challenges (Spec 03 „Server-Auth"): in SQLite mit TTL 5 min, pro Challenge-ID statt pro Username
// (Doppel-Tap-sicher), überleben Server-Neustarts, einmalig verwendbar.
import { randomBytes, randomUUID } from 'node:crypto';
import type { Db } from '../db.js';

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type ChallengePurpose = 'register' | 'login' | 'add-credential' | 'recovery';

export class ChallengeError extends Error {
  readonly code = 'challenge-expired' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ChallengeError';
  }
}

export interface IssuedChallenge {
  id: string;
  /** base64url, 32 Byte Zufall — geht als `challenge` in die WebAuthn-Optionen. */
  challenge: string;
  expiresAt: number;
}

export function createChallenge(db: Db, opts: { purpose: ChallengePurpose; userId?: string }, now: number): IssuedChallenge {
  const id = randomUUID();
  const challenge = randomBytes(32).toString('base64url');
  const expiresAt = now + CHALLENGE_TTL_MS;
  db.transaction(() => {
    db.prepare('DELETE FROM challenges WHERE expires_at <= ?').run(now);
    db.prepare('INSERT INTO challenges (id, challenge, purpose, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, challenge, opts.purpose, opts.userId ?? null, expiresAt, now);
  })();
  return { id, challenge, expiresAt };
}

/**
 * Löst eine Challenge ein (atomar gelöscht). Unbekannt, bereits verwendet, anderer Zweck oder abgelaufen →
 * `challenge-expired` — für den Client ist die Handlung dieselbe: neu anfordern.
 */
export function consumeChallenge(db: Db, id: string, purpose: ChallengePurpose, now: number): { challenge: string; userId: string | null } {
  const row = db
    .prepare('DELETE FROM challenges WHERE id = ? AND purpose = ? RETURNING challenge, user_id, expires_at')
    .get(id, purpose) as { challenge: string; user_id: string | null; expires_at: number } | undefined;
  if (!row || row.expires_at <= now) throw new ChallengeError('Challenge abgelaufen oder unbekannt — bitte erneut versuchen');
  return { challenge: row.challenge, userId: row.user_id };
}
