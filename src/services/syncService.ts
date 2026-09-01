// src/services/syncService.ts
// Sync-Service: Push-then-Pull, getriggert bei App-Start, `visibilitychange` → Foreground,
// `online`-Event und debounced nach lokalen Writes. KEIN Verlass auf die Background-Sync-API
// (auf iOS nicht verfügbar, siehe Spec "Explizit NICHT nutzen").
//
// Cursor wird gerätelokal in der settings-Tabelle gehalten (Entscheidungstabelle #6: Settings
// werden nicht synchronisiert). LWW-Konfliktauflösung: ein Pull-Record überschreibt den
// lokalen Datensatz nur, wenn sein `updatedAt` neuer ist — sonst gewinnt die lokale Version
// (und wird beim nächsten Push an den Server gemeldet).

import db, { getSetting, setSetting } from '../db';
import type { Template, Entry } from '../types/database';
import { encryptWithKey, decryptWithKey } from '../utils/crypto';
import { getCloudSessionDEK, isCloudSyncEnabled } from './cloudAuthService';
import { pullSync, pushSync, CloudApiError } from './cloudSyncApi';
import type {
  SyncTemplateDTO,
  SyncEntryDTO,
  TemplateSyncRecord,
  EntrySyncRecord,
} from './cloudSyncApi';

const CURSOR_KEY = 'cloudSyncCursor';
const DEBOUNCE_MS = 3000;

export interface SyncOutcome {
  ok: boolean;
  pushed: number;
  pulled: number;
  conflicts: number;
  error?: string;
}

let syncInFlight: Promise<SyncOutcome> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let triggersInitialized = false;
let onOutcomeListeners: Array<(outcome: SyncOutcome) => void> = [];

export function onSyncOutcome(listener: (outcome: SyncOutcome) => void): () => void {
  onOutcomeListeners.push(listener);
  return () => {
    onOutcomeListeners = onOutcomeListeners.filter(l => l !== listener);
  };
}

async function getCursor(): Promise<string | null> {
  return (await getSetting(CURSOR_KEY)) ?? null;
}

async function setCursor(cursor: string): Promise<void> {
  await setSetting(CURSOR_KEY, cursor);
}

// ── Push: lokal → DTO ──────────────────────────────────────────────────────

async function buildPushPayload(
  dek: CryptoKey
): Promise<{ templates: SyncTemplateDTO[]; entries: SyncEntryDTO[] }> {
  const allTemplates = await db.templates.toArray();
  const templateSyncIdById = new Map<number, string>();
  const templateDTOs: SyncTemplateDTO[] = [];

  for (const t of allTemplates) {
    if (!t.syncId || !t.updatedAt) continue; // nach der v21-Migration sollte das nie zutreffen
    templateSyncIdById.set(t.id!, t.syncId);
    const data = await encryptWithKey(JSON.stringify(t.blocks), dek);
    templateDTOs.push({
      syncId: t.syncId,
      name: t.name,
      order: t.order,
      icon: t.icon,
      color: t.color,
      data,
      updatedAt: t.updatedAt,
      deleted: !!t.deleted,
    });
  }

  const allEntries = await db.entries.toArray();
  const entryDTOs: SyncEntryDTO[] = [];

  for (const e of allEntries) {
    if (!e.syncId || !e.updatedAt) continue;
    const templateSyncId = templateSyncIdById.get(e.templateId);
    if (!templateSyncId) continue; // zugehöriges Template lokal nicht (mehr) vorhanden

    // Kernentscheidung der Spec: Server sieht nie Klartext. Nach der Erstmigration
    // (cloudMigrationService.ts) sind alle Entries bereits DEK-verschlüsselt; unverschlüsselte
    // Alt-Datensätze (encryptionMode='none') werden hier für den Push nachträglich verschlüsselt.
    const data = e.encrypted ? e.data : await encryptWithKey(e.data, dek);

    entryDTOs.push({
      syncId: e.syncId,
      templateSyncId,
      timestamp: e.timestamp instanceof Date ? e.timestamp.toISOString() : new Date(e.timestamp).toISOString(),
      editedAt: e.editedAt,
      tags: e.tags ?? [],
      data,
      updatedAt: e.updatedAt,
      deleted: !!e.deleted,
    });
  }

  return { templates: templateDTOs, entries: entryDTOs };
}

// ── Pull: DTO → lokal (LWW-Merge) ───────────────────────────────────────────

function isNewer(remoteUpdatedAt: string, localUpdatedAt: string | undefined): boolean {
  if (!localUpdatedAt) return true;
  return new Date(remoteUpdatedAt).getTime() > new Date(localUpdatedAt).getTime();
}

async function applyPulledTemplates(templates: SyncTemplateDTO[], dek: CryptoKey): Promise<void> {
  for (const dto of templates) {
    const existing = await db.templates.where('syncId').equals(dto.syncId).first();
    if (existing && !isNewer(dto.updatedAt, existing.updatedAt)) continue; // lokale Version ist aktueller

    let blocks: Template['blocks'] = [];
    try {
      blocks = JSON.parse(await decryptWithKey(dto.data, dek));
    } catch {
      console.error('[syncService] Template-Entschlüsselung fehlgeschlagen, syncId:', dto.syncId);
      continue;
    }

    if (existing) {
      await db.templates.update(existing.id!, {
        name: dto.name, order: dto.order, blocks, icon: dto.icon, color: dto.color,
        updatedAt: dto.updatedAt, deleted: dto.deleted,
      });
    } else {
      await db.templates.add({
        name: dto.name, order: dto.order, blocks, icon: dto.icon, color: dto.color,
        tags: [], syncId: dto.syncId, updatedAt: dto.updatedAt, deleted: dto.deleted,
      });
    }
  }
}

async function applyPulledEntries(entries: SyncEntryDTO[]): Promise<void> {
  if (entries.length === 0) return;

  // Template-syncId -> lokale numerische id (FK-Auflösung). Erst NACH applyPulledTemplates aufrufen.
  const allTemplates = await db.templates.toArray();
  const templateIdBySyncId = new Map<string, number>();
  for (const t of allTemplates) if (t.syncId) templateIdBySyncId.set(t.syncId, t.id!);

  for (const dto of entries) {
    const templateId = templateIdBySyncId.get(dto.templateSyncId);
    if (templateId === undefined) {
      console.warn('[syncService] Entry ohne bekanntes Template übersprungen, syncId:', dto.syncId);
      continue;
    }

    const existing = await db.entries.where('syncId').equals(dto.syncId).first();
    if (existing && !isNewer(dto.updatedAt, existing.updatedAt)) continue;

    const record: Omit<Entry, 'id'> = {
      templateId,
      timestamp: new Date(dto.timestamp),
      encrypted: true,
      encryptionVersion: 2,
      encryptionSource: 'cloud',
      data: dto.data,
      tags: dto.tags,
      editedAt: dto.editedAt,
      syncId: dto.syncId,
      updatedAt: dto.updatedAt,
      deleted: dto.deleted,
    };

    if (existing) {
      await db.entries.update(existing.id!, record);
    } else {
      await db.entries.add(record);
    }
  }
}

// ── Push-Konflikte: gewinnende Server-Version zurückspielen ────────────────
//
// Bei einem Push-Konflikt (clientWins === false) gewinnt die bereits auf dem Server
// gespeicherte Version. Da sich `server_seq` dabei nicht ändert, würde `pull()` diesen
// Datensatz nie liefern (Cursor kennt den Wert schon) — die gewinnende Version muss daher
// explizit aus `conflicts[].server` übernommen werden, über denselben Apply-Pfad wie ein
// normaler Pull-Record (LWW-Vergleich inklusive).

function conflictTemplateToDTO(rec: TemplateSyncRecord): SyncTemplateDTO {
  return {
    syncId: rec.syncId,
    name: rec.name ?? '',
    order: rec.order ?? 0,
    icon: rec.icon ?? undefined,
    color: rec.color ?? undefined,
    data: rec.blocks ?? '', // Server-Feldname für Templates ist `blocks`, nicht `data`
    updatedAt: rec.updatedAt,
    deleted: rec.deleted,
  };
}

function conflictEntryToDTO(rec: EntrySyncRecord): SyncEntryDTO {
  return {
    syncId: rec.syncId,
    templateSyncId: rec.templateSyncId ?? '',
    timestamp: rec.timestamp ?? '',
    editedAt: rec.editedAt ?? undefined,
    tags: rec.tags,
    data: rec.data ?? '',
    updatedAt: rec.updatedAt,
    deleted: rec.deleted,
  };
}

// ── Orchestrierung ───────────────────────────────────────────────────────────

/** Führt einen Push-then-Pull-Zyklus aus. Läuft niemals parallel zu sich selbst (dedupliziert laufende Aufrufe). */
export async function runSync(): Promise<SyncOutcome> {
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async (): Promise<SyncOutcome> => {
    try {
      if (!navigator.onLine) return { ok: false, pushed: 0, pulled: 0, conflicts: 0, error: 'offline' };
      if (!(await isCloudSyncEnabled())) return { ok: false, pushed: 0, pulled: 0, conflicts: 0, error: 'not-linked' };

      const dek = await getCloudSessionDEK();
      if (!dek) return { ok: false, pushed: 0, pulled: 0, conflicts: 0, error: 'no-session' };

      const { templates, entries } = await buildPushPayload(dek);
      const pushResult = await pushSync(templates, entries);

      // Verlorene LWW-Konflikte lokal zurückspielen, BEVOR der nächste Pull läuft (Bug #3):
      // sonst bleibt die unterlegene, lokale Alt-Version dauerhaft bestehen.
      const conflictTemplates: SyncTemplateDTO[] = [];
      const conflictEntries: SyncEntryDTO[] = [];
      for (const c of pushResult.conflicts) {
        if (c.type === 'template') conflictTemplates.push(conflictTemplateToDTO(c.server as TemplateSyncRecord));
        else conflictEntries.push(conflictEntryToDTO(c.server as EntrySyncRecord));
      }
      await applyPulledTemplates(conflictTemplates, dek);
      await applyPulledEntries(conflictEntries);

      const cursor = await getCursor();
      const pullResult = await pullSync(cursor);

      await applyPulledTemplates(pullResult.templates, dek);
      await applyPulledEntries(pullResult.entries);
      await setCursor(pullResult.cursor);

      const outcome: SyncOutcome = {
        ok: true,
        pushed: pushResult.applied.length,
        pulled: pullResult.templates.length + pullResult.entries.length,
        conflicts: pushResult.conflicts.length,
      };
      onOutcomeListeners.forEach(l => l(outcome));
      return outcome;
    } catch (err) {
      const message = err instanceof CloudApiError ? err.message : (err instanceof Error ? err.message : 'Unbekannter Fehler');
      const outcome: SyncOutcome = { ok: false, pushed: 0, pulled: 0, conflicts: 0, error: message };
      console.error('[syncService] Sync fehlgeschlagen:', err);
      onOutcomeListeners.forEach(l => l(outcome));
      return outcome;
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

/** Erst-Sync direkt nach dem Cloud-Setup (Migration ist zu diesem Zeitpunkt bereits gelaufen). */
export async function runInitialSync(): Promise<SyncOutcome> {
  return runSync();
}

/** Debounced Sync nach lokalen Writes (Dexie-Hooks, siehe initSyncTriggers). */
export function scheduleDebouncedSync(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runSync();
  }, DEBOUNCE_MS);
}

/**
 * Registriert die Sync-Trigger (App-Start-Aufruf obliegt dem Aufrufer, z.B. NavigationContext):
 * visibilitychange → Foreground, online-Event, debounced nach lokalen entries/templates-Writes.
 * Einmalig aufrufen (z.B. beim App-Start neben initAutoBackupHooks).
 */
export function initSyncTriggers(): void {
  if (triggersInitialized) return;
  triggersInitialized = true;

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) runSync();
  });

  window.addEventListener('online', () => {
    runSync();
  });

  const scheduleOnWrite = () => scheduleDebouncedSync();
  db.entries.hook('creating', scheduleOnWrite);
  db.entries.hook('updating', scheduleOnWrite);
  db.templates.hook('creating', scheduleOnWrite);
  db.templates.hook('updating', scheduleOnWrite);
}
