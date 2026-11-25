import { test, expect, type Page } from '@playwright/test';
import { go, onboardWithPassword, pickDate, pickDateTime } from './helpers';

/** Nur im Test: ersten Block der Vorlagenversion zum Pflichtfeld machen (Vorlagen-Editor folgt in M8). */
async function makeFirstBlockRequired(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('stb-v3');
        open.onsuccess = () => {
          const tx = open.result.transaction('records', 'readwrite');
          const store = tx.objectStore('records');
          const all = store.getAll();
          all.onsuccess = () => {
            for (const r of all.result as { kind: string; payload: string }[]) {
              if (r.kind !== 'templateVersion') continue;
              const v = JSON.parse(r.payload) as { blocks: { order: string; required: boolean }[] };
              const first = [...v.blocks].sort((a, b) => (a.order < b.order ? -1 : 1))[0]!;
              first.required = true;
              store.put({ ...r, payload: JSON.stringify(v) });
            }
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

/** Nur im Test: zweite Vorlage als Kopie der ersten (Vorlagen-UI folgt in M8). */
async function addSecondTemplate(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const id = '0190a1b2-0000-7000-8000-0000000000aa';
        const open = indexedDB.open('stb-v3');
        open.onsuccess = () => {
          const tx = open.result.transaction('records', 'readwrite');
          const store = tx.objectStore('records');
          const all = store.getAll();
          all.onsuccess = () => {
            for (const r of all.result as { id: string; kind: string; payload: string }[]) {
              if (r.kind === 'template') {
                const t = JSON.parse(r.payload) as Record<string, unknown>;
                store.put({ ...r, id, payload: JSON.stringify({ ...t, id, name: 'Zweite Vorlage', order: 'z' }) });
              }
              if (r.kind === 'templateVersion') {
                const v = JSON.parse(r.payload) as Record<string, unknown>;
                store.put({ ...r, id: `${id}.v1`, payload: JSON.stringify({ ...v, templateId: id }) });
              }
            }
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

const save = (page: Page) => page.getByRole('button', { name: 'Speichern' }).click();

test.describe('Eintragsformular', () => {
  test.beforeEach(async ({ page }) => {
    await onboardWithPassword(page);
  });

  test('BLK-07: Pflichtfeld leer → Speichern blockiert, Hinweis am Feld', async ({ page }) => {
    await makeFirstBlockRequired(page);
    await go(page, '/entry/new');
    await save(page);
    const field = page.getByTestId('block-field').filter({ hasText: 'Schmerzstärke' });
    await expect(field.getByRole('alert')).toHaveText('Pflichtfeld – bitte ausfüllen.');
    await expect(page.getByLabel(/Schmerzstärke/)).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL(/\/entry\/new$/);

    await page.getByLabel(/Schmerzstärke/).fill('6');
    await save(page);
    await expect(page.getByTestId('entry-time')).toBeVisible();
    await expect(page.getByTestId('entry-field').filter({ hasText: 'Schmerzstärke' })).toContainText('6');
  });

  test('BLK-09: Warnung nur nach echter Änderung, nicht nach bloßem Öffnen oder Vorlagenwechsel ohne Eingabe', async ({ page }) => {
    // Navigation per Link (wie in der App) — nur Router-Navigationen lassen sich abfangen.
    const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
    const openNew = () => page.getByTestId('template-tile').first().click();

    // bloßes Öffnen → keine Warnung
    await openNew();
    await expect(page.getByRole('button', { name: 'Speichern' })).toBeVisible();
    await page.getByRole('button', { name: 'Zurück' }).click();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Vorlagenwechsel ohne Eingabe → keine Warnung
    await addSecondTemplate(page);
    await openNew();
    await page.getByRole('button', { name: 'Zweite Vorlage' }).click();
    await expect(page.getByRole('button', { name: 'Zweite Vorlage' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Allgemeines Schmerz-Tagebuch' }).click();
    await page.getByRole('button', { name: 'Zurück' }).click();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // echte Änderung → Warnung; „Weiter bearbeiten" bleibt im Formular
    await openNew();
    await page.getByLabel('Notizen').fill('nach dem Aufstehen');
    await page.getByRole('button', { name: 'Zurück' }).click();
    await expect(page.getByRole('dialog')).toContainText('Änderungen verwerfen?');
    await page.getByRole('button', { name: 'Weiter bearbeiten' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/entry\/new(?:\?template=[^/]+)?$/);
    await expect(page.getByLabel('Notizen')).toHaveValue('nach dem Aufstehen');

    // Zeitangabe geändert → ebenfalls Warnung (auch über die untere Navigation)
    await page.getByLabel('Notizen').fill('');
    const timeField = page.getByLabel('Zeitpunkt: Uhrzeit', { exact: true });
    const initialTime = await timeField.inputValue();
    await timeField.fill(initialTime === '10:00' ? '11:00' : '10:00');
    await nav.getByRole('link', { name: 'Verlauf' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Weiter bearbeiten' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Änderung zurückgenommen (Ausgangswert) → keine Warnung
    await timeField.fill(initialTime);
    await nav.getByRole('link', { name: 'Verlauf' }).click();
    await expect(page.getByRole('heading', { name: 'Verlauf' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // „Verwerfen" verlässt das Formular (neue Einträge starten über die Vorlagen-Kacheln auf Start, UI-25)
    await nav.getByRole('link', { name: 'Start' }).click();
    await openNew();
    await page.getByLabel('Notizen').fill('x');
    await nav.getByRole('link', { name: 'Start' }).click();
    await page.getByRole('button', { name: 'Verwerfen' }).click();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
  });

  test('BLK-19: Zeitpunkt nachtragen und Zeitraum mit/ohne Uhrzeiten werden gespeichert und in Verlauf/Detail angezeigt', async ({ page }) => {
    // vergangener Zeitpunkt (Nachtragen)
    await go(page, '/entry/new');
    await pickDateTime(page, 'Zeitpunkt', '2026-02-20T21:30');
    await page.getByLabel(/Schmerzstärke/).fill('3');
    await save(page);
    await expect(page.getByTestId('entry-time')).toHaveText('20.02.2026, 21:30');

    // Zeitraum ganztägig
    await go(page, '/entry/new');
    await page.getByRole('button', { name: 'Zeitraum' }).click();
    await pickDate(page, 'Beginn', '2026-03-02');
    await pickDate(page, 'Ende', '2026-03-04');
    await save(page);
    await expect(page.getByTestId('entry-time')).toContainText('02.03.2026 – 04.03.2026');
    await expect(page.getByTestId('entry-time')).toContainText('Zeitraum');

    // Zeitraum mit Uhrzeiten; Ende vor Beginn wird abgelehnt
    await go(page, '/entry/new');
    await page.getByRole('button', { name: 'Zeitraum' }).click();
    await page.getByLabel('Mit Uhrzeit').check();
    await pickDateTime(page, 'Beginn', '2026-03-10T18:00');
    await pickDateTime(page, 'Ende', '2026-03-10T08:00');
    await save(page);
    await expect(page.getByText('Das Ende liegt vor dem Beginn.')).toBeVisible();
    await page.getByLabel('Ende: Uhrzeit', { exact: true }).fill('22:15');
    await save(page);
    await expect(page.getByTestId('entry-time')).toContainText('10.03.2026, 18:00 – 22:15');

    // Verlauf: neueste zuerst, Datum in der Card (keine Tagesüberschriften, RDM-028 P3); Zeitraum unter seinem Beginn
    await go(page, '/history');
    const rows = page.getByTestId('entry-row');
    await expect(page.getByTestId('entry-day')).toHaveCount(0);
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('10.03.2026, 18:00 – 22:15 · Zeitraum');
    await expect(rows.nth(1)).toContainText('02.03.2026 – 04.03.2026 · Zeitraum');
    await expect(rows.nth(2)).toContainText('20.02.2026, 21:30');

    // Bearbeiten behält die Zeitangabe
    await rows.nth(2).click();
    await page.getByRole('link', { name: 'Bearbeiten' }).click();
    await expect(page.getByLabel('Zeitpunkt', { exact: true })).toHaveText('20.02.2026');
    await expect(page.getByLabel('Zeitpunkt: Uhrzeit', { exact: true })).toHaveValue('21:30');
    await pickDateTime(page, 'Zeitpunkt', '2026-02-19T07:05');
    await save(page);
    await expect(page.getByTestId('entry-time')).toHaveText('19.02.2026, 07:05');
  });
  test('RDM-028 P5: Detailansicht zeigt Datum und Uhrzeit als Titel, darunter den Vorlagennamen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await go(page, '/entry/new');
    await pickDateTime(page, 'Zeitpunkt', '2026-02-20T21:30');
    await page.getByLabel(/Schmerzstärke/).fill('3');
    await save(page);
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toContainText('20.02.2026, 21:30');
    await expect(page.getByRole('heading', { name: 'Eintrag', exact: true })).toHaveCount(0);
    const title = await h1.boundingBox();
    const sub = await page.locator('header p').first().boundingBox();
    await expect(page.locator('header p').first()).toBeVisible();
    expect(sub!.y).toBeGreaterThanOrEqual(title!.y + title!.height - 1);

    // Zeitraum über zwei Tage: bricht um statt abgeschnitten zu werden
    await go(page, '/entry/new');
    await page.getByRole('button', { name: 'Zeitraum' }).click();
    await page.getByLabel('Mit Uhrzeit').check();
    await pickDateTime(page, 'Beginn', '2026-03-02T18:00');
    await pickDateTime(page, 'Ende', '2026-03-04T08:00');
    await save(page);
    await expect(page.getByTestId('entry-time')).toContainText('Zeitraum');
    await expect(h1).toHaveAccessibleName(/\d{2}:\d{2} Zeitraum$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    const fits = await h1.evaluate((el) => ({ over: el.scrollWidth > el.clientWidth, ellipsis: getComputedStyle(el).textOverflow }));
    expect(fits.over).toBe(false);
    expect(fits.ellipsis).not.toBe('ellipsis');
  });
});
