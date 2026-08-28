import { randomBytes } from 'node:crypto';
import { db } from '../db/index.js';
import { config } from '../config.js';

interface SessionRow {
  id: string;
  user_id: number;
  expires_at: string;
}

export function createSession(userId: number): { id: string; expiresAt: Date } {
  const id = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
    id,
    userId,
    expiresAt.toISOString(),
  );
  return { id, expiresAt };
}

/** Liefert die user_id einer gültigen, nicht abgelaufenen Session — sonst undefined. */
export function resolveSession(sessionId: string): number | undefined {
  const row = db
    .prepare('SELECT id, user_id, expires_at FROM sessions WHERE id = ?')
    .get(sessionId) as SessionRow | undefined;
  if (!row) return undefined;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return undefined;
  }
  return row.user_id;
}

export function destroySession(sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}
