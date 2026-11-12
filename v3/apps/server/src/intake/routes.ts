// Intake-Briefkasten (Spec 08): Kurzbefehl → Token prüfen → Form prüfen → sofort versiegeln → nur Siegel speichern.
// Der Klartext wird nie persistiert und nie geloggt (Fastify loggt keine Bodies; Fehlerantworten enthalten keine Inhalte).
import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sealForIntake } from '@stb/crypto';
import { INTAKE_BODY_MAX_BYTES, intakeBodySchema, intakeKeyRequestSchema } from '@stb/sync-protocol';
import type { Db } from '../db.js';
import type { AuthProvider } from '../auth/types.js';
import { requirePrincipal } from '../auth/require.js';
import { findActiveRole } from '../members/service.js';
import { createRateLimiter } from '../rate-limit.js';

export const INTAKE_RATE_LIMIT = { limit: 60, windowMs: 60 * 60 * 1000 };

const sha256 = (s: string) => createHash('sha256').update(s).digest('base64url');
const diaryParams = z.object({ diaryId: z.string().min(1).max(128) });
const keyParams = z.object({ id: z.string().min(1).max(128), keyId: z.string().min(1).max(128) });

export function registerIntakeRoutes(app: FastifyInstance, { db, auth, now }: { db: Db; auth: AuthProvider; now: () => number }): void {
  const limiter = createRateLimiter(INTAKE_RATE_LIMIT);
  const findKey = db.prepare('SELECT public_key FROM intake_keys WHERE diary_id = ? AND token_hash = ? AND revoked_at IS NULL');

  app.post('/api/v1/intake/:diaryId', { bodyLimit: INTAKE_BODY_MAX_BYTES }, async (req, reply) => {
    void reply.header('cache-control', 'no-store');
    const params = diaryParams.safeParse(req.params);
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!params.success || !token) return reply.code(401).send({ error: 'unauthenticated' });
    const tokenHash = sha256(token);

    const rl = limiter.hit(tokenHash, now());
    if (!rl.allowed) {
      return reply.code(429).header('retry-after', String(Math.ceil(rl.retryAfterMs / 1000))).send({ error: 'rate-limited' });
    }
    const key = findKey.get(params.data.diaryId, tokenHash) as { public_key: string } | undefined;
    if (!key) return reply.code(401).send({ error: 'unauthenticated' });

    const body = intakeBodySchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid-request' });

    const seal = await sealForIntake(key.public_key, params.data.diaryId, new TextEncoder().encode(JSON.stringify(body.data)));
    const id = randomUUID();
    db.prepare('INSERT INTO intake_items (id, diary_id, sealed, created_at) VALUES (?, ?, ?, ?)').run(id, params.data.diaryId, JSON.stringify(seal), now());
    return reply.code(202).send({ id });
  });

  app.post('/api/v1/diaries/:diaryId/intake-keys', async (req, reply) => {
    const p = await requirePrincipal(auth, req, reply);
    if (!p) return reply;
    const params = diaryParams.safeParse(req.params);
    const body = intakeKeyRequestSchema.safeParse(req.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid-request' });
    const role = findActiveRole(db, params.data.diaryId, p.userId);
    if (role !== 'owner' && role !== 'editor') return reply.code(403).send({ error: 'forbidden' });
    const id = randomUUID();
    db.prepare('INSERT INTO intake_keys (id, diary_id, public_key, token_hash, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id, params.data.diaryId, body.data.publicKey, body.data.tokenHash, p.userId, now(),
    );
    return reply.code(201).send({ id });
  });

  // Abholung durch die App (Spec 08, Schritt 4): Siegel auflisten, nach erfolgreicher Übernahme bestätigen → löschen.
  app.get('/api/v1/diaries/:diaryId/intake-items', async (req, reply) => {
    void reply.header('cache-control', 'no-store');
    const p = await requirePrincipal(auth, req, reply);
    if (!p) return reply;
    const params = diaryParams.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid-request' });
    const role = findActiveRole(db, params.data.diaryId, p.userId);
    if (role !== 'owner' && role !== 'editor') return reply.code(403).send({ error: 'forbidden' });
    const rows = db.prepare('SELECT id, sealed, created_at FROM intake_items WHERE diary_id = ? ORDER BY created_at, id').all(params.data.diaryId) as { id: string; sealed: string; created_at: number }[];
    return rows.map((r) => ({ id: r.id, sealed: r.sealed, receivedAt: r.created_at }));
  });

  app.delete('/api/v1/intake-items/:id', async (req, reply) => {
    const p = await requirePrincipal(auth, req, reply);
    if (!p) return reply;
    const params = z.object({ id: z.string().min(1).max(128) }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid-request' });
    const item = db.prepare('SELECT diary_id FROM intake_items WHERE id = ?').get(params.data.id) as { diary_id: string } | undefined;
    if (!item) return reply.code(404).send({ error: 'not-found' });
    const role = findActiveRole(db, item.diary_id, p.userId);
    if (role !== 'owner' && role !== 'editor') return reply.code(403).send({ error: 'forbidden' });
    db.prepare('DELETE FROM intake_items WHERE id = ?').run(params.data.id);
    return reply.code(204).send();
  });

  app.delete('/api/v1/diaries/:id/intake-keys/:keyId', async (req, reply) => {
    const p = await requirePrincipal(auth, req, reply);
    if (!p) return reply;
    const params = keyParams.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid-request' });
    const role = findActiveRole(db, params.data.id, p.userId);
    if (role !== 'owner' && role !== 'editor') return reply.code(403).send({ error: 'forbidden' });
    const r = db.prepare('UPDATE intake_keys SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND diary_id = ?').run(now(), params.data.keyId, params.data.id);
    return r.changes ? reply.code(204).send() : reply.code(404).send({ error: 'not-found' });
  });
}
