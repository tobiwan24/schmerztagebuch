import { test, expect, type Page } from '@playwright/test';
import { PASSWORD, go, onboardWithPassword } from './helpers';

/** Nur im Test: synthetische Einträge der letzten 25 Tage direkt in die lokale DB (Codec `plain`) schreiben. */
async function seedEntries(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('stb-v3');
        open.onsuccess = () => {
          const db = open.result;
          const read = db.transaction('records').objectStore('records').getAll();
          read.onsuccess = () => {
            const recs = read.result as { kind: string; payload: string; diaryId: string }[];
            const versions = recs.filter((r) => r.kind === 'templateVersion').map((r) => JSON.parse(r.payload) as { templateId: string; version: number; blocks: { id: string; type: string; label: string; role?: string; config: { options?: { id: string }[] } }[] });
            const diaryId = recs.find((r) => r.kind === 'diary')!.diaryId;
            const tx = db.transaction('records', 'readwrite');
            const store = tx.objectStore('records');
            const now = Date.now();
            let n = 0;
            for (let d = 0; d < 25; d++) {
              for (const v of versions) {
                const at = new Date(now - d * 86_400_000 - 3_600_000).toISOString();
                const values: Record<string, unknown> = {};
                for (const b of v.blocks) {
                  if (b.type === 'slider') values[b.id] = (d * 3 + v.blocks.length) % 11;
                  if (b.type === 'multiselect' && b.config.options) values[b.id] = d % 2 ? [b.config.options[d % b.config.options.length]!.id] : [];
                  if (b.type === 'bodymap' && d % 3 === 0) values[b.id] = { presetId: 'default-koerper-vorderseite', points: [{ id: `0190a1b2-0000-7000-8000-${String(d).padStart(12, '0')}`, x: 0.5, y: 0.2 + d / 100, intensity: 6 }] };
                  if (b.type === 'textarea' && d % 7 === 2) values[b.id] = { text: 'Termin', events: [{ id: `0190a1b2-0000-7000-9000-${String(d).padStart(12, '0')}`, category: 'doctor', title: 'Hausarzt' }] };
                }
                for (const k of Object.keys(values)) if (Array.isArray(values[k]) && (values[k] as unknown[]).length === 0) delete values[k];
                const id = `0190a1b2-${String(d).padStart(4, '0')}-7000-8000-${v.templateId.slice(-12)}`;
                const entry = { id, diaryId, templateId: v.templateId, templateVersion: v.version, occurredAt: at, recordedAt: at, updatedAt: at, authorId: 'e2e', values, tags: [], meta: { source: 'app', timezone: 'Europe/Berlin' }, hlc: `${now}:0000:e2e` };
                store.put({ id, diaryId, kind: 'entry', rev: 0, deleted: 0, codec: 'plain', payload: JSON.stringify(entry), localUpdatedAt: now, occurredAt: at });
                n++;
              }
            }
            tx.oncomplete = () => resolve(n);
            tx.onerror = () => reject(tx.error);
          };
        };
      }),
  );
}

test.describe('Auswertung', () => {
  test('ANA-13: Verlauf, Kalender, Medikamententage, Häufigkeiten, Body-Map-Übersicht rendern ohne Konsolenfehler; Ereignismarkierungen erscheinen', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));

    await onboardWithPassword(page);
    await go(page, '/more/templates');
    await page.getByRole('button', { name: /Kopfschmerz-Tagebuch/ }).click();
    await expect(page.getByTestId('template-row')).toHaveCount(2);
    expect(await seedEntries(page)).toBe(50);
    // neu laden → entsperren (Arbeitsset wird aus der DB aufgebaut)
    await page.reload();
    await page.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen' })).toBeVisible({ timeout: 30_000 });
    await go(page, '/analysis');

    // Verlauf mit Ereignismarkierungen
    const trend = page.getByTestId('analysis-view-trend');
    await expect(trend.locator('.recharts-line-curve')).toHaveCount(1, { timeout: 15_000 });
    await expect(trend.getByTestId('trend-n')).toContainText('n = ');
    await expect(trend.getByTestId('event-marks')).toContainText('Arzttermin: Hausarzt');
    expect(await trend.locator('.recharts-reference-line').count()).toBeGreaterThan(0);

    // Kalender
    await page.getByRole('button', { name: 'Kalender' }).click();
    await expect(page.getByTestId('calendar-grid')).toBeVisible();
    await expect.poll(() => page.locator('[data-testid=calendar-day]:not([data-value=""])').count()).toBeGreaterThan(0);

    // Medikamententage
    await page.getByRole('button', { name: 'Medis' }).click();
    await expect.poll(() => page.getByTestId('analysis-view-meds').locator('.recharts-bar-rectangle').count()).toBeGreaterThan(0);
    await page.getByLabel('Markierungslinie (Tage)').fill('10');
    await expect(page.getByTestId('analysis-view-meds').locator('.recharts-reference-line')).toHaveCount(1);

    // Häufigkeiten
    await page.getByRole('button', { name: 'Häufig.' }).click();
    await expect.poll(() => page.getByTestId('analysis-view-freq').locator('.recharts-bar-rectangle').count()).toBeGreaterThan(0);

    // Body-Map-Übersicht
    await page.getByRole('button', { name: 'Körper' }).click();
    await expect.poll(() => page.getByTestId('bodymap-overview').locator('circle').count()).toBeGreaterThan(0);

    // Zeitraumvergleich (Vorperiode ohne Daten → „Wenige Daten")
    await expect(page.getByTestId('compare-card')).toContainText('Zeiträume vergleichen');
    await expect(page.getByTestId('few-data')).toHaveText('Wenige Daten — Unterschied kann zufällig sein.');

    expect(errors).toEqual([]);
  });

  test('ANA-14: jede Ansicht ist als PNG exportierbar (Download-Event)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await onboardWithPassword(page);
    await go(page, '/more/templates');
    await page.getByRole('button', { name: /Kopfschmerz-Tagebuch/ }).click();
    await expect(page.getByTestId('template-row')).toHaveCount(2);
    await seedEntries(page);
    await page.reload();
    await page.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen' })).toBeVisible({ timeout: 30_000 });
    await go(page, '/analysis');
    await expect(page.getByTestId('analysis-view-trend').locator('.recharts-line-curve')).toHaveCount(1, { timeout: 15_000 });

    for (const [tab, view, ready] of [
      ['Verlauf', 'trend', '.recharts-line-curve'],
      ['Kalender', 'calendar', '[data-testid=calendar-day]'],
      ['Medis', 'meds', '.recharts-bar-rectangle'],
      ['Häufig.', 'freq', '.recharts-bar-rectangle'],
      ['Körper', 'body', '[data-testid=bodymap-overview] circle'],
    ] as const) {
      await page.getByRole('group', { name: 'Ansicht' }).getByRole('button', { name: tab, exact: true }).click();
      await expect(page.getByTestId(`analysis-view-${view}`).locator(ready).first()).toBeVisible({ timeout: 15_000 });
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Als PNG' }).click()]);
      expect(download.suggestedFilename()).toMatch(new RegExp(`^schmerztagebuch-${view}-[0-9]{4}-[0-9]{2}-[0-9]{2}[.]png$`));
      const chunks: Buffer[] = [];
      for await (const c of (await download.createReadStream())!) chunks.push(c as Buffer);
      const png = Buffer.concat(chunks);
      expect(png.subarray(0, 8).toString('hex'), view).toBe('89504e470d0a1a0a');
      expect(png.length, view).toBeGreaterThan(2000);
      expect(png.readUInt32BE(16), `${view} Breite`).toBeGreaterThan(300); // IHDR-Breite (2× Skalierung)
    }
    expect(errors).toEqual([]);
  });
});

