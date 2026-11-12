import type { FastifyInstance } from 'fastify';
import { pullQuerySchema, pushRequestSchema } from '@stb/sync-protocol';
import type { Db } from '../db.js';
import type { AuthProvider } from '../auth/types.js';
import { requirePrincipal } from '../auth/require.js';
import { findActiveRole, mayPushKind } from '../members/service.js';
import { applyPush, pull } from './service.js';

export interface SyncRouteDeps {
  db: Db;
  auth: AuthProvider;
  now: () => number;
}

export function registerSyncRoutes(app: FastifyInstance, { db, auth, now }: SyncRouteDeps): void {
  app.post('/api/v1/sync/push', async (req, reply) => {
    void reply.header('cache-control', 'no-store');
    const principal = await requirePrincipal(auth, req, reply);
    if (!principal) return reply;
    const body = pushRequestSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid-request' });
    const role = findActiveRole(db, body.data.diaryId, principal.userId);
    // Rolle je Op prüfen (Spec 09); eine verbotene Op lehnt den ganzen Push ab, nichts wird geschrieben.
    if (!role || !body.data.ops.every((op) => mayPushKind(role, op.kind))) return reply.code(403).send({ error: 'forbidden' });
    return { results: applyPush(db, body.data, now()) };
  });

  app.get('/api/v1/sync/pull', async (req, reply) => {
    void reply.header('cache-control', 'no-store');
    const principal = await requirePrincipal(auth, req, reply);
    if (!principal) return reply;
    const q = pullQuerySchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'invalid-request' });
    if (!findActiveRole(db, q.data.diaryId, principal.userId)) return reply.code(403).send({ error: 'forbidden' });
    return pull(db, q.data);
  });
}
