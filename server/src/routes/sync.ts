import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { pull, push } from '../services/sync.js';
import type { EntryPushRecord, TemplatePushRecord } from '../types.js';

/**
 * Alle Routen hier erzwingen `userId` aus der Session (via `requireAuth`
 * preHandler) und geben ihn in JEDER Query an die sync-Services durch —
 * niemals aus Client-Eingaben. Das ist die serverseitige Multi-User-
 * Datenisolation laut Spec.
 */
export function registerSyncRoutes(app: FastifyInstance): void {
  // GET /api/sync/pull?since=CURSOR -> { templates[], entries[], cursor }
  app.get<{ Querystring: { since?: string } }>(
    '/api/sync/pull',
    { preHandler: requireAuth },
    async (request, reply) => {
      const since = Number(request.query.since ?? 0);
      const result = pull(request.userId!, Number.isFinite(since) ? since : 0);
      return reply.send(result);
    },
  );

  // POST /api/sync/push { templates[], entries[] } -> { applied[], conflicts[], cursor }
  app.post<{ Body: { templates?: TemplatePushRecord[]; entries?: EntryPushRecord[] } }>(
    '/api/sync/push',
    { preHandler: requireAuth },
    async (request, reply) => {
      const templates = request.body?.templates ?? [];
      const entries = request.body?.entries ?? [];
      const result = push(request.userId!, templates, entries);
      return reply.send(result);
    },
  );
}
