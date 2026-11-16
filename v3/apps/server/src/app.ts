import Fastify, { type FastifyInstance } from 'fastify';
import type { Writable } from 'node:stream';
import type { ServerConfig } from './config.js';
import { isDatabaseReachable, type Db } from './db.js';
import { SERVER_VERSION } from './version.js';
import { noAuth, type AuthProvider } from './auth/types.js';
import { registerSyncRoutes } from './sync/routes.js';
import { registerMemberRoutes } from './members/routes.js';
import { registerInvitationRoutes } from './invitations/routes.js';
import { registerDeviceRoutes } from './auth/routes.js';
import { registerIntakeRoutes } from './intake/routes.js';
import { registerAccountRoutes } from './auth/account-routes.js';
import { registerBlobRoutes } from './blobs/routes.js';
import { registerShareRoutes } from './shares/routes.js';

export interface AppDeps {
  config: ServerConfig;
  db: Db;
  auth?: AuthProvider;
  now?: () => number;
  /** Ziel für strukturierte Logs (JSON, ohne Bodies). Ohne Angabe: keine Logs. */
  logStream?: Writable;
}

/** Baut die Fastify-App (ohne `listen`), damit Tests `fastify.inject` nutzen können. */
export function buildApp({ config, db, auth = noAuth, now = () => Date.now(), logStream }: AppDeps): FastifyInstance {
  // Strukturierte Logs ohne Bodies (Spec 12): Fastify protokolliert nur Methode, URL, Status, Dauer.
  const app = Fastify({ logger: logStream ? { level: 'info', stream: logStream } : false, bodyLimit: 8 * 1024 * 1024 });

  app.get('/api/v1/health', async () => ({ version: SERVER_VERSION, db: isDatabaseReachable(db) }));
  registerSyncRoutes(app, { db, auth, now });
  registerMemberRoutes(app, { db, auth, now });
  registerInvitationRoutes(app, { db, auth, now });
  registerDeviceRoutes(app, { db, auth, now });
  registerIntakeRoutes(app, { db, auth, now });
  registerBlobRoutes(app, { db, auth, now, blobDir: config.blobDir });
  registerShareRoutes(app, { db, auth, now });
  registerAccountRoutes(app, {
    db, auth, now, rp: { rpId: config.rpId, rpName: 'Schmerztagebuch', origins: config.allowedOrigins },
    ...(config.rateLimits ? { limits: config.rateLimits } : {}),
  });

  return app;
}
