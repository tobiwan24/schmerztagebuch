import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { resolveSession } from '../services/sessions.js';

/**
 * preHandler-Hook für alle geschützten Routen. Liest die Session-Cookie,
 * löst sie zur user_id auf und hängt sie an `request.userId`. Ohne gültige
 * Session -> 401, kein Weiterreichen an den Handler.
 *
 * ALLE `/api/sync/*`-Routen und alle anderen geschützten `/api/auth/*`-
 * Routen (me, logout, backup-code/rotate, backup-code/init) MÜSSEN diesen
 * Hook verwenden — `userId` wird ausschließlich aus der Session gelesen,
 * nie aus Client-Eingaben (Datenisolation, siehe Spec).
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sessionId = request.cookies[config.sessionCookieName];
  const userId = sessionId ? resolveSession(sessionId) : undefined;
  if (!userId) {
    await reply.code(401).send({ error: 'unauthorized' });
    return;
  }
  request.userId = userId;
}
