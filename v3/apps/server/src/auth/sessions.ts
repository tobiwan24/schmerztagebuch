// Sitzungen (Spec 03 „Server-Auth"): Cookie HttpOnly/Secure/SameSite=Strict, 30 Tage. Der Server speichert nur den
// SHA-256-Hash des Tokens. Gesperrte Geräte (`devices.revoked_at`) verlieren sofort jede Sitzung (CRY-14).
import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db.js';
import type { AuthProvider } from './types.js';

export const SESSION_COOKIE = 'stb_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('base64url');

export function createSession(db: Db, userId: string, deviceId: string, now: number): { token: string; setCookie: string } {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, device_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').run(
    hashToken(token), userId, deviceId, now, now + SESSION_TTL_MS,
  );
  return {
    token,
    setCookie: `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}`,
  };
}

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/** Authentifiziert über das Sitzungs-Cookie. Abgelaufen, unbekannt oder Gerät gesperrt → `null` (401). */
export function sessionAuth(db: Db, now: () => number): AuthProvider {
  const find = db.prepare(`
    SELECT s.token_hash, s.user_id, s.device_id, s.expires_at, d.revoked_at
    FROM sessions s JOIN devices d ON d.id = s.device_id
    WHERE s.token_hash = ?
  `);
  const drop = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  return {
    authenticate(req) {
      const token = readCookie(req.headers.cookie, SESSION_COOKIE);
      if (!token) return null;
      const row = find.get(hashToken(token)) as
        | { token_hash: string; user_id: string; device_id: string; expires_at: number; revoked_at: number | null }
        | undefined;
      if (!row) return null;
      if (row.expires_at <= now() || row.revoked_at !== null) {
        drop.run(row.token_hash);
        return null;
      }
      return { userId: row.user_id, deviceId: row.device_id };
    },
  };
}

/** Sperrt ein eigenes Gerät und beendet alle seine Sitzungen. Fremde/unbekannte Geräte → `not-found`. */
export function revokeDevice(db: Db, userId: string, deviceId: string, now: number): 'ok' | 'not-found' {
  return db.transaction(() => {
    const r = db.prepare("UPDATE devices SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND user_id = ? AND kind = 'device'").run(now, deviceId, userId);
    if (r.changes === 0) return 'not-found' as const;
    db.prepare('DELETE FROM sessions WHERE device_id = ?').run(deviceId);
    return 'ok' as const;
  })();
}

export interface DeviceInfo {
  id: string;
  nameCt: string;
  createdAt: number;
  revokedAt: number | null;
}

/** Eigene Geräte (Spec 03, CRY-19): nur Name (verschlüsselt) und Zeitpunkte, nie der Geräteschlüssel. */
export function listDevices(db: Db, userId: string): DeviceInfo[] {
  const rows = db.prepare("SELECT id, name_ct, created_at, revoked_at FROM devices WHERE user_id = ? AND kind = 'device' ORDER BY created_at, id").all(userId) as {
    id: string; name_ct: string; created_at: number; revoked_at: number | null;
  }[];
  return rows.map((r) => ({ id: r.id, nameCt: r.name_ct, createdAt: r.created_at, revokedAt: r.revoked_at }));
}
