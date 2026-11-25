// Berichtspaket des Arzt-Links (Spec 07, M18): das Berichtsmodell (für Tabelle und Diagramme in der Ansicht) und das
// fertige PDF. Wird nur verschlüsselt über den Server geteilt. Dieses Modul kennt weder Datenbank noch Sync.
import type { Report } from '@stb/export';
import { fromBase64Url, toBase64Url } from '@stb/crypto';

export interface ReportPackage {
  v: 1;
  report: Report;
  /** PDF-Bytes, base64url. */
  pdf: string;
}

export class ReportPackageError extends Error {
  constructor() {
    super('Ungültiges Berichtspaket');
    this.name = 'ReportPackageError';
  }
}

export function encodeReportPackage(report: Report, pdf: Uint8Array): Uint8Array<ArrayBuffer> {
  const pkg: ReportPackage = { v: 1, report, pdf: toBase64Url(pdf) };
  return new TextEncoder().encode(JSON.stringify(pkg));
}

export function decodeReportPackage(bytes: Uint8Array): ReportPackage {
  try {
    const pkg = JSON.parse(new TextDecoder().decode(bytes)) as Partial<ReportPackage>;
    const r = pkg.report;
    if (pkg.v !== 1 || typeof pkg.pdf !== 'string' || !r || !Array.isArray(r.tables) || !Array.isArray(r.stats) || typeof r.title !== 'string') throw new Error('Form');
    return pkg as ReportPackage;
  } catch {
    throw new ReportPackageError();
  }
}

export const pdfBytes = (pkg: ReportPackage): Uint8Array<ArrayBuffer> => fromBase64Url(pkg.pdf);
