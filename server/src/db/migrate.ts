import { db } from './index.js';

/**
 * Schema-Migration. Idempotent (CREATE TABLE IF NOT EXISTS) — beim Start
 * jedes Mal ausgeführt, es gibt (noch) kein Versions-/Migrationstool, da wir
 * bei Schema-Änderungen aktuell direkt am `develop`-Stand der Tabellen
 * arbeiten (Familien-Skala, kein produktiver Datenbestand vor v1-Release).
 *
 * Tabellen `users`, `credentials`, `templates`, `entries` exakt nach
 * Spec-Abschnitt "Datenmodell-Mapping". Zusätzlich zwei reine
 * Infrastruktur-Tabellen, die die Spec nicht explizit auflistet, aber für
 * Session-Persistenz und den monoton wachsenden Sync-Cursor zwingend nötig
 * sind: `sessions` (Cookie-Session-Speicher) und `sync_cursors`
 * (Zähler für `server_seq` pro User). Sie enthalten keine Nutzerdaten und
 * berühren das opake Blob-Prinzip nicht.
 */
export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      kdf_salt TEXT NOT NULL,
      backup_auth_hash TEXT,
      wrapped_dek_backup TEXT,
      backup_code_created_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL UNIQUE,
      public_key BLOB NOT NULL,
      sign_count INTEGER NOT NULL DEFAULT 0,
      wrapped_dek_passkey TEXT NOT NULL,
      device_label TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_credentials_user_id ON credentials(user_id);

    CREATE TABLE IF NOT EXISTS templates (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sync_id TEXT NOT NULL,
      name TEXT,
      "order" INTEGER,
      icon TEXT,
      color TEXT,
      blocks TEXT,
      updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      server_seq INTEGER NOT NULL,
      PRIMARY KEY (user_id, sync_id)
    );
    CREATE INDEX IF NOT EXISTS idx_templates_user_seq ON templates(user_id, server_seq);

    CREATE TABLE IF NOT EXISTS entries (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sync_id TEXT NOT NULL,
      template_sync_id TEXT,
      timestamp TEXT,
      edited_at TEXT,
      tags TEXT,
      encrypted INTEGER NOT NULL DEFAULT 1,
      data TEXT,
      updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      server_seq INTEGER NOT NULL,
      PRIMARY KEY (user_id, sync_id)
    );
    CREATE INDEX IF NOT EXISTS idx_entries_user_seq ON entries(user_id, server_seq);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS sync_cursors (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      next_seq INTEGER NOT NULL DEFAULT 1
    );
  `);
}
