import { randomBytes } from 'node:crypto';
import { db } from '../db/index.js';
import type { UserRow } from '../types.js';

export function findUserByUsername(username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

export function findUserById(id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

/**
 * Legt einen neuen User an. `kdf_salt` wird server-seitig zufällig erzeugt:
 * Die Spec listet `kdf_salt` als Nutzer-Feld, spezifiziert aber nicht,
 * welche Seite ihn erzeugt — der Backup-Code-Init-Request enthält ihn
 * nicht, `GET /api/auth/salt` muss ihn aber schon kennen. Konservativste
 * Lesart: Server erzeugt ihn bei Registrierung und gibt ihn in der
 * register-verify-Response zurück (siehe routes/auth.ts).
 */
export function createUser(username: string): UserRow {
  const kdfSalt = randomBytes(16).toString('base64');
  const info = db
    .prepare('INSERT INTO users (username, kdf_salt) VALUES (?, ?)')
    .run(username, kdfSalt);
  return findUserById(Number(info.lastInsertRowid))!;
}

export function setBackupCode(
  userId: number,
  backupAuthHash: string,
  wrappedDekBackup: string,
): void {
  db.prepare(
    `UPDATE users
     SET backup_auth_hash = ?, wrapped_dek_backup = ?, backup_code_created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?`,
  ).run(backupAuthHash, wrappedDekBackup, userId);
}
