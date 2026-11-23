import { test, expect, type Page } from '@playwright/test';
import { go, lockViaSettings, onboardWithPassword, PASSWORD } from './helpers';

type Json = Record<string, unknown> & { id: string; currentVersion: number; quickBlockIds?: string[]; blocks: { label: string; id: string }[]; settings: Record<string, unknown> };

/** Liest alle Records einer Art; mit `edit` (Funktionsquelltext) schreibt sie zurück (plain-Codec, JSON-Payload). */
async function records(page: Page, kind: string, edit: string | null = null): Promise<Json[]> {
  return page.evaluate(
    ([k, src]) =>
      new Promise<Json[]>((resolve) => {
        const fn = src ? (new Function(`return (${src})`)() as (p: Json) => Json) : null;
        const open = indexedDB.open('stb-v3');
        open.onsuccess = () => {
          const store = open.result.transaction('records', 'readwrite').objectStore('records');
          const all = store.getAll();
          all.onsuccess = () => {
            const rows = (all.result as { kind: string; payload: string }[]).filter((r) => r.kind === k);
            if (fn) for (const r of rows) store.put({ ...r, payload: JSON.stringify(fn(JSON.parse(r.payload))) });
            resolve(rows.map((r) => JSON.parse(r.payload)));
          };
        };
      }),
    [kind, edit] as const,
  );
}

const card = (page: Page, label: string) => page.getByTestId('block-editor-card').filter({ has: page.locator(`input[value="${label}"]`) });

test.describe('Schnelleintrag im Vorlagen-Editor und Vorlagenwahl', () => {
  test.describe.configure({ timeout: 90_000 });

  test('BLK-45: Schalter im Editor bestimmt die Felder, keine neue Version; Tagebuch-Einstellung entfällt und wird migriert', async ({ page }) => {
    await onboardWithPassword(page);

    // Standardregel ohne Auswahl
    await go(page, '/quick');
    await expect(page.getByLabel(/Schmerzstärke/)).toBeVisible();
    await expect(page.getByLabel('Notizen')).toHaveCount(0);

    // Editor: Notizen + Schmerzstärke, Reihenfolge folgt der Vorlage
    await go(page, '/more/templates');
    await page.getByRole('link', { name: 'Allgemeines Schmerz-Tagebuch bearbeiten' }).click();
    await card(page, 'Notizen').getByLabel('Im Schnelleintrag').check();
    await card(page, 'Schmerzstärke').getByLabel('Im Schnelleintrag').check();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen' })).toBeVisible();
    const [tpl] = await records(page, 'template');
    expect(tpl!.currentVersion).toBe(1);
    expect(tpl!.quickBlockIds).toHaveLength(2);

    await go(page, '/quick');
    await expect(page.getByLabel('Notizen')).toBeVisible();
    const labels = await page.getByTestId('block-field').locator('label').allTextContents();
    expect(labels.findIndex((l) => /Schmerzstärke/.test(l))).toBeLessThan(labels.findIndex((l) => /Notizen/.test(l)));

    // Auswahl bleibt im Editor erhalten; Tagebuch-Einstellungen bieten sie nicht mehr an
    await go(page, '/more/templates');
    await page.getByRole('link', { name: 'Allgemeines Schmerz-Tagebuch bearbeiten' }).click();
    await expect(card(page, 'Notizen').getByLabel('Im Schnelleintrag')).toBeChecked();
    await go(page, '/more/diaries');
    await page.getByTestId('diary-card').getByRole('link', { name: 'Einstellungen' }).click();
    await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Vorlage für den Schnelleintrag')).toHaveCount(0);

    // Migration: frühere Tagebuch-Einstellung → Vorlage (nur wenn dort leer), nach dem Entsperren
    await records(page, 'template', '(p) => { delete p.quickBlockIds; return p; }');
    const [version] = await records(page, 'templateVersion');
    const notes = version!.blocks.find((b) => b.label === 'Notizen')!.id;
    await records(page, 'diary', `(p) => ({ ...p, settings: { ...p.settings, quickEntryTemplateId: ${JSON.stringify(tpl!.id)}, quickEntryBlockIds: [${JSON.stringify(notes)}] } })`);
    await lockViaSettings(page);
    await go(page, '/unlock');
    await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
    await expect.poll(async () => (await records(page, 'template'))[0]!.quickBlockIds, { timeout: 20_000 }).toEqual([notes]);
    await expect.poll(async () => (await records(page, 'diary'))[0]!.settings.quickEntryTemplateId).toBeUndefined();
    await go(page, '/quick');
    await expect(page.getByLabel('Notizen')).toBeVisible();
    await expect(page.getByLabel(/Schmerzstärke/)).toHaveCount(0);
  });

  test('BLK-46: Vorlagenwahl im Schnelleintrag, zuletzt genutzte vorausgewählt, Wechsel mit Eingaben nur nach Rückfrage', async ({ page }) => {
    await onboardWithPassword(page);
    // zweite Vorlage mit einem Slider „Stimmung"
    await go(page, '/more/templates/new');
    await page.getByLabel('Name', { exact: true }).fill('Zweite');
    await page.getByRole('group', { name: 'Feld hinzufügen' }).getByRole('button', { name: 'Slider', exact: true }).click();
    await page.getByRole('region', { name: /^Feld 1:/ }).getByLabel('Bezeichnung', { exact: true }).fill('Stimmung');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen' })).toBeVisible();

    await go(page, '/quick');
    const choice = page.getByTestId('quick-template-choice');
    await expect(choice.getByRole('button')).toHaveCount(2);
    await expect(choice.getByRole('button', { name: 'Allgemeines Schmerz-Tagebuch' })).toHaveAttribute('aria-pressed', 'true');

    // Wechsel ohne Eingaben: ohne Rückfrage
    await choice.getByRole('button', { name: 'Zweite' }).click();
    await expect(page.getByLabel(/Stimmung/)).toBeVisible();
    await expect(page.getByLabel(/Schmerzstärke/)).toHaveCount(0);

    // Wert eingeben, Wechsel zurück → Rückfrage; Weiter bearbeiten behält, Wechseln verwirft
    const slider = page.getByLabel(/Stimmung/);
    const box = (await slider.boundingBox())!;
    await slider.click({ position: { x: box.width * 0.5, y: box.height / 2 } });
    await choice.getByRole('button', { name: 'Allgemeines Schmerz-Tagebuch' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Weiter bearbeiten' }).click();
    await expect(page.getByLabel(/Stimmung/)).toBeVisible();
    await choice.getByRole('button', { name: 'Allgemeines Schmerz-Tagebuch' }).click();
    await page.getByRole('button', { name: 'Vorlage wechseln', exact: true }).click();
    await expect(page.getByLabel(/Schmerzstärke/)).toBeVisible();

    // Speichern in „Zweite" → beim nächsten Öffnen ist sie vorausgewählt
    await choice.getByRole('button', { name: 'Zweite' }).click();
    const s2 = page.getByLabel(/Stimmung/);
    const b2 = (await s2.boundingBox())!;
    await s2.click({ position: { x: b2.width * 0.5, y: b2.height / 2 } });
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
    await page.getByRole('link', { name: 'Schnell eintragen' }).click();
    await expect(page.getByTestId('quick-template-choice').getByRole('button', { name: 'Zweite' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel(/Stimmung/)).toBeVisible();
  });
  test('RDM-028 P2: /quick?template= wählt die Vorlage vor', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/more/templates/new');
    await page.getByLabel('Name', { exact: true }).fill('Zweite');
    await page.getByRole('group', { name: 'Feld hinzufügen' }).getByRole('button', { name: 'Slider', exact: true }).click();
    await page.getByRole('region', { name: /^Feld 1:/ }).getByLabel('Bezeichnung', { exact: true }).fill('Stimmung');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Vorlagen' })).toBeVisible();
    const second = (await records(page, 'template')).find((x) => x.name === 'Zweite')!;

    await go(page, `/quick?template=${second.id}`);
    const choice = page.getByTestId('quick-template-choice');
    await expect(choice.getByRole('button', { name: 'Zweite' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel(/Stimmung/)).toBeVisible();

    // Unbekannte ID: bisheriger Fallback (erste Vorlage)
    await go(page, '/quick?template=gibt-es-nicht');
    await expect(page.getByTestId('quick-template-choice').getByRole('button', { name: 'Allgemeines Schmerz-Tagebuch' })).toHaveAttribute('aria-pressed', 'true');
  });
});
