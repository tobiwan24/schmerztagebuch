import { test, expect, type Page } from '@playwright/test';
import { PASSWORD, go, onboardWithPassword } from './helpers';

/** Nur im Test: 3 Tage × 40 synthetische Einträge (mittags, je 1 Minute Abstand) direkt in die lokale DB schreiben (Codec `plain`). */
async function seed(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('stb-v3');
        open.onsuccess = () => {
          const db = open.result;
          const read = db.transaction('records').objectStore('records').getAll();
          read.onsuccess = () => {
            const recs = read.result as { kind: string; payload: string; diaryId: string }[];
            const v = JSON.parse(recs.find((r) => r.kind === 'templateVersion')!.payload) as { templateId: string; version: number };
            const diaryId = recs.find((r) => r.kind === 'diary')!.diaryId;
            const noon = new Date();
            noon.setHours(12, 0, 0, 0);
            const tx = db.transaction('records', 'readwrite');
            const store = tx.objectStore('records');
            for (let d = 0; d < 3; d++) {
              for (let i = 0; i < 40; i++) {
                const at = new Date(noon.getTime() - d * 86_400_000 + i * 60_000).toISOString();
                const id = `0190a1b2-${String(d * 40 + i).padStart(4, '0')}-7000-8000-${v.templateId.slice(-12)}`;
                const entry = { id, diaryId, templateId: v.templateId, templateVersion: v.version, occurredAt: at, recordedAt: at, updatedAt: at, authorId: 'e2e', values: {}, tags: [], meta: { source: 'app', timezone: 'Europe/Berlin' }, hlc: `${Date.now()}:0000:e2e` };
                store.put({ id, diaryId, kind: 'entry', rev: 0, deleted: 0, codec: 'plain', payload: JSON.stringify(entry), localUpdatedAt: Date.now(), occurredAt: at });
              }
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          };
        };
      }),
  );
}

test.describe('Verlauf: Sortierung und Seiten', () => {
  test.describe.configure({ timeout: 90_000 });

  test('ANA-20: Sortierung (4 Optionen) bleibt nach Reload; Liste lädt je 50 Einträge, Tagesgruppen bleiben über Seitengrenzen korrekt', async ({ page }) => {
    await onboardWithPassword(page);
    await seed(page);
    await go(page, '/history');
    const rows = page.getByTestId('entry-row');
    const days = page.getByTestId('entry-day');
    await expect(rows).toHaveCount(50);
    await expect(days).toHaveCount(2);
    await expect(days.first()).toContainText('Heute');
    await expect(days.first().getByTestId('entry-row')).toHaveCount(40);
    await expect(days.nth(1).getByTestId('entry-row')).toHaveCount(10);

    await page.getByRole('button', { name: /Weitere laden/ }).click();
    await expect(rows).toHaveCount(100);
    await expect(days).toHaveCount(3);
    await expect(days.nth(1).getByTestId('entry-row')).toHaveCount(40);
    await page.getByRole('button', { name: /Weitere laden/ }).click();
    await expect(rows).toHaveCount(120);
    await expect(page.getByRole('button', { name: /Weitere laden/ })).toHaveCount(0);

    // Sortierung: 4 Optionen; „Älteste zuerst" beginnt mit dem ältesten Tag und startet wieder bei einer Seite
    const sort = page.getByLabel('Sortierung');
    await expect(sort.locator('option')).toHaveText(['Neueste zuerst', 'Älteste zuerst', 'Vorlage A–Z', 'Vorlage und Datum']);
    await sort.selectOption({ label: 'Älteste zuerst' });
    await expect(rows).toHaveCount(50);
    await expect(days.first()).not.toContainText('Heute');
    await sort.selectOption({ label: 'Vorlage A–Z' });
    await expect(page.getByTestId('entry-day')).toHaveCount(1);
    await expect(days.first()).toContainText('Allgemeines Schmerz-Tagebuch');
    await sort.selectOption({ label: 'Älteste zuerst' });

    // Reload (sperrt) → entsperren → Sortierung bleibt
    await page.reload();
    await page.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await expect(page.getByRole('heading', { name: 'Verlauf' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Sortierung')).toHaveValue('oldest');
    await expect(rows).toHaveCount(50);
    await expect(days.first()).not.toContainText('Heute');
  });
});
