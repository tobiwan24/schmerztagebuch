// Verschlüsselte Anhänge (Spec 04 `PUT/GET /api/v1/blobs/:id`). Der Server sieht nur Chiffretext; Inhalt als Datei unter
// BLOB_DIR/<diaryId>/<id>, Metadaten in `blobs`. Schreiben dürfen Owner und Editor (wie Anhang-Metadaten), lesen alle
// aktiven Mitglieder. Blobs sind unveränderlich: erneutes PUT derselben ID im selben Tagebuch ist ein No-op.
import type { FastifyInstance } from 'fastify';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOB_CIPHERTEXT_MAX_CHARS, blobIdSchema, blobQuerySchema } from '@stb/sync-protocol';
import type { Db } from '../db.js';
import type { AuthProvider } from '../auth/types.js';
import { requirePrincipal } from '../auth/require.js';
import { findActiveRole, mayPushKind } from '../members/service.js';

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
    const existing = db.prepare('SELECT diary_id FROM blobs WHERE id = ?').get(id.data) as { diary_id: string } | undefined;
    if (existing) return existing.diary_id === q.data.diaryId ? reply.code(200).send({ status: 'exists' }) : reply.code(409).send({ error: 'conflict' });

    const dir = join(blobDir, q.data.diaryId.replace(/[^A-Za-z0-9-]/g, '_'));
    mkdirSync(dir, { recursive: true });
    const path = join(dir, id.data);
    // erst vollständig schreiben, dann umbenennen — ein Abbruch hinterlässt keine halbe Datei unter dem Zielnamen
    writeFileSync(`${path}.tmp`, body, 'utf8');
    renameSync(`${path}.tmp`, path);
    db.prepare('INSERT INTO blobs (id, diary_id, size, path, created_at) VALUES (?, ?, ?, ?, ?)').run(id.data, q.data.diaryId, body.length, path, now());
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
    return reply.type('text/plain; charset=utf-8').send(readFileSync(row.path, 'utf8'));
  });
}
