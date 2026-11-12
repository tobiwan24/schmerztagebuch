import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import type { AuthProvider } from './types.js';
import { requirePrincipal } from './require.js';
import { revokeDevice } from './sessions.js';

const params = z.object({ id: z.string().min(1).max(128) });

export function registerDeviceRoutes(app: FastifyInstance, { db, auth, now }: { db: Db; auth: AuthProvider; now: () => number }): void {
  app.delete('/api/v1/devices/:id', async (req, reply) => {
    const p = await requirePrincipal(auth, req, reply);
    if (!p) return reply;
    const params_ = params.safeParse(req.params);
    if (!params_.success) return reply.code(400).send({ error: 'invalid-request' });
    const r = revokeDevice(db, p.userId, params_.data.id, now());
    return r === 'ok' ? reply.code(204).send() : reply.code(404).send({ error: 'not-found' });
  });
}
