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

describe('PDF-Layout Karten', () => {
  const MMPT = 72 / 25.4;
  async function pageSizes(bytes: Uint8Array, password?: string) {
    const doc = await open(bytes, password);
    const out: { w: number; h: number }[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const v = (await doc.getPage(p)).getViewport({ scale: 1 });
      out.push({ w: v.width / MMPT, h: v.height / MMPT });
    }
    return out;
  }

  it('EXP-14: Karten auf A4 hoch, je Eintrag eine Karte mit Zeit, Vorlage, allen Werten und Body-Map-Bild in gewählter Größe; Passwortschutz wirkt', async () => {
    const bytes = await renderReportPdf(report, { layout: 'cards', imageSize: 'a6', renderBodymap: async () => IMG });
    for (const s of await pageSizes(bytes)) {
      expect(s.w).toBeCloseTo(210, 0);
      expect(s.h).toBeCloseTo(297, 0);
    }
    const r = await inspect(bytes);
    expect(r.text).toContain('03.02.2026 08:30'); // Zeit (Europe/Berlin)
    expect(r.text).toContain('04.02.2026 - 06.02.2026'); // Zeitraum
    expect(r.text).toContain('Migräne-Tracking');
    expect(r.text).toContain('Allgemeines Schmerz-Tagebuch');
    expect(r.text).toContain('Schmerzstärke');
    expect(r.text).toContain('Übelkeit, Lichtempfindlichkeit'); // Mehrfachauswahl
    expect(r.text).toContain('Notizen');
    expect(r.text).toContain('Neurologie'); // Ereignis des Notizfelds
    expect(r.text).toContain('Schlagwörter: arbeit');
    // ein Bild (eine Körperkarte), Größe A6 (105 x 148 mm, Seitenverhältnis bleibt)
    expect(r.images).toHaveLength(1);
    const fit = Math.min(105 / IMG.width, 148 / IMG.height);
    expect(r.images[0]!.w / MM).toBeCloseTo(IMG.width * fit, 0);
    expect(r.images[0]!.h / MM).toBeCloseTo(IMG.height * fit, 0);

    expect((await inspect(await renderReportPdf(report, { layout: 'cards', imageSize: 'none', renderBodymap: async () => IMG }))).images).toHaveLength(0);

    const locked = await renderReportPdf(report, { layout: 'cards', imageSize: 'none', password: 'Arzt-2026', renderBodymap: async () => null });
    await expect(open(locked)).rejects.toMatchObject({ name: 'PasswordException' });
    expect((await inspect(locked, 'Arzt-2026')).text).toContain('Migräne-Tracking');
    expect(Buffer.from(locked).toString('latin1')).not.toContain('Testtagebuch');
  }, 60_000);
});

describe('PDF-Layout Dashboard', () => {
  it('EXP-15: Dashboard mit Diagrammbild, Kennzahlen der outcome-Blöcke und Häufigkeiten nur der gewählten Multiselects', async () => {
    const symptoms = report.multiselects.find((m) => m.label === 'Begleitsymptome')!;
    const triggers = report.multiselects.find((m) => m.label === 'Auslöser')!;
    expect(symptoms.options.find((o) => o.label === 'Übelkeit')?.days).toBe(1);
    expect(report.chart?.points.length).toBeGreaterThan(0);
    let chartCalls = 0;
    const render = (ids: string[], renderChart = async () => (chartCalls++, IMG)) =>
      renderReportPdf(report, { layout: 'dashboard', imageSize: 'none', renderBodymap: async () => null, renderChart, multiselectBlockIds: ids });

    const r = await inspect(await render([symptoms.blockId]));
    expect(chartCalls).toBe(1);
    expect(r.images).toHaveLength(1); // Diagramm
    expect(r.text).toContain('Verlaufsbericht');
    expect(r.text).toMatch(/Kennzahlen/);
    expect(r.text).toMatch(/Mittelwert 5\b/);
    expect(r.text).toContain('Begleitsymptome (Tage mit Auswahl)');
    expect(r.text).toContain('Übelkeit: 1 Tage');
    expect(r.text).not.toContain('Auslöser (Tage mit Auswahl)'); // nicht gewählt
    expect(r.text).toContain('Neurologie'); // Arztbesuch
    expect(r.text).toContain('Migräne-Tracking'); // Karten folgen

    const both = await inspect(await render([symptoms.blockId, triggers.blockId]));
    expect(both.text).toContain('Auslöser (Tage mit Auswahl)');
    const none = await inspect(await render([]));
    expect(none.text).not.toContain('(Tage mit Auswahl)');

    const locked = await renderReportPdf(report, { layout: 'dashboard', imageSize: 'none', password: 'Arzt-2026', renderBodymap: async () => null });
    await expect(open(locked)).rejects.toMatchObject({ name: 'PasswordException' });
    expect((await inspect(locked, 'Arzt-2026')).images).toHaveLength(0);
  }, 60_000);
});

describe('PDF Zusammenfassung für den Arzt', () => {
  it('Abschnitt mit bearbeitetem Text und Hinweis „Keine Diagnose“ in allen drei Layouts (Teil von VOI-15)', async () => {
    for (const layout of ['table', 'cards', 'dashboard'] as const) {
      const bytes = await renderReportPdf(report, { layout, imageSize: 'none', renderBodymap: async () => null, summary: 'Im Mittel Schmerzstärke 5 an drei Tagen.' });
      const r = await inspect(bytes);
      expect(r.text, layout).toContain('Zusammenfassung für den Arzt');
      expect(r.text, layout).toContain('Im Mittel Schmerzstärke 5 an drei Tagen.');
      expect(r.text, layout).toContain('Keine Diagnose');
    }
  });
});
