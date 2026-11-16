// PDF-Layout „Dashboard" (Spec 07, EXP-15), portiert aus v2 `renderDashboardLayout`: Seite 1 mit Diagrammbild des Zeitraums,
// Kennzahlen der `outcome`-Blöcke, Arztbesuchen und den Häufigkeiten der gewählten Multiselect-Blöcke; danach die Karten.
import type { Report } from './pdf-model.js';
import { drawCards } from './pdf-cards.js';
import { MARGIN, addPageFooters, safeImage, createPdfDoc, fmtDay, fmtNum, pdfText, type PdfOptions } from './pdf-common.js';

const FOOTER = 14;
const MAX_BARS = 8;

export async function renderDashboardPdf(report: Report, opts: PdfOptions): Promise<Uint8Array> {
  const doc = createPdfDoc('portrait', opts.password);
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const contentW = W - 2 * MARGIN;
  let y = MARGIN;
  const text = (s: string, x: number, yy: number, o?: Parameters<typeof doc.text>[3]) => doc.text(pdfText(s), x, yy, o);
  const guard = (h: number) => {
    if (y + h > H - FOOTER) {
      doc.addPage();
      y = MARGIN;
    }
  };
  const heading = (s: string) => {
    guard(10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 90);
    text(s, MARGIN, y);
    doc.setTextColor(0);
    y += 5;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  text('Verlaufsbericht', MARGIN, y + 4);
  y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100);
  text([report.diaryNames.join(', '), `${fmtDay(report.from)} - ${fmtDay(report.to)}`, `${report.entryCount} Einträge an ${report.daysWithEntry} von ${report.daysInRange} Tagen`].filter(Boolean).join(' · '), MARGIN, y);
  doc.setTextColor(0);
  y += 4;
  doc.setDrawColor(55, 65, 90);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y, W - MARGIN, y);
  doc.setLineWidth(0.2);
  y += 6;

  // Diagramm des Zeitraums
  const img = report.chart && opts.renderChart ? await safeImage(() => opts.renderChart!(report.chart!)) : null;
  if (img) {
    const h = Math.min(contentW * (img.height / img.width), 90);
    doc.addImage(img.dataUrl, img.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG', MARGIN, y, h * (img.width / img.height), h);
    y += h + 6;
  }

  // Kennzahlen der outcome-Blöcke
  if (report.stats.length) {
    heading('Kennzahlen');
    doc.setFontSize(9);
    for (const s of report.stats) {
      guard(6);
      doc.setFont('helvetica', 'bold');
      text(s.label, MARGIN, y);
      doc.setFont('helvetica', 'normal');
      text(`Mittelwert ${fmtNum(s.mean)} · Median ${fmtNum(s.median)} · Maximum ${fmtNum(s.max)} (n = ${s.n} Tage)`, MARGIN + 50, y);
      y += 5.5;
    }
    y += 3;
  }

  if (report.doctorVisits.length) {
    heading('Arztbesuche');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const d of report.doctorVisits) {
      guard(5);
      text(`- ${fmtDay(d.day)}  ${d.title}`, MARGIN + 2, y);
      y += 5;
    }
    y += 3;
  }

  // Häufigkeiten der ausgewählten Multiselect-Blöcke (Tage mit Auswahl)
  const wanted = new Set(opts.multiselectBlockIds ?? []);
  for (const ms of report.multiselects.filter((m) => wanted.has(m.blockId))) {
    const top = ms.options.filter((o) => o.days > 0).slice(0, MAX_BARS);
    heading(`${ms.label} (Tage mit Auswahl)`);
    if (!top.length) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      text('Keine Auswahl im Zeitraum', MARGIN + 2, y);
      y += 6;
      continue;
    }
    const barMax = contentW - 70;
    const maxDays = top[0]!.days;
    for (const o of top) {
      guard(6);
      doc.setFillColor(55, 65, 140);
      doc.rect(MARGIN + 2, y - 3.5, Math.max(1, (o.days / maxDays) * barMax), 4, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      text(`${o.label}: ${o.days} Tage (${Math.round(o.share * 100)} %)`, MARGIN + 2 + Math.max(1, (o.days / maxDays) * barMax) + 3, y);
      y += 6;
    }
    y += 3;
  }

  // Einträge als Karten
  doc.addPage();
  await drawCards(doc, report, opts, MARGIN);
  addPageFooters(doc, report);
  return new Uint8Array(doc.output('arraybuffer'));
}
