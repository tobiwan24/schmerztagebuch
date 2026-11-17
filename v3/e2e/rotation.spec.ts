// SHR-13: Mitglied entfernen → Rotation des Tagebuchschlüssels mit Fortschritt; das verbleibende Mitglied synchronisiert weiter,
// das entfernte bekommt 403 und keine neuen Daten. Drei Konten (Chromium, virtueller Authenticator).
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { addVirtualAuthenticator, go, onboardWithCloud, uniqueUser } from './helpers';

const foreground = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

async function addEntry(page: Page, pain: string, note: string) {
  await go(page, '/entry/new');
  await page.getByLabel(/Schmerzstärke/).fill(pain);
  await page.getByLabel('Notizen').fill(note);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByTestId('entry-time')).toBeVisible();
}

/** Anzahl Treffer der Verlaufssuche nach Text (nach einem Sync-Auslöser). */
async function hits(page: Page, text: string): Promise<number> {
  await foreground(page);
  await go(page, '/history');
  await page.getByLabel('Suchen').fill(text);
  return page.getByTestId('entry-row').count();
}

async function openMembers(page: Page) {
  await go(page, '/more/diaries');
  await page.getByTestId('diary-card').getByRole('link', { name: 'Mitglieder & Einladungen' }).click();
  await page.getByTestId('members-card').waitFor();
}

/** Lädt eine neue Person ein (Rolle „Darf eintragen“) und lässt sie annehmen; wartet, bis der Owner sie bestätigt hat. */
async function invite(owner: Page, browser: Browser, name: string, expectedMembers: number): Promise<{ ctx: BrowserContext; page: Page }> {
  await openMembers(owner);
  await owner.getByRole('button', { name: 'Darf eintragen' }).click();
  await owner.getByRole('button', { name: 'Einladungslink erzeugen' }).click();
  const hash = new URL((await owner.getByTestId('invite-link').textContent())!).hash;
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'de-DE' });
  const page = await ctx.newPage();
  await addVirtualAuthenticator(page);
  await onboardWithCloud(page, name);
  await go(page, `/invite${hash}`);
  await page.getByRole('button', { name: 'Einladung annehmen' }).click();
  await expect(page.getByTestId('invite-accepted')).toBeVisible();
  await expect
    .poll(
      async () => {
        await foreground(owner);
        await openMembers(owner);
        return owner.getByTestId('member').count();
      },
      { timeout: 45_000, intervals: [1000, 2000] },
    )
    .toBe(expectedMembers);
  return { ctx, page };
}

test.describe('DK-Rotation', () => {
  test.describe.configure({ timeout: 240_000 });
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'drei Konten mit virtuellem Authenticator (Chromium)');
  });

  test('SHR-13: Mitglied entfernen → Rotation mit Fortschritt; verbleibendes Mitglied synchronisiert weiter, entferntes bekommt 403 und nichts Neues', async ({ page: a, browser }) => {
    const owner = uniqueUser('rot-o');
    const stays = uniqueUser('rot-b');
    const leaves = uniqueUser('rot-c');
    await addVirtualAuthenticator(a);
    await onboardWithCloud(a, owner);
    await addEntry(a, '4', 'STB-ROT-VORHER');

    const b = await invite(a, browser, stays, 2);
    const c = await invite(a, browser, leaves, 3);
    const statuses: number[] = [];
    c.page.on('response', (r) => {
      if (r.url().includes('/api/v1/sync/pull')) statuses.push(r.status());
    });
    // beide Mitglieder sehen den ersten Eintrag
    await expect.poll(() => hits(b.page, 'STB-ROT-VORHER'), { timeout: 45_000, intervals: [1000, 2000] }).toBe(1);
    await expect.poll(() => hits(c.page, 'STB-ROT-VORHER'), { timeout: 45_000, intervals: [1000, 2000] }).toBe(1);

    // c entfernen → Rotation läuft und endet; Fortschritt sichtbar
    await openMembers(a);
    await a.getByTestId('member').filter({ hasText: leaves }).getByRole('button', { name: 'Entfernen' }).click();
    await a.getByRole('dialog').getByRole('button', { name: 'Entfernen' }).click();
    await expect(a.getByTestId('rotation-status')).toBeVisible();
    await expect(a.getByTestId('rotation-status')).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
    await expect(a.getByTestId('member')).toHaveCount(2);

    // alle neuen Daten laufen in der neuen Epoche: Owner schreibt weiter, b synchronisiert weiter (neuer Wrap), b schreibt zurück
    await addEntry(a, '6', 'STB-ROT-NACHHER');
    await expect.poll(() => hits(b.page, 'STB-ROT-NACHHER'), { timeout: 60_000, intervals: [1000, 2000] }).toBe(1);
    await expect.poll(() => hits(b.page, 'STB-ROT-VORHER'), { timeout: 20_000 }).toBe(1);
    await addEntry(b.page, '3', 'STB-ROT-VON-B');
    await expect.poll(() => hits(a, 'STB-ROT-VON-B'), { timeout: 60_000, intervals: [1000, 2000] }).toBe(1);

    // c: Server liefert 403, der neue Eintrag kommt nie an
    await expect.poll(async () => (await hits(c.page, 'STB-ROT-NACHHER'), statuses.includes(403)), { timeout: 30_000, intervals: [1000, 2000] }).toBe(true);
    await foreground(c.page);
    await go(c.page, '/history');
    await expect(c.page.getByTestId('entry-row')).toHaveCount(1); // nur der Eintrag von vorher
    await expect(c.page.getByTestId('entry-row')).not.toContainText('STB-ROT-');

    await b.ctx.close();
    await c.ctx.close();
  });
});
