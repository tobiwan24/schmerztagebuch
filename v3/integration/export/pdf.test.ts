// PDF-Export (Spec 07): unabhängig geprüft mit pdf.js — Text-Extraktion, Bildanzahl und -größe, Passwortschutz.
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { FIXTURE_EXPORT_NOW, buildReport, exportFixture, renderReportPdf, type RenderedImage } from '@stb/export';

const png = readFileSync(new URL('../../apps/web/src/assets/bodymap/koerper-vorderseite.png', import.meta.url));
const IMG: RenderedImage = { dataUrl: `data:image/png;base64,${png.toString('base64')}`, width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
const MM = 72 / 25.4; // PDF-Punkte je Millimeter

async function open(bytes: Uint8Array, password?: string) {
  return pdfjs.getDocument({ data: bytes.slice(), ...(password ? { password } : {}), isEvalSupported: false, useSystemFonts: false, verbosity: 0 }).promise;
}

async function inspect(bytes: Uint8Array, password?: string) {
  const doc = await open(bytes, password);
  const texts: string[] = [];
  const images: { w: number; h: number }[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    texts.push((await page.getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' '));
    const ops = await page.getOperatorList();
    let ctm = [1, 0, 0, 1, 0, 0];
    ops.fnArray.forEach((fn, i) => {
      if (fn === pdfjs.OPS.transform) ctm = ops.argsArray[i] as number[];
      if (fn === pdfjs.OPS.paintImageXObject) images.push({ w: Math.abs(ctm[0]!), h: Math.abs(ctm[3]!) });
    });
  }
  return { pages: doc.numPages, text: texts.join('\n'), images };
}

const src = exportFixture();
const report = buildReport(src, { now: FIXTURE_EXPORT_NOW });

describe('PDF', () => {
  it('EXP-08: PDF enthält Deckblatt mit Kennzahlen, Tabelle und Body-Map-Bilder in der gewählten Größe', async () => {
    const bytes = await renderReportPdf(report, { imageSize: 'a6', renderBodymap: async () => IMG });
    const r = await inspect(bytes);
    // Deckblatt
    expect(r.text).toContain('Zusammenfassung');
    expect(r.text).toContain('Testtagebuch');
    expect(r.text).toContain('Tage mit Eintrag');
    expect(r.text).toMatch(/Mittelwert 5\b/); // Migräne: Tageswerte 7, 5, 3 → Mittel 5
    expect(r.text).toContain('Arzttermine');
    expect(r.text).toContain('Neurologie');
    // Tabelle je Vorlage (inkl. Mehrfachauswahl und Zeitraum)
    expect(r.text).toContain('Migräne-Tracking');
    expect(r.text).toContain('Allgemeines Schmerz-Tagebuch');
    expect(r.text).toContain('Übelkeit, Lichtempfindlichkeit');
    expect(r.text).toContain('04.02.2026 - 06.02.2026');
    // Body-Map: genau ein Bild, Breite = A6-Box (105 mm) bzw. Höhe 148 mm — je nach Seitenverhältnis
    expect(r.images).toHaveLength(1);
    const img = r.images[0]!;
    const fitW = Math.min(105 / IMG.width, 148 / IMG.height);
    expect(img.w / MM).toBeCloseTo(IMG.width * fitW, 0);
    expect(img.h / MM).toBeCloseTo(IMG.height * fitW, 0);

    const none = await inspect(await renderReportPdf(report, { imageSize: 'none', renderBodymap: async () => IMG }));
    expect(none.images).toHaveLength(0);
    const a5 = await inspect(await renderReportPdf(report, { imageSize: 'a5', renderBodymap: async () => IMG }));
    expect(a5.images[0]!.h).toBeGreaterThan(img.h); // größer als A6 (auf die Seitenhöhe begrenzt)
  }, 60_000);

  it('EXP-09: passwortgeschütztes PDF lässt sich ohne Passwort nicht öffnen', async () => {
    const bytes = await renderReportPdf(report, { imageSize: 'none', password: 'Arzt-2026', renderBodymap: async () => null });
    await expect(open(bytes)).rejects.toMatchObject({ name: 'PasswordException' });
    await expect(open(bytes, 'falsch')).rejects.toMatchObject({ name: 'PasswordException' });
    const r = await inspect(bytes, 'Arzt-2026');
    expect(r.text).toContain('Zusammenfassung');
    // Inhalt liegt nicht im Klartext in der Datei
    expect(Buffer.from(bytes).toString('latin1')).not.toContain('Testtagebuch');
  }, 60_000);
});
