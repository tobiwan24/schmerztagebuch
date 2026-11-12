// Anzeige der Zeitangabe eines Eintrags (Spec 05, BLK-19) und Tagesgruppierung im Verlauf (Spec 10).
import type { Entry } from '@stb/core';
import { de } from '@/i18n/de';

const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

/** `YYYY-MM-DD` als lokales Datum (nicht UTC). */
const parseDay = (d: string) => new Date(`${d}T00:00`);
const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function formatEntryTime(entry: Pick<Entry, 'occurredAt' | 'period'>): string {
  const p = entry.period;
  if (!p) {
    const d = new Date(entry.occurredAt);
    return `${dateFmt.format(d)}, ${timeFmt.format(d)}`;
  }
  if (p.start.length === 10) {
    if (p.start === p.end) return `${dateFmt.format(parseDay(p.start))} (${de.entry.allDay})`;
    return `${dateFmt.format(parseDay(p.start))} – ${dateFmt.format(parseDay(p.end))}`;
  }
  const s = new Date(p.start);
  const e = new Date(p.end);
  const end = localDay(s) === localDay(e) ? timeFmt.format(e) : `${dateFmt.format(e)}, ${timeFmt.format(e)}`;
  return `${dateFmt.format(s)}, ${timeFmt.format(s)} – ${end}`;
}

/** Lokaler Tag, unter dem ein Eintrag im Verlauf erscheint (Zeitraum: Tag des Beginns). */
export function entryDay(entry: Pick<Entry, 'occurredAt' | 'period'>): string {
  return entry.period?.start.length === 10 ? entry.period.start : localDay(new Date(entry.occurredAt));
}

export function formatDay(day: string, nowMs: number): string {
  const today = localDay(new Date(nowMs));
  const y = new Date(nowMs);
  y.setDate(y.getDate() - 1);
  if (day === today) return de.entry.today;
  if (day === localDay(y)) return de.entry.yesterday;
  return dayFmt.format(parseDay(day));
}

/** Einträge (neueste zuerst) nach Tagen gruppiert, Reihenfolge bleibt erhalten. */
export function groupByDay<T extends Pick<Entry, 'occurredAt' | 'period'>>(entries: readonly T[]): { day: string; entries: T[] }[] {
  const groups: { day: string; entries: T[] }[] = [];
  for (const e of entries) {
    const day = entryDay(e);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.entries.push(e);
    else groups.push({ day, entries: [e] });
  }
  return groups;
}
