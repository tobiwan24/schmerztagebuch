import { test, expect, type Page } from '@playwright/test';
import { go, onboardWithPassword } from './helpers';

/** Nur im Test: synthetische ConflictLog-Records direkt in die lokale DB (Codec `plain`) schreiben. */
async function seedConflicts(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('stb-v3');
        open.onsuccess = () => {
          const db = open.result;
          const read = db.transaction('records').objectStore('records').getAll();
          read.onsuccess = () => {
            const diaryId = (read.result as { kind: string; diaryId: string }[]).find((r) => r.kind === 'diary')!.diaryId;
            const tx = db.transaction('records', 'readwrite');
            const rows = [
              { id: '0190a1b2-0001-7000-8000-00000000c001', recordId: '0190a1b2-0001-7000-8000-00000000e001', kind: 'entry', field: 'values.slider', value: 'Unterlegen-Wert-7', at: '2026-11-10T08:00:00.000Z' },
              { id: '0190a1b2-0002-7000-8000-00000000c002', recordId: '0190a1b2-0002-7000-8000-00000000e002', kind: 'template', field: 'name', value: 'Alter Name', at: '2026-11-11T08:00:00.000Z' },
            ];
            for (const r of rows) {
              const payload = { id: r.id, recordId: r.recordId, kind: r.kind, losingPayload: { field: r.field, losingValue: r.value, losingHlc: 'a', winningHlc: 'b' }, resolvedAt: r.at, seenByUser: false };
              tx.objectStore('records').put({ id: r.id, diaryId, kind: 'conflictLog', rev: 0, deleted: 0, codec: 'plain', payload: JSON.stringify(payload), localUpdatedAt: Date.now() });
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          };
        };
      }),
  );
}

test.describe('Konfliktprotokoll', () => {
  test.describe.configure({ timeout: 90_000 });

  test('UI-18: Einstellungen listen Konflikte, Start zeigt Banner, Öffnen markiert als gesehen', async ({ page }) => {
    await onboardWithPassword(page);
    await expect(page.getByTestId('conflict-banner')).toHaveCount(0);
    await seedConflicts(page);
    await go(page, '/more');
    await go(page, '/');
    const banner = page.getByTestId('conflict-banner');
    await expect(banner).toContainText('2 Konflikte');

    await go(page, '/more/settings');
    await page.getByRole('link', { name: 'Konfliktprotokoll' }).click();
    await expect(page.getByTestId('conflict-row')).toHaveCount(2);
    await expect(page.getByTestId('conflict-row').first()).toContainText('Vorlage');
    await expect(page.getByTestId('conflict-row').last()).toContainText('Eintrag');
    await expect(page.getByTestId('conflict-row').last()).toContainText('Unterlegen-Wert-7');
    await expect(page.getByTestId('conflict-row').last()).toContainText('values.slider');

    await go(page, '/more');
    await go(page, '/');
    await expect(page.getByTestId('conflict-banner')).toHaveCount(0);
    await go(page, '/more/settings/konflikte');
    await expect(page.getByTestId('conflict-row')).toHaveCount(2);
    await expect(page.getByText('Neu', { exact: true })).toHaveCount(0);
  });
});
