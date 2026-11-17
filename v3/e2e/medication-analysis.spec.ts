import { test, expect, type Page } from '@playwright/test';
import { go, onboardWithPassword } from './helpers';

/** Nur im Test: Einträge der letzten 8 Tage mit Medikamenten-Positionen direkt in die lokale DB (Codec `plain`) schreiben. */
async function seedMedication(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('stb-v3');
        open.onsuccess = () => {
          const db = open.result;
          const read = db.transaction('records').objectStore('records').getAll();
          read.onsuccess = () => {
            const recs = read.result as { kind: string; payload: string; diaryId: string }[];
            const diaryId = recs.find((r) => r.kind === 'diary')!.diaryId;
            const v = recs
              .filter((r) => r.kind === 'templateVersion')
              .map((r) => JSON.parse(r.payload) as { templateId: string; version: number; blocks: { id: string; type: string; config: { presets?: { id: string; name: string; dose?: number; unit: string }[] } }[] })
              .find((x) => x.blocks.some((b) => b.type === 'medication'))!;
            const med = v.blocks.find((b) => b.type === 'medication')!;
            const presets = med.config.presets!;
            const tx = db.transaction('records', 'readwrite');
            const store = tx.objectStore('records');
            const now = Date.now();
            for (let d = 0; d < 8; d++) {
              const at = new Date(now - d * 86_400_000 - 3_600_000).toISOString();
              // Ibuprofen an jedem Tag, Paracetamol an jedem vierten (→ 8 : 2 Tage)
              const pick = d % 4 === 0 ? [presets[0]!, presets[1]!] : [presets[0]!];
              const items = pick.map((p, i) => ({ id: `0190a1b2-${String(d).padStart(4, '0')}-7000-8000-${String(i).padStart(12, '0')}`, presetId: p.id, name: p.name, dose: p.dose, unit: p.unit, at }));
              const id = `0190a1b2-${String(d).padStart(4, '0')}-7000-9000-${v.templateId.slice(-12)}`;
              const entry = { id, diaryId, templateId: v.templateId, templateVersion: v.version, occurredAt: at, recordedAt: at, updatedAt: at, authorId: 'e2e', values: { [med.id]: { items } }, tags: [], meta: { source: 'app', timezone: 'Europe/Berlin' }, hlc: `${now}:0000:e2e` };
              store.put({ id, diaryId, kind: 'entry', rev: 0, deleted: 0, codec: 'plain', payload: JSON.stringify(entry), localUpdatedAt: now, occurredAt: at });
            }
            tx.oncomplete = () => resolve(8);
            tx.onerror = () => reject(tx.error);
          };
        };
      }),
  );
}

test.describe('Auswertung: Medikamente', () => {
  test.describe.configure({ timeout: 90_000 });

  test('ANA-23: Häufigkeiten zeigt das Kreisdiagramm „Medikamente“ mit Anteil je Medikament', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await onboardWithPassword(page);
    await go(page, '/more/templates');
    await page.getByRole('button', { name: /Schmerztagebuch mit Medikamenten/ }).click();
    await expect(page.getByTestId('template-row')).toHaveCount(2);
    await seedMedication(page);
    // Die Analyse lädt nur bei Schreib-Ereignissen der App neu (entprellt). Roh geschriebene Einträge kennt sie nicht:
    // ein App-Schreibvorgang NACH dem Seed (weitere Katalog-Vorlage) löst das Neuladen deterministisch aus.
    await page.getByRole('button', { name: /Migräne-Tracking/ }).click();
    await expect(page.getByTestId('template-row')).toHaveCount(3);
    await go(page, '/analysis');
    await page.getByRole('button', { name: 'Häufig.' }).click();

    const pie = page.getByTestId('med-pie');
    await expect(pie.getByText('Medikamente: Anteil je Medikament')).toBeVisible();
    await expect.poll(() => pie.locator('.recharts-pie-sector').count()).toBe(2);
    // 8 Tage Ibuprofen, 2 Tage Paracetamol → 80 % / 20 %
    await expect(page.getByTestId('med-pie-legend')).toContainText('Ibuprofen: 80 % (8 Tage)');
    await expect(page.getByTestId('med-pie-legend')).toContainText('Paracetamol: 20 % (2 Tage)');
    // Tooltip beim Tippen bzw. Berühren eines Segments
    // (Ring: Radius 40–80 um die Mitte; oben, bei 12 Uhr, liegt das große Segment)
    const box = (await pie.locator('.recharts-surface').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 60);
    await expect(pie.locator('.recharts-tooltip-wrapper')).toContainText('Tage');
    expect(errors).toEqual([]);
  });
});
