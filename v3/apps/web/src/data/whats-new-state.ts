// Zuletzt gesehene Version der Neuigkeiten (UI-27, A-081): `localStorage` `stb-v3-whatsnew`. Reine Darstellungs-
// information ohne Gesundheitsdaten, überlebt deshalb auch die Gefahr-Zone (A-078).
export const WHATS_NEW_KEY = 'stb-v3-whatsnew';

export function readLastSeen(storage: Pick<Storage, 'getItem'> = localStorage): string | null {
  try {
    return storage.getItem(WHATS_NEW_KEY);
  } catch {
    return null;
  }
}

export function writeLastSeen(version: string, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(WHATS_NEW_KEY, version);
  } catch {
    /* Speicher gesperrt (privater Modus): Dialog erscheint dann beim nächsten Start erneut. */
  }
}
