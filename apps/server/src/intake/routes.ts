// Intake-Briefkasten (Spec 08): Kurzbefehl → Token prüfen → Form prüfen → sofort versiegeln → nur Siegel speichern.
// Der Klartext wird nie persistiert und nie geloggt (Fastify loggt keine Bodies; Fehlerantworten enthalten keine Inhalte).
import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { checkIntake, versionFromBundle, type ShortcutBundle } from '@stb/core';
import { openManifest, sealForIntake } from '@stb/crypto';
import { INTAKE_BODY_MAX_BYTES, INTAKE_MANIFEST_MAX_CHARS, intakeBodySchema, intakeKeyRequestSchema, manifestUploadSchema } from '@stb/sync-protocol';
import type { Db } from '../db.js';
import type { AuthProvider } from '../auth/types.js';
import { requirePrincipal } from '../auth/require.js';
import { findActiveRole } from '../members/service.js';
import { createRateLimiter } from '../rate-limit.js';

export const INTAKE_RATE_LIMIT = { limit: 60, windowMs: 60 * 60 * 1000 };
/** Fehlversuche (unbekanntes/widerrufenes Token) pro IP — begrenzt Raten und Speicher. */
export const INTAKE_FAIL_LIMIT = { limit: 20, windowMs: 15 * 60 * 1000 };

const sha256 = (s: string) => createHash('sha256').update(s).digest('base64url');
const diaryParams = z.object({ diaryId: z.string().min(1).max(128) });
const keyParams = z.object({ id: z.string().min(1).max(128), keyId: z.string().min(1).max(128) });

export function registerIntakeRoutes(app: FastifyInstance, { db, auth, now }: { db: Db; auth: AuthProvider; now: () => number }): void {
  const limiter = createRateLimiter(INTAKE_RATE_LIMIT);
  // Manifest-Abruf und Prüfung zählen getrennt vom Senden (Mischform: mehrere Prüfungen je Eintrag).
  const readLimiter = createRateLimiter(INTAKE_RATE_LIMIT);
  const failLimiter = createRateLimiter(INTAKE_FAIL_LIMIT);
  // Ein Intake-Schlüssel gilt nur, solange sein Ersteller aktives Mitglied mit Schreibrecht für Intake ist (SHR-07).
  const findKey = db.prepare(`
    SELECT k.public_key, k.manifest FROM intake_keys k
    JOIN memberships m ON m.diary_id = k.diary_id AND m.principal_id = k.created_by
    WHERE k.diary_id = ? AND k.token_hash = ? AND k.revoked_at IS NULL
      AND m.revoked_at IS NULL AND m.role IN ('owner', 'editor')
  `);
  const tooMany = (reply: FastifyReply, retryAfterMs: number) =>
    reply.code(429).header('retry-after', String(Math.ceil(retryAfterMs / 1000))).send({ error: 'rate-limited' });

  /** Bearer-Token prüfen (gleiche Fehlversuch-Begrenzung wie beim Senden); bei Fehler ist die Antwort schon gesendet. */
  function authenticateToken(req: FastifyRequest, reply: FastifyReply) {
    void reply.header('cache-control', 'no-store');
    const params = diaryParams.safeParse(req.params);
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const key = params.success && token ? (findKey.get(params.data.diaryId, sha256(token)) as { public_key: string; manifest: string | null } | undefined) : undefined;
    if (!params.success || !key) {
      const fail = failLimiter.hit(req.ip, now());
      void (fail.allowed ? reply.code(401).send({ error: 'unauthenticated' }) : tooMany(reply, fail.retryAfterMs));
      return null;
    }
    const rl = readLimiter.hit(sha256(token), now());
    if (!rl.allowed) {
      void tooMany(reply, rl.retryAfterMs);
      return null;
    }
    return { diaryId: params.data.diaryId, token, manifest: key.manifest };
  }

  /** Siegel im Arbeitsspeicher öffnen (nur kurz lesbar, A-153); nie persistiert oder geloggt. */
  async function openBundle(a: { diaryId: string; token: string; manifest: string | null }): Promise<ShortcutBundle | null> {
    if (!a.manifest) return null;
    try {
      const bundle = JSON.parse(new TextDecoder().decode(await openManifest(a.token, a.diaryId, JSON.parse(a.manifest) as never))) as ShortcutBundle;
      return bundle?.manifest && bundle.blocks ? bundle : null;
    } catch {
      return null;
    }
  }

  app.get('/api/v1/intake/:diaryId/manifest', async (req, reply) => {
    const a = authenticateToken(req, reply);
    if (!a) return reply;
    const bundle = await openBundle(a);
    if (!bundle) return reply.code(404).send({ error: 'manifest-missing' });
    return reply.send(bundle.manifest);
  });

  // Dry-Run: prüft die erfassten Werte gegen die Vorlage und speichert nichts.
  app.post('/api/v1/intake/:diaryId/check', { bodyLimit: INTAKE_BODY_MAX_BYTES }, async (req, reply) => {
    const a = authenticateToken(req, reply);
    if (!a) return reply;
    const body = intakeBodySchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid-request' });
    const bundle = await openBundle(a);
    if (!bundle) return reply.code(404).send({ error: 'manifest-missing' });
    const templateId = body.data.templateId ?? bundle.manifest.defaultTemplateId;
    const version = templateId ? versionFromBundle(bundle, templateId) : null;
    if (!templateId || !version) return reply.code(404).send({ error: 'template-unknown' });
    return reply.send({ templateId, ...checkIntake(body.data, version) });
  });

  app.put('/api/v1/diaries/:id/intake-keys/:keyId/manifest', { bodyLimit: INTAKE_MANIFEST_MAX_CHARS + 1024 }, async (req, reply) => {
    const p = await requirePrincipal(auth, req, reply);
    if (!p) return reply;
    const params = keyParams.safeParse(req.params);
    const body = manifestUploadSchema.safeParse(req.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid-request' });
    const role = findActiveRole(db, params.data.id, p.userId);
    if (role !== 'owner' && role !== 'editor') return reply.code(403).send({ error: 'forbidden' });
    // Wie beim Widerrufen: Owner jeden Schlüssel, Editoren nur ihren eigenen (A-017). Gespeichert wird nur das Siegel.
    const r = db
      .prepare("UPDATE intake_keys SET manifest = ? WHERE id = ? AND diary_id = ? AND revoked_at IS NULL AND (? = 'owner' OR created_by = ?)")
      .run(JSON.stringify(body.data.seal), params.data.keyId, params.data.id, role, p.userId);
    return r.changes ? reply.code(204).send() : reply.code(404).send({ error: 'not-found' });
  });

  app.post('/api/v1/intake/:diaryId', { bodyLimit: INTAKE_BODY_MAX_BYTES }, async (req, reply) => {
    void reply.header('cache-control', 'no-store');
    const params = diaryParams.safeParse(req.params);
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const key = params.success && token ? (findKey.get(params.data.diaryId, sha256(token)) as { public_key: string } | undefined) : undefined;
    if (!params.success || !key) {
      const fail = failLimiter.hit(req.ip, now());
      if (!fail.allowed) return tooMany(reply, fail.retryAfterMs);
      return reply.code(401).send({ error: 'unauthenticated' });
    }
    // 60/h pro gültigem Token (Spec 08); gezählt wird erst nach erfolgreicher Prüfung.
    const rl = limiter.hit(sha256(token), now());
    if (!rl.allowed) return tooMany(reply, rl.retryAfterMs);

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
    // Owner dürfen jeden Intake-Schlüssel widerrufen, Editoren nur ihren eigenen (A-017).
    const r = db
      .prepare("UPDATE intake_keys SET revoked_at = COALESCE(revoked_at, ?), manifest = NULL WHERE id = ? AND diary_id = ? AND (? = 'owner' OR created_by = ?)")
      .run(now(), params.data.keyId, params.data.id, role, p.userId);
    return r.changes ? reply.code(204).send() : reply.code(404).send({ error: 'not-found' });
  });
}
