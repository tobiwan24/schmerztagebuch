// Arzt-Link (Spec 07, M18): `POST/GET /api/v1/shares`, `GET/DELETE /api/v1/shares/:id`.
// Der Server speichert nur Chiffretext. Der Schlüssel steht im URL-Fragment (`#k=…`) und erreicht ihn nie.
// Der öffentliche Abruf braucht keine Anmeldung, zählt Aufrufe und antwortet 410 nach Ablauf, bei erreichtem
// `max_views` oder Widerruf. Keine Bodies im Log (Fastify loggt nur Methode, URL, Status).
import type { FastifyInstance } from 'fastify';
import { createShareRequestSchema, shareIdSchema, SHARE_CIPHERTEXT_MAX_CHARS, type ShareInfo, type ShareStatus } from '@stb/sync-protocol';
import type { Db } from '../db.js';
import type { AuthProvider } from '../auth/types.js';
import { requirePrincipal } from '../auth/require.js';
import { createRateLimiter } from '../rate-limit.js';

export interface ShareRouteDeps {
  db: Db;
  auth: AuthProvider;
  now: () => number;
}

const DAY_MS = 86_400_000;
/** Abgelaufene Zeilen bleiben als „abgelaufen“ erkennbar (410), danach 404. */
const TOMBSTONE_MS = 7 * DAY_MS;
const CREATE_LIMIT = { limit: 20, windowMs: 3_600_000 };
const FETCH_LIMIT = { limit: 120, windowMs: 60_000 };

interface Row {
  id: string;
  expires_at: number;
  max_views: number;
  views: number;
  created_at: number;
  revoked_at: number | null;
}

function statusOf(r: Row, now: number): ShareStatus {
  if (r.revoked_at !== null) return 'revoked';
  if (r.expires_at <= now) return 'expired';
  if (r.views >= r.max_views) return 'exhausted';
  return 'active';
}

/** Chiffretext nicht mehr benötigter Links löschen, sehr alte Zeilen entfernen. */
export function cleanupShares(db: Db, now: number): void {
  db.prepare("UPDATE shares SET ciphertext = '' WHERE ciphertext <> '' AND (revoked_at IS NOT NULL OR expires_at <= ? OR views >= max_views)").run(now);
  db.prepare('DELETE FROM shares WHERE expires_at <= ?').run(now - TOMBSTONE_MS);
}

export function registerShareRoutes(app: FastifyInstance, { db, auth, now }: ShareRouteDeps): void {
  const createLimiter = createRateLimiter(CREATE_LIMIT);
  const fetchLimiter = createRateLimiter(FETCH_LIMIT);
  const timer = setInterval(() => cleanupShares(db, now()), 3_600_000);
  timer.unref();
  app.addHook('onClose', () => {
    clearInterval(timer);
  });

  app.post('/api/v1/shares', { bodyLimit: SHARE_CIPHERTEXT_MAX_CHARS + 4096 }, async (req, reply) => {
    void reply.header('cache-control', 'no-store');
    const principal = await requirePrincipal(auth, req, reply);
    if (!principal) return reply;
    const hit = createLimiter.hit(principal.userId, now());
    if (!hit.allowed) return reply.code(429).header('retry-after', Math.ceil(hit.retryAfterMs / 1000)).send({ error: 'rate-limited' });
    const body = createShareRequestSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid-request' });
    const t = now();
    cleanupShares(db, t);
    if (db.prepare('SELECT 1 FROM shares WHERE id = ?').get(body.data.id)) return reply.code(409).send({ error: 'conflict' });
    const expiresAt = t + body.data.expiresInDays * DAY_MS;
    db.prepare('INSERT INTO shares (id, created_by, ciphertext, expires_at, max_views, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      body.data.id, principal.userId, body.data.ciphertext, expiresAt, body.data.maxViews, t,
    );
    return reply.code(201).send({ id: body.data.id, expiresAt, maxViews: body.data.maxViews });
  });

  app.get('/api/v1/shares', async (req, reply) => {
    void reply.header('cache-control', 'no-store');
    const principal = await requirePrincipal(auth, req, reply);
    if (!principal) return reply;
    const t = now();
    cleanupShares(db, t);
    const rows = db.prepare('SELECT id, expires_at, max_views, views, created_at, revoked_at FROM shares WHERE created_by = ? ORDER BY created_at DESC').all(principal.userId) as Row[];
    const shares: ShareInfo[] = rows.map((r) => ({ id: r.id, createdAt: r.created_at, expiresAt: r.expires_at, maxViews: r.max_views, views: r.views, status: statusOf(r, t) }));
    return reply.send({ shares });
  });

  // Öffentlich: keine Anmeldung. Referrer-Policy und no-store, damit weder URL noch Antwort weitergegeben werden.
  app.get('/api/v1/shares/:id', async (req, reply) => {
    void reply.header('cache-control', 'no-store').header('referrer-policy', 'no-referrer');
    const hit = fetchLimiter.hit(req.ip, now());
    if (!hit.allowed) return reply.code(429).header('retry-after', Math.ceil(hit.retryAfterMs / 1000)).send({ error: 'rate-limited' });
    const id = shareIdSchema.safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(404).send({ error: 'not-found' });
    const t = now();
    const row = db.prepare('SELECT id, ciphertext, expires_at, max_views, views, created_at, revoked_at FROM shares WHERE id = ?').get(id.data) as (Row & { ciphertext: string }) | undefined;
    if (!row) return reply.code(404).send({ error: 'not-found' });
    const status = statusOf(row, t);
    if (status !== 'active') return reply.code(410).send({ error: status });
    // atomar zählen: parallele Abrufe können max_views nicht überschreiten
    const upd = db.prepare('UPDATE shares SET views = views + 1 WHERE id = ? AND views < max_views AND revoked_at IS NULL AND expires_at > ?').run(id.data, t);
    if (upd.changes !== 1) return reply.code(410).send({ error: 'exhausted' });
    return reply.send({ ciphertext: row.ciphertext, expiresAt: row.expires_at, viewsLeft: row.max_views - row.views - 1 });
  });

  app.delete('/api/v1/shares/:id', async (req, reply) => {
    void reply.header('cache-control', 'no-store');
    const principal = await requirePrincipal(auth, req, reply);
    if (!principal) return reply;
    const id = shareIdSchema.safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(404).send({ error: 'not-found' });
    const r = db.prepare("UPDATE shares SET revoked_at = ?, ciphertext = '' WHERE id = ? AND created_by = ? AND revoked_at IS NULL").run(now(), id.data, principal.userId);
    // fremde oder unbekannte Links wie „nicht vorhanden“ behandeln
    if (r.changes !== 1) return reply.code(404).send({ error: 'not-found' });
    return reply.code(204).send();
  });
}
