// Training (Spec 06 „Training“, A-084): Tage mit erledigten Übungen je Woche und Verlauf der Stufe je Übung.
// Rein beschreibend — keine Bewertung und keine Vorschläge für Stufenwechsel (Nicht-Ziel Therapieempfehlung).
import type { WsEntry } from './working-set.js';

export interface TrainingWeek {
  /** Montag der Woche, `YYYY-MM-DD`. */
  weekStart: string;
  /** Tage dieser Woche mit mindestens einer erledigten Übung. */
  days: number;
}

export interface LevelPoint {
  day: string;
  levelIndex: number;
  levelLabel: string;
}

export interface ExerciseLevels {
  blockId: string;
  label: string;
  /** Je Tag die Stufe der jüngsten erledigten Durchführung, aufsteigend nach Tag. */
  points: LevelPoint[];
}

export interface TrainingStats {
  /** Lückenlos vom ersten bis zum letzten Trainingstag (Wochen ohne Training mit `days: 0`). */
  weeks: TrainingWeek[];
  /** Tage mit erledigten Übungen insgesamt. */
  totalDays: number;
  /** Nur Übungen mit mindestens einer Stufenangabe. */
  levels: ExerciseLevels[];
}

const DAY_MS = 86_400_000;
const utc = (day: string): number => Date.parse(`${day}T00:00:00.000Z`);
const fmt = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Montag der Kalenderwoche eines Tages (`YYYY-MM-DD`). */
export function weekStartOf(day: string): string {
  const ms = utc(day);
  const dow = (new Date(ms).getUTCDay() + 6) % 7; // Mo = 0
  return fmt(ms - dow * DAY_MS);
}

export function trainingStats(entries: readonly WsEntry[]): TrainingStats {
  const doneDays = new Set<string>();
  const levelByBlock = new Map<string, { label: string; byDay: Map<string, { at: string; point: LevelPoint }> }>();

  for (const e of entries) {
    for (const f of e.fields) {
      if (f.value.kind !== 'exercise' || !f.value.done) continue;
      doneDays.add(e.day);
      const v = f.value;
      if (v.levelIndex === undefined || v.levelLabel === undefined) continue;
      const g = levelByBlock.get(f.blockId) ?? { label: f.label, byDay: new Map() };
      levelByBlock.set(f.blockId, g);
      const prev = g.byDay.get(e.day);
      if (!prev || e.occurredAt > prev.at) g.byDay.set(e.day, { at: e.occurredAt, point: { day: e.day, levelIndex: v.levelIndex, levelLabel: v.levelLabel } });
    }
  }

  const days = [...doneDays].sort();
  const perWeek = new Map<string, number>();
  for (const d of days) perWeek.set(weekStartOf(d), (perWeek.get(weekStartOf(d)) ?? 0) + 1);
  const weeks: TrainingWeek[] = [];
  if (days.length > 0) {
    for (let ms = utc(weekStartOf(days[0]!)); ms <= utc(weekStartOf(days.at(-1)!)); ms += 7 * DAY_MS) {
      const weekStart = fmt(ms);
      weeks.push({ weekStart, days: perWeek.get(weekStart) ?? 0 });
    }
  }

  const levels: ExerciseLevels[] = [...levelByBlock.entries()]
    .map(([blockId, g]) => ({ blockId, label: g.label, points: [...g.byDay.values()].map((x) => x.point).sort((a, b) => (a.day < b.day ? -1 : 1)) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'de') || (a.blockId < b.blockId ? -1 : 1));

  return { weeks, totalDays: days.length, levels };
}
