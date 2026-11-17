import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import type { AuthProvider } from '../auth/types.js';
import { requirePrincipal } from '../auth/require.js';
import { findActiveRole } from './service.js';
import { completeRotation, rotationState, startRotation } from './rotation.js';

const params = z.object({ id: z.string().min(1).max(128) });
const rotateBody = z.strictObject({
  fromEpoch: z.number().int().min(1).max(0xfffffffe),
  wraps: z.array(z.strictObject({ principalId: z.string().min(1).max(128), wrappedDk: z.string().min(1).max(4096) })).min(1).max(100),
  prevDkWrap: z.string().min(1).max(4096),
});

export function registerRotationRoutes(app: FastifyInstance, deps: { db: Db; auth: AuthProvider; now: () => number }): void {
  // Zustand für Fortschritt und Fortsetzen: aktuelle Epoche, läuft eine Rotation, Wrap des alten DK, offene Records/Blobs
  app.get('/api/v1/diaries/:id/rotation', async (req, reply) => {
    void reply.header('cache-control', 'no-store');
    const principal = await requirePrincipal(deps.auth, req, reply);
    if (!principal) return reply;
    const p = params.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'invalid-request' });
    if (!findActiveRole(deps.db, p.data.id, principal.userId)) return reply.code(403).send({ error: 'forbidden' });
    return rotationState(deps.db, p.data.id);
  });

  app.post('/api/v1/diaries/:id/rotate', async (req, reply) => {
    void reply.header('cache-control', 'no-store');
    const principal = await requirePrincipal(deps.auth, req, reply);
    if (!principal) return reply;
    const p = params.safeParse(req.params);
    const b = rotateBody.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: 'invalid-request' });
    const r = startRotation(deps.db, p.data.id, principal.userId, b.data);
    switch (r.status) {
      case 'ok': return { keyEpoch: r.keyEpoch };
      case 'forbidden': return reply.code(403).send({ error: 'forbidden' });
      case 'not-found': return reply.code(404).send({ error: 'not-found' });
      case 'rotation-running': return reply.code(409).send({ error: 'rotation-running' });
      case 'wraps-mismatch': return reply.code(400).send({ error: 'wraps-mismatch' });
      case 'epoch-mismatch': return reply.code(409).send({ error: 'epoch-mismatch', keyEpoch: r.keyEpoch });
    }
  });

  app.post('/api/v1/diaries/:id/rotate/complete', async (req, reply) => {
    void reply.header('cache-control', 'no-store');
    const principal = await requirePrincipal(deps.auth, req, reply);
    if (!principal) return reply;
    const p = params.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'invalid-request' });
    const r = completeRotation(deps.db, p.data.id, principal.userId);
    switch (r.status) {
      case 'ok': return { keyEpoch: r.keyEpoch, rotating: false };
      case 'forbidden': return reply.code(403).send({ error: 'forbidden' });
      case 'not-found': return reply.code(404).send({ error: 'not-found' });
      case 'incomplete': return reply.code(409).send({ error: 'rotation-incomplete', pendingRecords: r.pendingRecords, pendingBlobs: r.pendingBlobs });
    }
  });
}
