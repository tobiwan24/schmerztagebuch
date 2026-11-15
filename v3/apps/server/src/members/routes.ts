import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db.js';
import type { AuthProvider } from '../auth/types.js';
import { requirePrincipal } from '../auth/require.js';
import { changeRole, findActiveRole, revokeMember, ROLES, type MemberChangeResult } from './service.js';

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
  // Mitgliederliste (UI „Mitglieder", „Erfasst von", Sicherheitsnummer): nur für aktive Mitglieder; Benutzername und
  // öffentlicher Identity-Key sind keine Geheimnisse (A-034).
  app.get('/api/v1/diaries/:id/members', async (req, reply) => {
    void reply.header('cache-control', 'no-store');
    const principal = await requirePrincipal(deps.auth, req, reply);
    if (!principal) return reply;
    const p = z.object({ id: z.string().min(1).max(128) }).safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'invalid-request' });
    if (!findActiveRole(deps.db, p.data.id, principal.userId)) return reply.code(403).send({ error: 'forbidden' });
    const rows = deps.db
      .prepare(
        `SELECT m.principal_id, m.role, u.username, k.blob AS identity_pub FROM memberships m
         LEFT JOIN users u ON u.id = m.principal_id
         LEFT JOIN user_keys k ON k.user_id = m.principal_id AND k.kind = 'identity-pub'
         WHERE m.diary_id = ? AND m.revoked_at IS NULL
         ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, m.created_at, m.principal_id`,
      )
      .all(p.data.id) as { principal_id: string; role: string; username: string | null; identity_pub: string | null }[];
    return rows.map((r) => ({ principalId: r.principal_id, role: r.role, username: r.username ?? r.principal_id, identityPub: r.identity_pub }));
  });

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
