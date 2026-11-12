import Fastify, { type FastifyInstance } from 'fastify';
import type { ServerConfig } from './config.js';
import { isDatabaseReachable, type Db } from './db.js';
import { SERVER_VERSION } from './version.js';
import { noAuth, type AuthProvider } from './auth/types.js';
import { registerSyncRoutes } from './sync/routes.js';

export interface AppDeps {
  config: ServerConfig;
  db: Db;
  auth?: AuthProvider;
  now?: () => number;
}

/** Baut die Fastify-App (ohne `listen`), damit Tests `fastify.inject` nutzen können. */
export function buildApp({ db, auth = noAuth, now = () => Date.now() }: AppDeps): FastifyInstance {
  // Strukturierte Logs ohne Bodies (Spec 12); in Tests aus.
  const app = Fastify({ logger: false, bodyLimit: 8 * 1024 * 1024 });

  app.get('/api/v1/health', async () => ({ version: SERVER_VERSION, db: isDatabaseReachable(db) }));
  registerSyncRoutes(app, { db, auth, now });

  return app;
}
