import Dexie, { type EntityTable } from 'dexie';
import type { Block } from './types/blocks';
import type { Template, Entry, Settings } from './types/database';
import { generateUUID } from './utils/uuid';
import { AVAILABLE_ICON_NAMES } from './utils/iconUtils';
import { decryptData, encryptData, encryptWithKey, decryptWithKey, createPasswordTestWithKey } from './utils/crypto';

const db = new Dexie('PainDiaryDB') as Dexie & {
  templates: EntityTable<Template, 'id'>;
  entries: EntityTable<Entry, 'id'>;
  settings: EntityTable<Settings, 'key'>;
};

// Stubs v8–v13: Abwärtskompatibilität für Altversionen
const _legacySchema = { templates: '++id, name, order', entries: '++id, templateId, timestamp, encrypted', settings: 'key' };
db.version(8).stores(_legacySchema);
db.version(9).stores(_legacySchema);
db.version(10).stores(_legacySchema);
db.version(11).stores(_legacySchema);
db.version(12).stores(_legacySchema);
db.version(13).stores(_legacySchema);

// Version 14: Lucide Icon System Integration
db.version(14).stores({
  templates: '++id, name, order',
  entries: '++id, templateId, timestamp, encrypted, *tags',
  settings: 'key'
});

// Version 15: Persist image-to-textarea migration (was previously done at runtime)
db.version(15).upgrade(async tx => {
  const templates = await tx.table('templates').toArray();
  for (const template of templates) {
    const migrated = migrateImageBlocksToTextArea(template);
    if (migrated !== template) {
      await tx.table('templates').put(migrated);
    }
  }
});

// Version 16: BodyMap normalisierte Koordinaten (0.0-1.0)
db.version(16).stores({
  templates: '++id, name, order',
  entries: '++id, templateId, timestamp, encrypted, *tags',
  settings: 'key'
}).upgrade(async tx => {
  console.log('🔄 DB v16: Migriere BodyMap Koordinaten zu normalisierten Werten');

  function loadImageForMigration(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  const entries = await tx.table('entries').toArray();
  let migratedCount = 0;

  for (const entry of entries) {
    try {
      const blocks = JSON.parse(entry.data);
      let changed = false;

      for (const block of blocks) {
        if (block.type === 'bodymap' && block.value) {
          const bodyMapData = JSON.parse(block.value);

          if (bodyMapData.image && Array.isArray(bodyMapData.points) && bodyMapData.points.length > 0) {
            const firstPoint = bodyMapData.points[0];
            // Nur migrieren wenn Koordinaten noch Pixel-Werte sind (> 1)
            if (firstPoint.x > 1 || firstPoint.y > 1) {
              try {
                const img = await loadImageForMigration(bodyMapData.image);
                bodyMapData.points = bodyMapData.points.map((point: { x: number; y: number; diameter: number; [key: string]: unknown }) => ({
                  ...point,
                  x: point.x / img.width,
                  y: point.y / img.height,
                  diameter: point.diameter / img.width
                }));
                block.value = JSON.stringify(bodyMapData);
                changed = true;
              } catch {
                console.warn('Migration: Konnte Bild nicht laden für Entry', entry.id);
              }
            }
          }
        }
      }

      if (changed) {
        await tx.table('entries').put({
          ...entry,
          data: JSON.stringify(blocks)
        });
        migratedCount++;
      }
    } catch (error) {
      console.error('Migration v16 fehlgeschlagen für Entry:', entry.id, error);
    }
  }

  console.log(`✅ DB v16: ${migratedCount} Einträge mit BodyMap migriert`);
});

// Version 17: Entry editedAt field (optionales Feld, keine Strukturänderung)
db.version(17).stores({
  templates: '++id, name, order',
  entries: '++id, templateId, timestamp, encrypted, *tags',
  settings: 'key'
});

// Version 18: 'history'-Encryption-Mode entfernt → auf 'none' migrieren
db.version(18).stores({
  templates: '++id, name, order',
  entries: '++id, templateId, timestamp, encrypted, *tags',
  settings: 'key'
}).upgrade(async tx => {
  const setting = await tx.table('settings').get('encryptionMode');
  if (setting?.value === 'history') {
    await tx.table('settings').put({ key: 'encryptionMode', value: 'none' });
    console.log('🔄 DB v18: encryptionMode "history" → "none" migriert');
  }
});

// Version 19: Template icon/color Defaults als Dexie-Upgrade (war zuvor migrateTemplateStyles())
db.version(19).stores({
  templates: '++id, name, order',
  entries: '++id, templateId, timestamp, encrypted, *tags',
  settings: 'key'
}).upgrade(async tx => {
  const templates = await tx.table('templates').toArray();
  let colorIndex = 0;
  for (const template of templates) {
    const iconInvalid = !template.icon || !AVAILABLE_ICON_NAMES.includes(template.icon);
    const colorInvalid = !template.color;
    if (iconInvalid || colorInvalid) {
      const updates: Partial<Template> = {};
      if (iconInvalid) updates.icon = getDefaultIconForTemplate(template.name);
      if (colorInvalid) { updates.color = DEFAULT_COLORS[colorIndex % DEFAULT_COLORS.length]; colorIndex++; }
      await tx.table('templates').put({ ...template, ...updates });
    }
  }
});

// Version 20: Orphaned Encrypted Entries reparieren (Folge von unvollständiger v18-Migration)
// Betrifft Geräte, die Einträge unter encryptionMode='history' gespeichert hatten —
// die v18-Migration hat nur das Setting auf 'none' gesetzt, nicht die Einträge selbst.
db.version(20).stores({
  templates: '++id, name, order',
  entries: '++id, templateId, timestamp, encrypted, *tags',
  settings: 'key'
}).upgrade(async tx => {
  const modeSetting = await tx.table('settings').get('encryptionMode');
  if (modeSetting?.value !== 'none') return;

  const candidates = await tx.table('entries')
    .filter((e: Entry) => e.encrypted === true)
    .toArray();

  let fixed = 0;
  for (const entry of candidates) {
    try {
      JSON.parse(entry.data);
      // Erfolgreich → war plain JSON, nur falsch geflaggt → encrypted: false setzen
      await tx.table('entries').update(entry.id, { encrypted: false });
      fixed++;
    } catch {
      // Wirklich AES-GCM verschlüsselt → ohne Passwort nicht reparierbar
    }
  }
  if (fixed > 0) console.log(`✅ DB v20: ${fixed} orphaned encrypted ${fixed === 1 ? 'entry' : 'entries'} repaired`);
});

// Version 21: Cloud-Sync-Datenmodell — syncId (UUID), updatedAt (ISO), deleted (Tombstone) auf templates+entries
db.version(21).stores({
  templates: '++id, name, order, syncId',
  entries: '++id, templateId, timestamp, encrypted, *tags, syncId',
  settings: 'key'
}).upgrade(async tx => {
  const nowIso = new Date().toISOString();

  const templates = await tx.table('templates').toArray();
  for (const template of templates) {
    if (!template.syncId || !template.updatedAt || template.deleted === undefined) {
      await tx.table('templates').update(template.id, {
        syncId: template.syncId ?? generateUUID(),
        updatedAt: template.updatedAt ?? nowIso,
        deleted: template.deleted ?? false,
      });
    }
  }

  const entries = await tx.table('entries').toArray();
  for (const entry of entries) {
    if (!entry.syncId || !entry.updatedAt || entry.deleted === undefined) {
      const fallbackUpdatedAt = entry.editedAt ??
        (entry.timestamp instanceof Date ? entry.timestamp.toISOString() : new Date(entry.timestamp).toISOString());
      await tx.table('entries').update(entry.id, {
        syncId: entry.syncId ?? generateUUID(),
        updatedAt: entry.updatedAt ?? fallbackUpdatedAt,
        deleted: entry.deleted ?? false,
      });
    }
  }

  console.log(`✅ DB v21: ${templates.length} Vorlagen und ${entries.length} Einträge mit syncId/updatedAt/deleted versehen`);
});

// ========== MIGRATIONS ==========

// Standard-Icons basierend auf Template-Namen - Lucide Icon Names (CamelCase)
const DEFAULT_ICONS: Record<string, string> = {
  // Schmerz-bezogen
  'schmerz': 'Flame',
  'pain': 'Flame',
  'weh': 'AlertCircle',
  'kopf': 'Brain',
  'kopfschmerz': 'Brain',
  'migräne': 'Brain',
  'rücken': 'User',
  'bauch': 'User',
  'brust': 'HeartPulse',
  'herz': 'HeartPulse',
  'gelenk': 'Hand',
  'knie': 'Footprints',
  'fuß': 'Footprints',
  'bein': 'Footprints',
  'hand': 'Hand',
  'arm': 'Hand',
  'auge': 'Eye',
  'ohr': 'Ear',
  'akut': 'AlertCircle',
  'stark': 'TrendingUp',
  'chronisch': 'Target',
  
  // Medizin & Behandlung
  'medikament': 'Pill',
  'tablette': 'Pill',
  'pille': 'Pill',
  'spritze': 'Syringe',
  'injektion': 'Syringe',
  'arzt': 'Stethoscope',
  'behandlung': 'Stethoscope',
  'therapie': 'Activity',
  'vitals': 'HeartPulse',
  'temperatur': 'Thermometer',
  'fieber': 'Thermometer',
  
  // Allgemein
  'beispiel': 'Book',
  'tagebuch': 'Book',
  'notiz': 'Book',
  'schlaf': 'BedDouble',
  'ruhe': 'BedDouble',
  'essen': 'Coffee',
  'nahrung': 'Coffee',
  'stimmung': 'Smile',
  'gefühl': 'Smile',
  'termin': 'Calendar',
  'datum': 'Calendar',
  'tag': 'Calendar',
};

// Standard-Farben
const DEFAULT_COLORS = [
  '#007AFF', // Blau (Standard)
  '#FF3B30', // Rot
  '#34C759', // Grün
  '#5856D6', // Lila
  '#FF9500', // Orange
];

function getDefaultIconForTemplate(name: string): string {
  const lowerName = name.toLowerCase();
  for (const [keyword, icon] of Object.entries(DEFAULT_ICONS)) {
    if (lowerName.includes(keyword)) {
      return icon;
    }
  }
  return 'Book'; // Fallback
}

// ========== TEMPLATE CRUD ==========

export async function createTemplate(name: string, blocks: Block[] = []): Promise<number> {
  const maxOrder = await db.templates.orderBy('order').reverse().first();
  const order = (maxOrder?.order ?? -1) + 1;
  
  const id = await db.templates.add({
    name,
    order,
    blocks,
    tags: [],
    icon: getDefaultIconForTemplate(name),
    color: DEFAULT_COLORS[order % DEFAULT_COLORS.length],
    syncId: generateUUID(),
    updatedAt: new Date().toISOString(),
    deleted: false
  });

  return id as number;
}

// Migration: Image-Blocks zu TextArea-Blocks konvertieren (transparente Auto-Migration)
function migrateImageBlocksToTextArea(template: Template): Template {
  const hasImageBlock = template.blocks.some(b => b.type === 'image');
  if (!hasImageBlock) return template;

  const migratedBlocks = template.blocks.map(block => {
    if (block.type !== 'image') return block;

    // Image-Block-Daten (JSON-Array oder Legacy-Base64) in AttachedFile[] überführen
    let attachedFiles: { id: string; name: string; type: 'image' | 'pdf'; data: string; createdAt: string }[] = [];

    if (block.value && typeof block.value === 'string') {
      try {
        const parsed = JSON.parse(block.value);
        if (Array.isArray(parsed)) {
          // Normales Image-Block-Format: { id, data, type, name }
          attachedFiles = parsed.map((f: { id?: string; data: string; type?: string; name?: string }) => ({
            id: f.id ?? generateUUID(),
            name: f.name ?? 'Datei',
            type: (f.type === 'pdf' ? 'pdf' : 'image') as 'image' | 'pdf',
            data: f.data,
            createdAt: new Date().toISOString(),
          }));
        }
      } catch {
        // Legacy: einzelner Base64-String
        if (typeof block.value === 'string' && block.value.startsWith('data:image')) {
          attachedFiles = [{
            id: generateUUID(),
            name: 'Foto',
            type: 'image',
            data: block.value,
            createdAt: new Date().toISOString(),
          }];
        }
      }
    }

    return {
      ...block,
      type: 'textarea' as const,
      value: attachedFiles.length > 0 ? { attachedFiles } : undefined,
    };
  });

  return { ...template, blocks: migratedBlocks };
}

export async function getTemplates(): Promise<Template[]> {
  const templates = await db.templates.orderBy('order').filter(t => !t.deleted).toArray();
  return templates.map(migrateImageBlocksToTextArea);
}

export async function updateTemplate(id: number, changes: Partial<Template>): Promise<void> {
  await db.templates.update(id, { ...changes, updatedAt: new Date().toISOString() });
}

// Soft-Delete (Tombstone) statt Hard-Delete: Datensatz bleibt in der DB, damit Cloud-Sync
// die Löschung als Tombstone auf andere Geräte propagieren kann.
export async function deleteTemplate(id: number): Promise<void> {
  await db.templates.update(id, { deleted: true, updatedAt: new Date().toISOString() });
}


// ========== ENTRY CRUD ==========

export async function createEntry(
  templateId: number, 
  blocks: Block[], 
  encrypted = false
): Promise<number> {
  const data = JSON.stringify(blocks);
  
  // Tags aus MultiSelect-Blöcken extrahieren
  const tags: string[] = [];
  blocks.forEach(block => {
    if (block.type === 'multiselect' && Array.isArray(block.value)) {
      tags.push(...block.value);
    }
  });
  
  const id = await db.entries.add({
    templateId,
    timestamp: new Date(),
    encrypted,
    data,
    tags,
    syncId: generateUUID(),
    updatedAt: new Date().toISOString(),
    deleted: false
  });

  return id as number;
}

export async function getEntries(templateId?: number): Promise<Entry[]> {
  if (templateId !== undefined) {
    return await db.entries
      .where('templateId')
      .equals(templateId)
      .filter(e => !e.deleted)
      .reverse()
      .sortBy('timestamp');
  }
  return await db.entries.orderBy('timestamp').reverse().filter(e => !e.deleted).toArray();
}

export async function getEntry(id: number): Promise<Entry | undefined> {
  return await db.entries.get(id);
}

// Soft-Delete (Tombstone) statt Hard-Delete: Datensatz bleibt in der DB, damit Cloud-Sync
// die Löschung als Tombstone auf andere Geräte propagieren kann.
export async function deleteEntry(id: number): Promise<void> {
  await db.entries.update(id, { deleted: true, updatedAt: new Date().toISOString() });
}

export async function updateEntry(
  id: number,
  data: string,
  encrypted: boolean,
  editedAt: string,
  encryptionVersion?: number
): Promise<void> {
  const changes: Partial<Entry> = { data, encrypted, editedAt, updatedAt: editedAt };
  if (encryptionVersion !== undefined) changes.encryptionVersion = encryptionVersion;
  await db.entries.update(id, changes);
}


// ========== SETTINGS ==========

export async function getSetting(key: string): Promise<string | undefined> {
  const setting = await db.settings.get(key);
  return setting?.value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value });
}

export async function getAppSettings(): Promise<{
  encryptionMode: 'none' | 'full';
  biometricEnabled: boolean;
  setupCompleted: boolean;
}> {
  const mode = await getSetting('encryptionMode');
  const biometric = await getSetting('biometricEnabled');
  const setup = await getSetting('setupCompleted');

  return {
    encryptionMode: (mode as 'none' | 'full') || 'none',
    biometricEnabled: biometric === 'true',
    setupCompleted: setup === 'true'
  };
}


// ========== ENCRYPTION MIGRATION ==========

/**
 * EC1: Alle verschlüsselten Einträge entschlüsseln (full → none).
 * Wird aufgerufen bevor encryptionMode auf 'none' gesetzt wird.
 */
export async function decryptAllEntries(
  password: string,
  key?: CryptoKey,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const entries = await db.entries.toArray();
  const encrypted = entries.filter(e => e.encrypted);
  const total = encrypted.length;

  for (let i = 0; i < encrypted.length; i++) {
    const entry = encrypted[i];
    const decrypted = (entry.encryptionVersion === 2 && key)
      ? await decryptWithKey(entry.data, key)
      : await decryptData(entry.data, password);
    await db.entries.update(entry.id!, { data: decrypted, encrypted: false });
    onProgress?.(i + 1, total);
  }
}

/**
 * EC2: Alle unverschlüsselten Einträge verschlüsseln (none → full).
 * Wird aufgerufen nachdem Passwort gesetzt und encryptionMode auf 'full' gesetzt wurde.
 * key: wenn vorhanden, wird v2-Format (encryptWithKey) verwendet.
 */
export async function encryptAllEntries(
  password: string,
  key?: CryptoKey,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const entries = await db.entries.toArray();
  const unencrypted = entries.filter(e => !e.encrypted);
  const total = unencrypted.length;

  for (let i = 0; i < unencrypted.length; i++) {
    const entry = unencrypted[i];
    const changes: Partial<Entry> = { encrypted: true };
    if (key) {
      changes.data = await encryptWithKey(entry.data, key);
      changes.encryptionVersion = 2;
    } else {
      changes.data = await encryptData(entry.data, password);
    }
    await db.entries.update(entry.id!, changes);
    onProgress?.(i + 1, total);
  }
}

/**
 * EC3: Alle verschlüsselten Einträge mit neuem Passwort re-encrypten.
 * Wird aufgerufen beim Passwort-Wechsel.
 * oldKey/newKey: wenn vorhanden, werden v1→v2 und v2→v2 Pfade genutzt.
 */
export async function reEncryptAllEntries(
  oldPassword: string,
  newPassword: string,
  oldKey?: CryptoKey,
  newKey?: CryptoKey,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const entries = await db.entries.toArray();
  const encrypted = entries.filter(e => e.encrypted);
  const total = encrypted.length;

  for (let i = 0; i < encrypted.length; i++) {
    const entry = encrypted[i];
    const decrypted = (entry.encryptionVersion === 2 && oldKey)
      ? await decryptWithKey(entry.data, oldKey)
      : await decryptData(entry.data, oldPassword);

    const changes: Partial<Entry> = {};
    if (newKey) {
      changes.data = await encryptWithKey(decrypted, newKey);
      changes.encryptionVersion = 2;
    } else {
      changes.data = await encryptData(decrypted, newPassword);
    }
    await db.entries.update(entry.id!, changes);
    onProgress?.(i + 1, total);
  }
}

/**
 * EC4: Alle v1-Einträge auf v2-Format migrieren (Background-Migration nach Login).
 * Läuft asynchron, blockiert den User nicht.
 */
export async function runCryptoMigration(password: string, key: CryptoKey): Promise<void> {
  const entries = await db.entries.toArray();
  const v1Entries = entries.filter(e => e.encrypted && e.encryptionVersion !== 2);

  for (const entry of v1Entries) {
    try {
      const decrypted = await decryptData(entry.data, password);
      const reEncrypted = await encryptWithKey(decrypted, key);
      await db.entries.update(entry.id!, { data: reEncrypted, encryptionVersion: 2 });
    } catch (error) {
      console.error('[runCryptoMigration] Fehler bei Entry', entry.id, error);
    }
  }

  const testV2 = await createPasswordTestWithKey(key);
  await setSetting('passwordTestV2', testV2);
  await setSetting('cryptoVersion', 'v2');
}


// ========== INITIALISIERUNG ==========

export const DB_TARGET_VERSION = 21;

export async function getCurrentDBVersion(): Promise<number> {
  return new Promise((resolve) => {
    const req = indexedDB.open('PainDiaryDB');
    req.onsuccess = () => { const v = req.result.version; req.result.close(); resolve(v); };
    req.onerror = () => resolve(0);
  });
}

export async function initializeDB(): Promise<void> {
  await db.open();
}

export default db;
