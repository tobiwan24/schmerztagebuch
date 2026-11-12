// Server-Schema (Spec 02 „Server-Speicherung"), versioniert über `PRAGMA user_version`.
// Weitere Tabellen (users, credentials, devices, intake, invitations, …) kommen als neue Migrationen mit ihren Endpunkten.
import type { Db } from './db.js';

const MIGRATIONS: readonly string[] = [
  // 1: Tagebücher, Mitgliedschaften, Records + globaler Sequenzzähler
  `
  CREATE TABLE diaries (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE memberships (
    diary_id TEXT NOT NULL REFERENCES diaries(id),
    principal_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    key_epoch INTEGER NOT NULL,
    wrapped_dk TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    revoked_at INTEGER,
    PRIMARY KEY (diary_id, principal_id)
  );
  CREATE TABLE records (
    id TEXT PRIMARY KEY,
    diary_id TEXT NOT NULL REFERENCES diaries(id),
    kind TEXT NOT NULL,
    rev INTEGER NOT NULL,
    seq INTEGER NOT NULL UNIQUE,
    deleted INTEGER NOT NULL DEFAULT 0,
    ciphertext TEXT NOT NULL,
    size INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX records_diary_seq ON records (diary_id, seq);
  CREATE TABLE sync_counter (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    seq INTEGER NOT NULL
  );
  INSERT INTO sync_counter (id, seq) VALUES (1, 0);
  `,
  // 2: Einladungen (Spec 09)
  `
  CREATE TABLE invitations (
    id TEXT PRIMARY KEY,
    diary_id TEXT NOT NULL REFERENCES diaries(id),
    inviter_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
    ciphertext TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    accepted_at INTEGER,
    accepted_by TEXT,
    identity_pub TEXT,
    mac TEXT,
    confirmed_at INTEGER,
    revoked_at INTEGER
  );
  CREATE INDEX invitations_diary ON invitations (diary_id);
  `,
  // 3: WebAuthn-Challenges (Spec 03 „Server-Auth")
  `
  CREATE TABLE challenges (
    id TEXT PRIMARY KEY,
    challenge TEXT NOT NULL,
    purpose TEXT NOT NULL,
    user_id TEXT,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX challenges_expires ON challenges (expires_at);
  `,
  // 4: Nutzer, Geräte, Sitzungen (Spec 02/03)
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL DEFAULT 'device' CHECK (kind IN ('device')),
    name_ct TEXT NOT NULL,
    public_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    revoked_at INTEGER
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    device_id TEXT NOT NULL REFERENCES devices(id),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_device ON sessions (device_id);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function migrate(db: Db): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  if (current > SCHEMA_VERSION) throw new Error(`Datenbank-Schema ${current} ist neuer als der Server (${SCHEMA_VERSION})`);
  for (let v = current; v < SCHEMA_VERSION; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
