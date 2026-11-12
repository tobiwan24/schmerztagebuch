import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { pullQuerySchema, pushRequestSchema } from '@stb/sync-protocol';
import type { Db } from '../db.js';
import type { AuthProvider, Principal } from '../auth/types.js';
import { applyPush, findActiveRole, pull } from './service.js';

export interface SyncRouteDeps {
  db: Db;
  auth: AuthProvider;
  now: () => number;
}

async function requirePrincipal(auth: AuthProvider, req: FastifyRequest, reply: FastifyReply): Promise<Principal | null> {
  const p = await auth.authenticate(req);
  if (!p) void reply.code(401).send({ error: 'unauthenticated' });
  return p;
}

export function registerSyncRoutes(app: FastifyInstance, { db, auth, now }: SyncRouteDeps): void {
  app.post('/api/v1/sync/push', async (req, reply) => {
    void reply.header('cache-control', 'no-store');
    const principal = await requirePrincipal(auth, req, reply);
    if (!principal) return reply;
    const body = pushRequestSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid-request' });
    if (!findActiveRole(db, body.data.diaryId, principal.userId)) return reply.code(403).send({ error: 'forbidden' });
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
