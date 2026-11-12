import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import type { AuthProvider } from '../auth/types.js';
import { requirePrincipal } from '../auth/require.js';
import { changeRole, revokeMember, ROLES, type MemberChangeResult } from './service.js';

const params = z.object({ id: z.string().min(1).max(128), principalId: z.string().min(1).max(128) });
const patchBody = z.strictObject({ role: z.enum(ROLES) });

function send(reply: FastifyReply, r: MemberChangeResult, okStatus: number): FastifyReply {
  switch (r) {
    case 'ok':
      return reply.code(okStatus).send(okStatus === 204 ? undefined : { ok: true });
    case 'forbidden':
      return reply.code(403).send({ error: 'forbidden' });
    case 'not-found':
      return reply.code(404).send({ error: 'not-found' });
    case 'last-owner':
      return reply.code(409).send({ error: 'last-owner' });
  }
}

export function registerMemberRoutes(app: FastifyInstance, deps: { db: Db; auth: AuthProvider; now: () => number }): void {
  app.patch('/api/v1/diaries/:id/members/:principalId', async (req, reply) => {
    const principal = await requirePrincipal(deps.auth, req, reply);
    if (!principal) return reply;
    const p = params.safeParse(req.params);
    const b = patchBody.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: 'invalid-request' });
    return send(reply, changeRole(deps.db, p.data.id, principal.userId, p.data.principalId, b.data.role), 200);
  });

  app.delete('/api/v1/diaries/:id/members/:principalId', async (req, reply) => {
    const principal = await requirePrincipal(deps.auth, req, reply);
    if (!principal) return reply;
    const p = params.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'invalid-request' });
    return send(reply, revokeMember(deps.db, p.data.id, principal.userId, p.data.principalId, deps.now()), 204);
  });
}
