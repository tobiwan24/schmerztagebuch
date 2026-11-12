import Fastify, { type FastifyInstance } from 'fastify';
import type { ServerConfig } from './config.js';
import { isDatabaseReachable, type Db } from './db.js';
import { SERVER_VERSION } from './version.js';

export interface AppDeps {
  config: ServerConfig;
  db: Db;
}

/** Baut die Fastify-App (ohne `listen`), damit Tests `fastify.inject` nutzen können. */
export function buildApp({ db }: AppDeps): FastifyInstance {
  // Strukturierte Logs ohne Bodies (Spec 12); in Tests aus.
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });

  app.get('/api/v1/health', async () => ({ version: SERVER_VERSION, db: isDatabaseReachable(db) }));

  return app;
}
