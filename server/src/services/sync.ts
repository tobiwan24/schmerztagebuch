import { db } from '../db/index.js';
import type {
  EntryPushRecord,
  EntryRow,
  EntrySyncRecord,
  TemplatePushRecord,
  TemplateRow,
  TemplateSyncRecord,
} from '../types.js';

// ---------------------------------------------------------------------------
// Row <-> Wire-Format Mapping
// ---------------------------------------------------------------------------

function templateRowToRecord(row: TemplateRow): TemplateSyncRecord {
  return {
    syncId: row.sync_id,
    name: row.name,
    order: row.order,
    icon: row.icon,
    color: row.color,
    blocks: row.blocks,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  };
}

function entryRowToRecord(row: EntryRow): EntrySyncRecord {
  return {
    syncId: row.sync_id,
    templateSyncId: row.template_sync_id,
    timestamp: row.timestamp,
    editedAt: row.edited_at,
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : [],
    encrypted: row.encrypted === 1,
    data: row.data,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  };
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

export interface PullResult {
  templates: TemplateSyncRecord[];
  entries: EntrySyncRecord[];
  cursor: number;
}

export function pull(userId: number, since: number): PullResult {
  const templateRows = db
    .prepare('SELECT * FROM templates WHERE user_id = ? AND server_seq > ? ORDER BY server_seq ASC')
    .all(userId, since) as TemplateRow[];
  const entryRows = db
    .prepare('SELECT * FROM entries WHERE user_id = ? AND server_seq > ? ORDER BY server_seq ASC')
    .all(userId, since) as EntryRow[];

  const maxSeq = Math.max(
    since,
    ...templateRows.map((r) => r.server_seq),
    ...entryRows.map((r) => r.server_seq),
  );

  return {
    templates: templateRows.map(templateRowToRecord),
    entries: entryRows.map(entryRowToRecord),
    cursor: maxSeq,
  };
}

// ---------------------------------------------------------------------------
// Push (Record-LWW)
// ---------------------------------------------------------------------------

interface AppliedRef {
  type: 'template' | 'entry';
  syncId: string;
  serverSeq: number;
}

interface ConflictRef {
  type: 'template' | 'entry';
  syncId: string;
  reason: 'stale';
  server: TemplateSyncRecord | EntrySyncRecord;
}

export interface PushResult {
  applied: AppliedRef[];
  conflicts: ConflictRef[];
  cursor: number;
}

function nextServerSeq(userId: number): number {
  db.prepare('INSERT OR IGNORE INTO sync_cursors (user_id, next_seq) VALUES (?, 1)').run(userId);
  const row = db.prepare('SELECT next_seq FROM sync_cursors WHERE user_id = ?').get(userId) as {
    next_seq: number;
  };
  db.prepare('UPDATE sync_cursors SET next_seq = next_seq + 1 WHERE user_id = ?').run(userId);
  return row.next_seq;
}

// client.updatedAt >= stored.updatedAt -> übernehmen (LWW laut Spec API-Grobdesign)
function clientWins(clientUpdatedAt: string, storedUpdatedAt: string): boolean {
  return new Date(clientUpdatedAt).getTime() >= new Date(storedUpdatedAt).getTime();
}

function pushTemplate(userId: number, rec: TemplatePushRecord): AppliedRef | ConflictRef {
  const existing = db
    .prepare('SELECT * FROM templates WHERE user_id = ? AND sync_id = ?')
    .get(userId, rec.syncId) as TemplateRow | undefined;

  if (existing && !clientWins(rec.updatedAt, existing.updated_at)) {
    return { type: 'template', syncId: rec.syncId, reason: 'stale', server: templateRowToRecord(existing) };
  }

  const serverSeq = nextServerSeq(userId);
  db.prepare(
    `INSERT INTO templates (user_id, sync_id, name, "order", icon, color, blocks, updated_at, deleted, server_seq)
     VALUES (@userId, @syncId, @name, @order, @icon, @color, @blocks, @updatedAt, @deleted, @serverSeq)
     ON CONFLICT(user_id, sync_id) DO UPDATE SET
       name = excluded.name,
       "order" = excluded."order",
       icon = excluded.icon,
       color = excluded.color,
       blocks = excluded.blocks,
       updated_at = excluded.updated_at,
       deleted = excluded.deleted,
       server_seq = excluded.server_seq`,
  ).run({
    userId,
    syncId: rec.syncId,
    name: rec.name ?? null,
    order: rec.order ?? null,
    icon: rec.icon ?? null,
    color: rec.color ?? null,
    blocks: rec.blocks ?? null,
    updatedAt: rec.updatedAt,
    deleted: rec.deleted ? 1 : 0,
    serverSeq,
  });

  return { type: 'template', syncId: rec.syncId, serverSeq };
}

function pushEntry(userId: number, rec: EntryPushRecord): AppliedRef | ConflictRef {
  const existing = db
    .prepare('SELECT * FROM entries WHERE user_id = ? AND sync_id = ?')
    .get(userId, rec.syncId) as EntryRow | undefined;

  if (existing && !clientWins(rec.updatedAt, existing.updated_at)) {
    return { type: 'entry', syncId: rec.syncId, reason: 'stale', server: entryRowToRecord(existing) };
  }

  const serverSeq = nextServerSeq(userId);
  db.prepare(
    `INSERT INTO entries (user_id, sync_id, template_sync_id, timestamp, edited_at, tags, encrypted, data, updated_at, deleted, server_seq)
     VALUES (@userId, @syncId, @templateSyncId, @timestamp, @editedAt, @tags, @encrypted, @data, @updatedAt, @deleted, @serverSeq)
     ON CONFLICT(user_id, sync_id) DO UPDATE SET
       template_sync_id = excluded.template_sync_id,
       timestamp = excluded.timestamp,
       edited_at = excluded.edited_at,
       tags = excluded.tags,
       encrypted = excluded.encrypted,
       data = excluded.data,
       updated_at = excluded.updated_at,
       deleted = excluded.deleted,
       server_seq = excluded.server_seq`,
  ).run({
    userId,
    syncId: rec.syncId,
    templateSyncId: rec.templateSyncId ?? null,
    timestamp: rec.timestamp ?? null,
    editedAt: rec.editedAt ?? null,
    tags: JSON.stringify(rec.tags ?? []),
    encrypted: rec.encrypted === false ? 0 : 1, // Cloud-Records sind laut Spec immer verschlüsselt
    data: rec.data ?? null,
    updatedAt: rec.updatedAt,
    deleted: rec.deleted ? 1 : 0,
    serverSeq,
  });

  return { type: 'entry', syncId: rec.syncId, serverSeq };
}

export function push(
  userId: number,
  templates: TemplatePushRecord[],
  entries: EntryPushRecord[],
): PushResult {
  const applied: AppliedRef[] = [];
  const conflicts: ConflictRef[] = [];

  const run = db.transaction(() => {
    for (const rec of templates) {
      const result = pushTemplate(userId, rec);
      if ('reason' in result) conflicts.push(result);
      else applied.push(result);
    }
    for (const rec of entries) {
      const result = pushEntry(userId, rec);
      if ('reason' in result) conflicts.push(result);
      else applied.push(result);
    }
  });
  run();

  const cursorRow = db.prepare('SELECT next_seq FROM sync_cursors WHERE user_id = ?').get(userId) as
    | { next_seq: number }
    | undefined;
  const cursor = cursorRow ? cursorRow.next_seq - 1 : 0;

  return { applied, conflicts, cursor };
}
