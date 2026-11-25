// RDM-034: Vorlagen strikt pro Tagebuch (BLK-58/59/60) und persönlicher Vorlagenkatalog (BLK-62/63, SHR-21).
import { test, expect, type Page } from '@playwright/test';
import { addDeviceWithBackupCode, addVirtualAuthenticator, foreground, go, inviteMember, onboardWithCloud, onboardWithPassword, uniqueUser } from './helpers';

const switcherOf = (page: Page) => page.getByLabel('Tagebuch', { exact: true });

async function createDiary(page: Page, name: string, template: RegExp, expectedCards: number) {
  await go(page, '/more/diaries/new');
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: template }).click();
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(page.getByTestId('diary-card')).toHaveCount(expectedCards);
}

/** Sync abgeschlossen (Status steht nur in der Titelzeile der Tab-Seiten, RDM-028 P1). */
async function synced(page: Page) {
  await go(page, '/');
  await foreground(page);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-state', 'synced', { timeout: 20_000 });
}

async function selectOnStart(page: Page, diary: string) {
  await go(page, '/');
  await switcherOf(page).selectOption({ label: diary });
}

async function renameTemplate(page: Page, from: string, to: string) {
  await go(page, '/more/templates');
  await page.getByRole('link', { name: `${from} bearbeiten` }).click();
  await page.getByLabel('Name', { exact: true }).fill(to);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { name: 'Vorlagen', exact: true })).toBeVisible();
}

test.describe('Vorlagen strikt pro Tagebuch', () => {
  test.describe.configure({ timeout: 120_000 });

  test('BLK-58: Start und „Neuer Eintrag“ zeigen nur Vorlagen des gewählten Tagebuchs', async ({ page }) => {
    await onboardWithPassword(page);
    // T1: zwei Vorlagen, T2: eine
    await go(page, '/more/templates');
    await page.getByTestId('catalog-builtin').getByRole('button', { name: /Kopfschmerz-Tagebuch/ }).click();
    await expect(page.getByTestId('template-row')).toHaveCount(2);
    await createDiary(page, 'Katzentagebuch', /Migräne-Tracking/, 2);

    await selectOnStart(page, 'Mein Tagebuch');
    const tiles = page.getByTestId('template-tile');
    await expect(tiles).toHaveText(['Allgemeines Schmerz-Tagebuch', 'Kopfschmerz-Tagebuch']);
    await expect(page.getByRole('link', { name: /Schnell/ })).toHaveCount(1);
    await expect(page.getByRole('link', { name: /Schnell/ })).toHaveAttribute('href', /\/quick\?diary=/);
    // Neuer Eintrag: nur T1; Wischen/Vorlagenwahl bleibt innerhalb dieser Liste
    await go(page, '/entry/new');
    await expect(page.getByRole('button', { name: 'Kopfschmerz-Tagebuch' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Migräne-Tracking' })).toHaveCount(0);

    await selectOnStart(page, 'Katzentagebuch');
    await expect(tiles).toHaveText(['Migräne-Tracking']);
    await expect(page.getByRole('link', { name: /Schnell/ })).toHaveCount(1);
    await go(page, '/entry/new');
    await expect(page.getByText('Begleitsymptome', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Allgemeines Schmerz-Tagebuch' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Kopfschmerz-Tagebuch' })).toHaveCount(0);
  });

  test('BLK-59: Bearbeiten/Duplizieren nutzt das Tagebuch des Eintrags; ?template= aus T2 schaltet auf T2 um', async ({ page }) => {
    await onboardWithPassword(page);
    await createDiary(page, 'Katzentagebuch', /Migräne-Tracking/, 2);
    // Eintrag in T2
    await selectOnStart(page, 'Katzentagebuch');
    const t2Template = new URL((await page.getByTestId('template-tile').first().getAttribute('href'))!, 'http://x').searchParams.get('template')!;
    await go(page, '/entry/new');
    await page.getByLabel(/Schmerzstärke/).fill('4');
    await page.getByLabel('Notizen').fill('Katze');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('entry-time')).toBeVisible();

    // T1 wählen, dann den T2-Eintrag bearbeiten bzw. duplizieren
    await selectOnStart(page, 'Mein Tagebuch');
    await go(page, '/history');
    await switcherOf(page).selectOption({ label: 'Alle Tagebücher' });
    await page.getByTestId('entry-row').filter({ hasText: 'Migräne-Tracking' }).click();
    await page.getByRole('link', { name: 'Bearbeiten' }).click();
    await expect(page.getByText('Begleitsymptome', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Allgemeines Schmerz-Tagebuch' })).toHaveCount(0);
    await page.goBack();
    await page.getByRole('link', { name: 'Duplizieren' }).click();
    await expect(page.getByText('Begleitsymptome', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Allgemeines Schmerz-Tagebuch' })).toHaveCount(0);

    // Deep-Link auf eine T2-Vorlage bei gewähltem T1 → Umschalter steht danach auf T2
    await selectOnStart(page, 'Mein Tagebuch');
    await go(page, `/entry/new?template=${t2Template}`);
    await expect(page.getByText('Begleitsymptome', { exact: true })).toBeVisible();
    await go(page, '/');
    await expect(switcherOf(page).locator('option:checked')).toHaveText('Katzentagebuch');
    await expect(page.getByTestId('template-tile')).toHaveText(['Migräne-Tracking']);
  });
});

test.describe('Vorlagenkatalog', () => {
  test.describe.configure({ timeout: 120_000 });

  test('BLK-62: hinzufügen, daraus unabhängig anlegen, aktualisieren, als neuen Eintrag, entfernen', async ({ page }) => {
    await onboardWithPassword(page);
    await go(page, '/more/templates');
    await expect(page.getByTestId('catalog-own')).toHaveCount(0);
    await page.getByRole('button', { name: 'Allgemeines Schmerz-Tagebuch zum Vorlagenkatalog hinzufügen' }).click();
    await expect(page.getByTestId('catalog-status')).toHaveText('„Allgemeines Schmerz-Tagebuch“ wurde zum Vorlagenkatalog hinzugefügt.');
    const own = page.getByTestId('catalog-own-row');
    await expect(own).toHaveCount(1);
    await expect(own).toContainText('3 Felder');

    // Bibliothek ist kein Tagebuch: weder in Mehr → Tagebücher noch im Umschalter
    await go(page, '/more/diaries');
    await expect(page.getByTestId('diary-card')).toHaveCount(1);

    // Neues Tagebuch mit der eigenen Vorlage aus dem Vorlagenkatalog
    await createDiary(page, 'Zweitbuch', /3 Felder/, 2);
    await go(page, '/');
    await expect(switcherOf(page).locator('option')).toHaveText(['Mein Tagebuch', 'Zweitbuch']);
    await switcherOf(page).selectOption({ label: 'Zweitbuch' });
    await expect(page.getByTestId('template-tile')).toHaveText(['Allgemeines Schmerz-Tagebuch']);

    // Unabhängig: Änderung in Zweitbuch ändert weder Original noch Vorlagenkatalog
    await renameTemplate(page, 'Allgemeines Schmerz-Tagebuch', 'Zweitbuch-Vorlage');
    await expect(own).toHaveText(/Allgemeines Schmerz-Tagebuch/);
    await switcherOf(page).selectOption({ label: 'Mein Tagebuch' });
    await expect(page.getByTestId('template-row')).toHaveText([/Allgemeines Schmerz-Tagebuch/]);

    // Original ändern, erneut hinzufügen → „Im Vorlagenkatalog aktualisieren“
    await renameTemplate(page, 'Allgemeines Schmerz-Tagebuch', 'Mein Schmerz');
    await page.getByRole('button', { name: 'Mein Schmerz zum Vorlagenkatalog hinzufügen' }).click();
    await expect(page.getByRole('dialog')).toContainText('ist schon im Vorlagenkatalog');
    await page.getByRole('button', { name: 'Im Vorlagenkatalog aktualisieren' }).click();
    await expect(page.getByTestId('catalog-status')).toHaveText('„Mein Schmerz“ wurde im Vorlagenkatalog aktualisiert.');
    await expect(own).toHaveCount(1);
    await expect(own).toContainText('Mein Schmerz');

    // … oder als neuen Eintrag
    await page.getByRole('button', { name: 'Mein Schmerz zum Vorlagenkatalog hinzufügen' }).click();
    await page.getByRole('button', { name: 'Als neuen Eintrag hinzufügen' }).click();
    await expect(own).toHaveCount(2);

    // Aus dem Vorlagenkatalog im gewählten Tagebuch anlegen
    await own.first().getByRole('button', { name: 'Mein Schmerz 3 Felder' }).click();
    await expect(page.getByTestId('template-row')).toHaveCount(2);

    // Entfernen mit Bestätigung
    await own.first().getByRole('button', { name: 'Mein Schmerz aus dem Vorlagenkatalog entfernen' }).click();
    await expect(page.getByRole('dialog')).toContainText('aus dem Vorlagenkatalog entfernen?');
    await page.getByRole('dialog').getByRole('button', { name: 'Entfernen' }).click();
    await expect(own).toHaveCount(1);
    await expect(page.getByTestId('template-row')).toHaveCount(2);
  });

  test('BLK-63: Vorlagenkatalog auf zwei Geräten desselben Kontos synchron', async ({ page: a, browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'Virtueller Authenticator mit PRF nur über CDP (Chromium)');
    await addVirtualAuthenticator(a);
    const user = uniqueUser('cat63');
    const code = await onboardWithCloud(a, user);
    const b = await addDeviceWithBackupCode(browser, user, code);
    const ownRows = async (page: Page) => {
      await synced(page);
      await go(page, '/more/templates');
      return page.getByTestId('catalog-own-row').allTextContents();
    };

    await go(a, '/more/templates');
    await a.getByRole('button', { name: 'Allgemeines Schmerz-Tagebuch zum Vorlagenkatalog hinzufügen' }).click();
    await expect(a.getByTestId('catalog-own-row')).toHaveCount(1);
    await expect.poll(async () => (await ownRows(b)).join('|'), { timeout: 45_000, intervals: [1000, 2000] }).toContain('Allgemeines Schmerz-Tagebuch');

    // Aktualisieren
    await renameTemplate(a, 'Allgemeines Schmerz-Tagebuch', 'Neu benannt');
    await a.getByRole('button', { name: 'Neu benannt zum Vorlagenkatalog hinzufügen' }).click();
    await a.getByRole('button', { name: 'Im Vorlagenkatalog aktualisieren' }).click();
    await expect(a.getByTestId('catalog-own-row')).toContainText('Neu benannt');
    await expect.poll(async () => (await ownRows(b)).join('|'), { timeout: 45_000, intervals: [1000, 2000] }).toContain('Neu benannt');

    // Entfernen
    await a.getByRole('button', { name: 'Neu benannt aus dem Vorlagenkatalog entfernen' }).click();
    await a.getByRole('dialog').getByRole('button', { name: 'Entfernen' }).click();
    await expect(a.getByTestId('catalog-own-row')).toHaveCount(0);
    await expect.poll(async () => (await ownRows(b)).length, { timeout: 45_000, intervals: [1000, 2000] }).toBe(0);
  });

  test('SHR-21 + BLK-60: geänderte Vorlage des geteilten Tagebuchs kommt beim Mitglied an, nur dort; Mitglied (viewer) kopiert sie in den eigenen Vorlagenkatalog', async ({ page: a, browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'zwei Konten mit virtuellem Authenticator (Chromium)');
    const SHARED = 'Gemeinsames Tagebuch';
    await addVirtualAuthenticator(a);
    await onboardWithCloud(a, uniqueUser('shr21-o'));
    await go(a, '/more/diaries');
    await a.getByTestId('diary-card').getByRole('link', { name: 'Einstellungen' }).click();
    await a.getByLabel('Name').fill(SHARED);
    await a.getByRole('button', { name: 'Speichern' }).click();
    await expect(a.getByText('Gespeichert.')).toBeVisible();
    const { page: b } = await inviteMember(a, browser, uniqueUser('shr21-m'), 2, 'Darf lesen');

    // Owner ändert die Vorlage im geteilten Tagebuch
    await renameTemplate(a, 'Allgemeines Schmerz-Tagebuch', 'Geteilte Vorlage');
    await synced(a);

    // Mitglied: Änderung kommt im geteilten Tagebuch an (R4)
    await expect
      .poll(
        async () => {
          await foreground(b);
          await synced(b);
          await go(b, '/more/templates');
          await switcherOf(b).selectOption({ label: SHARED });
          // Liste lädt nach dem Umschalten neu
          await b.waitForTimeout(1000);
          return b.getByTestId('template-row').allTextContents();
        },
        { timeout: 45_000, intervals: [1000, 2000] },
      )
      .toEqual([expect.stringContaining('Geteilte Vorlage')]);

    // … und nur dort: Start im eigenen Tagebuch zeigt sie nicht
    await selectOnStart(b, 'Mein Tagebuch');
    await expect(b.getByTestId('template-tile')).toHaveText(['Allgemeines Schmerz-Tagebuch']);

    // BLK-60: geteiltes Tagebuch nur lesbar → keine Kacheln, keine Schnell-Buttons, Hinweis; „Übungen“ bleibt
    await selectOnStart(b, SHARED);
    await expect(b.getByTestId('start-read-only')).toHaveText('In diesem Tagebuch kannst du nur lesen.');
    await expect(b.getByTestId('template-tile')).toHaveCount(0);
    await expect(b.getByRole('link', { name: /Schnell/ })).toHaveCount(0);
    await expect(b.getByTestId('training-tile')).toBeVisible();

    // Mitglied (viewer) übernimmt die Vorlage als Kopie in den eigenen Vorlagenkatalog
    await go(b, '/more/templates');
    await switcherOf(b).selectOption({ label: SHARED });
    await b.getByRole('button', { name: 'Geteilte Vorlage zum Vorlagenkatalog hinzufügen' }).click();
    await expect(b.getByTestId('catalog-own-row')).toContainText('Geteilte Vorlage');

    // Owner sieht den Vorlagenkatalog des Mitglieds nicht
    await foreground(a);
    await go(a, '/more/templates');
    await expect(a.getByTestId('template-row')).toHaveCount(1);
    await expect(a.getByTestId('catalog-own-row')).toHaveCount(0);

    // BLK-60: /quick ohne Parameter bei nur lesbarem gewähltem Tagebuch → Auswahl der beschreibbaren
    await createDiary(b, 'Zweitbuch', /Migräne-Tracking/, 3);
    await selectOnStart(b, SHARED);
    await go(b, '/quick');
    await expect(b.getByTestId('quick-diary-choice').getByRole('link')).toHaveCount(2);
  });
});
