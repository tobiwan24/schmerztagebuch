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
  // 5: Intake (Spec 08)
  `
  CREATE TABLE intake_keys (
    id TEXT PRIMARY KEY,
    diary_id TEXT NOT NULL REFERENCES diaries(id),
    public_key TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    revoked_at INTEGER
  );
  CREATE TABLE intake_items (
    id TEXT PRIMARY KEY,
    diary_id TEXT NOT NULL REFERENCES diaries(id),
    sealed TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX intake_items_diary ON intake_items (diary_id);
  `,
  // 6: Record-IDs nur pro Tagebuch eindeutig — ein fremdes Tagebuch kann keine IDs vorab belegen (Review M4–M6, Befund 4)
  `
  CREATE TABLE records_new (
    id TEXT NOT NULL,
    diary_id TEXT NOT NULL REFERENCES diaries(id),
    kind TEXT NOT NULL,
    rev INTEGER NOT NULL,
    seq INTEGER NOT NULL UNIQUE,
    deleted INTEGER NOT NULL DEFAULT 0,
    ciphertext TEXT NOT NULL,
    size INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (diary_id, id)
  );
  INSERT INTO records_new SELECT id, diary_id, kind, rev, seq, deleted, ciphertext, size, updated_at FROM records;
  DROP TABLE records;
  ALTER TABLE records_new RENAME TO records;
  CREATE INDEX records_diary_seq ON records (diary_id, seq);
  `,
  // 7: WebAuthn-Credentials und Nutzerschlüssel (Spec 02 „Server-Speicherung", Spec 03) — nur öffentliche Schlüssel und Wraps
  `
  CREATE TABLE credentials (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    public_key TEXT NOT NULL,
    counter INTEGER NOT NULL,
    transports TEXT,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER
  );
  CREATE INDEX credentials_user ON credentials (user_id);
  CREATE TABLE user_keys (
    user_id TEXT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK (kind IN ('identity-pub', 'identity-priv-enc', 'umk-wrap-passkey', 'umk-wrap-backup')),
    credential_id TEXT NOT NULL DEFAULT '',
    blob TEXT NOT NULL,
    PRIMARY KEY (user_id, kind, credential_id)
  );
  `,
  // 8: Backup-Verifier für Recovery/„Gerät hinzufügen" per Backup-Code (DECISIONS A-023) — CHECK erweitern (Tabelle neu)
  `
  CREATE TABLE user_keys_new (
    user_id TEXT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK (kind IN ('identity-pub', 'identity-priv-enc', 'umk-wrap-passkey', 'umk-wrap-backup', 'backup-verifier')),
    credential_id TEXT NOT NULL DEFAULT '',
    blob TEXT NOT NULL,
    PRIMARY KEY (user_id, kind, credential_id)
  );
  INSERT INTO user_keys_new SELECT user_id, kind, credential_id, blob FROM user_keys;
  DROP TABLE user_keys;
  ALTER TABLE user_keys_new RENAME TO user_keys;
  `,
  // 9: verschlüsselte Anhänge (Spec 02/04 `blobs`; Inhalt als Datei unter BLOB_DIR, DECISIONS A-032)
  `
  CREATE TABLE blobs (
    id TEXT PRIMARY KEY,
    diary_id TEXT NOT NULL REFERENCES diaries(id),
    size INTEGER NOT NULL,
    path TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX blobs_diary ON blobs(diary_id);
  `,
  // 10: Arzt-Link (Spec 07/02 `shares`, M18): nur Chiffretext; der Schluessel steht im URL-Fragment und erreicht den Server nie
  `
  CREATE TABLE shares (
    id TEXT PRIMARY KEY,
    created_by TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    max_views INTEGER NOT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    revoked_at INTEGER
  );
  CREATE INDEX shares_creator ON shares (created_by);
  `,
  // 11: DK-Rotation (Spec 03, M22.2): Epoche je Tagebuch, Zustand "Rotation läuft" (alte Epoche, alter DK unter dem neuen) und die
  // Epoche je Record/Blob (aus dem Envelope beim Schreiben); Bestand ist Epoche 1, weil es vorher keine Rotation gab.
  `
  ALTER TABLE diaries ADD COLUMN key_epoch INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE diaries ADD COLUMN rotation_from INTEGER;
  ALTER TABLE diaries ADD COLUMN prev_dk_wrap TEXT;
  ALTER TABLE records ADD COLUMN key_epoch INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE blobs ADD COLUMN key_epoch INTEGER NOT NULL DEFAULT 1;
  `,
  // 12 (M22.4, SHR-14): Flag je Mitgliedschaft — ein Editor darf Vorlagen (template/templateVersion) bearbeiten
  `
  ALTER TABLE memberships ADD COLUMN can_edit_templates INTEGER NOT NULL DEFAULT 0;
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
