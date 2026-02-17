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
    // Standard-Vorlage: Kopfschmerz-Tagebuch mit vollständiger Dashboard-Aktivierung
    await createTemplate('Kopfschmerz-Tagebuch', [
      {
        id: generateUUID(),
        type: 'date',
        label: 'Datum',
        value: new Date().toISOString().split('T')[0],
        hideLabelInDiary: true
      },
      {
        id: generateUUID(),
        type: 'slider',
        label: 'Schmerzstärke',
        value: 5,
        min: 0,
        max: 10,
        step: 1,
        dashboard: {
          enabled: true,
          type: 'pain'
        }
      },
      {
        id: generateUUID(),
        type: 'multiselect',
        label: 'Schmerzart',
        value: [],
        multiSelectOptions: [
          { text: 'Migräne', color: '#FF3B30' },
          { text: 'Spannungskopfschmerz', color: '#FF9500' },
          { text: 'Clusterkopfschmerz', color: '#5856D6' }
        ],
        dashboard: {
          enabled: true
        }
      },
      {
        id: generateUUID(),
        type: 'multiselect',
        label: 'Begleitsymptome',
        value: [],
        multiSelectOptions: [
          { text: 'Übelkeit', color: '#34C759' },
          { text: 'Aura', color: '#5856D6' },
          { text: 'Lichtempfindlichkeit', color: '#FF9500' },
          { text: 'Schwindel', color: '#007AFF' }
        ],
        dashboard: {
          enabled: true
        }
      },
      {
        id: generateUUID(),
        type: 'multiselect',
        label: 'Medikamente',
        value: [],
        multiSelectOptions: [
          { text: 'IBU 400', color: '#007AFF' },
          { text: 'IBU 600', color: '#5856D6' },
          { text: 'Paracetamol', color: '#34C759' },
          { text: 'Triptan', color: '#FF3B30' }
        ],
        dashboard: {
          enabled: true
        }
      },
      {
        id: generateUUID(),
        type: 'textarea',
        label: 'Notizen',
        value: '',
        dashboard: {
          enabled: true
        }
      },
      {
        id: generateUUID(),
        type: 'bodymap',
        label: 'Körperkarte',
        value: '',
        dashboard: {
          enabled: true,
          type: 'pain'
        }
      }
    ]);
  }
}

export default db;
