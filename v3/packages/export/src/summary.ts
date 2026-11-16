// Eingabe für die „Zusammenfassung für den Arzt“ (Spec 08, VOI-15, A-086): standardmäßig nur Kennzahlen (Datenminimierung).
// Notizen (Felder mit Rolle `note`) gehen nur auf ausdrücklichen Wunsch mit. Rein, ohne DOM; der Aufrufer zeigt den
// Inhalt vor dem Senden an (Freigabe je Vorgang).
import { applyFilter, buildWorkingSet, type FilterSpec } from '@stb/analysis';
import type { ExportSource } from './json-v1.js';
import { buildReport, type Report } from './pdf-model.js';

export interface SummaryInput {
  period: string;
  facts: { label: string; value: string }[];
  /** Nur gesetzt, wenn Notizen freigegeben wurden (und vorhanden sind). */
  notes?: string[];
}

/** Grenzen laut `llmSummaryRequestSchema` (sync-protocol). */
const MAX_FACTS = 60;
const MAX_NOTES = 30;
const MAX_NOTE_CHARS = 2000;

const num = (n: number | null) => (n === null ? '-' : n.toLocaleString('de-DE', { maximumFractionDigits: 1 }));
const day = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const cut = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);

/** Kennzahlen des Berichts als Liste aus Bezeichnung und Wert; keine Freitexte (Arzttermine nur als Anzahl). */
export function summaryFacts(report: Report): SummaryInput['facts'] {
  const facts: SummaryInput['facts'] = [
    { label: 'Tage mit Eintrag', value: `${report.daysWithEntry} von ${report.daysInRange}` },
    { label: 'Einträge', value: String(report.entryCount) },
  ];
  for (const s of report.stats) {
    facts.push({ label: cut(`${s.label} (${s.template})`, 200), value: `Mittelwert ${num(s.mean)}, Median ${num(s.median)}, Maximum ${num(s.max)} an ${s.n} Tagen` });
  }
  for (const m of report.medicationDays) facts.push({ label: cut(`Medikamententage ${m.label}`, 200), value: String(m.days) });
  if (report.doctorVisits.length) facts.push({ label: 'Arzttermine im Zeitraum', value: String(report.doctorVisits.length) });
  return facts.slice(0, MAX_FACTS);
}

/** Notizen (Rolle `note`) des Zeitraums, neueste zuerst, begrenzt in Anzahl und Länge. */
export function summaryNotes(src: ExportSource, opts: { now: number; filter?: FilterSpec }): string[] {
  const ws = buildWorkingSet({ entries: src.entries, templates: src.templates, versions: src.versions, diaries: src.diaries });
  const entries = (opts.filter ? applyFilter(ws, opts.filter, { now: opts.now }) : ws.entries).slice().sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  const out: string[] = [];
  for (const e of entries) {
    for (const f of e.fields) {
      if (f.role === 'note' && f.display.trim()) out.push(cut(`${day(e.day)}: ${f.display.trim()}`, MAX_NOTE_CHARS));
    }
  }
  return out.slice(0, MAX_NOTES);
}

export function buildSummaryInput(src: ExportSource, opts: { now: number; filter?: FilterSpec; includeNotes?: boolean }): SummaryInput {
  const report = buildReport(src, { now: opts.now, ...(opts.filter ? { filter: opts.filter } : {}) });
  const notes = opts.includeNotes ? summaryNotes(src, opts) : [];
  return {
    period: `${day(report.from)} bis ${day(report.to)}`,
    facts: summaryFacts(report),
    ...(notes.length ? { notes } : {}),
  };
}

/** Der Inhalt als Text für den Freigabedialog (genau das, was gesendet wird). */
export function summaryPreview(input: SummaryInput): string {
  return [
    `Zeitraum: ${input.period}`,
    ...input.facts.map((f) => `${f.label}: ${f.value}`),
    ...(input.notes?.length ? ['', 'Notizen:', ...input.notes] : []),
  ].join('\n');
}
