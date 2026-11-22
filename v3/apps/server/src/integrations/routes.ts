// Integrationen (Spec 03/07, M24.2, CRY-24, A-127): nur lesend, nur Chiffretext.
//   Owner (Sitzung):   POST/GET /api/v1/diaries/:id/integrations, DELETE /api/v1/diaries/:id/integrations/:integrationId
//   Integration (Bearer `stbi_…`): GET /api/v1/integration/records?since=&limit= — Chiffretext + DK-Wrap der Integration.
// Der Server kennt vom Token nur den Hash. Jede andere Anfrage mit einem Integrations-Token → 403 `integration-read-only`
// (Push, Pull, Blobs, Konto): der Token gibt nie Schreibzugriff. Rate-Limit je Integration. Keine Bodies im Log.
import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  createIntegrationRequestSchema,
  INTEGRATION_TOKEN_PREFIX,
  INTEGRATIONS_PER_DIARY_MAX,
  integrationRecordsQuerySchema,
  type IntegrationInfo,
  type IntegrationRecordsResponse,
} from '@stb/sync-protocol';
import type { Db } from '../db.js';
import type { AuthProvider } from '../auth/types.js';
import { requirePrincipal } from '../auth/require.js';
import { createRateLimiter } from '../rate-limit.js';
import { findActiveRole } from '../members/service.js';
import { pull } from '../sync/service.js';

export interface IntegrationRouteDeps {
  db: Db;
  auth: AuthProvider;
  now: () => number;
  /** Anfragen je Minute und Integration (Standard 120). */
  limitPerMinute?: number;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('base64url');
const diaryParams = z.object({ id: z.string().min(1).max(128) });
const idParams = z.object({ id: z.string().min(1).max(128), integrationId: z.string().min(1).max(64) });

function bearerToken(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (typeof h !== 'string') return null;
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1]! : null;
}

interface AuthRow {
  id: string;
  diary_id: string;
  device_revoked: number | null;
  member_revoked: number | null;
  key_epoch: number;
  wrapped_dk: string;
}

function revokeIntegrationRows(db: Db, diaryId: string, id: string, now: number): void {
  db.prepare("UPDATE devices SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND kind = 'integration'").run(now, id);
  db.prepare('UPDATE memberships SET revoked_at = COALESCE(revoked_at, ?) WHERE diary_id = ? AND principal_id = ?').run(now, diaryId, id);
}

/** Widerruf aller Integrationen eines Tagebuchs (Gerät + Mitgliedschaft) — von der DK-Rotation genutzt (A-127). */
export function revokeDiaryIntegrations(db: Db, diaryId: string, now: number): number {
  const ids = (db.prepare('SELECT id FROM integrations WHERE diary_id = ?').all(diaryId) as { id: string }[]).map((r) => r.id);
  for (const id of ids) revokeIntegrationRows(db, diaryId, id, now);
  return ids.length;
}

export function registerIntegrationRoutes(app: FastifyInstance, { db, auth, now, limitPerMinute = 120 }: IntegrationRouteDeps): void {
  const limiter = createRateLimiter({ limit: limitPerMinute, windowMs: 60_000 });

  // Muss vor den übrigen Routen registriert werden (gilt nur für danach definierte Routen).
  app.addHook('onRequest', async (req, reply) => {
    const token = bearerToken(req);
    if (!token?.startsWith(INTEGRATION_TOKEN_PREFIX)) return;
    const path = req.url.split('?')[0];
    if (req.method === 'GET' && path === '/api/v1/integration/records') return;
    return reply.code(403).header('cache-control', 'no-store').send({ error: 'integration-read-only' });
  });

  app.post('/api/v1/diaries/:id/integrations', async (req, reply) => {
    void reply.header('cache-control', 'no-store');
    const principal = await requirePrincipal(auth, req, reply);
    if (!principal) return reply;
    const p = diaryParams.safeParse(req.params);
    const b = createIntegrationRequestSchema.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: 'invalid-request' });
    const diaryId = p.data.id;
    const t = now();
    const result = db.transaction(() => {
      if (findActiveRole(db, diaryId, principal.userId) !== 'owner') return { code: 403, error: 'forbidden' } as const;
      const d = db.prepare('SELECT key_epoch, rotation_from FROM diaries WHERE id = ?').get(diaryId) as { key_epoch: number; rotation_from: number | null } | undefined;
      if (!d) return { code: 404, error: 'not-found' } as const;
      // Der Wrap muss zur aktuellen Epoche gehören; während einer Rotation gibt es keine neuen Zugänge.
      if (d.rotation_from !== null) return { code: 409, error: 'rotation-running' } as const;
      if (b.data.keyEpoch !== d.key_epoch) return { code: 409, error: 'epoch-mismatch', keyEpoch: d.key_epoch } as const;
      const active = (db.prepare('SELECT COUNT(*) AS n FROM integrations i JOIN devices v ON v.id = i.id WHERE i.diary_id = ? AND v.revoked_at IS NULL').get(diaryId) as { n: number }).n;
      if (active >= INTEGRATIONS_PER_DIARY_MAX) return { code: 409, error: 'too-many-integrations' } as const;
      if (db.prepare('SELECT 1 FROM integrations WHERE token_hash = ?').get(b.data.tokenHash)) return { code: 409, error: 'conflict' } as const;
      const id = randomUUID();
      db.prepare("INSERT INTO devices (id, user_id, kind, name_ct, public_key, created_at) VALUES (?, ?, 'integration', ?, ?, ?)").run(id, principal.userId, b.data.nameCt, b.data.publicKey, t);
      db.prepare('INSERT INTO integrations (id, diary_id, token_hash, created_at) VALUES (?, ?, ?, ?)').run(id, diaryId, b.data.tokenHash, t);
      db.prepare("INSERT INTO memberships (diary_id, principal_id, role, key_epoch, wrapped_dk, created_at) VALUES (?, ?, 'viewer', ?, ?, ?)").run(diaryId, id, b.data.keyEpoch, b.data.wrappedDk, t);
      return { code: 201, id } as const;
    })();
    if (result.code === 201) return reply.code(201).send({ id: result.id });
    return reply.code(result.code).send('keyEpoch' in result ? { error: result.error, keyEpoch: result.keyEpoch } : { error: result.error });
  });

  app.get('/api/v1/diaries/:id/integrations', async (req, reply) => {
    void reply.header('cache-control', 'no-store');
    const principal = await requirePrincipal(auth, req, reply);
    if (!principal) return reply;
    const p = diaryParams.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'invalid-request' });
    if (findActiveRole(db, p.data.id, principal.userId) !== 'owner') return reply.code(403).send({ error: 'forbidden' });
    const rows = db
      .prepare('SELECT i.id, v.name_ct, i.created_at, i.last_used_at, v.revoked_at FROM integrations i JOIN devices v ON v.id = i.id WHERE i.diary_id = ? ORDER BY i.created_at, i.id')
      .all(p.data.id) as { id: string; name_ct: string; created_at: number; last_used_at: number | null; revoked_at: number | null }[];
    const list: IntegrationInfo[] = rows.map((r) => ({ id: r.id, nameCt: r.name_ct, createdAt: r.created_at, lastUsedAt: r.last_used_at, revokedAt: r.revoked_at }));
    return list;
  });

  app.delete('/api/v1/diaries/:id/integrations/:integrationId', async (req, reply) => {
    void reply.header('cache-control', 'no-store');
    const principal = await requirePrincipal(auth, req, reply);
    if (!principal) return reply;
    const p = idParams.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'invalid-request' });
    const t = now();
    const r = db.transaction(() => {
      if (findActiveRole(db, p.data.id, principal.userId) !== 'owner') return 'forbidden' as const;
      if (!db.prepare('SELECT 1 FROM integrations WHERE id = ? AND diary_id = ?').get(p.data.integrationId, p.data.id)) return 'not-found' as const;
      revokeIntegrationRows(db, p.data.id, p.data.integrationId, t);
      return 'ok' as const;
    })();
    if (r === 'forbidden') return reply.code(403).send({ error: 'forbidden' });
    if (r === 'not-found') return reply.code(404).send({ error: 'not-found' });
    return reply.code(204).send();
  });

  // Lesender Zugriff der Integration: Chiffretext aller Record-Arten + Wrap und Epoche der Integration.
  app.get('/api/v1/integration/records', async (req, reply) => {
    void reply.header('cache-control', 'no-store');
    const token = bearerToken(req);
    if (!token?.startsWith(INTEGRATION_TOKEN_PREFIX)) return reply.code(401).send({ error: 'unauthenticated' });
    const row = db
      .prepare(
        `SELECT i.id, i.diary_id, v.revoked_at AS device_revoked, m.revoked_at AS member_revoked, m.key_epoch, m.wrapped_dk
         FROM integrations i JOIN devices v ON v.id = i.id
         JOIN memberships m ON m.diary_id = i.diary_id AND m.principal_id = i.id
         WHERE i.token_hash = ?`,
      )
      .get(sha256(token)) as AuthRow | undefined;
    if (!row || row.device_revoked !== null || row.member_revoked !== null) return reply.code(401).send({ error: 'unauthenticated' });
    const hit = limiter.hit(row.id, now());
    if (!hit.allowed) return reply.code(429).header('retry-after', Math.ceil(hit.retryAfterMs / 1000)).send({ error: 'rate-limited' });
    const q = integrationRecordsQuerySchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'invalid-request' });
    db.prepare('UPDATE integrations SET last_used_at = ? WHERE id = ?').run(now(), row.id);
    const page = pull(db, { diaryId: row.diary_id, since: q.data.since, limit: q.data.limit });
    const body: IntegrationRecordsResponse = { ...page, diaryId: row.diary_id, keyEpoch: row.key_epoch, wrappedDk: row.wrapped_dk };
    return body;
  });
}
