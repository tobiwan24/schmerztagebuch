// PDF-Layout „Karten" (Spec 07, EXP-14), portiert aus v2 `renderCardsLayout`: A4 hoch, je Eintrag eine Karte mit Zeit,
// Vorlage, allen Werten (Label links, Wert rechts) und dem Body-Map-Bild in der gewählten Größe.
import type { Report } from './pdf-model.js';
import type { jsPDF } from 'jspdf';
import { MARGIN, addPageFooters, safeImage, createPdfDoc, fitImage, fmtDay, pdfText, type PdfOptions } from './pdf-common.js';

const LABEL_W = 50;
const FOOTER = 14;
const LINE = 4;

export async function renderCardsPdf(report: Report, opts: PdfOptions): Promise<Uint8Array> {
  const doc = createPdfDoc('portrait', opts.password);
  const W = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(pdfText(report.title), MARGIN, MARGIN + 3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(pdfText(`${fmtDay(report.from)} - ${fmtDay(report.to)} · ${report.entryCount} Einträge`), W - MARGIN, MARGIN + 3, { align: 'right' });
  await drawCards(doc, report, opts, MARGIN + 10);
  addPageFooters(doc, report);
  return new Uint8Array(doc.output('arraybuffer'));
}

/** Zeichnet die Karten ab Höhe `startY` auf der aktuellen Seite (neue Seiten nach Bedarf). */
export async function drawCards(doc: jsPDF, report: Report, opts: PdfOptions, startY: number): Promise<void> {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const contentW = W - 2 * MARGIN;
  let y = startY;
  const text = (s: string, x: number, yy: number, o?: Parameters<typeof doc.text>[3]) => doc.text(pdfText(s), x, yy, o);
  const guard = (h: number) => {
    if (y + h > H - FOOTER) {
      doc.addPage();
      y = MARGIN;
    }
  };

  for (const card of report.cards) {
    guard(24);
    doc.setDrawColor(55, 65, 90);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, W - MARGIN, y);
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 90);
    text(card.when, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110);
    text(card.template, W - MARGIN, y, { align: 'right' });
    doc.setTextColor(0);
    y += 6;
    doc.setLineWidth(0.2);

    for (const f of card.fields) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      const lines = f.text.trim() ? (doc.splitTextToSize(pdfText(f.text), contentW - LABEL_W - 2) as string[]) : [];
      guard(Math.max(1, lines.length) * LINE + 3);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(80, 80, 100);
      text(`${f.label}${f.archived ? ' (archiviert)' : ''}:`, MARGIN, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0);
      if (lines.length) doc.text(lines, MARGIN + LABEL_W, y);
      y += Math.max(1, lines.length) * LINE + 1.5;
      if (f.bodymap && opts.imageSize !== 'none') {
        const img = await safeImage(() => opts.renderBodymap(f.bodymap!));
        if (img) {
          // Zielgröße laut Auswahl, begrenzt auf die Seite; passt sie nicht mehr unter die Zeile, beginnt eine neue Seite
          const fit = fitImage(img, opts.imageSize, contentW, H - FOOTER - 2 * MARGIN);
          guard(fit.h + 2);
          doc.addImage(img.dataUrl, img.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG', MARGIN, y, fit.w, fit.h);
          y += fit.h + 3;
        }
      }
    }
    if (card.tags.length) {
      guard(LINE + 2);
      doc.setFontSize(8);
      doc.setTextColor(110);
      text(`Schlagwörter: ${card.tags.join(', ')}`, MARGIN, y);
      doc.setTextColor(0);
      y += LINE + 1;
    }
    y += 4;
  }
}
