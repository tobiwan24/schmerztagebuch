import Dexie, { type EntityTable } from 'dexie';
import type { Block } from './types/blocks';
import type { Template, Entry, Settings } from './types/database';
import { generateUUID } from './utils/uuid';

const db = new Dexie('PainDiaryDB') as Dexie & {
  templates: EntityTable<Template, 'id'>;
  entries: EntityTable<Entry, 'id'>;
  settings: EntityTable<Settings, 'key'>;
};

// Version 5: Template-System
db.version(5).stores({
  templates: '++id, name, order',
  entries: '++id, templateId, timestamp, encrypted, *tags',
  settings: 'key'
});

// ========== MIGRATIONS ==========

// Standard-Icons basierend auf Template-Namen - ERWEITERT mit medizinischen Icons
const DEFAULT_ICONS: Record<string, string> = {
  // Schmerz-bezogen
  'schmerz': 'flame',
  'pain': 'flame',
  'weh': 'alertcircle',
  'kopf': 'brain',
  'kopfschmerz': 'brain',
  'migräne': 'brain',
  'rücken': 'user',
  'bauch': 'user',
  'brust': 'heartpulse',
  'herz': 'heartpulse',
  'gelenk': 'hand',
  'knie': 'footprints',
  'fuß': 'footprints',
  'bein': 'footprints',
  'hand': 'hand',
  'arm': 'hand',
  'auge': 'eye',
  'ohr': 'ear',
  'akut': 'alertcircle',
  'stark': 'trendingup',
  'chronisch': 'target',
  
  // Medizin & Behandlung
  'medikament': 'pill',
  'tablette': 'pill',
  'pille': 'pill',
  'spritze': 'syringe',
  'injektion': 'syringe',
  'arzt': 'stethoscope',
  'behandlung': 'stethoscope',
  'therapie': 'activity',
  'vitals': 'heartpulse',
  'temperatur': 'thermometer',
  'fieber': 'thermometer',
  
  // Allgemein
  'beispiel': 'book',
  'tagebuch': 'book',
  'notiz': 'book',
  'schlaf': 'bed',
  'ruhe': 'bed',
  'essen': 'coffee',
  'nahrung': 'coffee',
  'stimmung': 'smile',
  'gefühl': 'smile',
  'termin': 'calendar',
  'datum': 'calendar',
  'tag': 'calendar',
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
  return 'book'; // Fallback
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

export async function getTemplates(): Promise<Template[]> {
  return await db.templates.orderBy('order').toArray();
}

export async function getTemplate(id: number): Promise<Template | undefined> {
  return await db.templates.get(id);
}

export async function updateTemplate(id: number, changes: Partial<Template>): Promise<void> {
  await db.templates.update(id, changes);
}

export async function deleteTemplate(id: number): Promise<void> {
  await db.templates.delete(id);
}

export async function reorderTemplates(templates: Template[]): Promise<void> {
  await db.transaction('rw', db.templates, async () => {
    for (let i = 0; i < templates.length; i++) {
      if (templates[i].id) {
        await db.templates.update(templates[i].id!, { order: i });
      }
    }
  });
}

export async function getTemplateEntryCount(templateId: number): Promise<number> {
  return await db.entries.where('templateId').equals(templateId).count();
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

export async function getEntriesByTag(tag: string): Promise<Entry[]> {
  return await db.entries
    .where('tags')
    .equals(tag)
    .reverse()
    .sortBy('timestamp');
}

export async function getEntriesByDateRange(start: Date, end: Date): Promise<Entry[]> {
  return await db.entries
    .where('timestamp')
    .between(start, end, true, true)
    .reverse()
    .sortBy('timestamp');
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

export async function setAppSettings(settings: {
  encryptionMode?: 'none' | 'history' | 'full';
  biometricEnabled?: boolean;
  setupCompleted?: boolean;
}): Promise<void> {
  if (settings.encryptionMode) {
    await setSetting('encryptionMode', settings.encryptionMode);
  }
  if (settings.biometricEnabled !== undefined) {
    await setSetting('biometricEnabled', String(settings.biometricEnabled));
  }
  if (settings.setupCompleted !== undefined) {
    await setSetting('setupCompleted', String(settings.setupCompleted));
  }
}

// ========== INITIALISIERUNG ==========

export async function initializeDB(): Promise<void> {
  // Migration ausführen
  await migrateTemplateStyles();
  
  const count = await db.templates.count();
  
  if (count === 0) {
    // Beispiel-Template: Tab mit Datum, Schmerzstärke und Notizen
    await createTemplate('Beispiel-Tab', [
      {
        id: generateUUID(),
        type: 'date',
        label: 'Datum',
        value: new Date().toISOString().split('T')[0]
      },
      {
        id: generateUUID(),
        type: 'slider',
        label: 'Schmerzstärke',
        value: 5,
        min: 0,
        max: 10,
        step: 1
      },
      {
        id: generateUUID(),
        type: 'textarea',
        label: 'Notizen',
        value: ''
      }
    ]);
  }
}

export default db;
