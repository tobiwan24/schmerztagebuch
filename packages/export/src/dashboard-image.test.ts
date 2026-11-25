// EXP-26: Das Bild eines eigenen Dashboards ist die Grundlage für das PDF-Layout „Dashboard“ (ersetzt das Standard-Diagramm).
import { describe, expect, it } from 'vitest';
import { exportFixture, FIXTURE_EXPORT_NOW } from './fixture.js';
import { buildReport } from './pdf-model.js';
import { renderReportPdf } from './pdf.js';

// 1×1-PNG (synthetisch)
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const latin = (b: Uint8Array) => Buffer.from(b).toString('latin1');

describe('PDF-Layout Dashboard mit Dashboard-Bild', () => {
  const report = buildReport(exportFixture(), { now: FIXTURE_EXPORT_NOW });
  const base = { layout: 'dashboard' as const, imageSize: 'a5' as const, renderBodymap: async () => null };

  it('EXP-26: dashboardImage wird auf Seite 1 eingebettet und ersetzt das Standard-Diagramm (renderChart läuft nicht)', async () => {
    let chartCalls = 0;
    const renderChart = async () => (chartCalls++, { dataUrl: PNG, width: 1, height: 1 });
    const without = await renderReportPdf(report, { ...base, renderChart: async () => null });
    const withImg = await renderReportPdf(report, { ...base, renderChart, dashboardImage: { dataUrl: PNG, width: 900, height: 600 } });
    expect(chartCalls).toBe(0);
    expect(latin(withImg)).toContain('/Subtype /Image');
    expect(latin(without)).not.toContain('/Subtype /Image');
    expect(latin(withImg).startsWith('%PDF-')).toBe(true);
  });

  it('EXP-26: ein defektes Dashboard-Bild bricht das PDF nicht ab', async () => {
    const bytes = await renderReportPdf(report, { ...base, dashboardImage: { dataUrl: 'data:image/png;base64,@@@', width: 10, height: 10 } });
    expect(latin(bytes).startsWith('%PDF-')).toBe(true);
  });
});
