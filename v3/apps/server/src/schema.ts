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
