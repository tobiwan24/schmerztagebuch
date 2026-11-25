// Auslöser-Analyse (Spec 06 „Zusammenhänge“, A-090): Vierfeldertafel und Lift je Ereignis.
// Ereignis an Tag d (lag 0) bzw. Tag d−1 (lag 1) → Ergebnis an Tag d ≥ Schwelle. Rein beschreibend, keine Ursachenaussage.
import type { Role } from '@stb/core';
import { dailySeries, picksOf, type DayRange, type DailyMode, type NumericTarget } from './aggregate.js';
import type { WsEntry } from './working-set.js';

/** Mindestzahl an Fällen (Tage mit Ereignis und Ergebniswert), ab der ein Lift ausgewiesen wird. */
export const MIN_LIFT_CASES = 10;

export interface FourFold {
  /** Ereignis, Ergebnis ≥ Schwelle. */
  exposedHigh: number;
  /** Ereignis, Ergebnis < Schwelle. */
  exposedLow: number;
  /** kein Ereignis, Ergebnis ≥ Schwelle. */
  otherHigh: number;
  /** kein Ereignis, Ergebnis < Schwelle. */
  otherLow: number;
}

export interface TriggerLift {
  key: string;
  label: string;
  /** Fälle = Tage mit Ereignis, an denen ein Ergebniswert vorliegt. */
  cases: number;
  table: FourFold;
  enough: boolean;
  /** Anteil „hoch“ an den Ereignistagen / an allen Tagen mit Ergebniswert; `null` unter der Mindestzahl. */
  rateWithEvent: number | null;
  rateOverall: number | null;
  /** rateWithEvent / rateOverall; `null` unter der Mindestzahl oder wenn der Gesamtanteil 0 ist. */
  lift: number | null;
}

export interface TriggerLiftOptions {
  outcome: NumericTarget;
  /** Ergebnis „hoch“ ab diesem Tageswert (inklusive). */
  threshold: number;
  /** 0 = Ereignis am selben Tag, 1 = am Vortag. */
  lag?: 0 | 1;
  trigger: { blockId: string } | { role: Role };
  range?: DayRange;
  mode?: DailyMode;
}

const DAY_MS = 86_400_000;
const shift = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export function triggerLift(entries: readonly WsEntry[], opts: TriggerLiftOptions): TriggerLift[] {
  const lag = opts.lag ?? 0;
  const inRange = (day: string) => !opts.range || (day >= opts.range.from && day <= opts.range.to);
  const scoped = opts.range ? entries.filter((e) => inRange(e.day)) : entries;
  const outcome = dailySeries(scoped, opts.outcome, opts.mode).map((d) => ({ day: d.day, high: d.value >= opts.threshold }));
  const total = outcome.length;
  const totalHigh = outcome.filter((o) => o.high).length;

  // Ereignis → Tage (ohne Zeitraumgrenze nach hinten: Ereignisse am Vortag des ersten Tages zählen mit, daher alle Einträge).
  const events = new Map<string, { label: string; days: Set<string> }>();
  const triggerEntries = lag === 0 ? scoped : entries;
  for (const e of triggerEntries) {
    const fields = 'blockId' in opts.trigger ? e.fields.filter((f) => f.blockId === (opts.trigger as { blockId: string }).blockId) : e.fields.filter((f) => f.role === (opts.trigger as { role: Role }).role);
    for (const f of fields) {
      for (const [key, label] of picksOf(f)) {
        const ev = events.get(key) ?? { label, days: new Set<string>() };
        ev.days.add(e.day);
        events.set(key, ev);
      }
    }
  }

  const rows: TriggerLift[] = [];
  for (const [key, ev] of events) {
    const table: FourFold = { exposedHigh: 0, exposedLow: 0, otherHigh: 0, otherLow: 0 };
    for (const o of outcome) {
      const exposed = ev.days.has(shift(o.day, -lag));
      if (exposed) { if (o.high) table.exposedHigh++; else table.exposedLow++; }
      else if (o.high) table.otherHigh++;
      else table.otherLow++;
    }
    const cases = table.exposedHigh + table.exposedLow;
    if (cases === 0) continue;
    const enough = cases >= MIN_LIFT_CASES;
    const rateWithEvent = enough ? table.exposedHigh / cases : null;
    const rateOverall = enough && total > 0 ? totalHigh / total : null;
    const lift = rateWithEvent !== null && rateOverall !== null && rateOverall > 0 ? rateWithEvent / rateOverall : null;
    rows.push({ key, label: ev.label, cases, table, enough, rateWithEvent, rateOverall, lift });
  }
  // Mit Lift zuerst (absteigend), dann nach Fallzahl; Ereignisse unter der Mindestzahl ohne Zahl am Ende.
  return rows.sort((a, b) => (b.lift ?? -1) - (a.lift ?? -1) || b.cases - a.cases || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}
