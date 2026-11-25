// Anzeige der Zeitangabe eines Eintrags (Spec 05, BLK-19).
import type { Entry } from '@stb/core';
import { de } from '@/i18n/de';

const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

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
