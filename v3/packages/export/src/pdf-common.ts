// Gemeinsames der PDF-Layouts (Spec 07 „PDF"): Optionen, Bildgrößen wie v2, WinAnsi-Text, Dokument, Kopf-/Fußzeile.
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

export type PdfLayout = 'table' | 'cards';

export interface PdfOptions {
  /** Standard `table`. */
  layout?: PdfLayout;
  imageSize: PdfImageSize;
  password?: string;
  renderBodymap: (value: BodymapValue) => Promise<RenderedImage | null>;
}

export const MARGIN = 15;

/** Standardschriften kennen nur WinAnsi: typografische Zeichen ersetzen, Unbekanntes als „?". */
export function pdfText(s: string): string {
  const map: Record<string, string> = { '–': '-', '—': '-', '≥': '>=', '≤': '<=', '…': '...', '„': '"', '“': '"', '”': '"', '‚': "'", '‘': "'", '’': "'", '→': '->', '◆': '*', '•': '-' };
  return [...s].map((c) => map[c] ?? (c.charCodeAt(0) <= 0xff ? c : '?')).join('');
}

export const fmtNum = (n: number | null) => (n === null ? '-' : n.toLocaleString('de-DE', { maximumFractionDigits: 1 }));
export const fmtDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;


/** Neues Dokument (A4, mm) mit optionalem Passwortschutz. */
export function createPdfDoc(orientation: 'landscape' | 'portrait', password?: string): jsPDF {
  return new jsPDF({
    orientation, unit: 'mm', format: 'a4', compress: true,
    ...(password ? { encryption: { userPassword: password, ownerPassword: `${password}#owner`, userPermissions: ['print', 'copy'] } } : {}),
  });
}

/** Fußzeile mit Seitenzahlen auf allen Seiten. */
export function addPageFooters(doc: jsPDF, report: Report): void {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(pdfText(`Seite ${i} von ${pages} · erstellt ${fmtDay(report.createdAt.slice(0, 10))}`), W - MARGIN, H - 7, { align: 'right' });
    doc.setTextColor(0);
  }
}

/** Zielgröße eines Bildes in der gewählten Größe, begrenzt auf `maxW`×`maxH`, Seitenverhältnis bleibt. */
export function fitImage(img: RenderedImage, size: Exclude<PdfImageSize, 'none'>, maxW: number, maxH: number): { w: number; h: number } {
  const box = PDF_IMAGE_SIZE_MM[size];
  const scale = Math.min(Math.min(box.w, maxW) / img.width, Math.min(box.h, maxH) / img.height);
  return { w: img.width * scale, h: img.height * scale };
}
