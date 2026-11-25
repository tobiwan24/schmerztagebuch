// Verschlüsselte Anhänge (Spec 04 `PUT/GET /api/v1/blobs/:id`). Der Server sieht nur Chiffretext; Inhalt als Datei unter
// BLOB_DIR/<diaryId>/<id>, Metadaten in `blobs` (`path` relativ zu BLOB_DIR — Backups lassen sich woanders einspielen, QA-09). Schreiben dürfen Owner und Editor (wie Anhang-Metadaten), lesen alle
// aktiven Mitglieder. Blobs sind unveränderlich: erneutes PUT derselben ID im selben Tagebuch ist ein No-op.
import type { FastifyInstance } from 'fastify';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BLOB_CIPHERTEXT_MAX_CHARS, blobIdSchema, blobQuerySchema } from '@stb/sync-protocol';
import type { Db } from '../db.js';
import type { AuthProvider } from '../auth/types.js';
import { requirePrincipal } from '../auth/require.js';
import { findActiveRole, mayPushKind } from '../members/service.js';
import { getDiaryEpoch } from '../members/rotation.js';
import { envelopeEpoch } from '../epoch.js';

export interface BlobRouteDeps {
  db: Db;
  auth: AuthProvider;
  now: () => number;
  blobDir: string;
}

const CIPHERTEXT_RE = /^[A-Za-z0-9_-]+$/;

export function registerBlobRoutes(app: FastifyInstance, { db, auth, now, blobDir }: BlobRouteDeps): void {
  app.put('/api/v1/blobs/:id', { bodyLimit: BLOB_CIPHERTEXT_MAX_CHARS + 1024 }, async (req, reply) => {
    void reply.header('cache-control', 'no-store');
    const principal = await requirePrincipal(auth, req, reply);
    if (!principal) return reply;
    const id = blobIdSchema.safeParse((req.params as { id: string }).id);
    const q = blobQuerySchema.safeParse(req.query);
    const body = req.body;
    if (!id.success || !q.success || typeof body !== 'string' || !body || body.length > BLOB_CIPHERTEXT_MAX_CHARS || !CIPHERTEXT_RE.test(body)) {
      return reply.code(400).send({ error: 'invalid-request' });
    }
    const role = findActiveRole(db, q.data.diaryId, principal.userId);
    if (!role || !mayPushKind(role, 'attachmentMeta')) return reply.code(403).send({ error: 'forbidden' });
    // Nur mit der aktuellen Schlüsselepoche (M22, CRY-22)
    const state = getDiaryEpoch(db, q.data.diaryId);
    const epoch = envelopeEpoch(body);
    if (epoch !== (state?.keyEpoch ?? 1)) return reply.code(409).send({ error: 'stale-epoch', keyEpoch: state?.keyEpoch ?? 1 });
    const existing = db.prepare('SELECT diary_id, path, key_epoch FROM blobs WHERE id = ?').get(id.data) as { diary_id: string; path: string; key_epoch: number } | undefined;
    if (existing && existing.diary_id !== q.data.diaryId) return reply.code(409).send({ error: 'conflict' });
    if (existing) {
      // Blobs sind unveränderlich - außer der Owner stellt sie während einer Rotation auf die neue Epoche um (Datei wird atomar ersetzt)
      if (role !== 'owner' || state?.rotationFrom == null || existing.key_epoch >= epoch) return reply.code(200).send({ status: 'exists' });
      const target = join(blobDir, existing.path);
      writeFileSync(`${target}.tmp`, body, 'utf8');
      renameSync(`${target}.tmp`, target);
      db.prepare('UPDATE blobs SET size = ?, key_epoch = ? WHERE id = ?').run(body.length, epoch, id.data);
      return reply.code(200).send({ status: 'replaced' });
    }

    const rel = `${q.data.diaryId.replace(/[^A-Za-z0-9-]/g, '_')}/${id.data}`;
    const path = join(blobDir, rel);
    mkdirSync(dirname(path), { recursive: true });
    // erst vollständig schreiben, dann umbenennen - ein Abbruch hinterlässt keine halbe Datei unter dem Zielnamen
    writeFileSync(`${path}.tmp`, body, 'utf8');
    renameSync(`${path}.tmp`, path);
    db.prepare('INSERT INTO blobs (id, diary_id, size, path, created_at, key_epoch) VALUES (?, ?, ?, ?, ?, ?)').run(id.data, q.data.diaryId, body.length, rel, now(), epoch);
    return reply.code(201).send({ status: 'stored' });
  });

  app.get('/api/v1/blobs/:id', async (req, reply) => {
    void reply.header('cache-control', 'no-store');
    const principal = await requirePrincipal(auth, req, reply);
    if (!principal) return reply;
    const id = blobIdSchema.safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: 'invalid-request' });
    const row = db.prepare('SELECT diary_id, path FROM blobs WHERE id = ?').get(id.data) as { diary_id: string; path: string } | undefined;
    // Ohne Mitgliedschaft wie „nicht vorhanden" — verrät nicht, ob es die ID gibt
    if (!row || !findActiveRole(db, row.diary_id, principal.userId)) return reply.code(404).send({ error: 'not-found' });
    return reply.type('text/plain; charset=utf-8').send(readFileSync(join(blobDir, row.path), 'utf8'));
  });
}
