// CSV-Export (Spec 07): long (eine Zeile je Eintrag × Block-Wert, Multiselect je Option) und wide (eine Zeile je Eintrag,
// eine Spalte je Block der aktuellen Vorlagenversion). UTF-8 mit BOM, CRLF, RFC-4180-Maskierung, Schutz vor
// Formel-Injection (Textzellen mit `=`, `+`, `-`, `@` am Anfang bekommen ein `'`). Profile: Standard und Excel (DE) (A-029).
import { applyFilter, buildWorkingSet, type FilterSpec, type WsEntry, type WsField } from '@stb/analysis';
import type { ExportSource } from './json-v1.js';

export type CsvProfile = 'standard' | 'excel-de';
type Cell = { kind: 'text'; value: string } | { kind: 'number'; value: number } | { kind: 'empty' };

const PROFILE = {
  standard: { sep: ',', decimal: '.' },
  'excel-de': { sep: ';', decimal: ',' },
} as const;

const text = (value: string | undefined): Cell => (value === undefined || value === '' ? { kind: 'empty' } : { kind: 'text', value });
const num = (value: number | undefined): Cell => (value === undefined ? { kind: 'empty' } : { kind: 'number', value });

/** Maskiert eine Zelle: Formel-Injection zuerst (nur Text), dann RFC 4180 (Trenner, Anführungszeichen, Zeilenumbrüche). */
export function formatCell(cell: Cell, profile: CsvProfile): string {
  const p = PROFILE[profile];
  if (cell.kind === 'empty') return '';
  let s = cell.kind === 'number' ? String(cell.value).replace('.', p.decimal) : cell.value;
  if (cell.kind === 'text' && /^[=+\-@]/.test(s)) s = `'${s}`;
  if (s.includes(p.sep) || s.includes('"') || s.includes('\n') || s.includes('\r')) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
/** Zeitpunkt je Profil: Standard ISO 8601 (UTC, wie gespeichert), Excel (DE) `TT.MM.JJJJ HH:MM` in der Tagebuch-Zeitzone. */
export function formatTime(iso: string, timeZone: string, profile: CsvProfile): string {
  if (profile === 'standard') return iso;
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('de-DE', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    formatters.set(timeZone, f);
  }
  return f.format(new Date(iso)).replace(',', '');
}

function toCsv(header: string[], rows: Cell[][], profile: CsvProfile): string {
  const p = PROFILE[profile];
  const lines = [header.map((h) => formatCell(text(h), profile)).join(p.sep), ...rows.map((r) => r.map((c) => formatCell(c, profile)).join(p.sep))];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

interface Scope {
  entries: WsEntry[];
  raw: Map<string, ExportSource['entries'][number]>;
  diaryName: Map<string, string>;
  timezone: Map<string, string>;
  versionOf: Map<string, number>;
}

function scope(src: ExportSource, opts: { filter?: FilterSpec; now: number }): Scope {
  const ws = buildWorkingSet({ entries: src.entries, templates: src.templates, versions: src.versions, diaries: src.diaries });
  const entries = (opts.filter ? applyFilter(ws, opts.filter, { now: opts.now }) : ws.entries).slice().reverse(); // älteste zuerst
  return {
    entries,
    raw: new Map(src.entries.map((e) => [e.id, e])),
    diaryName: new Map(src.diaries.map((d) => [d.id, d.name])),
    timezone: new Map(src.diaries.map((d) => [d.id, d.settings.timezone])),
    versionOf: new Map(src.entries.map((e) => [e.id, e.templateVersion])),
  };
}

const unitOf = (src: ExportSource, blockId: string): string | undefined => {
  for (const v of src.versions) for (const b of v.blocks) if (b.id === blockId && b.type === 'slider') return b.config.unit;
  return undefined;
};

/** Anzeigetext inkl. Kommentaren der Body-Map-Markierungen (Nutzerdaten, A-029). */
function displayWithComments(f: WsField, raw: unknown): string {
  if (f.value.kind !== 'points') return f.display;
  const points = (raw as { points?: { comment?: string }[] } | undefined)?.points ?? [];
  const comments = points.map((p, i) => (p.comment ? `#${i + 1}: ${p.comment}` : '')).filter(Boolean);
  return comments.length ? `${f.display} (${comments.join('; ')})` : f.display;
}

/** Zahl und Text eines Feldwerts (long), Multiselect ausgenommen (eigene Zeilen je Option). */
function valueCells(f: WsField, raw: unknown): [Cell, Cell] {
  const v = f.value;
  switch (v.kind) {
    case 'numeric':
      return [num(v.value), { kind: 'empty' }];
    case 'event':
      return [num(v.occurred ? 1 : 0), text(f.display)];
    case 'points':
      return [num(v.points.length), text(displayWithComments(f, raw))];
    case 'time':
      return [num(v.durationMinutes), text(f.display)];
    default:
      return [{ kind: 'empty' }, text(f.display)];
  }
}

export const CSV_LONG_COLUMNS = [
  'entry_id', 'occurred_at', 'diary', 'template', 'template_version', 'block_id', 'block_label', 'role', 'type',
  'value_number', 'value_text', 'option_id', 'option_label', 'unit', 'source', 'period_end',
] as const;

/** Ende eines Zeitraum-Eintrags (Spec 05 `period`; Spalte zusätzlich zu Spec 07, A-029). Ganztägig nur Datum. */
function periodEnd(e: ExportSource['entries'][number] | undefined, timeZone: string, profile: CsvProfile): Cell {
  const p = e?.period;
  if (!p) return { kind: 'empty' };
  if (p.end.length === 10) return text(profile === 'standard' ? p.end : `${p.end.slice(8, 10)}.${p.end.slice(5, 7)}.${p.end.slice(0, 4)}`);
  return text(formatTime(p.end, timeZone, profile));
}

export function exportCsvLong(src: ExportSource, opts: { profile: CsvProfile; filter?: FilterSpec; now: number }): string {
  const s = scope(src, opts);
  const rows: Cell[][] = [];
  for (const e of s.entries) {
    const base = (f: WsField): Cell[] => [
      text(e.id), text(formatTime(e.occurredAt, s.timezone.get(e.diaryId) ?? 'UTC', opts.profile)), text(s.diaryName.get(e.diaryId)), text(e.templateName),
      num(s.versionOf.get(e.id)), text(f.blockId), text(f.label), text(f.role), text(f.type),
    ];
    const end = periodEnd(s.raw.get(e.id), s.timezone.get(e.diaryId) ?? 'UTC', opts.profile);
    for (const f of e.fields) {
      if (f.value.kind === 'options') {
        f.value.optionIds.forEach((id, i) => rows.push([...base(f), { kind: 'empty' }, { kind: 'empty' }, text(id), text(f.optionLabels[i]), { kind: 'empty' }, text(e.source), end]));
        continue;
      }
      const [n, t] = valueCells(f, s.raw.get(e.id)?.values[f.blockId]);
      rows.push([...base(f), n, t, { kind: 'empty' }, { kind: 'empty' }, text(unitOf(src, f.blockId)), text(e.source), end]);
    }
  }
  return toCsv([...CSV_LONG_COLUMNS], rows, opts.profile);
}

/** Wide: Spalten = Blöcke der aktuellen Versionen (in Vorlagen-/Block-Reihenfolge); gleiche Labels mit Vorlagenname. */
export function exportCsvWide(src: ExportSource, opts: { profile: CsvProfile; filter?: FilterSpec; now: number }): string {
  const s = scope(src, opts);
  const order = (a: { order: string; id: string }, b: { order: string; id: string }) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : 1);
  const columns: { blockId: string; label: string; template: string }[] = [];
  for (const t of [...src.templates].sort(order)) {
    const cur = src.versions.find((v) => v.templateId === t.id && v.version === t.currentVersion);
    for (const b of [...(cur?.blocks ?? [])].sort(order)) columns.push({ blockId: b.id, label: b.label, template: t.name });
  }
  const dup = (label: string) => columns.filter((c) => c.label === label).length > 1;
  const header = ['entry_id', 'occurred_at', 'period_end', 'diary', 'template', 'template_version', 'source', ...columns.map((c) => (dup(c.label) ? `${c.template}: ${c.label}` : c.label))];
  const rows: Cell[][] = s.entries.map((e) => [
    text(e.id), text(formatTime(e.occurredAt, s.timezone.get(e.diaryId) ?? 'UTC', opts.profile)),
    periodEnd(s.raw.get(e.id), s.timezone.get(e.diaryId) ?? 'UTC', opts.profile), text(s.diaryName.get(e.diaryId)), text(e.templateName),
    num(s.versionOf.get(e.id)), text(e.source),
    ...columns.map((c): Cell => {
      const f = e.fields.find((x) => x.blockId === c.blockId);
      if (!f) return { kind: 'empty' };
      if (f.value.kind === 'numeric') return num(f.value.value);
      if (f.value.kind === 'options') return text(f.optionLabels.join('; '));
      return text(displayWithComments(f, s.raw.get(e.id)?.values[f.blockId]));
    }),
  ]);
  return toCsv(header, rows, opts.profile);
}
