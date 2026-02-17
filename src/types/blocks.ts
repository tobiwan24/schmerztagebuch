// Alle verfügbaren Block-Typen
export type BlockType = 
  | 'text' 
  | 'checkbox' 
  | 'image' 
  | 'slider' 
  | 'date' 
  | 'multiselect' 
  | 'textarea' 
  | 'bodymap';

// MultiSelect Button Option
export interface MultiSelectOption {
  text: string;
  color: string;
}

// AttachedFile für TextArea-Block
export interface AttachedFile {
  id: string;
  name: string;
  type: 'image' | 'pdf';
  data: string; // Base64
  createdAt: string;
}

// TextArea Block Value (erweitert)
export interface TextAreaBlockValue {
  text?: string;
  events?: { eventCategory: 'event' | 'doctor'; eventTitle: string }[];
  attachedFiles?: AttachedFile[];
}

// CheckboxValue für erweiterte Checkbox-Funktionalität
export interface CheckboxValue {
  checked: boolean;
  text?: string;
}

// Alle möglichen Block-Werte
export type BlockValue = string | number | boolean | File | string[] | CheckboxValue | TextAreaBlockValue;

// Dashboard-Konfiguration für Blöcke
export interface DashboardConfig {
  enabled: boolean;
  type?: 'pain' | 'function';  // Für Slider/BodyMap
  eventTitle?: string;         // Für TextArea als Event
  eventCategory?: 'event' | 'doctor';  // Event oder Arztbesuch
}

// Basis-Interface für alle Blöcke
export interface Block {
  id: string;
  type: BlockType;
  label: string;
  hideLabelInDiary?: boolean;  // Flag zum Ausblenden des Labels in DiaryView
  isDeletable?: boolean;       // false = Pflicht-Block, Delete-Button ausgeblendet
  value?: BlockValue;
  options?: string[];  // Deprecated - alte MultiSelect
  multiSelectOptions?: MultiSelectOption[];  // Neue MultiSelect mit Farben
  min?: number;        // Für Slider
  max?: number;        // Für Slider
  step?: number;       // Für Slider
  dashboard?: DashboardConfig;  // NEU: Dashboard-Konfiguration
}

// Type Guards für bessere Type Safety
export function isTextBlock(block: Block): block is Block & { type: 'text'; value?: string } {
  return block.type === 'text';
}

export function isCheckboxBlock(block: Block): block is Block & { type: 'checkbox'; value?: boolean } {
  return block.type === 'checkbox';
}

export function isImageBlock(block: Block): block is Block & { type: 'image'; value?: File | string } {
  return block.type === 'image';
}

export function isSliderBlock(block: Block): block is Block & { type: 'slider'; value?: number } {
  return block.type === 'slider';
}

export function isDateBlock(block: Block): block is Block & { type: 'date'; value?: string } {
  return block.type === 'date';
}

export function isMultiSelectBlock(block: Block): block is Block & { type: 'multiselect'; value?: string[]; options: string[] } {
  return block.type === 'multiselect';
}

export function isTextAreaBlock(block: Block): block is Block & { type: 'textarea'; value?: string | TextAreaBlockValue } {
  return block.type === 'textarea';
}

export function isBodyMapBlock(block: Block): block is Block & { type: 'bodymap'; value?: string } {
  return block.type === 'bodymap';
}