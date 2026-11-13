// Aggregation und Periodenvergleich (Spec 06, verbindliche Semantik). Rein beschreibend, jede Kennzahl mit `n`.
// - Tage in der Zeitzone des Tagebuchs (`WsEntry.day`, Arbeitsset).
// - Mehrere Einträge pro Tag: `mean` · `max` · `last` (Standard `max` für Rolle `outcome`, sonst `mean`).
// - Leere Werte zählen nicht in `n`; Tage ohne Wert erscheinen nicht (nie „0").
import type { Role } from '@stb/core';
import type { WsEntry, WsField } from './working-set.js';
import type { WeatherField } from './working-set.js';

export type DailyMode = 'mean' | 'max' | 'last';
export type NumericTarget = { blockId: string } | { role: Role } | { weatherField: WeatherField };

export interface DayValue {
  day: string;
  value: number;
  /** Anzahl Einzelwerte an diesem Tag. */
  n: number;
}

/** Hinweis bei kleiner Fallzahl (Spec 06). Bewusst ohne Ursachen- oder Wertungsformulierung (ANA-15). */
export const FEW_DATA_THRESHOLD = 7;

function numericValues(e: WsEntry, t: NumericTarget): number[] {
  if ('weatherField' in t) {
    const v = e.weather[t.weatherField];
    return v === undefined ? [] : [v];
  }
  const fields: WsField[] = 'blockId' in t ? e.fields.filter((f) => f.blockId === t.blockId) : e.fields.filter((f) => f.role === t.role);
  return fields.flatMap((f) => (f.value.kind === 'numeric' ? [f.value.value] : []));
}

/** Standard-Modus: `max` für Ergebnis-Blöcke (Rolle `outcome`), sonst `mean`. */
export function defaultMode(entries: readonly WsEntry[], t: NumericTarget): DailyMode {
  if ('role' in t) return t.role === 'outcome' ? 'max' : 'mean';
  if ('weatherField' in t) return 'mean';
  for (const e of entries) {
    const f = e.fields.find((x) => x.blockId === t.blockId);
    if (f) return f.role === 'outcome' ? 'max' : 'mean';
  }
  return 'mean';
}

/** Tageswerte eines numerischen Ziels, aufsteigend nach Tag; nur Tage mit mindestens einem Wert. */
export function dailySeries(entries: readonly WsEntry[], t: NumericTarget, mode: DailyMode = defaultMode(entries, t)): DayValue[] {
  const byDay = new Map<string, { at: string; v: number }[]>();
  for (const e of entries) {
    for (const v of numericValues(e, t)) {
      const list = byDay.get(e.day) ?? [];
      list.push({ at: e.occurredAt, v });
      byDay.set(e.day, list);
    }
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, list]) => {
      const vals = list.map((x) => x.v);
      const value =
        mode === 'max' ? Math.max(...vals)
        : mode === 'last' ? [...list].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)).at(-1)!.v
        : vals.reduce((s, x) => s + x, 0) / vals.length;
      return { day, value, n: vals.length };
    });
}

export interface PeriodStats {
  /** Anzahl Tage mit Wert (Grundlage aller Kennzahlen). */
  n: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  /** Tage mit Tageswert ≥ Schwelle (falls angegeben). */
  daysAtOrAbove: number | null;
  /** Tage mit mindestens einem Eintrag (egal welcher Wert) und Tage ohne Eintrag im Zeitraum — getrennt ausgewiesen. */
  daysWithEntry: number;
  daysWithoutEntry: number;
}

export interface DayRange {
  from: string;
  to: string;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function daysInRange(r: DayRange): number {
  return Math.round((Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`)) / 86_400_000) + 1;
}

const inRange = (day: string, r: DayRange) => day >= r.from && day <= r.to;

export function periodStats(entries: readonly WsEntry[], t: NumericTarget, range: DayRange, opts: { mode?: DailyMode; threshold?: number } = {}): PeriodStats {
  const scoped = entries.filter((e) => inRange(e.day, range));
  const series = dailySeries(scoped, t, opts.mode ?? defaultMode(entries, t)).map((d) => d.value);
  const withEntry = new Set(scoped.map((e) => e.day)).size;
  const n = series.length;
  return {
    n,
    mean: n ? series.reduce((s, x) => s + x, 0) / n : null,
    median: n ? median(series) : null,
    min: n ? Math.min(...series) : null,
    max: n ? Math.max(...series) : null,
    daysAtOrAbove: opts.threshold === undefined ? null : series.filter((v) => v >= opts.threshold!).length,
    daysWithEntry: withEntry,
    daysWithoutEntry: daysInRange(range) - withEntry,
  };
}

export interface PeriodComparison {
  a: PeriodStats;
  b: PeriodStats;
  /** Absolute Differenz b − a (keine Signifikanz, Spec 06). */
  diff: { mean: number | null; median: number | null; min: number | null; max: number | null; daysAtOrAbove: number | null };
  /** „Wenige Daten" genau dann, wenn eine Seite n < 7 hat (ANA-09). */
  fewData: boolean;
}

const sub = (b: number | null, a: number | null) => (a === null || b === null ? null : b - a);

export function comparePeriods(entries: readonly WsEntry[], t: NumericTarget, a: DayRange, b: DayRange, opts: { mode?: DailyMode; threshold?: number } = {}): PeriodComparison {
  const sa = periodStats(entries, t, a, opts);
  const sb = periodStats(entries, t, b, opts);
  return {
    a: sa,
    b: sb,
    diff: { mean: sub(sb.mean, sa.mean), median: sub(sb.median, sa.median), min: sub(sb.min, sa.min), max: sub(sb.max, sa.max), daysAtOrAbove: sub(sb.daysAtOrAbove, sa.daysAtOrAbove) },
    fewData: sa.n < FEW_DATA_THRESHOLD || sb.n < FEW_DATA_THRESHOLD,
  };
}

/** Standard-Vergleich: aktueller Zeitraum vs. vorheriger gleicher Länge. */
export function previousRange(r: DayRange): DayRange {
  const len = daysInRange(r);
  const shift = (day: string, n: number) => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  return { from: shift(r.from, -len), to: shift(r.from, -1) };
}

export interface OptionDays {
  optionId: string;
  label: string;
  days: number;
  /** Anteil an den Tagen mit Eintrag im Zeitraum (0..1). */
  share: number;
}

/** Je Option (Multiselect) bzw. Checkbox: Anzahl Tage mit Auswahl im Zeitraum; mehrere Einträge am Tag zählen einmal. */
export function optionDays(entries: readonly WsEntry[], t: { blockId: string } | { role: Role }, range: DayRange): OptionDays[] {
  const scoped = entries.filter((e) => inRange(e.day, range));
  const recordedDays = new Set(scoped.map((e) => e.day)).size;
  const days = new Map<string, { label: string; set: Set<string> }>();
  for (const e of scoped) {
    const fields = 'blockId' in t ? e.fields.filter((f) => f.blockId === t.blockId) : e.fields.filter((f) => f.role === t.role);
    for (const f of fields) {
      const picks: [string, string][] =
        f.value.kind === 'options' ? f.value.optionIds.map((id, i) => [id, f.optionLabels[i] ?? id])
        : f.value.kind === 'event' && f.value.occurred ? [[f.blockId, f.label]]
        : [];
      for (const [id, label] of picks) {
        const d = days.get(id) ?? { label, set: new Set<string>() };
        d.set.add(e.day);
        days.set(id, d);
      }
    }
  }
  return [...days.entries()]
    .map(([optionId, d]) => ({ optionId, label: d.label, days: d.set.size, share: recordedDays ? d.set.size / recordedDays : 0 }))
    .sort((x, y) => y.days - x.days || (x.label < y.label ? -1 : 1));
}

export interface MedicationMonth {
  month: string;
  optionId: string;
  label: string;
  days: number;
}

/** Medikamententage je Monat (Spec 06): Blöcke der Rolle `medication`, je Option getrennt; Mehrfacheinnahme am Tag = 1 Tag. */
export function medicationDaysByMonth(entries: readonly WsEntry[]): MedicationMonth[] {
  const map = new Map<string, { month: string; optionId: string; label: string; set: Set<string> }>();
  for (const e of entries) {
    for (const f of e.fields) {
      if (f.role !== 'medication') continue;
      const picks: [string, string][] =
        f.value.kind === 'options' ? f.value.optionIds.map((id, i) => [id, f.optionLabels[i] ?? id])
        : f.value.kind === 'event' && f.value.occurred ? [[f.blockId, f.label]]
        : [];
      for (const [id, label] of picks) {
        const month = e.day.slice(0, 7);
        const key = `${month}|${id}`;
        const m = map.get(key) ?? { month, optionId: id, label, set: new Set<string>() };
        m.set.add(e.day);
        map.set(key, m);
      }
    }
  }
  return [...map.values()]
    .map(({ set, ...m }) => ({ ...m, days: set.size }))
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : a.label < b.label ? -1 : 1));
}

export interface EventMark {
  day: string;
  category: 'event' | 'doctor';
  title: string;
}

/** Ereignisse (`textarea`-Ereignisse) als Markierungen für den Verlauf (Spec 06), aufsteigend nach Tag. */
export function eventMarks(entries: readonly WsEntry[]): EventMark[] {
  const out: EventMark[] = [];
  for (const e of entries) {
    for (const f of e.fields) {
      if (f.value.kind !== 'textEvents') continue;
      for (const ev of f.value.events) out.push({ day: ev.at ? ev.at.slice(0, 10) : e.day, category: ev.category, title: ev.title });
    }
  }
  return out.sort((x, y) => (x.day < y.day ? -1 : x.day > y.day ? 1 : 0));
}

export interface BodymapOverview {
  presetId: string;
  /** Anzahl Einträge mit Markierungen auf diesem Bild. */
  entries: number;
  points: { x: number; y: number; intensity?: number }[];
}

/** Body-Map-Übersicht (Spec 06): alle Markierungen eines Zeitraums je Bild, häufigstes Bild zuerst. */
export function bodymapOverview(entries: readonly WsEntry[]): BodymapOverview[] {
  const by = new Map<string, BodymapOverview>();
  for (const e of entries) {
    for (const f of e.fields) {
      if (f.value.kind !== 'points' || f.value.points.length === 0) continue;
      const o = by.get(f.value.presetId) ?? { presetId: f.value.presetId, entries: 0, points: [] };
      o.entries += 1;
      o.points.push(...f.value.points);
      by.set(f.value.presetId, o);
    }
  }
  return [...by.values()].sort((x, y) => y.entries - x.entries);
}

