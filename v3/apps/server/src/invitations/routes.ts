import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import type { AuthProvider } from '../auth/types.js';
import { requirePrincipal } from '../auth/require.js';
import {
  acceptInvitation,
  confirmMember,
  createInvitation,
  listPendingAcceptances,
  readInvitation,
  revokeInvitation,
  type Result,
} from './service.js';

const id = z.string().min(1).max(128);
const diaryParams = z.object({ id });
const invParams = z.object({ id });
const createBody = z.strictObject({ role: z.enum(['editor', 'viewer']), ciphertext: z.string().min(1).max(16_384) });
const acceptBody = z.strictObject({ identityPub: z.string().min(1).max(1024), mac: z.string().min(1).max(256) });
const confirmBody = z.strictObject({ invitationId: id, wrappedDk: z.string().min(1).max(4096) });

const STATUS = { 'not-found': 404, gone: 410, forbidden: 403, conflict: 409 } as const;

function send<T>(reply: FastifyReply, r: Result<T>, okStatus: number): FastifyReply {
  if (!r.ok) return reply.code(STATUS[r.error]).send({ error: r.error });
  return okStatus === 204 ? reply.code(204).send() : reply.code(okStatus).send(r.value);
}

export function registerInvitationRoutes(app: FastifyInstance, { db, auth, now }: { db: Db; auth: AuthProvider; now: () => number }): void {
  app.post('/api/v1/diaries/:id/invitations', async (req, reply) => {
    const p = await requirePrincipal(auth, req, reply);
    if (!p) return reply;
    const params = diaryParams.safeParse(req.params);
    const body = createBody.safeParse(req.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid-request' });
    return send(reply, createInvitation(db, params.data.id, p.userId, body.data.role, body.data.ciphertext, now()), 201);
  });

  app.get('/api/v1/diaries/:id/invitations', async (req, reply) => {
    const p = await requirePrincipal(auth, req, reply);
    if (!p) return reply;
    const params = diaryParams.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid-request' });
    return send(reply, listPendingAcceptances(db, params.data.id, p.userId), 200);
  });

  // Ohne Auth (Spec 09); Rate-Limit folgt mit der allgemeinen Rate-Limit-Infrastruktur.
  app.get('/api/v1/invitations/:id', async (req, reply) => {
    const params = invParams.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid-request' });
    void reply.header('cache-control', 'no-store');
    return send(reply, readInvitation(db, params.data.id, now()), 200);
  });

  app.post('/api/v1/invitations/:id/accept', async (req, reply) => {
    const p = await requirePrincipal(auth, req, reply);
    if (!p) return reply;
    const params = invParams.safeParse(req.params);
    const body = acceptBody.safeParse(req.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid-request' });
    return send(reply, acceptInvitation(db, params.data.id, p.userId, body.data.identityPub, body.data.mac, now()), 204);
  });

  app.delete('/api/v1/invitations/:id', async (req, reply) => {
    const p = await requirePrincipal(auth, req, reply);
    if (!p) return reply;
    const params = invParams.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid-request' });
    return send(reply, revokeInvitation(db, params.data.id, p.userId, now()), 204);
  });

  app.post('/api/v1/diaries/:id/members', async (req, reply) => {
    const p = await requirePrincipal(auth, req, reply);
    if (!p) return reply;
    const params = diaryParams.safeParse(req.params);
    const body = confirmBody.safeParse(req.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid-request' });
    return send(reply, confirmMember(db, params.data.id, p.userId, body.data.invitationId, body.data.wrappedDk, now()), 201);
  });
}
