import { db } from '../db/index.js';
import type { CredentialRow } from '../types.js';

export function findCredentialById(credentialId: string): CredentialRow | undefined {
  return db
    .prepare('SELECT * FROM credentials WHERE credential_id = ?')
    .get(credentialId) as CredentialRow | undefined;
}

export function findCredentialsByUserId(userId: number): CredentialRow[] {
  return db
    .prepare('SELECT * FROM credentials WHERE user_id = ?')
    .all(userId) as CredentialRow[];
}

export function createCredential(params: {
  userId: number;
  credentialId: string;
  publicKey: Buffer;
  signCount: number;
  wrappedDekPasskey: string;
  deviceLabel?: string | null;
}): CredentialRow {
  const info = db
    .prepare(
      `INSERT INTO credentials (user_id, credential_id, public_key, sign_count, wrapped_dek_passkey, device_label)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      params.userId,
      params.credentialId,
      params.publicKey,
      params.signCount,
      params.wrappedDekPasskey,
      params.deviceLabel ?? null,
    );
  return db.prepare('SELECT * FROM credentials WHERE id = ?').get(info.lastInsertRowid) as CredentialRow;
}

export function updateSignCount(credentialId: string, newCount: number): void {
  db.prepare('UPDATE credentials SET sign_count = ? WHERE credential_id = ?').run(newCount, credentialId);
}
