import type { Block } from './blocks';

// Template: Wiederverwendbare Seitenvorlage mit Bausteinen
export interface Template {
  id?: number;
  name: string;
  order: number;
  tags?: string[];
  blocks: Block[];
  icon?: string;      // Icon-Name aus Lucide-Bibliothek
  color?: string;     // Hex-Farbcode für Button-Hintergrund
  syncId?: string;     // UUID v4 — geräteübergreifende ID für Cloud-Sync (Server-PK-Bestandteil)
  updatedAt?: string;  // ISO-Timestamp der letzten Änderung — Basis für LWW-Konfliktauflösung
  deleted?: boolean;   // Tombstone (Soft-Delete) — Datensatz bleibt in der DB, damit Löschung sync-fähig ist
}

// Entry: Ausgefülltes Template (verschlüsselt gespeichert)
export interface Entry {
  id?: number;
  templateId: number;
  timestamp: Date;
  encrypted: boolean;
  data: string;  // JSON string (plain oder verschlüsselt)
  tags?: string[];
  editedAt?: string;  // ISO timestamp der letzten Bearbeitung
  encryptionVersion?: number;  // 2 = v2 (Key-Caching); undefined/1 = v1 (Legacy per-entry PBKDF2)
  encryptionSource?: 'cloud' | 'local';  // Welcher Schlüssel verschlüsselt hat — Cloud-DEK oder lokales Passwort.
                                          // undefined = 'local' (Rückwärtskompatibilität, Alt-Einträge vor diesem Feld).
                                          // Lokale Passwort-Migrationen (db.ts) überspringen 'cloud'-Einträge.
  syncId?: string;     // UUID v4 — geräteübergreifende ID für Cloud-Sync (Server-PK-Bestandteil)
  updatedAt?: string;  // ISO-Timestamp der letzten Änderung — Basis für LWW-Konfliktauflösung
  deleted?: boolean;   // Tombstone (Soft-Delete) — Datensatz bleibt in der DB, damit Löschung sync-fähig ist
}

// Settings: App-Konfiguration
export interface Settings {
  key: string;
  value: string;
}

// Verschlüsselungs-Modi
export type EncryptionMode = 'none' | 'full';
