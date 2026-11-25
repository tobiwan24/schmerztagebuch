import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthProvider, Principal } from './types.js';

/** Liefert den angemeldeten Akteur oder antwortet mit 401 (dann `null`). */
export async function requirePrincipal(auth: AuthProvider, req: FastifyRequest, reply: FastifyReply): Promise<Principal | null> {
  const p = await auth.authenticate(req);
  if (!p) void reply.code(401).send({ error: 'unauthenticated' });
  return p;
}
