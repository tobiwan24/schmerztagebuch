// PDF-Rendering (Spec 07 „PDF"), portiert aus v2 `src/utils/pdfExport.ts` (Tabellenlayout A4 quer, Body-Map-Bilder mit
// Größe a4 | a5 | a6 | none, Passwortschutz über jsPDF `encryption`). Neu: Deckblatt-Zusammenfassung für den Arzttermin.
// Die Body-Map-Bilder (Bild + Markierungen) rendert der Aufrufer (Browser: Canvas) — hier keine DOM-Abhängigkeit.
import { jsPDF } from 'jspdf';
import type { BodymapValue } from '@stb/core';
import type { Report } from './pdf-model.js';

export type PdfImageSize = 'a4' | 'a5' | 'a6' | 'none';
/** Bildgrößen wie v2 (`IMAGE_SIZE_MM`). */
export const PDF_IMAGE_SIZE_MM: Record<Exclude<PdfImageSize, 'none'>, { w: number; h: number }> = {
  a6: { w: 105, h: 148 },
  a5: { w: 148, h: 210 },
  a4: { w: 210, h: 297 },
};

export interface RenderedImage {
  /** PNG- oder JPEG-Data-URL. */
  dataUrl: string;
  width: number;
  height: number;
}

export interface PdfOptions {
  imageSize: PdfImageSize;
  password?: string;
  renderBodymap: (value: BodymapValue) => Promise<RenderedImage | null>;
}

const MARGIN = 15;

/** Standardschriften kennen nur WinAnsi: typografische Zeichen ersetzen, Unbekanntes als „?". */
export function pdfText(s: string): string {
  const map: Record<string, string> = { '–': '-', '—': '-', '≥': '>=', '≤': '<=', '…': '...', '„': '"', '“': '"', '”': '"', '‚': "'", '‘': "'", '’': "'", '→': '->', '◆': '*', '•': '-' };
  return [...s].map((c) => map[c] ?? (c.charCodeAt(0) <= 0xff ? c : '?')).join('');
}

const fmtNum = (n: number | null) => (n === null ? '-' : n.toLocaleString('de-DE', { maximumFractionDigits: 1 }));
const fmtDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

export async function renderReportPdf(report: Report, opts: PdfOptions): Promise<Uint8Array> {
  const doc = new jsPDF({
    orientation: 'landscape', unit: 'mm', format: 'a4', compress: true,
    ...(opts.password ? { encryption: { userPassword: opts.password, ownerPassword: `${opts.password}#owner`, userPermissions: ['print', 'copy'] } } : {}),
  });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const contentW = W - 2 * MARGIN;
  let y = MARGIN;
  const text = (s: string, x: number, yy: number, o?: Parameters<jsPDF['text']>[3]) => doc.text(pdfText(s), x, yy, o);

  const header = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    text(report.title, MARGIN, MARGIN);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    text(`${fmtDay(report.from)} - ${fmtDay(report.to)}`, W - MARGIN, MARGIN, { align: 'right' });
    doc.setDrawColor(200);
    doc.line(MARGIN, MARGIN + 2, W - MARGIN, MARGIN + 2);
    y = MARGIN + 9;
  };
  const newPage = () => {
    doc.addPage();
    header();
  };
  const need = (h: number) => {
    if (y + h > H - MARGIN) newPage();
  };

  // ── Deckblatt ──────────────────────────────────────────────────────────
  header();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  text('Zusammenfassung', MARGIN, y + 4);
  y += 12;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const line = (label: string, value: string) => {
    need(6);
    doc.setFont('helvetica', 'bold');
    text(label, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    text(value, MARGIN + 60, y);
    y += 6;
  };
  if (report.diaryNames.length) line('Tagebuch', report.diaryNames.join(', '));
  line('Zeitraum', `${fmtDay(report.from)} - ${fmtDay(report.to)} (${report.daysInRange} Tage)`);
  line('Tage mit Eintrag', `${report.daysWithEntry} von ${report.daysInRange}`);
  line('Einträge', String(report.entryCount));
  y += 3;
  for (const s of report.stats) line(s.label, `Mittelwert ${fmtNum(s.mean)} · Median ${fmtNum(s.median)} · Maximum ${fmtNum(s.max)} (n = ${s.n} Tage)`);
  if (report.medicationDays.length) {
    y += 3;
    line('Medikamententage', report.medicationDays.map((m) => `${m.label}: ${m.days}`).join(' · '));
  }
  if (report.doctorVisits.length) {
    y += 3;
    line('Arzttermine', report.doctorVisits.map((d) => `${fmtDay(d.day)} ${d.title}`).join(' · '));
  }
  y += 4;
  doc.setFontSize(8);
  doc.setTextColor(110);
  text('Rein beschreibend: Kennzahlen aus Tageswerten, keine Aussagen über Ursachen.', MARGIN, y);
  doc.setTextColor(0);

  // ── Tabellen je Vorlage ────────────────────────────────────────────────
  for (const t of report.tables) {
    newPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    text(t.template, MARGIN, y);
    y += 6;
    const whenW = 38;
    const colW = (contentW - whenW) / Math.max(1, t.columns.length);
    const fontSize = t.columns.length > 8 ? 7 : 8;
    const headerRow = () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(fontSize);
      doc.setFillColor(240, 240, 240);
      const heads = t.columns.map((c) => doc.splitTextToSize(pdfText(c.archived ? `${c.label} (archiviert)` : c.label), colW - 2) as string[]);
      const h = Math.max(1, ...heads.map((x) => x.length)) * fontSize * 0.42 + 3;
      doc.rect(MARGIN, y - 4, contentW, h, 'F');
      doc.text('Zeitpunkt', MARGIN + 1, y);
      heads.forEach((lines, i) => doc.text(lines, MARGIN + whenW + i * colW + 1, y));
      y += h;
      doc.setFont('helvetica', 'normal');
    };
    headerRow();
    for (const r of t.rows) {
      const cells = r.cells.map((c) => doc.splitTextToSize(pdfText(c), colW - 2) as string[]);
      const whenLines = doc.splitTextToSize(pdfText(r.when), whenW - 2) as string[];
      const h = Math.max(1, whenLines.length, ...cells.map((c) => c.length)) * fontSize * 0.42 + 2.5;
      if (y + h > H - MARGIN) {
        newPage();
        headerRow();
      }
      doc.setFontSize(fontSize);
      doc.text(whenLines, MARGIN + 1, y);
      cells.forEach((lines, i) => doc.text(lines, MARGIN + whenW + i * colW + 1, y));
      doc.setDrawColor(225);
      doc.line(MARGIN, y + h - 3.5, W - MARGIN, y + h - 3.5);
      y += h;
    }
  }

  // ── Body-Maps ──────────────────────────────────────────────────────────
  if (opts.imageSize !== 'none') {
    const box = PDF_IMAGE_SIZE_MM[opts.imageSize];
    for (const b of report.bodymaps) {
      const img = await opts.renderBodymap(b.value);
      if (!img) continue;
      newPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      text(`${b.when} · ${b.template} · ${b.label}`, MARGIN, y);
      y += 4;
      // Zielgröße laut Auswahl, begrenzt auf die Seite, Seitenverhältnis des Bildes bleibt
      const maxW = Math.min(box.w, contentW);
      const maxH = Math.min(box.h, H - y - MARGIN);
      const scale = Math.min(maxW / img.width, maxH / img.height);
      const fmt = img.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(img.dataUrl, fmt, MARGIN, y, img.width * scale, img.height * scale);
    }
  }

  // Fußzeile mit Seitenzahlen
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120);
    text(`Seite ${i} von ${pages} · erstellt ${fmtDay(report.createdAt.slice(0, 10))}`, W - MARGIN, H - 7, { align: 'right' });
    doc.setTextColor(0);
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
