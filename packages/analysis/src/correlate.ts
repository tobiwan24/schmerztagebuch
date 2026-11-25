// Zusammenhänge (Spec 06 „Zusammenhänge“, A-090): Spearman-Rangkorrelation auf Tageswerten mit Zeitversatz 0–7 Tage.
// Rein beschreibend: kein p-Wert, keine Ursachenaussage. Unterhalb der Mindestzahl gibt es keinen Koeffizienten.
import type { DayValue } from './aggregate.js';

/** Mindestzahl gemeinsamer Tage, ab der ein Koeffizient ausgewiesen wird. */
export const MIN_CORRELATION_DAYS = 14;
/** Größter Zeitversatz in Tagen. */
export const MAX_LAG_DAYS = 7;

export type CorrelationStrength = 'weak' | 'medium' | 'strong';

export interface Correlation {
  /** Zeitversatz: Wert von `a` am Tag d wird mit dem Wert von `b` am Tag d + lag gepaart. */
  lag: number;
  /** Anzahl gemeinsamer Tage (Paare). */
  n: number;
  /** `n` ≥ Mindestzahl. */
  enough: boolean;
  /** Spearman ρ in −1..1; `null` unter der Mindestzahl oder wenn eine Reihe konstant ist. */
  rho: number | null;
  /** Stärke in Worten nach |ρ| (< 0,3 schwach, < 0,6 mittel, sonst stark); `null` ohne Koeffizient. */
  strength: CorrelationStrength | null;
  /** Eine der beiden Reihen hat über die gemeinsamen Tage keinen Unterschied (ρ nicht definiert). */
  constant: boolean;
}

const DAY_MS = 86_400_000;
const dayIndex = (day: string): number => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);

/** Rang mit Mittelwert bei Gleichstand (1-basiert). */
function ranks(xs: readonly number[]): number[] {
  const idx = xs.map((_, i) => i).sort((i, j) => xs[i]! - xs[j]!);
  const out = new Array<number>(xs.length);
  let k = 0;
  while (k < idx.length) {
    let m = k;
    while (m + 1 < idx.length && xs[idx[m + 1]!] === xs[idx[k]!]) m++;
    const r = (k + m) / 2 + 1;
    for (let q = k; q <= m; q++) out[idx[q]!] = r;
    k = m + 1;
  }
  return out;
}

function pearson(x: readonly number[], y: readonly number[]): number | null {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx, dy = y[i]! - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

export function strengthOf(rho: number): CorrelationStrength {
  const a = Math.abs(rho);
  return a < 0.3 ? 'weak' : a < 0.6 ? 'medium' : 'strong';
}

/** Spearman-Korrelation zweier Tagesreihen mit Zeitversatz `lag` (0–7, ganzzahlig). */
export function correlate(a: readonly DayValue[], b: readonly DayValue[], lag = 0): Correlation {
  if (!Number.isInteger(lag) || lag < 0 || lag > MAX_LAG_DAYS) throw new RangeError(`lag muss eine ganze Zahl von 0 bis ${MAX_LAG_DAYS} sein`);
  const byDay = new Map<number, number>();
  for (const d of b) byDay.set(dayIndex(d.day), d.value);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const d of a) {
    const v = byDay.get(dayIndex(d.day) + lag);
    if (v !== undefined) { xs.push(d.value); ys.push(v); }
  }
  const n = xs.length;
  if (n < MIN_CORRELATION_DAYS) return { lag, n, enough: false, rho: null, strength: null, constant: false };
  const rho = pearson(ranks(xs), ranks(ys));
  return { lag, n, enough: true, rho, strength: rho === null ? null : strengthOf(rho), constant: rho === null };
}
