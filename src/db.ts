import Dexie, { type EntityTable } from 'dexie';
import type { Block } from './types/blocks';
import type { Template, Entry, Settings } from './types/database';
import { generateUUID } from './utils/uuid';

const db = new Dexie('PainDiaryDB') as Dexie & {
  templates: EntityTable<Template, 'id'>;
  entries: EntityTable<Entry, 'id'>;
  settings: EntityTable<Settings, 'key'>;
};

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

// Migration: Templates ohne icon/color mit Defaults versehen
export async function migrateTemplateStyles(): Promise<void> {
  const templates = await db.templates.toArray();
  let colorIndex = 0;
  
  for (const template of templates) {
    if (!template.icon || !template.color) {
      const updates: Partial<Template> = {};
      
      if (!template.icon) {
        updates.icon = getDefaultIconForTemplate(template.name);
      }
      
      if (!template.color) {
        updates.color = DEFAULT_COLORS[colorIndex % DEFAULT_COLORS.length];
        colorIndex++;
      }
      
      if (template.id) {
        await db.templates.update(template.id, updates);
      }
    }
  }
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
    color: DEFAULT_COLORS[order % DEFAULT_COLORS.length]
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
  const templates = await db.templates.orderBy('order').toArray();
  return templates.map(migrateImageBlocksToTextArea);
}

export async function updateTemplate(id: number, changes: Partial<Template>): Promise<void> {
  await db.templates.update(id, changes);
}

export async function deleteTemplate(id: number): Promise<void> {
  await db.templates.delete(id);
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
    tags
  });
  
  return id as number;
}

export async function getEntries(templateId?: number): Promise<Entry[]> {
  if (templateId !== undefined) {
    return await db.entries
      .where('templateId')
      .equals(templateId)
      .reverse()
      .sortBy('timestamp');
  }
  return await db.entries.orderBy('timestamp').reverse().toArray();
}

export async function getEntry(id: number): Promise<Entry | undefined> {
  return await db.entries.get(id);
}

export async function deleteEntry(id: number): Promise<void> {
  await db.entries.delete(id);
}

export async function updateEntry(
  id: number,
  data: string,
  encrypted: boolean,
  editedAt: string
): Promise<void> {
  await db.entries.update(id, { data, encrypted, editedAt });
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
  encryptionMode: 'none' | 'history' | 'full';
  biometricEnabled: boolean;
  setupCompleted: boolean;
}> {
  const mode = await getSetting('encryptionMode');
  const biometric = await getSetting('biometricEnabled');
  const setup = await getSetting('setupCompleted');
  
  return {
    encryptionMode: (mode as 'none' | 'history' | 'full') || 'none',
    biometricEnabled: biometric === 'true',
    setupCompleted: setup === 'true'
  };
}


// ========== INITIALISIERUNG ==========

export async function initializeDB(): Promise<void> {
  // Migration ausführen
  await migrateTemplateStyles();
  
  // Keine Default-Vorlagen mehr: werden im SetupWizard vom User gewählt
}

export default db;
