import type { FastifyInstance } from 'fastify';
import { pullQuerySchema, pushRequestSchema } from '@stb/sync-protocol';
import type { Db } from '../db.js';
import type { AuthProvider } from '../auth/types.js';
import { requirePrincipal } from '../auth/require.js';
import { findActiveMembership, findActiveRole, mayPushKind } from '../members/service.js';
import { getDiaryEpoch } from '../members/rotation.js';
import { envelopeEpoch } from '../epoch.js';
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
    const membership = findActiveMembership(db, body.data.diaryId, principal.userId);
    // Rolle (und Flag `canEditTemplates`) je Op prüfen (Spec 09); eine verbotene Op lehnt den ganzen Push ab, nichts wird geschrieben.
    if (!membership || !body.data.ops.every((op) => mayPushKind(membership.role, op.kind, membership.canEditTemplates))) return reply.code(403).send({ error: 'forbidden' });
    // Nur mit der aktuellen Schlüsselepoche schreiben (M22, CRY-22): nach einer Rotation -> 409, nichts wird geschrieben.
    // Der Client holt dann den neuen Wrap, stellt seine Änderungen auf die neue Epoche um und sendet erneut.
    const epoch = getDiaryEpoch(db, body.data.diaryId)?.keyEpoch ?? 1;
    if (body.data.ops.some((op) => envelopeEpoch(op.ciphertext) !== epoch)) return reply.code(409).send({ error: 'stale-epoch', keyEpoch: epoch });
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
