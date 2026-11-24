import { test, expect, type Page } from '@playwright/test';
import { go, onboardWithPassword } from './helpers';

async function storedEntries(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ meta: { source: string }; values: Record<string, unknown> }[]>((resolve) => {
        const open = indexedDB.open('stb-v3');
        open.onsuccess = () => {
          const all = open.result.transaction('records').objectStore('records').getAll();
          all.onsuccess = () =>
            resolve((all.result as { kind: string; payload: string }[]).filter((r) => r.kind === 'entry').map((r) => JSON.parse(r.payload)));
        };
      }),
  );
}

test.describe('Schnelleintrag', () => {
  test("BLK-10: von der Startseite in ≤ 3 Tipps gespeichert, meta.source = 'quick'", async ({ page }) => {
    await onboardWithPassword(page);
    let taps = 0;
    const tap = async (fn: () => Promise<void>) => {
      taps++;
      await fn();
    };

    await tap(() => page.getByRole('link', { name: 'Schnell eintragen' }).click());
    const slider = page.getByLabel(/Schmerzstärke/);
    const box = (await slider.boundingBox())!;
    await tap(() => slider.click({ position: { x: box.width * 0.6, y: box.height / 2 } }));
    await tap(() => page.getByRole('button', { name: 'Speichern' }).click());

    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
    expect(taps).toBeLessThanOrEqual(3);
    await go(page, '/history');
    await expect(page.getByTestId('entry-row')).toHaveCount(1);

    const [entry] = await storedEntries(page);
    expect(entry!.meta.source).toBe('quick');
    const values = Object.values(entry!.values);
    expect(values).toHaveLength(1);
    expect(typeof values[0]).toBe('number');

    // weitere Felder später im Eintrag ergänzbar
    await page.getByTestId('entry-row').click();
    await page.getByRole('link', { name: 'Bearbeiten' }).click();
    await page.getByLabel('Notizen').fill('später ergänzt');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('entry-field').filter({ hasText: 'Notizen' })).toContainText('später ergänzt');
    expect((await storedEntries(page))[0]!.meta.source).toBe('quick');
  });

  test('ohne Wert wird nichts gespeichert', async ({ page }) => {
    await onboardWithPassword(page);
    await page.getByRole('link', { name: 'Schnell eintragen' }).click();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Gib mindestens einen Wert ein.')).toBeVisible();
    expect(await storedEntries(page)).toEqual([]);
  });
});
