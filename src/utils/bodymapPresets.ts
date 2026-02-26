// BodyMap Preset Verwaltung
export interface BodyMapPreset {
  id: string;
  name: string;
  image: string;       // base64 (user-created presets) oder leer bei Default-Presets
  imageUrl?: string;   // Pfad zu gebündeltem Bild (nur bei Default-Presets)
  isDefault?: boolean; // true = kann nicht gelöscht werden
}

const STORAGE_KEY = 'bodymap_presets';

// Standard-Presets (gebündelte Körperbilder aus public/bodymap/)
const DEFAULT_PRESETS: BodyMapPreset[] = [
  {
    id: 'default-body-front',
    name: 'Körper – Vorderseite',
    image: '',
    imageUrl: '/bodymap/body-front.svg',
    isDefault: true,
  },
  {
    id: 'default-body-back',
    name: 'Körper – Rückseite',
    image: '',
    imageUrl: '/bodymap/body-back.svg',
    isDefault: true,
  },
];

export function getPresets(): BodyMapPreset[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const userPresets: BodyMapPreset[] = stored ? JSON.parse(stored) : [];
    // User-eigene Presets zuerst, dann Default-Presets
    return [...userPresets, ...DEFAULT_PRESETS];
  } catch (error) {
    console.error('Fehler beim Laden der Presets:', error);
  }
  return [...DEFAULT_PRESETS];
}

export function savePreset(name: string, image: string): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const userPresets: BodyMapPreset[] = stored ? JSON.parse(stored) : [];
    const newPreset: BodyMapPreset = {
      id: crypto.randomUUID(),
      name,
      image
    };
    userPresets.push(newPreset);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userPresets));
  } catch (error) {
    console.error('Fehler beim Speichern des Presets:', error);
  }
}

export function deletePreset(id: string): void {
  // Default-Presets sind nicht löschbar
  const defaultPreset = DEFAULT_PRESETS.find(p => p.id === id);
  if (defaultPreset) return;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const userPresets: BodyMapPreset[] = stored ? JSON.parse(stored) : [];
    const filtered = userPresets.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Fehler beim Löschen des Presets:', error);
  }
}

// setDefaultPreset() und getDefaultPreset() ENTFERNT
// Default-Preset wird jetzt pro Block in block.bodyMapConfig.defaultPresetId gespeichert
