import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { go, onboardWithPassword } from './helpers';

const PNG = fileURLToPath(new URL('../apps/web/src/assets/bodymap/fuss-dorsal.png', import.meta.url));
const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetisch') });

/** Nur im Test: Ereignisse und/oder Anhänge der Textarea abschalten (Editor-Pfad: BLK-24). */
async function setTextareaConfig(page: Page, config: { allowEvents: boolean; allowAttachments: boolean }): Promise<void> {
  await page.evaluate(
    (cfg) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('stb-v3');
        open.onsuccess = () => {
          const tx = open.result.transaction('records', 'readwrite');
          const store = tx.objectStore('records');
          const all = store.getAll();
          all.onsuccess = () => {
            for (const r of all.result as { kind: string; payload: string }[]) {
              if (r.kind !== 'templateVersion') continue;
              const v = JSON.parse(r.payload) as { blocks: { type: string; config: Record<string, unknown> }[] };
              for (const b of v.blocks) if (b.type === 'textarea') Object.assign(b.config, cfg);
              store.put({ ...r, payload: JSON.stringify(v) });
            }
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    config,
  );
}

const save = (page: Page) => page.getByRole('button', { name: 'Speichern' }).click();

test.describe('Textarea: Ereignisse und Anhänge', () => {
  test.describe.configure({ timeout: 90_000 });
  test.beforeEach(async ({ page }) => {
    await onboardWithPassword(page);
  });

  test('BLK-31: Ereignis, Arztbesuch, Foto und PDF hinzufügen/entfernen; Detail zeigt Kategorien und öffnbare Anhänge', async ({ page }) => {
    await go(page, '/entry/new');
    await page.getByLabel('Notizen').fill('Spaziergang und Arzt');

    // Ereignis und Arztbesuch
    await page.getByRole('button', { name: 'Ereignis hinzufügen' }).click();
    await page.getByLabel('Titel').fill('Spaziergang');
    await page.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
    await page.getByRole('button', { name: 'Arztbesuch hinzufügen' }).click();
    await page.getByLabel('Titel').fill('Hausarzt');
    await page.getByLabel('Titel').press('Enter');
    await page.getByRole('button', { name: 'Ereignis hinzufügen' }).click();
    await page.getByLabel('Titel').fill('Wird entfernt');
    await page.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
    await expect(page.getByTestId('event-item')).toHaveCount(3);
    await page.getByRole('button', { name: 'Eintrag „Wird entfernt“ entfernen' }).click();
    await expect(page.getByTestId('event-item')).toHaveCount(2);

    // Foto (mit Vorschau) und PDF, ein weiteres PDF wieder entfernen
    const file = page.getByLabel('Datei auswählen');
    await file.setInputFiles(PNG);
    await expect(page.getByRole('img', { name: /Vorschau: fuss-dorsal\.png/ })).toBeVisible();
    await file.setInputFiles(pdf('Befund.pdf'));
    await file.setInputFiles(pdf('Unnötig.pdf'));
    await expect(page.getByTestId('attachment-item')).toHaveCount(3);
    await page.getByRole('button', { name: 'Anhang „Unnötig.pdf“ entfernen' }).click();
    await expect(page.getByTestId('attachment-item')).toHaveCount(2);

    await save(page);
    await expect(page.getByTestId('entry-time')).toBeVisible();
    const events = page.getByTestId('event');
    await expect(events).toHaveCount(2);
    await expect(events.filter({ hasText: 'Spaziergang' })).toContainText('Ereignis');
    await expect(events.filter({ hasText: 'Hausarzt' })).toContainText('Arztbesuch');
    const attachments = page.getByTestId('attachment');
    await expect(attachments).toHaveCount(2);
    await expect(attachments.filter({ hasText: 'Befund.pdf' }).getByRole('button', { name: 'Öffnen' })).toBeEnabled();
    await expect(page.getByText('Unnötig.pdf')).toHaveCount(0);

    // Bearbeiten: vorhandenen Anhang entfernen, Ereignis entfernen → Detail ohne beides
    await page.getByRole('link', { name: 'Bearbeiten' }).click();
    await expect(page.getByTestId('attachment-item')).toHaveCount(2);
    await page.getByRole('button', { name: 'Anhang „Befund.pdf“ entfernen' }).click();
    await page.getByRole('button', { name: 'Eintrag „Hausarzt“ entfernen' }).click();
    await save(page);
    await expect(page.getByTestId('attachment')).toHaveCount(1);
    await expect(page.getByTestId('event')).toHaveCount(1);
    await expect(page.getByText('Befund.pdf')).toHaveCount(0);
  });

  test('Anhänge öffnen im Dialog der App, ohne neues Fenster (iOS blockiert Pop-ups nach await)', async ({ page }) => {
    const popups: string[] = [];
    page.on('popup', (p) => popups.push(p.url()));
    await go(page, '/entry/new');
    await page.getByLabel('Notizen').fill('Mit Anhängen');
    const file = page.getByLabel('Datei auswählen');
    await file.setInputFiles(PNG);
    await file.setInputFiles(pdf('Befund.pdf'));
    await expect(page.getByTestId('attachment-item')).toHaveCount(2);
    await save(page);
    await expect(page.getByTestId('attachment')).toHaveCount(2);

    // Bild: Dialog mit geladenem <img>
    await page.getByTestId('attachment').filter({ hasText: 'fuss-dorsal.png' }).getByRole('button', { name: 'Öffnen' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const img = dialog.getByRole('img', { name: 'fuss-dorsal.png' });
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    await dialog.getByRole('button', { name: 'Schließen' }).click();
    await expect(dialog).toBeHidden();

    // PDF: Dialog mit echtem Link auf die Blob-URL
    await page.getByTestId('attachment').filter({ hasText: 'Befund.pdf' }).getByRole('button', { name: 'Öffnen' }).click();
    await expect(dialog).toBeVisible();
    const link = dialog.getByRole('link', { name: 'PDF öffnen' });
    await expect(link).toHaveAttribute('href', /^blob:/);
    await expect(link).toHaveAttribute('target', '_blank');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    expect(popups).toEqual([]);
  });

  test('BLK-31: zu große und unzulässige Dateien werden abgelehnt; Verwerfen schreibt nichts', async ({ page }) => {
    await go(page, '/entry/new');
    const file = page.getByLabel('Datei auswählen');
    await file.setInputFiles({ name: 'riesig.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(21 * 1024 * 1024) });
    await expect(page.getByRole('alert')).toContainText('größer als 20 MB');
    await file.setInputFiles({ name: 'notiz.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
    await expect(page.getByRole('alert')).toContainText('erlaubt sind Bilder und PDF');
    await expect(page.getByTestId('attachment-item')).toHaveCount(0);

    // Anhängen und Formular verwerfen (neu laden): nichts in blobs / blob_outbox / records(attachmentMeta)
    await file.setInputFiles(pdf('Flüchtig.pdf'));
    await expect(page.getByTestId('attachment-item')).toHaveCount(1);
    await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Verlauf' }).click();
    await page.getByRole('button', { name: 'Verwerfen' }).click();
    await expect(page.getByRole('heading', { name: 'Verlauf' })).toBeVisible();
    const counts = await page.evaluate(
      () =>
        new Promise<{ blobs: number; outbox: number; metas: number }>((resolve, reject) => {
          const open = indexedDB.open('stb-v3');
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction(['blobs', 'blob_outbox', 'records'], 'readonly');
            const blobs = tx.objectStore('blobs').count();
            const outbox = tx.objectStore('blob_outbox').count();
            const recs = tx.objectStore('records').getAll();
            tx.oncomplete = () => resolve({ blobs: blobs.result, outbox: outbox.result, metas: (recs.result as { kind: string }[]).filter((r) => r.kind === 'attachmentMeta').length });
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    expect(counts).toEqual({ blobs: 0, outbox: 0, metas: 0 });
  });

  test('RDM-030: Ereignis, Arztbesuch und Foto nur als Symbole nebeneinander, Beschriftung als Hinweis', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await go(page, '/entry/new');
    const names = ['Ereignis hinzufügen', 'Arztbesuch hinzufügen', 'Foto oder PDF anhängen'];
    const boxes = [];
    for (const name of names) {
      const b = page.getByRole('button', { name, exact: true });
      await expect(b).toHaveAttribute('title', name);
      await expect(b).toHaveText('');
      boxes.push((await b.boundingBox())!);
    }
    for (const b of boxes) expect(b.y).toBe(boxes[0]!.y);
    for (const b of boxes) expect(b.height).toBeGreaterThanOrEqual(44);
  });

  test('BLK-31: allowEvents/allowAttachments = false blendet die Knöpfe aus', async ({ page }) => {
    await setTextareaConfig(page, { allowEvents: false, allowAttachments: true });
    await go(page, '/entry/new');
    await expect(page.getByRole('button', { name: 'Ereignis hinzufügen' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Arztbesuch hinzufügen' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Foto oder PDF anhängen' })).toBeVisible();

    await go(page, '/history');
    await setTextareaConfig(page, { allowEvents: true, allowAttachments: false });
    await go(page, '/entry/new');
    await expect(page.getByRole('button', { name: 'Foto oder PDF anhängen' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ereignis hinzufügen' })).toBeVisible();
  });
});
