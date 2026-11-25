// Server-Backup (Spec 12 „Betrieb", QA-09): konsistenter SQLite-Snapshot per `VACUUM INTO` (transaktional, auch bei
// laufendem Server) plus Kopie des Blob-Verzeichnisses. Enthält nur Chiffretext und Metadaten.
// Aufruf: `node apps/server/dist/backup.js <Zielordner>` (liest DATABASE_PATH und BLOB_DIR aus der Umgebung).
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDatabase, type Db } from './db.js';

export interface BackupResult {
  dir: string;
  database: string;
  blobs: string;
}

/** Snapshot nach `<outDir>/stb.sqlite` + `<outDir>/blobs/`. `outDir` darf noch nicht existieren (keine Vermischung). */
export function createBackup(db: Db, blobDir: string, outDir: string): BackupResult {
  if (existsSync(outDir)) throw new Error(`Backup-Ziel existiert bereits: ${outDir}`);
  mkdirSync(outDir, { recursive: true });
  const database = join(outDir, 'stb.sqlite');
  db.prepare('VACUUM INTO ?').run(database);
  const blobs = join(outDir, 'blobs');
  if (existsSync(blobDir)) cpSync(blobDir, blobs, { recursive: true });
  else mkdirSync(blobs);
  // Snapshot prüfen, bevor er als gelungen gilt
  const check = openDatabase(database);
  try {
    const r = check.pragma('integrity_check', { simple: true });
    if (r !== 'ok') throw new Error(`Snapshot beschädigt: ${String(r)}`);
  } finally {
    check.close();
  }
  return { dir: outDir, database, blobs };
}

/** Backup in einen frischen Server einspielen (leere Ziele). */
export function restoreBackup(backupDir: string, databasePath: string, blobDir: string): void {
  if (existsSync(databasePath)) throw new Error(`Ziel-Datenbank existiert bereits: ${databasePath}`);
  cpSync(join(backupDir, 'stb.sqlite'), databasePath);
  rmSync(blobDir, { recursive: true, force: true });
  cpSync(join(backupDir, 'blobs'), blobDir, { recursive: true });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const out = process.argv[2];
  const dbPath = process.env.DATABASE_PATH;
  const blobDir = process.env.BLOB_DIR;
  if (!out || !dbPath || !blobDir) {
    console.error('Aufruf: DATABASE_PATH=… BLOB_DIR=… node backup.js <Zielordner>');
    process.exit(1);
  }
  const db = openDatabase(resolve(dbPath));
  try {
    const r = createBackup(db, resolve(blobDir), resolve(out));
    console.log(`Backup geschrieben: ${r.dir}`);
  } finally {
    db.close();
  }
}
