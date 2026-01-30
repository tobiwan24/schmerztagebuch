// BodyMap Preset Verwaltung
export interface BodyMapPreset {
  id: string;
  name: string;
  image: string; // base64
  isDefault?: boolean;
}

const STORAGE_KEY = 'bodymap_presets';

// Standard-Presets (können später durch echte Bilder ersetzt werden)
const DEFAULT_PRESETS: BodyMapPreset[] = [
  // Hier können später Standard-Körpersilhouetten hinzugefügt werden
];

export function getPresets(): BodyMapPreset[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Fehler beim Laden der Presets:', error);
  }
  return [...DEFAULT_PRESETS];
}

export function savePreset(name: string, image: string): void {
  const presets = getPresets();
  const newPreset: BodyMapPreset = {
    id: crypto.randomUUID(),
    name,
    image,
    isDefault: false
  };
  presets.push(newPreset);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function deletePreset(id: string): void {
  const presets = getPresets();
  const filtered = presets.filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function setDefaultPreset(id: string): void {
  const presets = getPresets();
  const updated = presets.map(p => ({
    ...p,
    isDefault: p.id === id
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function getDefaultPreset(): BodyMapPreset | null {
  const presets = getPresets();
  return presets.find(p => p.isDefault) || null;
}
