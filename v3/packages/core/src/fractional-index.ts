// Fractional Index (Spec 02 „Reihenfolge"): Order-Keys sind Ziffernfolgen zur Basis 62, gelesen als Nachkommastellen
// 0.xxxx. Ein Key endet nie auf der kleinsten Ziffer, damit darunter immer Platz bleibt. Die Ziffern sind in
// ASCII-Reihenfolge, daher stimmt der einfache String-Vergleich (`<`) mit der numerischen Ordnung überein.

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ZERO = DIGITS[0]!;
const KEY_RE = /^[0-9A-Za-z]*[1-9A-Za-z]$/;

export function isValidOrderKey(key: string): boolean {
  return KEY_RE.test(key);
}

const digit = (c: string | undefined): number => (c === undefined ? 0 : DIGITS.indexOf(c));

/** Mittelpunkt zweier Ziffernfolgen; `b === null` steht für 1.0. Voraussetzung: a < b, keine Endnullen. */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while ((a[n] ?? ZERO) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const da = digit(a[0]);
  const db = b === null ? DIGITS.length : digit(b[0]);
  if (db - da > 1) return DIGITS[Math.round((da + db) / 2)]!;
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[da]! + midpoint(a.slice(1), null);
}

/**
 * Key strikt zwischen `a` und `b` (`null` = offenes Ende). Wirft bei ungültigen Keys oder `a >= b`.
 */
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null && !isValidOrderKey(a)) throw new TypeError(`Ungültiger Order-Key: "${a}"`);
  if (b !== null && !isValidOrderKey(b)) throw new TypeError(`Ungültiger Order-Key: "${b}"`);
  if (a !== null && b !== null && a >= b) throw new RangeError(`Order-Keys nicht aufsteigend: "${a}" >= "${b}"`);
  return midpoint(a ?? '', b);
}

const cmp = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

/** Sortierung nach `order`, bei Gleichstand nach `id` (deterministisch auf allen Geräten, ohne Locale). */
export function compareByOrder(a: { order: string; id: string }, b: { order: string; id: string }): number {
  return cmp(a.order, b.order) || cmp(a.id, b.id);
}
