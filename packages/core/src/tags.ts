// Tags eines Eintrags (Spec 05, BLK-28): frei, normalisiert, ohne Duplikate; Vorschläge aus dem Tagebuch.

export const MAX_TAG_LENGTH = 40;
export const MAX_TAGS = 20;
export const MAX_SUGGESTIONS = 8;

/** Trimmen, Leerraum zusammenfassen, Kommas entfernen (A-060), auf 40 Zeichen kürzen; leer → `null`. */
export function normalizeTag(raw: string): string | null {
  const t = raw.replace(/,/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH).trim();
  return t === '' ? null : t;
}

const fold = (s: string) => s.toLocaleLowerCase('de');

/** Fügt einen Tag hinzu; ungültig, doppelt (ohne Groß-/Kleinschreibung) oder über dem Limit → Liste unverändert. */
export function addTag(tags: readonly string[], raw: string): string[] {
  const t = normalizeTag(raw);
  if (!t || tags.length >= MAX_TAGS || tags.some((x) => fold(x) === fold(t))) return [...tags];
  return [...tags, t];
}

/** Vorschläge: vorhandene Tags des Tagebuchs mit passendem Präfix, nach Häufigkeit (dann alphabetisch), höchstens 8. */
export function suggestTags(entryTags: readonly (readonly string[])[], prefix: string, current: readonly string[]): string[] {
  const p = fold(prefix.replace(/\s+/g, ' ').trim());
  const have = new Set(current.map(fold));
  const counts = new Map<string, { label: string; n: number }>();
  for (const tags of entryTags) {
    for (const t of new Set(tags.map(fold))) {
      const label = tags.find((x) => fold(x) === t)!;
      const c = counts.get(t);
      if (c) c.n++;
      else counts.set(t, { label, n: 1 });
    }
  }
  return [...counts.entries()]
    .filter(([k]) => k.startsWith(p) && !have.has(k))
    .sort((a, b) => b[1].n - a[1].n || a[1].label.localeCompare(b[1].label, 'de'))
    .slice(0, MAX_SUGGESTIONS)
    .map(([, v]) => v.label);
}
