import { test, expect, type Page } from '@playwright/test';
import { PASSWORD, go, onboardWithPassword, openAnalysisView } from './helpers';

/**
 * Nur im Test: synthetische Einträge der letzten 25 Tage direkt in die lokale DB (Codec `plain`).
 * Kopfschmerz-Tagebuch: Schmerzstärke = 10 − ⌊d/3⌋ (d = Tage zurück), „Auslöser“ = erste Option an den 12 jüngsten Tagen.
 * Allgemeines Tagebuch: Schmerzstärke = d (also gegenläufig zum Kopfschmerz-Tagebuch).
 * Daraus folgt: Schmerz ≥ 7 genau an den Tagen d ≤ 11 → alle 12 Auslöser-Tage sind „hoch“.
 */
async function seedEntries(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('stb-v3');
        open.onsuccess = () => {
          const db = open.result;
          const read = db.transaction('records').objectStore('records').getAll();
          read.onsuccess = () => {
            const recs = read.result as { kind: string; payload: string }[];
            const versions = recs.filter((r) => r.kind === 'templateVersion').map((r) => JSON.parse(r.payload) as { templateId: string; version: number; blocks: { id: string; type: string; label: string; role?: string; config: { options?: { id: string }[] } }[] });
            const diaryId = (recs.find((r) => r.kind === 'diary') as unknown as { diaryId: string }).diaryId;
            const tx = db.transaction('records', 'readwrite');
            const store = tx.objectStore('records');
            const now = Date.now();
            let n = 0;
            for (let d = 0; d < 25; d++) {
              for (const v of versions) {
                const at = new Date(now - d * 86_400_000 - 3_600_000).toISOString();
                const values: Record<string, unknown> = {};
                const headache = v.blocks.some((b) => b.label === 'Auslöser');
                for (const b of v.blocks) {
                  if (b.type === 'slider') values[b.id] = headache ? 10 - Math.floor(d / 3) : d;
                  if (b.type === 'multiselect' && b.label === 'Auslöser' && d < 12) values[b.id] = [b.config.options![0]!.id];
                }
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

test.describe('Auswertung: Zusammenhänge', () => {
  test('ANA-28: Koeffizient mit Stärke in Worten, n und Warnhinweis; Auslöser mit Fallzahlen; unter der Mindestzahl nur Hinweise', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await onboardWithPassword(page);
    await go(page, '/more/templates');
    await page.getByRole('button', { name: /Kopfschmerz-Tagebuch/ }).click();
    await expect(page.getByTestId('template-row')).toHaveCount(2);
    expect(await seedEntries(page)).toBe(50);
    await page.reload();
    await page.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen' })).toBeVisible({ timeout: 30_000 });
    await go(page, '/analysis');

    await openAnalysisView(page, 'Zusammenh.');
    const caveat = page.getByTestId('corr-caveat');
    await expect(caveat).toHaveText('Zusammenhang ist keine Ursache.');

    // Zwei Felder: Schmerzstärke im Allgemeinen Tagebuch gegen Schmerzstärke im Kopfschmerz-Tagebuch, selber Tag
    const pair = page.getByTestId('corr-pair');
    await pair.getByRole('group', { name: 'Wert A' }).getByRole('button', { name: 'Schmerzstärke · Allgemeines Schmerz-Tagebuch' }).click();
    await pair.getByRole('group', { name: 'Wert B' }).getByRole('button', { name: 'Schmerzstärke · Kopfschmerz-Tagebuch' }).click();
    const result = page.getByTestId('corr-result');
    // Minuszeichen kann als „-“ oder „−“ formatiert sein
    await expect(result).toContainText(/Rangkorrelation ρ = [-−]0,9\d/, { timeout: 15_000 });
    await expect(result).toContainText('starker Zusammenhang, gegenläufig');
    await expect(result).toContainText(/n = 2[3-5] gemeinsame Tage/);

    // Zeitversatz 7 Tage: weniger gemeinsame Tage, weiterhin eine Zahl
    await pair.getByRole('group', { name: 'Zeitversatz in Tagen' }).getByRole('button', { name: '7', exact: true }).click();
    await expect(result).toContainText(/n = 1[6-8] gemeinsame Tage/);
    await expect(caveat).toBeVisible();

    // Auslöser: 12 Fälle, alle hoch → Lift = (12/12) / (12/25) ≈ 2,1
    const trig = page.getByTestId('corr-triggers');
    await trig.getByRole('group', { name: 'Ergebnis' }).getByRole('button', { name: 'Schmerzstärke · Kopfschmerz-Tagebuch' }).click();
    const rows = page.getByTestId('corr-trigger-row');
    await expect(rows.filter({ hasText: 'Stress' })).toContainText(/Stress: 1[0-2] Fälle · hoch an 100 % dieser Tage, an allen Tagen (4\d|50) %/);
    await expect(rows.filter({ hasText: 'Stress' })).toContainText(/Lift 2,\d/);
    // Optionen ohne Ereignis tauchen nicht auf
    await expect(rows).toHaveCount(1);

    // 7-Tage-Zeitraum: unter der Mindestzahl nur Hinweise, keine Zahl
    await pair.getByRole('group', { name: 'Zeitversatz in Tagen' }).getByRole('button', { name: '0', exact: true }).click();
    await page.getByRole('button', { name: '7 T', exact: true }).click();
    await expect(result).toContainText(/Zu wenige gemeinsame Tage für eine Zahl \(n = [5-7], mindestens 14\)/);
    await expect(result).not.toContainText('ρ');
    const row = rows.filter({ hasText: 'Stress' });
    await expect(row).toContainText(/Fälle? — zu wenige für eine Zahl \(mindestens 10\)/);
    await expect(row).not.toContainText('Lift');
    await expect(caveat).toBeVisible();

    expect(errors).toEqual([]);
  });
});
