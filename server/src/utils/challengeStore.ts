import { config } from '../config.js';

/**
 * Kurzlebiger In-Memory-Speicher für WebAuthn-Challenges zwischen
 * `*-options` und `*-verify` (Registrierung und Login). Bewusst nicht in
 * SQLite, da Challenges nur für die Dauer einer einzelnen Ceremony
 * (Sekunden bis wenige Minuten) relevant sind und bei einem Server-Neustart
 * ohnehin verfallen dürfen — der Client startet die Ceremony dann einfach
 * neu. Familien-Skala/Single-Instance-Deployment vorausgesetzt (siehe Spec:
 * SQLite statt Postgres, keine Multi-Instanz-Anforderung).
 */
interface ChallengeEntry {
  challenge: string;
  expiresAt: number;
}

const store = new Map<string, ChallengeEntry>();

function key(kind: 'register' | 'login', username: string): string {
  return `${kind}:${username}`;
}

export function setChallenge(kind: 'register' | 'login', username: string, challenge: string): void {
  store.set(key(kind, username), { challenge, expiresAt: Date.now() + config.challengeTtlMs });
}

export function takeChallenge(kind: 'register' | 'login', username: string): string | undefined {
  const k = key(kind, username);
  const entry = store.get(k);
  store.delete(k);
  if (!entry || entry.expiresAt < Date.now()) {
    return undefined;
  }
  return entry.challenge;
}
