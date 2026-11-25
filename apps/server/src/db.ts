// SQLite-Zugriff (better-sqlite3). Schema-Tabellen folgen mit den jeweiligen Endpunkten (Spec 02 „Server-Speicherung").
import Database from 'better-sqlite3';

export type Db = Database.Database;

export function openDatabase(path: string): Db {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function isDatabaseReachable(db: Db): boolean {
  try {
    return db.prepare('SELECT 1 AS ok').get() !== undefined;
  } catch {
    return false;
  }
}
