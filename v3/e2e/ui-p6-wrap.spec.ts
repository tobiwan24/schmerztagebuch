import { test, expect, type Page } from '@playwright/test';
import { PASSWORD, go, onboardWithPassword, openAnalysisView } from './helpers';

const LONG = 'Übungsphasen 1-Ruhe 2-Aufwärmen 3-Belastung 4-Abkühlen';

/** Nur im Test: Zahlenfelder aller Vorlagen bekommen ein sehr langes Label; je 25 Tage synthetische Einträge (Codec `plain`). */
async function seed(page: Page, label: string) {
  return page.evaluate(
    (long) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('stb-v3');
        open.onsuccess = () => {
          const db = open.result;
          const read = db.transaction('records').objectStore('records').getAll();
          read.onsuccess = () => {
            const recs = read.result as { id: string; kind: string; payload: string; diaryId: string }[];
            const tx = db.transaction('records', 'readwrite');
            const store = tx.objectStore('records');
            const versions = recs.filter((r) => r.kind === 'templateVersion');
            const diaryId = recs.find((r) => r.kind === 'diary')!.diaryId;
            const now = Date.now();
            let n = 0;
            for (const rec of versions) {
              const v = JSON.parse(rec.payload) as { templateId: string; version: number; blocks: { id: string; type: string; label: string }[] };
              for (const b of v.blocks) if (b.type === 'slider') b.label = long;
              store.put({ ...rec, payload: JSON.stringify(v), localUpdatedAt: now });
              for (let d = 0; d < 25; d++) {
                const at = new Date(now - d * 86_400_000 - 3_600_000).toISOString();
                const values: Record<string, unknown> = {};
                for (const b of v.blocks) if (b.type === 'slider') values[b.id] = (d * 3 + 2) % 11;
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
    label,
  );
}

async function prepare(page: Page) {
  await page.setViewportSize({ width: 375, height: 800 });
  await onboardWithPassword(page);
  await go(page, '/more/templates');
  await page.getByRole('button', { name: /Kopfschmerz-Tagebuch/ }).click();
  await expect(page.getByTestId('template-row')).toHaveCount(2);
  expect(await seed(page, LONG)).toBe(50);
  await page.reload();
  await page.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
  await expect(page.getByRole('heading', { name: 'Vorlagen' })).toBeVisible({ timeout: 30_000 });
  await go(page, '/analysis');
}

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

test.describe('RDM-028 P6: Umbruch und Beschriftung', () => {
  test('RDM-028 P6: lange Chips und Namen brechen um, kein horizontaler Überlauf', async ({ page }) => {
    await prepare(page);
    for (const view of ['Verlauf']) {
      await openAnalysisView(page, view);
      const chip = page.getByRole('group', { name: 'Feld' }).getByRole('button').first();
      await expect(chip).toBeVisible();
      expect((await chip.boundingBox())!.height).toBeGreaterThan(36);
      expect(await noOverflow(page)).toBeLessThanOrEqual(375);
    }
    await openAnalysisView(page, 'Dashboards');
    const name = 'Mein sehr langes Dashboard für die Auswertung aller Übungen und Beschwerden xxxx';
    expect(name.length).toBe(80);
    await page.getByLabel('Name des neuen Dashboards').fill(name);
    await page.getByRole('button', { name: 'Dashboard anlegen' }).click();
    await expect(page.getByTestId('dashboard-name')).toHaveText(name);
    await page.getByLabel('Ansicht hinzufügen').selectOption({ label: 'Kennzahl' });
    await page.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
    await page.getByRole('button', { name: 'Umbenennen' }).click();
    expect((await page.getByRole('button', { name }).first().boundingBox())!.height).toBeGreaterThan(36);
    expect(await noOverflow(page)).toBeLessThanOrEqual(375);
  });

  test('RDM-028 P6: Zusammenhänge zeigen „Wert A“ und „Wert B“', async ({ page }) => {
    await prepare(page);
    await openAnalysisView(page, 'Zusammenh.');
    const pair = page.getByTestId('corr-pair');
    await expect(pair.getByText('Wert A', { exact: true })).toBeVisible();
    await expect(pair.getByText('Wert B', { exact: true })).toBeVisible();
    await expect(pair.getByRole('group', { name: 'Wert A' })).toBeVisible();
    await expect(pair.getByRole('group', { name: 'Wert B' })).toBeVisible();
    expect(await noOverflow(page)).toBeLessThanOrEqual(375);
  });
});
