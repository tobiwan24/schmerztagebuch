// Berichtsmodell für den PDF-Export (Spec 07 „PDF"): rein, ohne DOM — Deckblatt-Zusammenfassung für den Arzttermin
// (Zeitraum, Tage mit Eintrag, Kennzahlen der `outcome`-Blöcke, Medikamententage, Arzttermine), Tabelle je Vorlage
// (archivierte Felder alter Versionen gekennzeichnet) und die Body-Maps des Zeitraums.
import {
  applyFilter, buildWorkingSet, eventMarks, medicationDaysByMonth, periodStats, type FilterSpec, type WsEntry,
} from '@stb/analysis';
import type { BodymapValue } from '@stb/core';
import type { ExportSource } from './json-v1.js';

export interface ReportStat {
  label: string;
  template: string;
  n: number;
  mean: number | null;
  median: number | null;
  max: number | null;
}

export interface ReportTable {
  template: string;
  columns: { label: string; archived: boolean }[];
  rows: { when: string; cells: string[] }[];
}

export interface ReportBodymap {
  when: string;
  template: string;
  label: string;
  value: BodymapValue;
}

export interface Report {
  title: string;
  diaryNames: string[];
  from: string;
  to: string;
  daysInRange: number;
  daysWithEntry: number;
  entryCount: number;
  stats: ReportStat[];
  medicationDays: { label: string; days: number }[];
  doctorVisits: { day: string; title: string }[];
  tables: ReportTable[];
  bodymaps: ReportBodymap[];
  createdAt: string;
}

const dayCount = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
const fmtDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

function when(e: WsEntry, raw: ExportSource['entries'][number] | undefined, tz: string): string {
  const p = raw?.period;
  if (p && p.start.length === 10) return p.start === p.end ? fmtDay(p.start) : `${fmtDay(p.start)} – ${fmtDay(p.end)}`;
  const f = (iso: string) => new Intl.DateTimeFormat('de-DE', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)).replace(',', '');
  if (p) return `${f(p.start)} – ${f(p.end)}`;
  return f(e.occurredAt);
}

/**
 * Bericht für einen Zeitraum (`from`/`to` als Kalendertage) bzw. einen Filter. Ohne Zeitraum: erster bis letzter Eintrag.
 */
export function buildReport(src: ExportSource, opts: { now: number; filter?: FilterSpec; title?: string }): Report {
  const ws = buildWorkingSet({ entries: src.entries, templates: src.templates, versions: src.versions, diaries: src.diaries });
  const entries = (opts.filter ? applyFilter(ws, opts.filter, { now: opts.now }) : ws.entries).slice().sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1));
  const raw = new Map(src.entries.map((e) => [e.id, e]));
  const tz = new Map(src.diaries.map((d) => [d.id, d.settings.timezone]));
  const days = entries.map((e) => e.day).sort();
  const range = opts.filter && 'from' in opts.filter.range ? opts.filter.range : { from: days[0] ?? new Date(opts.now).toISOString().slice(0, 10), to: days.at(-1) ?? new Date(opts.now).toISOString().slice(0, 10) };

  // Kennzahlen je outcome-Block (Tageswerte, Spec 06)
  const outcomeBlocks = new Map<string, { label: string; template: string }>();
  for (const e of entries) for (const f of e.fields) if (f.role === 'outcome' && f.value.kind === 'numeric' && !outcomeBlocks.has(f.blockId)) outcomeBlocks.set(f.blockId, { label: f.label, template: e.templateName });
  const stats = [...outcomeBlocks].map(([blockId, b]) => {
    const s = periodStats(entries, { blockId }, range);
    return { label: b.label, template: b.template, n: s.n, mean: s.mean, median: s.median, max: s.max };
  });
  const meds = new Map<string, number>();
  for (const m of medicationDaysByMonth(entries)) meds.set(m.label, (meds.get(m.label) ?? 0) + m.days);

  // Tabellen je Vorlage: Spalten der aktuellen Version, danach archivierte Felder aus den Einträgen
  const order = (a: { order: string; id: string }, b: { order: string; id: string }) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : 1);
  const tables: ReportTable[] = [];
  for (const t of [...src.templates].sort(order)) {
    const list = entries.filter((e) => e.templateId === t.id);
    if (!list.length) continue;
    const cur = src.versions.find((v) => v.templateId === t.id && v.version === t.currentVersion);
    const cols: { blockId: string; label: string; archived: boolean }[] = [...(cur?.blocks ?? [])].sort(order).map((b) => ({ blockId: b.id, label: b.label, archived: false }));
    for (const e of list) for (const f of e.fields) if (f.archived && !cols.some((c) => c.blockId === f.blockId)) cols.push({ blockId: f.blockId, label: f.label, archived: true });
    tables.push({
      template: t.name,
      columns: cols.map(({ label, archived }) => ({ label, archived })),
      rows: list.map((e) => ({
        when: when(e, raw.get(e.id), tz.get(e.diaryId) ?? 'UTC'),
        cells: cols.map((c) => {
          const f = e.fields.find((x) => x.blockId === c.blockId);
          if (!f) return '';
          if (f.value.kind === 'options') return f.optionLabels.join(', ');
          return f.display;
        }),
      })),
    });
  }

  const bodymaps: ReportBodymap[] = [];
  for (const e of entries) {
    for (const f of e.fields) {
      if (f.value.kind !== 'points') continue;
      const v = raw.get(e.id)?.values[f.blockId] as BodymapValue | undefined;
      if (v && v.points.length) bodymaps.push({ when: when(e, raw.get(e.id), tz.get(e.diaryId) ?? 'UTC'), template: e.templateName, label: f.label, value: v });
    }
  }

  return {
    title: opts.title ?? 'Schmerztagebuch – Bericht',
    diaryNames: src.diaries.filter((d) => entries.some((e) => e.diaryId === d.id)).map((d) => d.name),
    from: range.from,
    to: range.to,
    daysInRange: dayCount(range.from, range.to),
    daysWithEntry: new Set(days).size,
    entryCount: entries.length,
    stats,
    medicationDays: [...meds].map(([label, d]) => ({ label, days: d })).sort((a, b) => b.days - a.days),
    doctorVisits: eventMarks(entries).filter((m) => m.category === 'doctor').map((m) => ({ day: m.day, title: m.title })),
    tables,
    bodymaps,
    createdAt: new Date(opts.now).toISOString(),
  };
}
