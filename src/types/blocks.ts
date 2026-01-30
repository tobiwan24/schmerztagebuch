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

// CheckboxValue für erweiterte Checkbox-Funktionalität
export interface CheckboxValue {
  checked: boolean;
  text?: string;
}

// Alle möglichen Block-Werte
export type BlockValue = string | number | boolean | File | string[] | CheckboxValue;

// Basis-Interface für alle Blöcke
export interface Block {
  id: string;
  type: BlockType;
  label: string;
  hideLabelInDiary?: boolean;  // NEU: Flag zum Ausblenden des Labels in DiaryView
  value?: BlockValue;
  options?: string[];  // Deprecated - alte MultiSelect
  multiSelectOptions?: MultiSelectOption[];  // Neue MultiSelect mit Farben
  min?: number;        // Für Slider
  max?: number;        // Für Slider
  step?: number;       // Für Slider
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

export function isTextAreaBlock(block: Block): block is Block & { type: 'textarea'; value?: string } {
  return block.type === 'textarea';
}

export function isBodyMapBlock(block: Block): block is Block & { type: 'bodymap'; value?: string } {
  return block.type === 'bodymap';
}