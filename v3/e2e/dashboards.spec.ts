import { test, expect, type Page } from '@playwright/test';
import { PASSWORD, go, onboardWithPassword } from './helpers';

/** Nur im Test: synthetische Einträge der letzten 20 Tage direkt in die lokale DB (Codec `plain`). */
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
            const versions = recs.filter((r) => r.kind === 'templateVersion').map((r) => JSON.parse(r.payload) as { templateId: string; version: number; blocks: { id: string; type: string }[] });
            const diaryId = recs.find((r) => r.kind === 'diary')!.diaryId;
            const tx = db.transaction('records', 'readwrite');
            const store = tx.objectStore('records');
            const now = Date.now();
            let n = 0;
            for (let d = 0; d < 20; d++) {
              for (const v of versions) {
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
  );
}

async function openDashboards(page: Page) {
  await go(page, '/analysis');
  await page.getByRole('button', { name: 'Dashboards', exact: true }).click();
  await expect(page.getByTestId('dashboards-view')).toBeVisible();
}

test.describe('Auswertung: Meine Dashboards', () => {
  test('ANA-32: Dashboard anlegen, umbenennen, Ansichten hinzufügen, verschieben (Zeiger + Tastatur), entfernen; bleibt nach Reload erhalten', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));

    await onboardWithPassword(page);
    await go(page, '/more/templates');
    await expect(page.getByTestId('template-row')).toHaveCount(1);
    expect(await seedEntries(page)).toBeGreaterThan(0);
    await page.reload();
    await page.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen' })).toBeVisible({ timeout: 30_000 });

    await openDashboards(page);
    await expect(page.getByText('Noch kein eigenes Dashboard')).toBeVisible();
    await page.getByLabel('Name des neuen Dashboards').fill('Meine Woche');
    await page.getByRole('button', { name: 'Dashboard anlegen' }).click();
    await expect(page.getByTestId('dashboard-name')).toHaveText('Meine Woche');
    await expect(page.getByText('Dieses Dashboard ist noch leer.')).toBeVisible();

    const add = async (label: string) => {
      await page.getByLabel('Ansicht hinzufügen').selectOption({ label });
      await page.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
    };
    await add('Kennzahl');
    await add('Verlauf');
    await add('Medikamententage');
    const kinds = () => page.getByTestId('dashboard-widget').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
    await expect.poll(kinds).toEqual(['kpi', 'timeseries', 'medicationDays']);
    await expect(page.getByTestId('kpi-value')).not.toHaveText('–', { timeout: 15_000 });
    await expect(page.getByTestId('dashboard-widget').nth(1).locator('.recharts-line-curve')).toHaveCount(1, { timeout: 15_000 });

    // verschieben: Zeiger …
    await page.getByRole('button', { name: 'Verlauf nach oben', exact: true }).click();
    await expect.poll(kinds).toEqual(['timeseries', 'kpi', 'medicationDays']);
    // … und Tastatur
    await page.getByRole('button', { name: 'Medikamententage nach oben', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(kinds).toEqual(['timeseries', 'medicationDays', 'kpi']);
    await page.getByRole('button', { name: 'Kennzahl nach oben', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect.poll(kinds).toEqual(['timeseries', 'kpi', 'medicationDays']);

    // umbenennen, entfernen
    await page.getByRole('button', { name: 'Umbenennen', exact: true }).click();
    await page.getByLabel('Neuer Name').fill('Monat');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(page.getByTestId('dashboard-name')).toHaveText('Monat');
    await page.getByRole('button', { name: 'Medikamententage entfernen', exact: true }).click();
    await expect.poll(kinds).toEqual(['timeseries', 'kpi']);

    // bleibt nach Reload erhalten
    await go(page, '/more/templates');
    await page.reload();
    await page.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen' })).toBeVisible({ timeout: 30_000 });
    await openDashboards(page);
    await expect(page.getByTestId('dashboard-name')).toHaveText('Monat');
    await expect.poll(kinds).toEqual(['timeseries', 'kpi']);

    // löschen
    await page.getByRole('button', { name: 'Dashboard löschen', exact: true }).click();
    await expect(page.getByText('Noch kein eigenes Dashboard')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
