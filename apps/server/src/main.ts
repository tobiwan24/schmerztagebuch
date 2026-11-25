// Einstiegspunkt: Konfiguration prüfen, Datenbank öffnen, HTTP-Server starten.
import { mkdirSync } from 'node:fs';
import type { Writable } from 'node:stream';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, ConfigError } from './config.js';
import { openDatabase } from './db.js';
import { migrate } from './schema.js';
import { buildApp } from './app.js';
import { sessionAuth } from './auth/sessions.js';

export interface RunningServer {
  url: string;
  close(): Promise<void>;
}

/** Startet den Server. Ungültige Konfiguration → `ConfigError` mit allen betroffenen Variablen. */
export async function startServer(env: Record<string, string | undefined>, opts: { cwd?: string; logStream?: Writable } = {}): Promise<RunningServer> {
  const config = loadConfig(env);
  const cwd = opts.cwd ?? process.cwd();
  const databasePath = resolve(cwd, config.databasePath);
  const blobDir = resolve(cwd, config.blobDir);
  mkdirSync(dirname(databasePath), { recursive: true });
  mkdirSync(blobDir, { recursive: true });

  const db = openDatabase(databasePath);
  migrate(db);
  // Strukturierte Logs (JSON, ohne Bodies und Header, Spec 12) — Standard: stdout (Docker sammelt sie ein).
  const app = buildApp({ config: { ...config, databasePath, blobDir }, db, auth: sessionAuth(db, () => Date.now()), logStream: opts.logStream ?? process.stdout });
  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (e) {
    db.close();
    throw e;
  }
  const addr = app.server.address();
  const port = typeof addr === 'object' && addr ? addr.port : config.port;
  return {
    url: `http://${config.host === '0.0.0.0' ? '127.0.0.1' : config.host}:${port}`,
    async close() {
      await app.close();
      db.close();
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  startServer(process.env).catch((e: unknown) => {
    console.error(e instanceof ConfigError ? e.message : e);
    process.exit(1);
  });
}
