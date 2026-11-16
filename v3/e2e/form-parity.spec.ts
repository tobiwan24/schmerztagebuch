import { test, expect, type Page } from '@playwright/test';
import { go, onboardWithPassword } from './helpers';

const OPT_RED = '0190a1b2-0000-7000-8000-0000000000b1';
const OPT_BLUE = '0190a1b2-0000-7000-8000-0000000000b2';
const BLOCK_MS = '0190a1b2-0000-7000-8000-0000000000b3';

/** Nur im Test: Slider mit Info-Hinweis, Notizen ohne sichtbares Label, Auswahlfeld mit Farben (Editor-Pfad: BLK-24/43). */
async function patchTemplate(page: Page): Promise<void> {
  await page.evaluate(
    ([red, blue, ms]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('stb-v3');
        open.onsuccess = () => {
          const tx = open.result.transaction('records', 'readwrite');
          const store = tx.objectStore('records');
          const all = store.getAll();
          all.onsuccess = () => {
            for (const r of all.result as { kind: string; payload: string }[]) {
              if (r.kind !== 'templateVersion') continue;
              const v = JSON.parse(r.payload) as { blocks: { label: string; type: string; config: Record<string, unknown>; hideLabel?: boolean }[] };
              for (const b of v.blocks) {
                if (b.type === 'slider') b.config.infoText = 'Skala von 0 (kein Schmerz) bis 10 (stärkster Schmerz)';
                if (b.label === 'Notizen') b.hideLabel = true;
              }
              v.blocks.push({
                id: ms, label: 'Auslöser', type: 'multiselect', required: false, order: 'z',
                config: { multiple: true, options: [{ id: red, label: 'Stress', color: '#ef4444' }, { id: blue, label: 'Wetter', color: '#3b82f6' }] },
              } as never);
              store.put({ ...r, payload: JSON.stringify(v) });
            }
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    [OPT_RED, OPT_BLUE, BLOCK_MS],
  );
}

/** Kontrastverhältnis (WCAG) von Text- und Hintergrundfarbe eines Elements; Farben über ein Canvas nach RGB aufgelöst. */
async function contrastOf(page: Page, name: string): Promise<number> {
  return page.getByRole('button', { name, exact: true }).evaluate((el) => {
    const toRgb = (css: string): [number, number, number] => {
      const c = document.createElement('canvas').getContext('2d')!;
      c.fillStyle = '#000';
      c.fillStyle = css;
      c.fillRect(0, 0, 1, 1);
      const d = c.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!];
    };
    const lum = ([r, g, b]: [number, number, number]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const cs = getComputedStyle(el);
    const a = lum(toRgb(cs.color));
    const b = lum(toRgb(cs.backgroundColor));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

test.describe('Eintragsformular: Parität', () => {
  test.describe.configure({ timeout: 90_000 });

  test('BLK-41: Info-Hinweis am Slider, Optionsfarben (AA, gewählt unterscheidbar), Label ausgeblendet mit zugänglichem Namen', async ({ page }) => {
    await onboardWithPassword(page);
    await patchTemplate(page);
    await go(page, '/entry/new');

    // Info-Hinweis: aufklappbar
    const info = page.getByRole('button', { name: 'Info anzeigen' });
    await expect(page.getByRole('note')).toHaveCount(0);
    await info.click();
    await expect(page.getByRole('button', { name: 'Info ausblenden' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('note')).toContainText('Skala von 0');
    await page.getByRole('button', { name: 'Info ausblenden' }).click();
    await expect(page.getByRole('note')).toHaveCount(0);

    // hideLabel: kein sichtbares Label, aber zugänglicher Name
    await expect(page.locator('label', { hasText: 'Notizen' })).toHaveClass(/sr-only/);
    await expect(page.getByLabel('Notizen')).toBeVisible();
    await expect(page.locator('label', { hasText: 'Auslöser' })).not.toHaveClass(/sr-only/);

    // Optionsfarben: nicht gewählt und gewählt jeweils AA, gewählt ist am Häkchen und am Zustand erkennbar
    const stress = page.getByRole('button', { name: 'Stress', exact: true });
    const wetter = page.getByRole('button', { name: 'Wetter', exact: true });
    const idleBg = await stress.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await contrastOf(page, 'Stress')).toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf(page, 'Wetter')).toBeGreaterThanOrEqual(4.5);
    await stress.click();
    await expect(stress).toHaveAttribute('aria-pressed', 'true');
    await expect(wetter).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => stress.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(idleBg);
    // `transition-all` am Button: Farben laufen kurz — abwarten, bis der Endwert erreicht ist.
    await expect.poll(() => contrastOf(page, 'Stress')).toBeGreaterThanOrEqual(4.5);
    await expect(stress.locator('svg')).toHaveCount(1);
    await expect(wetter.locator('svg')).toHaveCount(0);
  });
});
