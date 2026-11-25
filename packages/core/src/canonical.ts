/** JSON mit sortierten Schlüsseln, ohne `undefined` — Grundlage des Strukturvergleichs. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Strukturelle Gleichheit über `canonical` (Schlüsselreihenfolge und `undefined` egal). */
export const deepEqual = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);
