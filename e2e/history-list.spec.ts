import { test, expect, type Page } from '@playwright/test';
import { PASSWORD, go, onboardWithPassword, openSort } from './helpers';

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

  test('ANA-20: Sortierung (4 Optionen) bleibt nach Reload; Liste lädt je 50 Einträge, Seitengrenzen und Datum in den Zeilen stimmen (ohne Tagesüberschriften, RDM-028 P3)', async ({ page }) => {
    await onboardWithPassword(page);
    await seed(page);
    await go(page, '/history');
    const rows = page.getByTestId('entry-row');
    const dateOf = (offsetDays: number) => {
      const d = new Date();
      d.setDate(d.getDate() - offsetDays);
      return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
    };
    await expect(page.getByTestId('entry-day')).toHaveCount(0);
    await expect(rows).toHaveCount(50);
    await expect(rows.filter({ hasText: dateOf(0) })).toHaveCount(40);
    await expect(rows.filter({ hasText: dateOf(1) })).toHaveCount(10);

    await page.getByRole('button', { name: /Weitere laden/ }).click();
    await expect(rows).toHaveCount(100);
    await expect(rows.filter({ hasText: dateOf(1) })).toHaveCount(40);
    await page.getByRole('button', { name: /Weitere laden/ }).click();
    await expect(rows).toHaveCount(120);
    await expect(page.getByRole('button', { name: /Weitere laden/ })).toHaveCount(0);

    // Sortierung: 4 Optionen; „Älteste zuerst" beginnt mit dem ältesten Tag und startet wieder bei einer Seite
    await openSort(page);
    const sort = page.getByLabel('Sortierung');
    await expect(sort.locator('option')).toHaveText(['Neueste zuerst', 'Älteste zuerst', 'Vorlage A–Z', 'Vorlage und Datum']);
    await sort.selectOption({ label: 'Älteste zuerst' });
    await expect(rows).toHaveCount(50);
    await expect(rows.first()).toContainText(dateOf(2));
    await sort.selectOption({ label: 'Vorlage A–Z' });
    await expect(page.locator('[data-testid=entry-list] h2')).toHaveCount(1);
    await expect(page.locator('[data-testid=entry-list] h2').first()).toContainText('Allgemeines Schmerz-Tagebuch');
    await sort.selectOption({ label: 'Älteste zuerst' });

    // Reload (sperrt) → entsperren → Sortierung bleibt
    await page.reload();
    await page.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await expect(page.getByRole('heading', { name: 'Verlauf' })).toBeVisible({ timeout: 30_000 });
    await openSort(page);
    await expect(page.getByLabel('Sortierung')).toHaveValue('oldest');
    await expect(rows).toHaveCount(50);
    await expect(rows.first()).toContainText(dateOf(2));
  });

  test('RDM-028 P3: Verlauf-Card zeigt Symbol, Titel, Datum, Kennzeichen und Schmerzwert', async ({ page }) => {
    await onboardWithPassword(page);
    // Nur im Test: Eintrag mit Textfeld-Text, outcome-Slider 7, Arzttermin und Körperkarten-Punkt direkt in die lokale DB schreiben
    const noon = await page.evaluate(
      () =>
        new Promise<string>((resolve, reject) => {
          const open = indexedDB.open('stb-v3');
          open.onsuccess = () => {
            const db = open.result;
            const read = db.transaction('records').objectStore('records').getAll();
            read.onsuccess = () => {
              const recs = read.result as { kind: string; payload: string; diaryId: string }[];
              const v = JSON.parse(recs.find((r) => r.kind === 'templateVersion')!.payload) as { templateId: string; version: number; blocks: { id: string; type: string; role?: string; config: { min?: number; max?: number } }[] };
              const diaryId = recs.find((r) => r.kind === 'diary')!.diaryId;
              const area = v.blocks.find((b) => b.type === 'textarea')!;
              const body = v.blocks.find((b) => b.type === 'bodymap')!;
              const pain = v.blocks.find((b) => b.type === 'slider' && b.role === 'outcome')!;
              if (pain.config.min !== 0 || pain.config.max !== 10) return reject(new Error('Schmerz-Slider nicht 0–10'));
              const at = new Date();
              at.setHours(12, 0, 0, 0);
              const iso = at.toISOString();
              const id = `0190a1b2-0001-7000-8000-${v.templateId.slice(-12)}`;
              const values = {
                [area.id]: { text: 'Pochender Kopfschmerz links', events: [{ id: 'ev1', category: 'doctor', title: 'Hausarzt', at: iso }], attachmentIds: [] },
                [body.id]: { points: [{ id: 'p1', kind: 'point', x: 0.5, y: 0.3, intensity: 5, size: 'medium' }] },
                [pain.id]: 7,
              };
              const entry = { id, diaryId, templateId: v.templateId, templateVersion: v.version, occurredAt: iso, recordedAt: iso, updatedAt: iso, authorId: 'e2e', values, tags: [], meta: { source: 'app', timezone: 'Europe/Berlin' }, hlc: `${Date.now()}:0000:e2e` };
              const tx = db.transaction('records', 'readwrite');
              tx.objectStore('records').put({ id, diaryId, kind: 'entry', rev: 0, deleted: 0, codec: 'plain', payload: JSON.stringify(entry), localUpdatedAt: Date.now(), occurredAt: iso });
              tx.oncomplete = () => resolve(iso);
              tx.onerror = () => reject(tx.error);
            };
          };
        }),
    );
    expect(noon).toBeTruthy();
    await go(page, '/');
    await go(page, '/history');
    const row = page.getByTestId('entry-row');
    await expect(row).toHaveCount(1);
    await expect(page.getByTestId('entry-day')).toHaveCount(0);
    await expect(row.getByTestId('template-icon')).toBeVisible();
    await expect(row.getByTestId('entry-title')).toContainText('Pochender Kopfschmerz links');
    await expect(row).toContainText('Allgemeines Schmerz-Tagebuch');
    await expect(row).toContainText(/\d{2}\.\d{2}\.\d{4}, 12:00/);
    await expect(row.getByLabel('Arztbesuch')).toBeVisible();
    await expect(row.getByLabel('Body-Map')).toBeVisible();
    await expect(row.getByLabel('Foto')).toHaveCount(0);
    const pain = row.getByLabel('Schmerz 7');
    await expect(pain).toHaveText('7');
    await expect(pain).toHaveClass(/text-orange-600/);
  });

  test('UI-25: weder Verlauf noch Start haben einen „Neuer Eintrag"-Knopf (neue Einträge über die Vorlagen-Kacheln, RDM-028 P2)', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/history');
    await expect(page.getByRole('heading', { name: 'Verlauf' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Neuer Eintrag' })).toHaveCount(0);
    await seed(page);
    await go(page, '/');
    await go(page, '/history');
    await expect(page.getByTestId('entry-row').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Neuer Eintrag' })).toHaveCount(0);
    await go(page, '/');
    await expect(page.getByRole('link', { name: 'Neuer Eintrag' })).toHaveCount(0);
    await expect(page.getByTestId('template-tile').first()).toBeVisible();
  });
});
