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
}

// Entry: Ausgefülltes Template (verschlüsselt gespeichert)
export interface Entry {
  id?: number;
  templateId: number;
  timestamp: Date;
  encrypted: boolean;
  data: string;  // JSON string (plain oder verschlüsselt)
  tags?: string[];
}

// Settings: App-Konfiguration
export interface Settings {
  key: string;
  value: string;
}

// Verschlüsselungs-Modi
export type EncryptionMode = 'none' | 'history' | 'full';

export interface AppSettings {
  encryptionMode: EncryptionMode;
  biometricEnabled: boolean;
  setupCompleted: boolean;
}
