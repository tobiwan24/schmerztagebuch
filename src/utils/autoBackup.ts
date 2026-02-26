// src/utils/autoBackup.ts
// Automatisches Backup in LocalStorage via nativer CompressionStream-API (kein pako!)

import db from '../db';

const AUTO_BACKUP_KEY = 'auto_backup';
const BACKUP_TIMESTAMP_KEY = 'backup_timestamp';
const MAX_BACKUP_SIZE = 4.5 * 1024 * 1024; // 4.5 MB

// ── Komprimierung (native CompressionStream, iOS Safari 15.4+) ────────────────

async function compress(text: string): Promise<string> {
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(new TextEncoder().encode(text));
  writer.close();
  const buffer = await new Response(stream.readable).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function decompress(base64: string): Promise<string> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const stream = new DecompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Response(stream.readable).text();
}

// ── Daten sammeln ─────────────────────────────────────────────────────────────

async function collectData() {
  const [templates, entries, settings] = await Promise.all([
    db.templates.toArray(),
    db.entries.toArray(),
    db.settings.toArray()
  ]);
  return {
    version: db.verno,
    exportedAt: new Date().toISOString(),
    templates,
    entries,
    // ⚠️ Limitation Phase 11.4: entries.data enthält ggf. noch Bild-Base64,
    // da der separate images-Store erst in Phase 11.5 eingeführt wird.
    // Große Bilder können das 5 MB LocalStorage-Limit überschreiten →
    // Fallback: Trimmen auf letzte 100 Entries.
    settings,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function createAutoBackup(): Promise<boolean> {
  try {
    const data = await collectData();
    const compressed = await compress(JSON.stringify(data));
    const sizeInBytes = new Blob([compressed]).size;

    let toStore = compressed;

    if (sizeInBytes > MAX_BACKUP_SIZE) {
      console.warn(`Auto-backup zu groß (${sizeInBytes} bytes), kürze auf letzte 100 Einträge`);
      const limited = { ...data, entries: data.entries.slice(-100) };
      toStore = await compress(JSON.stringify(limited));
      if (new Blob([toStore]).size > MAX_BACKUP_SIZE) {
        console.error('Auch gekürztes Backup zu groß – übersprungen');
        return false;
      }
    }

    try {
      localStorage.setItem(AUTO_BACKUP_KEY, toStore);
      localStorage.setItem(BACKUP_TIMESTAMP_KEY, Date.now().toString());
    } catch (e) {
      if ((e as DOMException).name === 'QuotaExceededError') {
        console.warn('LocalStorage voll – lösche altes Backup und versuche erneut');
        clearAutoBackup();
        localStorage.setItem(AUTO_BACKUP_KEY, toStore);
        localStorage.setItem(BACKUP_TIMESTAMP_KEY, Date.now().toString());
      } else {
        throw e;
      }
    }

    console.log('✅ Auto-Backup erstellt:', sizeInBytes, 'bytes');
    return true;
  } catch (error) {
    console.error('Auto-Backup fehlgeschlagen:', error);
    return false;
  }
}

export async function restoreFromAutoBackup(): Promise<boolean> {
  try {
    const compressed = localStorage.getItem(AUTO_BACKUP_KEY);
    if (!compressed) return false;

    const json = await decompress(compressed);
    const data = JSON.parse(json);

    await db.transaction('rw', db.templates, db.entries, db.settings, async () => {
      if (data.templates?.length) await db.templates.bulkPut(data.templates);
      if (data.entries?.length) await db.entries.bulkPut(data.entries);
      if (data.settings?.length) await db.settings.bulkPut(data.settings);
    });

    console.log('✅ Aus Auto-Backup wiederhergestellt');
    return true;
  } catch (error) {
    console.error('Wiederherstellung aus Auto-Backup fehlgeschlagen:', error);
    return false;
  }
}

export function hasAutoBackup(): boolean {
  return localStorage.getItem(AUTO_BACKUP_KEY) !== null;
}

export function getBackupTimestamp(): Date | null {
  const ts = localStorage.getItem(BACKUP_TIMESTAMP_KEY);
  return ts ? new Date(Number(ts)) : null;
}

export function clearAutoBackup(): void {
  localStorage.removeItem(AUTO_BACKUP_KEY);
  localStorage.removeItem(BACKUP_TIMESTAMP_KEY);
}

// ── Dexie Hook Registration (in App.tsx aufrufen, NICHT direkt in db.ts) ──────
// Vermeidet zirkuläre Imports zwischen db.ts und autoBackup.ts

export function initAutoBackupHooks(): void {
  db.entries.hook('creating', () => {
    createAutoBackup().catch(err => console.warn('Auto-Backup (creating) fehlgeschlagen:', err));
  });
  db.entries.hook('updating', () => {
    createAutoBackup().catch(err => console.warn('Auto-Backup (updating) fehlgeschlagen:', err));
  });
  db.templates.hook('creating', () => {
    createAutoBackup().catch(err => console.warn('Auto-Backup Template (creating) fehlgeschlagen:', err));
  });
  db.templates.hook('updating', () => {
    createAutoBackup().catch(err => console.warn('Auto-Backup Template (updating) fehlgeschlagen:', err));
  });
}
