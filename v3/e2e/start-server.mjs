// Startet den echten Server für E2E-Tests (frische SQLite-DB pro Lauf). RP-ID localhost, Origin = Vite-Preview.
import { rmSync, mkdirSync, createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = resolve(root, 'reports', 'e2e-server');
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

const { startServer } = await import(new URL('../apps/server/dist/main.js', import.meta.url).href);
const server = await startServer({
  RP_ID: 'localhost',
  ALLOWED_ORIGINS: 'http://localhost:4173',
  DATABASE_PATH: resolve(dataDir, 'stb.db'),
  BLOB_DIR: resolve(dataDir, 'blobs'),
  PORT: '3901',
  HOST: '127.0.0.1',
  // Ein E2E-Lauf meldet viele Konten und Zweitgeräte von 127.0.0.1 an — Limits hier hoch, Standardwerte im Server-Test.
  AUTH_RATE_LIMIT_PER_MIN: '10000',
  RECOVERY_RATE_LIMIT_PER_15MIN: '10000',
}, { logStream: createWriteStream(resolve(dataDir, 'server.log')) }); // QA-07: wird nach dem Lauf geprüft
console.log(`E2E-Server läuft auf ${server.url}`);
