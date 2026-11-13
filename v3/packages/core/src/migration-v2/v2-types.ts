// Eingangsformen aus v2 (Spec 11 „Ausgangslage"): nur lesend, bewusst tolerant typisiert — echte v2-Daten enthalten
// Altformen (Legacy-Werte, fehlende Felder). Die Transformation prüft jeden Wert selbst.

export type V2BlockType = 'text' | 'checkbox' | 'image' | 'slider' | 'date' | 'multiselect' | 'textarea' | 'bodymap';

export interface V2Block {
  id: string;
  type: V2BlockType | string;
  label?: string;
  isDeletable?: boolean;
  value?: unknown;
  /** Alte Multiselect-Optionen (nur Texte). */
  options?: string[];
  multiSelectOptions?: { text: string; color?: string }[];
  min?: number;
  max?: number;
  step?: number;
  dashboard?: { enabled?: boolean; type?: 'pain' | 'function'; eventTitle?: string; eventCategory?: 'event' | 'doctor' };
  bodyMapConfig?: { defaultPresetId?: string };
}

export interface V2Template {
  id: number;
  name: string;
  order: number;
  blocks: V2Block[];
  icon?: string;
  color?: string;
  syncId?: string;
  updatedAt?: string;
  deleted?: boolean;
}

/** v2-Eintrag nach dem Entschlüsseln: `blocks` = Momentaufnahme der Vorlage mit Werten, `null` = nicht entschlüsselbar. */
export interface V2DecodedEntry {
  id: number;
  templateId: number;
  /** ISO-Zeitpunkt der Erfassung (v2 `timestamp`). */
  timestamp: string;
  syncId?: string;
  updatedAt?: string;
  editedAt?: string;
  deleted?: boolean;
  blocks: V2Block[] | null;
  /** Grund, falls `blocks === null` (z. B. „falsches Passwort“, „kein Cloud-Schlüssel“). */
  decryptError?: string;
}

export interface V2Source {
  templates: V2Template[];
  entries: V2DecodedEntry[];
}
