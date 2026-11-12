// Backup-Code (Spec 03): 128 Bit Zufall, Base32 (RFC 4648) in 8er-Gruppen. Erzeugung/Format folgen mit CRY-07.

/** Normalisiert Eingaben tolerant: Groß-/Kleinschreibung, Leerzeichen und Bindestriche spielen keine Rolle. */
export function normalizeBackupCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]+/g, '');
}
